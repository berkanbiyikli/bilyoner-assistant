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

// ---- Opportunity & Momentum Types ----

type AlertLevel = "HOT" | "WARM" | "INFO";

interface LiveOpportunity {
  level: AlertLevel;
  market: string;        // "Over 2.5", "BTTS", "Ev Sahibi Gol", etc.
  message: string;
  reasoning: string;
  confidence: number;    // 0-100
  timeWindow: string;    // "Son 15dk", "2. Yarı", etc.
}

interface MomentumData {
  homeScore: number;     // 0-100
  awayScore: number;     // 0-100
  dominantTeam: "home" | "away" | "balanced";
  trend: "increasing" | "decreasing" | "stable";
  description: string;
}

interface DangerLevel {
  homeAttack: number;    // 0-100
  awayAttack: number;    // 0-100
  goalProbability: number; // next goal probability in next 15min
  description: string;
}

interface LiveMatchAnalysis {
  momentum: MomentumData;
  danger: DangerLevel;
  opportunities: LiveOpportunity[];
  insights: string[];
  matchTemperature: number; // 0-100, overall action level
  nextGoalTeam: "home" | "away" | "either" | "unlikely";
  scorePressure: number;   // 0-100, how much pressure for goals
}

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
  analysis: LiveMatchAnalysis | null;
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
        const analysis = generateLiveAnalysis(match, stats, events, prediction);

        return {
          fixture: match,
          statistics: stats,
          events: events ? events.sort((a, b) => b.time.elapsed - a.time.elapsed) : null,
          lineups,
          prediction,
          liveInsights: insights,
          analysis,
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
      analysis: null,
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
  const analysis = generateLiveAnalysis(match, stats, events, prediction);

  return NextResponse.json({
    fixture: match,
    statistics: stats,
    events: events ? events.sort((a, b) => b.time.elapsed - a.time.elapsed) : null,
    lineups,
    prediction,
    liveInsights: insights,
    analysis,
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

// =============================================
// CANLI ANALİZ MOTORu — Momentum, Fırsat, Tehlike
// =============================================

function getStat(stats: FixtureStatisticsResponse[], teamIdx: number, type: string): number {
  const s = stats[teamIdx]?.statistics?.find((st) => st.type === type);
  if (!s) return 0;
  return typeof s.value === "string" ? parseFloat(s.value) || 0 : (s.value as number) ?? 0;
}

function generateLiveAnalysis(
  match: FixtureResponse,
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  prediction: { picks: Array<{ type: string; confidence: number; odds: number }> } | null
): LiveMatchAnalysis {
  const elapsed = match.fixture.status.elapsed || 0;
  const homeGoals = match.goals.home ?? 0;
  const awayGoals = match.goals.away ?? 0;
  const totalGoals = homeGoals + awayGoals;
  const homeName = match.teams.home.name;
  const awayName = match.teams.away.name;
  const isHT = match.fixture.status.short === "HT";
  const htHome = match.score.halftime.home ?? 0;
  const htAway = match.score.halftime.away ?? 0;

  // === MOMENTUM HESAPLA ===
  const momentum = calculateMomentum(stats, events, elapsed, homeName, awayName, homeGoals, awayGoals);

  // === TEHLİKE SEVİYESİ ===
  const danger = calculateDanger(stats, events, elapsed, homeGoals, awayGoals, momentum);

  // === FIRSAT TESPİTİ ===
  const opportunities = detectOpportunities(
    match, stats, events, prediction, elapsed,
    homeGoals, awayGoals, totalGoals, homeName, awayName,
    momentum, danger, isHT, htHome, htAway
  );

  // === MAÇ SICAKLIĞI ===
  const matchTemperature = calculateTemperature(stats, events, elapsed, totalGoals);

  // === BİR SONRAKİ GOL TAHMİNİ ===
  const nextGoalTeam = predictNextGoal(stats, events, elapsed, momentum, danger, homeGoals, awayGoals);

  // === SKOR BASKISI ===
  const scorePressure = calculateScorePressure(elapsed, totalGoals, homeGoals, awayGoals, momentum);

  return {
    momentum,
    danger,
    opportunities: opportunities.sort((a, b) => {
      const levelOrder = { HOT: 0, WARM: 1, INFO: 2 };
      return (levelOrder[a.level] - levelOrder[b.level]) || (b.confidence - a.confidence);
    }),
    insights: [], // insights zaten ayrı field
    matchTemperature,
    nextGoalTeam,
    scorePressure,
  };
}

// ------ MOMENTUM ------
function calculateMomentum(
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  elapsed: number,
  homeName: string,
  awayName: string,
  homeGoals: number,
  awayGoals: number
): MomentumData {
  let homeScore = 50;
  let awayScore = 50;

  if (stats && stats.length >= 2) {
    const homePoss = getStat(stats, 0, "Ball Possession");
    const awayPoss = getStat(stats, 1, "Ball Possession");
    const homeShots = getStat(stats, 0, "Total Shots");
    const awayShots = getStat(stats, 1, "Total Shots");
    const homeSoG = getStat(stats, 0, "Shots on Goal");
    const awaySoG = getStat(stats, 1, "Shots on Goal");
    const homeCorners = getStat(stats, 0, "Corner Kicks");
    const awayCorners = getStat(stats, 1, "Corner Kicks");
    const homeDangerous = getStat(stats, 0, "Shots insidebox");
    const awayDangerous = getStat(stats, 1, "Shots insidebox");
    const homeXg = getStat(stats, 0, "expected_goals");
    const awayXg = getStat(stats, 1, "expected_goals");

    // Top hakimiyeti etkisi (x0.8)
    homeScore += (homePoss - 50) * 0.8;
    awayScore += (awayPoss - 50) * 0.8;

    // Şut üstünlüğü (x2)
    const totalShots = homeShots + awayShots || 1;
    homeScore += ((homeShots / totalShots) - 0.5) * 40;
    awayScore += ((awayShots / totalShots) - 0.5) * 40;

    // İsabetli şut farkı (x3 — daha değerli)
    const totalSoG = homeSoG + awaySoG || 1;
    homeScore += ((homeSoG / totalSoG) - 0.5) * 60;
    awayScore += ((awaySoG / totalSoG) - 0.5) * 60;

    // Ceza sahası içi şutlar (x2.5)
    const totalDangerous = homeDangerous + awayDangerous || 1;
    homeScore += ((homeDangerous / totalDangerous) - 0.5) * 50;
    awayScore += ((awayDangerous / totalDangerous) - 0.5) * 50;

    // Korner baskısı (x1)
    const totalCorners = homeCorners + awayCorners || 1;
    homeScore += ((homeCorners / totalCorners) - 0.5) * 20;
    awayScore += ((awayCorners / totalCorners) - 0.5) * 20;

    // xG etkisi (x3 — en güvenilir sinyal)
    if (homeXg + awayXg > 0) {
      const totalXg = homeXg + awayXg || 1;
      homeScore += ((homeXg / totalXg) - 0.5) * 60;
      awayScore += ((awayXg / totalXg) - 0.5) * 60;
    }
  }

  // Son olaylar bonus (son 10dk gol/kartlar)
  if (events) {
    const recentEvents = events.filter(e => elapsed - e.time.elapsed <= 10);
    for (const ev of recentEvents) {
      if (ev.type === "Goal") {
        const isHome = ev.team.name === homeName;
        if (isHome) homeScore += 10;
        else awayScore += 10;
      }
      if (ev.type === "Card" && ev.detail === "Red Card") {
        const isHome = ev.team.name === homeName;
        if (isHome) { homeScore -= 15; awayScore += 10; }
        else { awayScore -= 15; homeScore += 10; }
      }
    }
  }

  // Skor durumu etkisi — geri kalan takım daha agresif
  if (homeGoals < awayGoals) { homeScore += 8; }
  if (awayGoals < homeGoals) { awayScore += 8; }

  // Normalize 0-100
  homeScore = Math.max(0, Math.min(100, homeScore));
  awayScore = Math.max(0, Math.min(100, awayScore));

  const diff = homeScore - awayScore;
  const dominantTeam = Math.abs(diff) < 10 ? "balanced" : diff > 0 ? "home" : "away";
  const dominantName = dominantTeam === "home" ? homeName : dominantTeam === "away" ? awayName : "";

  let trend: "increasing" | "decreasing" | "stable" = "stable";
  if (Math.abs(diff) > 25) trend = "increasing";
  else if (Math.abs(diff) < 5) trend = "stable";

  const description =
    dominantTeam === "balanced"
      ? "⚖️ Dengeli maç, iki takım da eşit baskıda"
      : Math.abs(diff) > 30
      ? `🔥 ${dominantName} çok baskın! Üstünlük açık`
      : Math.abs(diff) > 15
      ? `📈 ${dominantName} daha etkili, momentum onda`
      : `↗️ ${dominantName} hafif üstün`;

  return { homeScore, awayScore, dominantTeam, trend, description };
}

// ------ TEHLİKE SEVİYESİ ------
function calculateDanger(
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
  momentum: MomentumData
): DangerLevel {
  let homeAttack = 30;
  let awayAttack = 30;

  if (stats && stats.length >= 2) {
    const homeSoG = getStat(stats, 0, "Shots on Goal");
    const awaySoG = getStat(stats, 1, "Shots on Goal");
    const homeDangerous = getStat(stats, 0, "Shots insidebox");
    const awayDangerous = getStat(stats, 1, "Shots insidebox");
    const homeXg = getStat(stats, 0, "expected_goals");
    const awayXg = getStat(stats, 1, "expected_goals");
    const homeCorners = getStat(stats, 0, "Corner Kicks");
    const awayCorners = getStat(stats, 1, "Corner Kicks");

    // İsabetli şut başına tehlike
    homeAttack += homeSoG * 6;
    awayAttack += awaySoG * 6;

    // Ceza sahası şutları
    homeAttack += homeDangerous * 5;
    awayAttack += awayDangerous * 5;

    // xG direkt ekleme
    homeAttack += homeXg * 15;
    awayAttack += awayXg * 15;

    // Korner tehlike (her korner mini fırsat)
    homeAttack += homeCorners * 2;
    awayAttack += awayCorners * 2;
  }

  // Geç dakikalar = artan tehlike
  if (elapsed >= 70) {
    const lateBoost = (elapsed - 70) * 0.8;
    homeAttack += lateBoost;
    awayAttack += lateBoost;
  }

  // Geri kalan takım ekstra atak
  if (homeGoals < awayGoals) homeAttack += 15;
  if (awayGoals < homeGoals) awayAttack += 15;

  // Kırmızı kart = atak gücü düşer
  if (events) {
    const redCards = events.filter(e => e.type === "Card" && e.detail === "Red Card");
    for (const rc of redCards) {
      if (rc.team.name) {
        // 10 kişi kalan takımın ataklığı düşer
        // (basit: events'ta team.id yok, isim üzerinden)
      }
    }
  }

  homeAttack = Math.max(0, Math.min(100, homeAttack));
  awayAttack = Math.max(0, Math.min(100, awayAttack));

  // Gol olasılığı: (iki takımın ortalama tehlike seviyesi) * zaman faktörü
  const avgDanger = (homeAttack + awayAttack) / 2;
  const timeMultiplier = elapsed < 30 ? 0.7 : elapsed < 60 ? 0.85 : elapsed < 75 ? 1.0 : 1.2;
  const goalProbability = Math.min(95, Math.round(avgDanger * timeMultiplier * 0.8));

  const description =
    goalProbability >= 75 ? "🔴 Çok yüksek gol tehlikesi!"
    : goalProbability >= 55 ? "🟠 Gol kapıda — yoğun baskı var"
    : goalProbability >= 35 ? "🟡 Orta seviye tehlike"
    : "🟢 Düşük tempo, gol beklentisi az";

  return { homeAttack, awayAttack, goalProbability, description };
}

// ------ FIRSAT TESPİTİ ------
function detectOpportunities(
  match: FixtureResponse,
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  prediction: { picks: Array<{ type: string; confidence: number; odds: number }> } | null,
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
  totalGoals: number,
  homeName: string,
  awayName: string,
  momentum: MomentumData,
  danger: DangerLevel,
  isHT: boolean,
  htHome: number,
  htAway: number
): LiveOpportunity[] {
  const opps: LiveOpportunity[] = [];

  if (!stats || stats.length < 2) return opps;

  const homeShots = getStat(stats, 0, "Total Shots");
  const awayShots = getStat(stats, 1, "Total Shots");
  const homeSoG = getStat(stats, 0, "Shots on Goal");
  const awaySoG = getStat(stats, 1, "Shots on Goal");
  const homePoss = getStat(stats, 0, "Ball Possession");
  const awayPoss = getStat(stats, 1, "Ball Possession");
  const homeDangerous = getStat(stats, 0, "Shots insidebox");
  const awayDangerous = getStat(stats, 1, "Shots insidebox");
  const homeXg = getStat(stats, 0, "expected_goals");
  const awayXg = getStat(stats, 1, "expected_goals");
  const homeCorners = getStat(stats, 0, "Corner Kicks");
  const awayCorners = getStat(stats, 1, "Corner Kicks");
  const totalCorners = homeCorners + awayCorners;
  const totalXg = homeXg + awayXg;
  const totalShots = homeShots + awayShots;
  const totalSoG = homeSoG + awaySoG;

  // Kırmızı kart bilgisi
  const redCards = events?.filter(e => e.type === "Card" && e.detail === "Red Card") || [];
  const hasRedCard = redCards.length > 0;

  // ============ OVER/UNDER FIRSATLARI ============

  // Yüksek xG ama düşük gol — Over fırsatı (regresyon beklentisi)
  if (totalXg > 2.0 && totalGoals < 2 && elapsed >= 30 && elapsed <= 70) {
    opps.push({
      level: totalXg > 3.0 ? "HOT" : "WARM",
      market: "Over 2.5",
      message: `xG ${totalXg.toFixed(1)} ama sadece ${totalGoals} gol — goller yakında!`,
      reasoning: `Beklenen gol (xG) ${totalXg.toFixed(1)} iken sadece ${totalGoals} gol atılmış. İstatistiksel olarak goller gecikmeli gelecek.`,
      confidence: Math.min(85, Math.round(totalXg * 25)),
      timeWindow: elapsed < 45 ? "2. Yarı" : "Son 30dk",
    });
  }

  // Çok fazla şut ama gol yok — baskı patlaması
  if (totalShots >= 20 && totalGoals <= 1 && elapsed >= 35 && elapsed <= 75) {
    opps.push({
      level: totalShots >= 28 ? "HOT" : "WARM",
      market: "Sıradaki Gol",
      message: `${totalShots} şut, ${totalSoG} isabetli ama sadece ${totalGoals} gol!`,
      reasoning: `Maçta yoğun pozisyon var. ${totalShots} şuttan sadece ${totalGoals} gol çıkmış — gol kaçınılmaz.`,
      confidence: Math.min(80, 50 + totalShots),
      timeWindow: "Yakın",
    });
  }

  // İlk yarı golsüz ama 2. yarıda tempo yükseldi
  if (htHome + htAway === 0 && elapsed >= 50 && elapsed <= 75 && totalXg > 1.5) {
    opps.push({
      level: "WARM",
      market: "Over 1.5",
      message: "İlk yarı 0-0 ama 2. yarıda tempo yükseldi",
      reasoning: `İlk yarı karşılıklı temkinliydi ama 2. yarıda pozisyonlar artıyor. xG: ${totalXg.toFixed(1)}`,
      confidence: 60,
      timeWindow: "Son 30dk",
    });
  }

  // Gol festivali — Over 3.5 / 4.5
  if (totalGoals >= 3 && elapsed <= 65) {
    opps.push({
      level: "HOT",
      market: totalGoals >= 4 ? "Over 4.5" : "Over 3.5",
      message: `${elapsed}' itibariyle ${totalGoals} gol — maç açık!`,
      reasoning: `Erken gol bolluğu savunma düzenini bozdu. Aksiyon devam edecek.`,
      confidence: Math.min(85, 55 + totalGoals * 6),
      timeWindow: "Devam eden",
    });
  }

  // Son dakikalar + düşük gol = Under güçleniyor
  if (elapsed >= 78 && totalGoals <= 1) {
    opps.push({
      level: "WARM",
      market: "Under 2.5",
      message: `${elapsed}' ve sadece ${totalGoals} gol — Under güvende`,
      reasoning: `Kalan süre çok az. Maç temposu düşük, Under 2.5 çok büyük ihtimalle tutar.`,
      confidence: Math.min(90, 70 + (elapsed - 78) * 2),
      timeWindow: `Son ${90 - elapsed}dk`,
    });
  }

  // ============ BTTS FIRSATLARI ============

  // Bir takım attı, diğeri çok baskı yapıyor
  if ((homeGoals > 0 && awayGoals === 0 && awayAttackStrong()) || 
      (awayGoals > 0 && homeGoals === 0 && homeAttackStrong())) {
    const attackingTeam = homeGoals === 0 ? homeName : awayName;
    const attackLevel = homeGoals === 0 ? danger.homeAttack : danger.awayAttack;
    opps.push({
      level: attackLevel > 60 ? "HOT" : "WARM",
      market: "BTTS Var",
      message: `${attackingTeam} yoğun baskıda — gol an meselesi!`,
      reasoning: `Bir takım zaten attı. ${attackingTeam} ${homeGoals === 0 ? homeSoG : awaySoG} isabetli şutla kapıyı zorluyor.`,
      confidence: Math.min(80, 50 + attackLevel * 0.3),
      timeWindow: elapsed < 60 ? "2. Yarı" : "Son bölüm",
    });
  }

  // İki takım da atak — BTTS ana fırsat
  if (homeGoals === 0 && awayGoals === 0 && homeSoG >= 2 && awaySoG >= 2 && elapsed >= 25 && elapsed <= 70) {
    opps.push({
      level: "WARM",
      market: "BTTS Var",
      message: `İki takım da şut buluyor (${homeSoG}-${awaySoG} isabetli) — BTTS muhtemel`,
      reasoning: `Her iki takım da gol pozisyonu üretiyor. xG: Ev ${homeXg.toFixed(1)} - Dep ${awayXg.toFixed(1)}`,
      confidence: Math.min(75, 40 + (homeSoG + awaySoG) * 4),
      timeWindow: "Devam eden",
    });
  }

  // ============ MAÇ SONUCU FIRSATLARI ============

  // Tek taraflı baskı — favori kazanır
  if (momentum.dominantTeam !== "balanced" && Math.abs(momentum.homeScore - momentum.awayScore) > 25) {
    const dominant = momentum.dominantTeam === "home" ? homeName : awayName;
    const dominantGoals = momentum.dominantTeam === "home" ? homeGoals : awayGoals;
    const otherGoals = momentum.dominantTeam === "home" ? awayGoals : homeGoals;
    const market = momentum.dominantTeam === "home" ? "MS 1" : "MS 2";

    if (dominantGoals >= otherGoals) {
      opps.push({
        level: Math.abs(momentum.homeScore - momentum.awayScore) > 40 ? "HOT" : "WARM",
        market,
        message: `${dominant} maça hakim — ${dominantGoals > otherGoals ? "önde" : "beraberde"} ve baskılı`,
        reasoning: `Momentum: ${momentum.homeScore.toFixed(0)}-${momentum.awayScore.toFixed(0)}. ${dominant} istatistiklerde çok üstün.`,
        confidence: Math.min(80, 50 + Math.abs(momentum.homeScore - momentum.awayScore) * 0.5),
        timeWindow: elapsed < 60 ? "Maç sonu" : `Son ${90 - elapsed}dk`,
      });
    }
  }

  // 10 kişi kalan takıma karşı — sayısal üstünlük fırsatı
  if (hasRedCard && elapsed <= 75) {
    for (const rc of redCards) {
      const weakTeam = rc.team.name;
      const strongTeam = weakTeam === homeName ? awayName : homeName;
      const market = weakTeam === homeName ? "MS 2" : "MS 1";
      const timeSinceRed = elapsed - rc.time.elapsed;

      if (timeSinceRed <= 30) {
        opps.push({
          level: "HOT",
          market,
          message: `${weakTeam} 10 kişi! ${strongTeam} için büyük fırsat`,
          reasoning: `Kırmızı kart sonrası ${strongTeam} sayısal üstünlükte. 10 kişi kalan takımlar son 30dk'da %35+ daha fazla gol yer.`,
          confidence: 70,
          timeWindow: `Son ${90 - elapsed}dk`,
        });

        // 10 kişi= over fırsatı da
        opps.push({
          level: "WARM",
          market: "Over 2.5",
          message: `Kırmızı kart maçı açtı — gol gelir`,
          reasoning: `10 kişi kalan takım savunmada boşluk bırakır, karşı takım daha çok pozisyon bulur.`,
          confidence: 60,
          timeWindow: `Son ${90 - elapsed}dk`,
        });
      }
    }
  }

  // ============ KORNER FIRSATLARI ============
  if (totalCorners >= 8 && elapsed <= 70) {
    const perMin = totalCorners / Math.max(elapsed, 1);
    const projected = Math.round(perMin * 90);
    if (projected >= 12) {
      opps.push({
        level: projected >= 14 ? "HOT" : "WARM",
        market: `Toplam Korner Üst ${projected >= 14 ? "11.5" : "9.5"}`,
        message: `${elapsed}'de ${totalCorners} korner — projeksiyon: ${projected}`,
        reasoning: `Mevcut tempoda maç sonunda ${projected} korner bekleniyor. Set piece'ler de gol getirebilir.`,
        confidence: Math.min(80, 50 + totalCorners * 2),
        timeWindow: "Maç sonu",
      });
    }
  }

  // ============ SKOR TEMELLİ FIRSATLAR ============

  // Geri kalan takım baskılıysa — eşitlik/çevirme fırsatı
  if (homeGoals !== awayGoals && elapsed >= 45 && elapsed <= 80) {
    const trailing = homeGoals < awayGoals ? "home" : "away";
    const trailingName = trailing === "home" ? homeName : awayName;
    const trailingMomentum = trailing === "home" ? momentum.homeScore : momentum.awayScore;
    const trailingAttack = trailing === "home" ? danger.homeAttack : danger.awayAttack;

    if (trailingMomentum > 55 && trailingAttack > 50) {
      opps.push({
        level: trailingMomentum > 65 ? "HOT" : "WARM",
        market: trailing === "home" ? "ÇS 1X" : "ÇS X2",
        message: `${trailingName} geri ama çok baskılı! Eşitlik yakın`,
        reasoning: `Geri kalan ${trailingName} momentum skoru ${trailingMomentum.toFixed(0)} ile baskın. Atak gücü: ${trailingAttack.toFixed(0)}/100`,
        confidence: Math.min(70, 40 + trailingMomentum * 0.3),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    }
  }

  // Devre arası — 2. yarı gol beklentisi
  if (isHT) {
    if (htHome + htAway === 0 && totalXg > 1.0) {
      opps.push({
        level: "WARM",
        market: "2. Yarı Gol Var",
        message: `İlk yarı 0-0 ama xG ${totalXg.toFixed(1)} — 2. yarı patlar`,
        reasoning: `Pozisyon üretimi var ama bitiricilikte sıkıntı yaşandı. 2. yarıda taktik değişikliklerle goller gelecek.`,
        confidence: 65,
        timeWindow: "2. Yarı",
      });
    }
    if (htHome + htAway >= 3) {
      opps.push({
        level: "HOT",
        market: "Over 3.5",
        message: `İlk yarıda ${htHome + htAway} gol — maç çılgın!`,
        reasoning: `Savunmalar çökmüş durumda. Bu tempoda 2. yarıda da gol beklenir.`,
        confidence: 75,
        timeWindow: "2. Yarı",
      });
    }
  }

  return opps;

  // Helper: Ev sahibi atak gücü yüksek mi?
  function homeAttackStrong(): boolean {
    return homeSoG >= 3 || homeXg > 1.0 || homeDangerous >= 4;
  }
  function awayAttackStrong(): boolean {
    return awaySoG >= 3 || awayXg > 1.0 || awayDangerous >= 4;
  }
}

// ------ MAÇ SICAKLIĞI ------
function calculateTemperature(
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  elapsed: number,
  totalGoals: number
): number {
  let temp = 30; // base

  // Gol etkisi (büyük)
  temp += totalGoals * 12;

  // Şut yoğunluğu
  if (stats && stats.length >= 2) {
    const totalShots = getStat(stats, 0, "Total Shots") + getStat(stats, 1, "Total Shots");
    const perMin = elapsed > 0 ? totalShots / elapsed : 0;
    temp += perMin * 80; // yüksek şut yoğunluğu = sıcak maç
  }

  // Olay yoğunluğu
  if (events) {
    temp += events.filter(e => e.type === "Goal").length * 8;
    temp += events.filter(e => e.type === "Card" && e.detail === "Red Card").length * 15;
    temp += events.filter(e => e.type === "Card" && e.detail === "Yellow Card").length * 2;
  }

  // Geç dakikalar + yakın skor = heyecan artışı
  if (elapsed >= 75 && totalGoals > 0) {
    temp += 10;
  }

  return Math.max(0, Math.min(100, Math.round(temp)));
}

// ------ BİR SONRAKİ GOL TAHMİNİ ------
function predictNextGoal(
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  elapsed: number,
  momentum: MomentumData,
  danger: DangerLevel,
  homeGoals: number,
  awayGoals: number
): "home" | "away" | "either" | "unlikely" {
  // Çok geç dakikalar + az tehlike
  if (elapsed >= 85 && danger.goalProbability < 40) return "unlikely";

  // Dominant takım belli ise
  if (momentum.dominantTeam !== "balanced") {
    const diffPercent = Math.abs(momentum.homeScore - momentum.awayScore);
    if (diffPercent > 20) {
      return momentum.dominantTeam as "home" | "away";
    }
  }

  // Tehlike seviyeleri kontrol
  if (danger.homeAttack > danger.awayAttack + 20) return "home";
  if (danger.awayAttack > danger.homeAttack + 20) return "away";

  // Dengeli ama tehlikeli
  if (danger.goalProbability > 50) return "either";

  return "unlikely";
}

// ------ SKOR BASKISI ------
function calculateScorePressure(
  elapsed: number,
  totalGoals: number,
  homeGoals: number,
  awayGoals: number,
  momentum: MomentumData
): number {
  let pressure = 20;

  // Golsüz geçen süre baskı yaratır
  if (totalGoals === 0) {
    pressure += Math.min(40, elapsed * 0.5);
  }

  // Geri kalan takım baskısı
  if (homeGoals !== awayGoals) {
    pressure += 15;
    if (elapsed >= 70) pressure += 20; // son dakikalar + geriden gelmek
  }

  // Geç dakika baskısı
  if (elapsed >= 80) pressure += 15;
  if (elapsed >= 85) pressure += 10;

  // Momentum dengesizliği baskı yaratır
  pressure += Math.abs(momentum.homeScore - momentum.awayScore) * 0.3;

  return Math.max(0, Math.min(100, Math.round(pressure)));
}
