import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminSupabase();

    // Tüm tahminleri çek
    const { data: predictions, error: predError } = await supabase
      .from("predictions")
      .select("*")
      .order("kickoff", { ascending: false });

    if (predError) throw predError;

    const all = predictions || [];
    const settled = all.filter((p) => p.result !== "pending");
    const won = settled.filter((p) => p.result === "won");
    const lost = settled.filter((p) => p.result === "lost");
    const pending = all.filter((p) => p.result === "pending");

    // İsabet oranı
    const hitRate = settled.length > 0 ? (won.length / settled.length) * 100 : 0;

    // Ortalama odds
    const avgOdds = all.length > 0
      ? all.reduce((sum, p) => sum + p.odds, 0) / all.length
      : 0;

    // Ortalama confidence
    const avgConfidence = all.length > 0
      ? all.reduce((sum, p) => sum + p.confidence, 0) / all.length
      : 0;

    // Kazanan ortalama odds
    const avgWonOdds = won.length > 0
      ? won.reduce((sum, p) => sum + p.odds, 0) / won.length
      : 0;

    // ROI hesaplama (birim bazlı)
    const totalStaked = settled.length; // Her tahmin 1 birim
    const totalReturn = won.reduce((sum, p) => sum + p.odds, 0);
    const roi = totalStaked > 0 ? ((totalReturn - totalStaked) / totalStaked) * 100 : 0;

    // Value bet istatistikleri
    const valueBets = all.filter((p) => p.is_value_bet);
    const valueBetsSettled = valueBets.filter((p) => p.result !== "pending");
    const valueBetsWon = valueBets.filter((p) => p.result === "won");
    const valueBetHitRate = valueBetsSettled.length > 0
      ? (valueBetsWon.length / valueBetsSettled.length) * 100
      : 0;

    // Lig bazlı istatistikler
    const leagueMap = new Map<string, { total: number; won: number; lost: number; pending: number; avgOdds: number; totalOdds: number }>();
    for (const p of all) {
      const existing = leagueMap.get(p.league) || { total: 0, won: 0, lost: 0, pending: 0, avgOdds: 0, totalOdds: 0 };
      existing.total++;
      existing.totalOdds += p.odds;
      if (p.result === "won") existing.won++;
      else if (p.result === "lost") existing.lost++;
      else existing.pending++;
      existing.avgOdds = existing.totalOdds / existing.total;
      leagueMap.set(p.league, existing);
    }
    const leagueStats = Array.from(leagueMap.entries())
      .map(([league, stats]) => ({
        league,
        ...stats,
        hitRate: (stats.won + stats.lost) > 0 ? (stats.won / (stats.won + stats.lost)) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Pick tipi istatistikleri
    const pickMap = new Map<string, { total: number; won: number; lost: number; avgOdds: number; totalOdds: number }>();
    for (const p of all) {
      const existing = pickMap.get(p.pick) || { total: 0, won: 0, lost: 0, avgOdds: 0, totalOdds: 0 };
      existing.total++;
      existing.totalOdds += p.odds;
      if (p.result === "won") existing.won++;
      else if (p.result === "lost") existing.lost++;
      existing.avgOdds = existing.totalOdds / existing.total;
      pickMap.set(p.pick, existing);
    }
    const pickStats = Array.from(pickMap.entries())
      .map(([pick, stats]) => ({
        pick,
        ...stats,
        hitRate: (stats.won + stats.lost) > 0 ? (stats.won / (stats.won + stats.lost)) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Günlük istatistikler (son 30 gün)
    const dailyMap = new Map<string, { total: number; won: number; lost: number }>();
    for (const p of settled) {
      const day = p.kickoff.split("T")[0];
      const existing = dailyMap.get(day) || { total: 0, won: 0, lost: 0 };
      existing.total++;
      if (p.result === "won") existing.won++;
      else existing.lost++;
      dailyMap.set(day, existing);
    }
    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        ...stats,
        hitRate: stats.total > 0 ? (stats.won / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // Tweet istatistikleri
    const { data: tweets } = await supabase
      .from("tweets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    const tweetStats = {
      total: tweets?.length || 0,
      dailyPicks: tweets?.filter((t) => t.type === "daily_picks").length || 0,
      coupons: tweets?.filter((t) => t.type === "coupon").length || 0,
      liveAlerts: tweets?.filter((t) => t.type === "live_alert").length || 0,
      results: tweets?.filter((t) => t.type === "result").length || 0,
      recentTweets: (tweets || []).slice(0, 10).map((t) => ({
        id: t.tweet_id,
        type: t.type,
        content: t.content.substring(0, 140),
        createdAt: t.created_at,
      })),
    };

    return NextResponse.json({
      overview: {
        totalPredictions: all.length,
        pending: pending.length,
        settled: settled.length,
        won: won.length,
        lost: lost.length,
        hitRate: Math.round(hitRate * 10) / 10,
        avgOdds: Math.round(avgOdds * 100) / 100,
        avgWonOdds: Math.round(avgWonOdds * 100) / 100,
        avgConfidence: Math.round(avgConfidence),
        roi: Math.round(roi * 10) / 10,
      },
      valueBets: {
        total: valueBets.length,
        settled: valueBetsSettled.length,
        won: valueBetsWon.length,
        hitRate: Math.round(valueBetHitRate * 10) / 10,
      },
      leagueStats,
      pickStats,
      dailyStats,
      tweetStats,
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { error: "İstatistikler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
