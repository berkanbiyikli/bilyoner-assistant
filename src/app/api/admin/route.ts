// ============================================
// Admin Dashboard API
// Live Tracker, Optimization, Thread Tracker verileri
// ============================================

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { calculateValidationStats, calculateCalibration } from "@/lib/prediction/validator";
import { getLastOptimizationResult, runOptimization } from "@/lib/prediction/optimizer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section") || "overview";

  try {
    const supabase = createAdminSupabase();

    switch (section) {
      case "overview": {
        const [validationStats, calibration, optimResult] = await Promise.all([
          calculateValidationStats(),
          calculateCalibration(),
          Promise.resolve(getLastOptimizationResult()),
        ]);

        return NextResponse.json({
          validation: validationStats,
          calibration,
          optimization: optimResult,
        });
      }

      case "live-tracker": {
        // Son 24 saatteki tweet seed'leri ve thread zincirleri
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: recentTweets } = await supabase
          .from("tweets")
          .select("*")
          .gte("created_at", oneDayAgo)
          .order("created_at", { ascending: false });

        const tweets = recentTweets || [];

        // Thread zincirleri oluştur
        const seeds = tweets.filter((t) => t.type === "daily_picks" && t.fixture_id);
        const replies = tweets.filter((t) =>
          ["live_alert", "outcome_reply"].includes(t.type) && t.fixture_id
        );

        const threads = seeds.reduce((acc, seed) => {
          const fixtureId = seed.fixture_id!;
          if (!acc[fixtureId]) {
            acc[fixtureId] = {
              fixtureId,
              seedTweet: seed,
              replies: [],
              status: "tracking",
            };
          }
          return acc;
        }, {} as Record<number, { fixtureId: number; seedTweet: typeof seeds[0]; replies: typeof replies; status: string }>);

        for (const reply of replies) {
          const fid = reply.fixture_id!;
          if (threads[fid]) {
            threads[fid].replies.push(reply);
            if (reply.type === "outcome_reply") {
              threads[fid].status = "settled";
            }
          }
        }

        // Tweet tipi dağılımı
        const typeCounts: Record<string, number> = {};
        for (const t of tweets) {
          typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
        }

        // Saatlik tweet dağılımı (rate limit kontrolü)
        const hourlyMap = new Map<string, number>();
        for (const t of tweets) {
          const hour = new Date(t.created_at).toISOString().slice(0, 13);
          hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
        }
        const hourlyDistribution = Array.from(hourlyMap.entries())
          .map(([hour, count]) => ({ hour: hour.slice(11, 13) + ":00", count }))
          .sort((a, b) => a.hour.localeCompare(b.hour));

        return NextResponse.json({
          threads: Object.values(threads),
          tweetTypeCounts: typeCounts,
          hourlyDistribution,
          totalTweets: tweets.length,
          activeThreads: Object.values(threads).filter((t) => t.status === "tracking").length,
          settledThreads: Object.values(threads).filter((t) => t.status === "settled").length,
        });
      }

      case "simulation": {
        // En son tahminlerden simülasyon dağılım verisi
        const { data: recentPredictions } = await supabase
          .from("predictions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        // Validation records'tan sim accuracy verileri
        const { data: validationRecords } = await supabase
          .from("validation_records")
          .select("*")
          .not("sim_top_scoreline", "is", null)
          .order("kickoff", { ascending: false })
          .limit(100);

        const records = validationRecords || [];

        // Skor dağılımı analizi
        const scoreDistribution = new Map<string, { predicted: number; actual: number }>();
        for (const r of records) {
          if (r.sim_top_scoreline) {
            const scores = r.sim_top_scoreline.split(",").map((s: string) => s.trim());
            for (const score of scores) {
              if (!scoreDistribution.has(score)) {
                scoreDistribution.set(score, { predicted: 0, actual: 0 });
              }
              scoreDistribution.get(score)!.predicted++;
            }
          }
          if (r.actual_score) {
            if (!scoreDistribution.has(r.actual_score)) {
              scoreDistribution.set(r.actual_score, { predicted: 0, actual: 0 });
            }
            scoreDistribution.get(r.actual_score)!.actual++;
          }
        }

        // Confidence vs Actual scatter data
        const scatterData = records.map((r) => ({
          confidence: r.confidence,
          simProb: r.sim_probability || 0,
          result: r.result,
          pick: r.pick,
          odds: r.odds,
          actualScore: r.actual_score,
          simTopScore: r.sim_top_scoreline,
          match: `${r.home_team} vs ${r.away_team}`,
        }));

        // Poisson lambda dağılım tahmini (son 50 maç)
        const predictions = recentPredictions || [];
        const poissonData = predictions.map((p) => ({
          match: `${p.home_team} vs ${p.away_team}`,
          confidence: p.confidence,
          odds: p.odds,
          pick: p.pick,
          league: p.league,
          kickoff: p.kickoff,
        }));

        return NextResponse.json({
          scoreDistribution: Array.from(scoreDistribution.entries())
            .map(([score, counts]) => ({ score, ...counts }))
            .sort((a, b) => b.predicted - a.predicted)
            .slice(0, 20),
          scatterData: scatterData.slice(0, 100),
          recentPredictions: poissonData,
          totalValidated: records.length,
          scorelineHits: records.filter((r) => {
            if (!r.sim_top_scoreline || !r.actual_score) return false;
            return r.sim_top_scoreline.includes(r.actual_score);
          }).length,
        });
      }

      case "roi": {
        // Band bazlı ROI verileri
        const validationStats = await calculateValidationStats();

        // Günlük ROI trend
        const { data: allRecords } = await supabase
          .from("validation_records")
          .select("*")
          .in("result", ["won", "lost"])
          .order("kickoff", { ascending: true });

        let records = allRecords || [];

        // Fallback
        if (records.length === 0) {
          const { data: preds } = await supabase
            .from("predictions")
            .select("*")
            .in("result", ["won", "lost"])
            .order("kickoff", { ascending: true });
          records = (preds || []) as unknown as typeof records;
        }

        // Kümülatif ROI hesabı
        let cumulativeStake = 0;
        let cumulativeReturn = 0;
        const dailyROI: { date: string; roi: number; cumROI: number; won: number; lost: number }[] = [];
        const dailyMap = new Map<string, { won: number; lost: number; return: number }>();

        for (const r of records) {
          const day = r.kickoff.split("T")[0];
          if (!dailyMap.has(day)) dailyMap.set(day, { won: 0, lost: 0, return: 0 });
          const d = dailyMap.get(day)!;
          if (r.result === "won") {
            d.won++;
            d.return += r.odds;
          } else {
            d.lost++;
          }
        }

        for (const [date, d] of Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          const dayTotal = d.won + d.lost;
          cumulativeStake += dayTotal;
          cumulativeReturn += d.return;
          const dayROI = dayTotal > 0 ? ((d.return - dayTotal) / dayTotal) * 100 : 0;
          const cumROI = cumulativeStake > 0 ? ((cumulativeReturn - cumulativeStake) / cumulativeStake) * 100 : 0;
          dailyROI.push({
            date,
            roi: Math.round(dayROI * 10) / 10,
            cumROI: Math.round(cumROI * 10) / 10,
            won: d.won,
            lost: d.lost,
          });
        }

        // Lig bazlı ROI
        const leagueROI = new Map<string, { won: number; lost: number; return: number; total: number }>();
        for (const r of records) {
          const league = r.league;
          if (!leagueROI.has(league)) leagueROI.set(league, { won: 0, lost: 0, return: 0, total: 0 });
          const l = leagueROI.get(league)!;
          l.total++;
          if (r.result === "won") { l.won++; l.return += r.odds; }
          else l.lost++;
        }

        const leagueStats = Array.from(leagueROI.entries())
          .filter(([, v]) => v.total >= 3)
          .map(([league, v]) => ({
            league,
            total: v.total,
            won: v.won,
            lost: v.lost,
            winRate: Math.round((v.won / v.total) * 1000) / 10,
            roi: Math.round(((v.return - v.total) / v.total) * 1000) / 10,
          }))
          .sort((a, b) => b.roi - a.roi);

        return NextResponse.json({
          validationStats,
          dailyROI: dailyROI.slice(-60),
          leagueROI: leagueStats,
          totalStake: cumulativeStake,
          totalReturn: Math.round(cumulativeReturn * 100) / 100,
          overallROI: cumulativeStake > 0 ? Math.round(((cumulativeReturn - cumulativeStake) / cumulativeStake) * 1000) / 10 : 0,
        });
      }

      case "optimize": {
        // Manuel optimization tetikle
        const result = await runOptimization();
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }
  } catch (error) {
    console.error("[ADMIN API] Error:", error);
    return NextResponse.json(
      { error: "Admin verisi yüklenirken hata oluştu", details: String(error) },
      { status: 500 }
    );
  }
}
