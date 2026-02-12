import { NextRequest, NextResponse } from "next/server";
import {
  getLiveFixtures,
  getFixtureStatistics,
  getFixtureEvents,
  getLineups,
} from "@/lib/api-football";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { FixtureResponse, FixtureStatisticsResponse, FixtureEvent, LineupResponse } from "@/types/api-football";

export const revalidate = 0;

// İstatistik tiplerini Türkçe'ye çevir
const STAT_LABELS: Record<string, string> = {
  "Shots on Goal": "İsabetli Şut",
  "Shots off Goal": "İsabetsiz Şut",
  "Total Shots": "Toplam Şut",
  "Blocked Shots": "Bloke Şut",
  "Shots insidebox": "Ceza Sahası İçi",
  "Shots outsidebox": "Ceza Sahası Dışı",
  Fouls: "Faul",
  "Corner Kicks": "Korner",
  Offsides: "Ofsayt",
  "Ball Possession": "Top Hakimiyeti",
  "Yellow Cards": "Sarı Kart",
  "Red Cards": "Kırmızı Kart",
  "Goalkeeper Saves": "Kaleci Kurtarışı",
  "Total passes": "Toplam Pas",
  "Passes accurate": "İsabetli Pas",
  "Passes %": "Pas İsabeti %",
  "expected_goals": "xG",
};

