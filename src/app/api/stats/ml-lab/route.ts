import { NextResponse } from "next/server";
import { createAdminSupabase, fetchAllRows } from "@/lib/supabase/admin";

interface PredictionLite {
  pick: string;
  odds: number;
  confidence: number;
  result: "won" | "lost" | "pending" | "void";
  analysis_data: {
    analysis?: {
      mlProbabilities?: Record<string, number>;
    };
  } | null;
  league: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mapPickToMlMarket(pick: string): string | null {
  const map: Record<string, string> = {
    "1": "1",
    "2": "2",
    "X": "X",
    "Over 2.5": "Over 2.5",
    "Under 2.5": "Under 2.5",
    "Over 1.5": "Over 1.5",
    "Under 1.5": "Under 1.5",
    "Over 3.5": "Over 3.5",
    "Under 3.5": "Under 3.5",
    "BTTS Yes": "BTTS Yes",
    "BTTS No": "BTTS No",
  };
  return map[pick] || null;
}

export async function GET() {
  try {
    const supabase = createAdminSupabase();

    const allPreds = await fetchAllRows<PredictionLite>(supabase, "predictions", {
      select: "pick, odds, confidence, result, analysis_data, league, kickoff",
      order: { column: "kickoff", ascending: false },
      filters: [
        { method: "in", args: ["result", ["won", "lost"]] },
      ],
    });

    const settled = allPreds.filter((p) => p.result === "won" || p.result === "lost");
    const focusPicks = settled.filter((p) => p.pick === "1" || p.pick === "2" || p.pick === "HT BTTS Yes");

    let mlCovered = 0;
    let brierMl = 0;
    let brierConf = 0;
    let brierCount = 0;

    let mlWins = 0;
    let mlSignals = 0;
    let confWins = 0;
    let confSignals = 0;

    const upsetCandidates = focusPicks.filter((p) => (p.pick === "1" || p.pick === "2") && p.odds >= 2.8);
    const upsetWon = upsetCandidates.filter((p) => p.result === "won").length;

    const htBttsCandidates = focusPicks.filter((p) => p.pick === "HT BTTS Yes" && p.odds >= 2.0);
    const htBttsWon = htBttsCandidates.filter((p) => p.result === "won").length;

    const leagueUpsetMap = new Map<string, { total: number; won: number }>();

    for (const p of settled) {
      const label = p.result === "won" ? 1 : 0;
      const confProb = clamp(p.confidence / 100, 0.05, 0.95);

      if (p.confidence >= 60) {
        confSignals++;
        if (label === 1) confWins++;
      }

      const mlMarket = mapPickToMlMarket(p.pick);
      const mlProbRaw = mlMarket ? p.analysis_data?.analysis?.mlProbabilities?.[mlMarket] : undefined;

      if (typeof mlProbRaw === "number") {
        mlCovered++;
        const mlProb = clamp(mlProbRaw / 100, 0.05, 0.95);
        brierMl += Math.pow(mlProb - label, 2);
        brierConf += Math.pow(confProb - label, 2);
        brierCount++;

        if (mlProbRaw >= 55) {
          mlSignals++;
          if (label === 1) mlWins++;
        }
      }

      if ((p.pick === "1" || p.pick === "2") && p.odds >= 2.8) {
        const curr = leagueUpsetMap.get(p.league) || { total: 0, won: 0 };
        curr.total += 1;
        if (label === 1) curr.won += 1;
        leagueUpsetMap.set(p.league, curr);
      }
    }

    const leagueUpsets = Array.from(leagueUpsetMap.entries())
      .filter(([, v]) => v.total >= 8)
      .map(([league, v]) => ({
        league,
        sample: v.total,
        hitRate: Math.round((v.won / v.total) * 1000) / 10,
      }))
      .sort((a, b) => b.hitRate - a.hitRate)
      .slice(0, 12);

    const { data: modelData } = await supabase
      .from("ml_models")
      .select("version, trained_at, record_count, market_count")
      .eq("id", "current")
      .single();

    return NextResponse.json({
      success: true,
      model: modelData || null,
      totals: {
        settled: settled.length,
        focusPicks: focusPicks.length,
        mlCoverage: settled.length > 0 ? Math.round((mlCovered / settled.length) * 1000) / 10 : 0,
      },
      quality: {
        brierMl: brierCount > 0 ? Math.round((brierMl / brierCount) * 10000) / 10000 : null,
        brierConfidence: brierCount > 0 ? Math.round((brierConf / brierCount) * 10000) / 10000 : null,
        mlSignalHitRate: mlSignals > 0 ? Math.round((mlWins / mlSignals) * 1000) / 10 : 0,
        confSignalHitRate: confSignals > 0 ? Math.round((confWins / confSignals) * 1000) / 10 : 0,
        samplesCompared: brierCount,
      },
      surprise: {
        upset: {
          sample: upsetCandidates.length,
          hitRate: upsetCandidates.length > 0 ? Math.round((upsetWon / upsetCandidates.length) * 1000) / 10 : 0,
        },
        htBtts: {
          sample: htBttsCandidates.length,
          hitRate: htBttsCandidates.length > 0 ? Math.round((htBttsWon / htBttsCandidates.length) * 1000) / 10 : 0,
        },
        topLeaguesForUpset: leagueUpsets,
      },
    });
  } catch (error) {
    console.error("ML lab stats error:", error);
    return NextResponse.json({ error: "ML lab istatistikleri alinamadi" }, { status: 500 });
  }
}
