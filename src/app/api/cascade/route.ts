import { NextRequest, NextResponse } from "next/server";
import { buildAllCascadeStrategies } from "@/lib/cascade";
import { getCached, setCache } from "@/lib/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getLeagueById, getLeagueByName } from "@/lib/api-football";
import type { MatchPrediction, CascadeRiskLevel, CascadeStrategy } from "@/types";

export const maxDuration = 30;

const CASCADE_CACHE_TTL = 10 * 60; // 10 dakika

/**
 * GET /api/cascade?date=YYYY-MM-DD&stake=100
 * Günün maçları için kademeli bahis stratejisi oluştur
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const stake = Math.max(10, Math.min(10000, Number(searchParams.get("stake")) || 100));

    // Cache kontrol
    const cacheKey = `cascade:${date}:${stake}`;
    const cached = getCached<Record<CascadeRiskLevel, CascadeStrategy>>(cacheKey);
    if (cached) {
      return NextResponse.json({
        date,
        stake,
        source: "cache",
        strategies: cached,
      });
    }

    // Doğrudan Supabase'den tahminleri çek (internal fetch yerine — 504 chain timeout önlenir)
    const supabase = createAdminSupabase();
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const { data: dbPredictions } = await supabase
      .from("predictions")
      .select("*")
      .gte("kickoff", dayStart)
      .lte("kickoff", dayEnd)
      .neq("pick", "no_pick")
      .order("confidence", { ascending: false });

    // DB tahminlerini MatchPrediction formatına dönüştür
    const grouped = new Map<number, typeof dbPredictions>();
    for (const p of (dbPredictions || [])) {
      const group = grouped.get(p.fixture_id) || [];
      group.push(p);
      grouped.set(p.fixture_id, group);
    }

    const predictions: MatchPrediction[] = Array.from(grouped.entries()).map(([fixtureId, preds]) => {
      const sorted = preds!.sort((a, b) => b.confidence - a.confidence);
      const first = sorted[0];
      const leagueId = first.league_id as number | undefined;
      const config = leagueId ? getLeagueById(leagueId) : getLeagueByName(first.league);
      const leagueObj = config
        ? { id: config.id, name: config.name, country: config.country, logo: "", flag: config.flag, season: 0, round: "" }
        : { id: 0, name: first.league, country: "", logo: "", flag: "", season: 0, round: "" };

      return {
        fixtureId,
        fixture: null,
        league: leagueObj,
        homeTeam: { id: 0, name: first.home_team, logo: "", winner: null },
        awayTeam: { id: 0, name: first.away_team, logo: "", winner: null },
        kickoff: first.kickoff,
        picks: sorted.map((p) => ({
          type: p.pick,
          confidence: p.confidence,
          odds: p.odds,
          reasoning: p.analysis_summary || "",
          expectedValue: p.expected_value,
          isValueBet: p.is_value_bet,
        })),
        analysis: first.analysis_data?.analysis || undefined,
        insights: first.analysis_data?.insights || undefined,
        odds: undefined,
        aiAnalysis: undefined,
        isLive: false,
      } as unknown as MatchPrediction;
    });

    if (predictions.length === 0) {
      return NextResponse.json({
        date,
        stake,
        source: "empty",
        strategies: null,
        message: "Bu tarih için tahmin bulunamadı",
      });
    }

    // 3 risk seviyesi için cascade stratejileri oluştur
    const strategies = buildAllCascadeStrategies(predictions, stake);

    // Cache'le
    setCache(cacheKey, strategies, CASCADE_CACHE_TTL);

    return NextResponse.json({
      date,
      stake,
      source: "live",
      strategies,
    });
  } catch (error) {
    console.error("[CASCADE] API error:", error);
    return NextResponse.json({ error: "Cascade strateji oluşturulamadı" }, { status: 500 });
  }
}