interface EnrichedLiveMatch {
  fixture: FixtureResponse;
  statistics: FixtureStatisticsResponse[] | null;
  events: FixtureEvent[] | null;
  lineups: LineupResponse[] | null;
  prediction: {
    picks: Array<{
      type: string;
      confidence: number;
      odds: number;
      reasoning: string;
      expectedValue: number;
      isValueBet: boolean;
    }>;
    analysisSummary: string;
  } | null;
  liveInsights: string[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixtureId = searchParams.get("id"); // Tek maç detayı

    // Tek maç detayı isteniyorsa
    if (fixtureId) {
      const id = parseInt(fixtureId);
      return await getEnrichedMatch(id);
    }

    // Tüm canlı maçlar
    const matches = await getLiveFixtures();

    if (matches.length === 0) {
      return NextResponse.json({ count: 0, matches: [], enriched: [] });
    }

    // DB'den bu maçların tahminlerini çek
    const supabase = createAdminSupabase();
    const fixtureIds = matches.map((m) => m.fixture.id);

    const { data: dbPredictions } = await supabase
      .from("predictions")
      .select("*")
      .in("fixture_id", fixtureIds)
      .order("confidence", { ascending: false });

    // Fixture bazlı prediction group
    const predMap = new Map<number, typeof dbPredictions>();
    for (const p of dbPredictions || []) {
      const group = predMap.get(p.fixture_id) || [];
      group.push(p);
      predMap.set(p.fixture_id, group);
    }

    // Canlı maçları zenginleştir (paralel — en fazla 10 maç)
    const matchesToEnrich = matches.slice(0, 10);
    const enrichedMatches: EnrichedLiveMatch[] = await Promise.all(
      matchesToEnrich.map(async (match) => {
        const fid = match.fixture.id;

        // İstatistik + events paralel çek
        const [stats, events, lineups] = await Promise.all([
          getFixtureStatistics(fid).catch(() => null),
          getFixtureEvents(fid).catch(() => null),
          getLineups(fid).catch(() => null),
        ]);

        // Tahminleri bul
        const preds = predMap.get(fid);
        const prediction = preds
          ? {
              picks: preds.map((p) => ({
                type: p.pick,
                confidence: p.confidence,
                odds: p.odds,
                reasoning: p.analysis_summary || "",
                expectedValue: p.expected_value,
                isValueBet: p.is_value_bet,
              })),
              analysisSummary: preds[0]?.analysis_summary || "",
            }
          : null;

        // Canlı içgörüler oluştur
        const insights = generateLiveInsights(match, stats, events, prediction);

        return {
          fixture: match,
          statistics: stats,
          events: events ? events.sort((a, b) => b.time.elapsed - a.time.elapsed) : null,
          lineups,
          prediction,
          liveInsights: insights,
        };
      })
    );

    // Kalan maçlar (zenginleştirilmemiş)
    const remainingMatches = matches.slice(10).map((match) => ({
      fixture: match,
      statistics: null,
      events: null,
      lineups: null,
      prediction: predMap.has(match.fixture.id)
        ? {
            picks: (predMap.get(match.fixture.id) || []).map((p) => ({
              type: p.pick,
              confidence: p.confidence,
              odds: p.odds,
              reasoning: p.analysis_summary || "",
              expectedValue: p.expected_value,
              isValueBet: p.is_value_bet,
            })),
            analysisSummary: predMap.get(match.fixture.id)?.[0]?.analysis_summary || "",
          }
        : null,
      liveInsights: [],
    }));

    return NextResponse.json({
      count: matches.length,
      enriched: [...enrichedMatches, ...remainingMatches],
      statLabels: STAT_LABELS,
    });
  } catch (error) {
    console.error("Live API error:", error);
    return NextResponse.json(
      { error: "Canlı maçlar yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}

// Tek maç detayı
async function getEnrichedMatch(fixtureId: number) {
  const [allLive, stats, events, lineups] = await Promise.all([
    getLiveFixtures(),
    getFixtureStatistics(fixtureId).catch(() => null),
    getFixtureEvents(fixtureId).catch(() => null),
    getLineups(fixtureId).catch(() => null),
  ]);

  const match = allLive.find((m) => m.fixture.id === fixtureId);
  if (!match) {
    return NextResponse.json({ error: "Maç bulunamadı" }, { status: 404 });
  }

  // DB'den prediction
  const supabase = createAdminSupabase();
  const { data: preds } = await supabase
    .from("predictions")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("confidence", { ascending: false });

  const prediction = preds?.length
    ? {
        picks: preds.map((p) => ({
          type: p.pick,
          confidence: p.confidence,
          odds: p.odds,
          reasoning: p.analysis_summary || "",
          expectedValue: p.expected_value,
          isValueBet: p.is_value_bet,
        })),
        analysisSummary: preds[0].analysis_summary || "",
      }
    : null;

  const insights = generateLiveInsights(match, stats, events, prediction);

  return NextResponse.json({
    fixture: match,
    statistics: stats,
    events: events ? events.sort((a, b) => b.time.elapsed - a.time.elapsed) : null,
    lineups,
    prediction,
    liveInsights: insights,
    statLabels: STAT_LABELS,
  });
}

// Canlı içgörüler: skor durumu + tahmin uyumu + istatistik bazlı öneriler
function generateLiveInsights(
  match: FixtureResponse,
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  prediction: { picks: Array<{ type: string; confidence: number; odds: number }> } | null
): string[] {
  const insights: string[] = [];
  const elapsed = match.fixture.status.elapsed || 0;
  const homeGoals = match.goals.home ?? 0;
  const awayGoals = match.goals.away ?? 0;
  const totalGoals = homeGoals + awayGoals;
  const homeName = match.teams.home.name;
  const awayName = match.teams.away.name;

  // 1. Skor durumu analizi
  if (totalGoals === 0 && elapsed >= 60) {
    insights.push("⚠️ 60'+ ve hâlâ gol yok — geç gol riski yüksek");
  }
  if (totalGoals >= 3 && elapsed <= 45) {
    insights.push("🔥 İlk yarıda 3+ gol — yüksek tempolu maç");
  }
  if (totalGoals >= 4) {
    insights.push("⚡ Gol festivali — Over 3.5 tuttu");
  }

  // 2. İstatistik bazlı
  if (stats && stats.length >= 2) {
    const getStat = (teamIdx: number, type: string) => {
      const s = stats[teamIdx]?.statistics?.find((s) => s.type === type);
      return s ? (typeof s.value === "string" ? parseFloat(s.value) : (s.value as number) ?? 0) : 0;
    };

    const homePoss = getStat(0, "Ball Possession");
    const awayPoss = getStat(1, "Ball Possession");
    const homeShots = getStat(0, "Total Shots");
    const awayShots = getStat(1, "Total Shots");
    const homeSoG = getStat(0, "Shots on Goal");
    const awaySoG = getStat(1, "Shots on Goal");
    const homeCorners = getStat(0, "Corner Kicks");
    const awayCorners = getStat(1, "Corner Kicks");

    if (homePoss > 65) insights.push(`📊 ${homeName} top hakimiyeti %${homePoss} — baskı altında`);
    if (awayPoss > 65) insights.push(`📊 ${awayName} top hakimiyeti %${awayPoss} — baskı altında`);
    if (homeShots >= 15 && homeGoals === 0) insights.push(`🎯 ${homeName} ${homeShots} şut ama gol yok — şanssız`);
    if (awayShots >= 15 && awayGoals === 0) insights.push(`🎯 ${awayName} ${awayShots} şut ama gol yok — şanssız`);
    if (homeSoG + awaySoG >= 12) insights.push(`🔫 Toplam ${homeSoG + awaySoG} isabetli şut — aksiyon yoğun`);
    if (homeCorners + awayCorners >= 10) insights.push(`🚩 Toplam ${homeCorners + awayCorners} korner — set piece fırsatları`);
  }

  // 3. Olay bazlı
  if (events) {
    const redCards = events.filter((e) => e.type === "Card" && e.detail === "Red Card");
    if (redCards.length > 0) {
      const teams = [...new Set(redCards.map((r) => r.team.name))];
      insights.push(`🟥 Kırmızı kart: ${teams.join(", ")} — sayısal avantaj`);
    }

    const goals = events.filter((e) => e.type === "Goal");
    const recentGoal = goals.find((g) => elapsed - g.time.elapsed <= 5);
    if (recentGoal) {
      insights.push(`⚽ SON GOL! ${recentGoal.player.name} (${recentGoal.team.name}) — ${recentGoal.time.elapsed}'`);
    }
  }

  // 4. Tahmin uyumu kontrolü
  if (prediction?.picks?.length) {
    const bestPick = prediction.picks[0];
    let pickStatus = "";

    if (bestPick.type === "1" && homeGoals > awayGoals) pickStatus = "✅ tuttu";
    else if (bestPick.type === "1" && homeGoals <= awayGoals) pickStatus = "❌ tehlikede";
    else if (bestPick.type === "2" && awayGoals > homeGoals) pickStatus = "✅ tuttu";
    else if (bestPick.type === "2" && awayGoals <= homeGoals) pickStatus = "❌ tehlikede";
    else if (bestPick.type === "X" && homeGoals === awayGoals) pickStatus = "✅ tutuyor";
    else if (bestPick.type === "X" && homeGoals !== awayGoals) pickStatus = "❌ tehlikede";
    else if (bestPick.type === "Over 2.5" && totalGoals >= 3) pickStatus = "✅ tuttu";
    else if (bestPick.type === "Over 2.5" && totalGoals < 3) pickStatus = elapsed >= 70 ? "⚠️ zaman daralıyor" : "⏳ bekleniyor";
    else if (bestPick.type === "Under 2.5" && totalGoals <= 2) pickStatus = "✅ tutuyor";
    else if (bestPick.type === "Under 2.5" && totalGoals >= 3) pickStatus = "❌ bozuldu";
    else if (bestPick.type === "BTTS Yes") {
      if (homeGoals > 0 && awayGoals > 0) pickStatus = "✅ tuttu";
      else if (homeGoals > 0 || awayGoals > 0) pickStatus = "⏳ bir takım daha atmalı";
      else pickStatus = "⏳ bekleniyor";
    }
    else if (bestPick.type === "BTTS No") {
      if (homeGoals > 0 && awayGoals > 0) pickStatus = "❌ bozuldu";
      else pickStatus = "✅ tutuyor";
    }

    if (pickStatus) {
      insights.push(`🎯 Tahmin: ${bestPick.type} (%${bestPick.confidence}) → ${pickStatus}`);
    }
  }

  return insights;
}
