import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";
import { getLeagueById } from "@/lib/api-football/leagues";
import type { FixtureResponse } from "@/types/api-football";

export const maxDuration = 60;

/**
 * /api/predictions/league?league=203&days=5
 * Belirli bir lig için gelecek N günlük maçları getirir.
 * Önce DB'deki kayıtlı tahminleri çeker — sadece DB'de olmayan NS maçları canlı analiz eder.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = parseInt(searchParams.get("league") || "0");
    const days = Math.min(7, Math.max(1, parseInt(searchParams.get("days") || "5")));

    if (!leagueId) {
      return NextResponse.json({ error: "league parametresi gerekli" }, { status: 400 });
    }

    const leagueConfig = getLeagueById(leagueId);
    if (!leagueConfig) {
      return NextResponse.json({ error: "Desteklenmeyen lig" }, { status: 400 });
    }

    // Cache kontrol
    const cacheKey = `league-predictions:${leagueId}:${days}`;
    const cached = getCached<{ predictions: unknown[]; fixtures: unknown[] }>(cacheKey);
    if (cached) {
      return NextResponse.json({
        league: leagueConfig,
        source: "cache",
        days,
        totalFixtures: cached.fixtures.length,
        analyzed: cached.predictions.length,
        fixtures: cached.fixtures,
        predictions: cached.predictions,
      });
    }

    // Gelecek N gün için tarihleri oluştur
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const supabase = createAdminSupabase();

    // ---- 1) DB'deki kayıtlı tahminleri çek (lig adına göre) ----
    const dayStart = `${dates[0]}T00:00:00.000Z`;
    const dayEnd = `${dates[dates.length - 1]}T23:59:59.999Z`;

    const { data: dbPredictions } = await supabase
      .from("predictions")
      .select("*")
      .gte("kickoff", dayStart)
      .lte("kickoff", dayEnd)
      .eq("league", leagueConfig.name)
      .neq("pick", "no_pick")
      .order("confidence", { ascending: false });

    const dbFixtureIds = new Set((dbPredictions || []).map((p: { fixture_id: number }) => p.fixture_id));

    // DB tahminlerini fixture bazlı grupla
    const fixtureGrouped = new Map<number, typeof dbPredictions>();
    for (const dbPred of (dbPredictions || [])) {
      const group = fixtureGrouped.get(dbPred.fixture_id) || [];
      group.push(dbPred);
      fixtureGrouped.set(dbPred.fixture_id, group);
    }

    // ---- 2) Maçları API'den çek ve ligleye filtrele (fixture detayları için) ----
    const allFixtures: FixtureResponse[] = [];
    for (const date of dates) {
      try {
        const dayFixtures = await getFixturesByDate(date);
        const leagueFixtures = dayFixtures.filter((f) => f.league.id === leagueId);
        allFixtures.push(...leagueFixtures);
      } catch (err) {
        console.error(`[LEAGUE-PRED] Error fetching ${date}:`, err);
      }
    }

    // ---- 3) DB'deki tahminleri zenginleştir ----
    const dbEnriched = Array.from(fixtureGrouped.entries()).map(([fixtureId, preds]) => {
      if (!preds) return null;
      const fixture = allFixtures.find((f) => f.fixture.id === fixtureId);
      const sortedPreds = preds.sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence);
      const firstPred = sortedPreds[0];

      return {
        fixtureId,
        fixture: fixture ?? null,
        league: fixture?.league ?? {
          id: leagueId,
          name: leagueConfig.name,
          country: leagueConfig.country,
          logo: "",
          flag: leagueConfig.flag,
          season: 0,
          round: "",
        },
        homeTeam: fixture?.teams.home ?? { id: 0, name: firstPred.home_team, logo: "", winner: null },
        awayTeam: fixture?.teams.away ?? { id: 0, name: firstPred.away_team, logo: "", winner: null },
        kickoff: firstPred.kickoff,
        picks: sortedPreds.map((p: { pick: string; confidence: number; odds: number; analysis_summary: string; expected_value: number; is_value_bet: boolean }) => ({
          type: p.pick,
          confidence: p.confidence,
          odds: p.odds,
          reasoning: p.analysis_summary || "",
          expectedValue: p.expected_value,
          isValueBet: p.is_value_bet,
        })),
        analysis: {
          summary: firstPred.analysis_summary || "",
          homeAttack: 50,
          homeDefense: 50,
          awayAttack: 50,
          awayDefense: 50,
          homeForm: 50,
          awayForm: 50,
        },
        odds: undefined,
        isLive: fixture
          ? fixture.fixture.status.short !== "NS" && fixture.fixture.status.short !== "FT"
          : false,
      };
    }).filter(Boolean);

    // ---- 4) DB'de OLMAYAN NS maçları canlı analiz et (max 8) ----
    const unseenFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && !dbFixtureIds.has(f.fixture.id)
    ).slice(0, 8);

    let liveAnalyzed: unknown[] = [];
    if (unseenFixtures.length > 0) {
      try {
        liveAnalyzed = await analyzeMatches(unseenFixtures, 2);
      } catch (err) {
        console.error(`[LEAGUE-PRED] Analysis error for league ${leagueId}:`, err);
      }
    }

    const allPredictions = [...dbEnriched, ...liveAnalyzed];

    // Tüm maçları fixture listesi olarak döndür
    const fixtureList = allFixtures.map((f) => ({
      fixtureId: f.fixture.id,
      date: f.fixture.date,
      status: f.fixture.status.short,
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      homeLogo: f.teams.home.logo,
      awayLogo: f.teams.away.logo,
      score: f.fixture.status.short === "NS" ? null : {
        home: f.goals.home,
        away: f.goals.away,
      },
    }));

    // Cache'e kaydet (5 dk)
    if (allPredictions.length > 0 || fixtureList.length > 0) {
      setCache(cacheKey, { predictions: allPredictions, fixtures: fixtureList }, 300);
    }

    return NextResponse.json({
      league: leagueConfig,
      source: dbEnriched.length > 0 && liveAnalyzed.length > 0
        ? "hybrid"
        : dbEnriched.length > 0
          ? "database"
          : "live",
      days,
      dates,
      totalFixtures: allFixtures.length,
      fromDb: dbEnriched.length,
      fromLive: liveAnalyzed.length,
      analyzed: allPredictions.length,
      fixtures: fixtureList,
      predictions: allPredictions,
    });
  } catch (error) {
    console.error("League predictions API error:", error);
    return NextResponse.json(
      { error: "Lig tahminleri yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
