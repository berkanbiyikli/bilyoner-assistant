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
  "Dangerous Attacks": "Tehlikeli Atak",
};

// ---- v2 SABİTLERİ: Akıllı Filtreler ----
const MIN_LIVE_ODDS = 1.40;                    // Minimum oran eşiği — altındaki öneriler filtrelenir
const LATE_GAME_UNDER_BLACKLIST_MINUTE = 80;   // 80+ dakikada Under/Alt önerileri tamamen engellenir
const LATE_GAME_UNDER_SOFT_MINUTE = 70;        // 70-80 arası Under önerileri için sıkı koşullar
const LATE_GAME_UNDER_MAX_CONFIDENCE = 55;     // 70-80 arası Under max güven
const LATE_GAME_UNDER_MIN_ODDS = 1.60;         // 70-80 arası Under min oran
const XG_GOAL_COMING_THRESHOLD = 1.0;          // liveXg - actualGoals > 1.0 ise "Gol Geliyor" sinyali
const PRESSURE_UNDER_BLOCK_RATE = 3;           // Tehlikeli atak/dk > 3 ise Under engelleyici

// Senaryo tipleri
type ScenarioType = "BASKI_VAR" | "MAC_UYUDU" | "GOL_FESTIVALI" | "SAVUNMA_SAVASI" | "COMEBACK_KOKUSU" | "ERKEN_FIRTINA" | "SON_DAKIKA_HEYECANI" | "NORMAL";

// Önceki polling verileri cache (in-memory, stats diff hesabı için)
const previousStatsCache = new Map<number, { timestamp: number; stats: Record<string, number> }>();

// ---- Opportunity & Momentum Types ----

type AlertLevel = "HOT" | "WARM" | "INFO";
type OpportunityCategory = "UYUYAN_DEV" | "ERKEN_PATLAMA" | "SON_DAKIKA_VURGUN" | "STANDART";

interface LiveOpportunity {
  level: AlertLevel;
  market: string;
  message: string;
  reasoning: string;
  confidence: number;
  timeWindow: string;
  scenario?: ScenarioType;
  valueScore: number;             // 0-100: Bahis değeri (düşük oran = düşük değer)
  category: OpportunityCategory;  // Fırsat kategorisi
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

interface PressureData {
  home: number;          // 0-100
  away: number;          // 0-100
}

interface LiveMomentumEnrichedData {
  liveXg: { home: number; away: number };
  xgDelta: number;
  pressureIndex: PressureData;
  recentDangerousRate: { home: number; away: number };
  scenarioType: ScenarioType;
  scenarioMessage: string;
}

interface LiveMatchAnalysis {
  momentum: MomentumData;
  danger: DangerLevel;
  opportunities: LiveOpportunity[];
  insights: string[];
  matchTemperature: number;
  nextGoalTeam: "home" | "away" | "either" | "unlikely";
  scorePressure: number;
  // v2: Zenginleştirilmiş momentum verileri
  enrichedMomentum?: LiveMomentumEnrichedData;
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

    // Maçları öncelik sırasına göre sırala (enrichment için)
    const prioritizedMatches = [...matches].sort((a, b) => {
      // 1. DB'de tahmini olanlar önce
      const aPred = predMap.has(a.fixture.id) ? 1 : 0;
      const bPred = predMap.has(b.fixture.id) ? 1 : 0;
      if (aPred !== bPred) return bPred - aPred;

      // 2. Gollü maçlar önce (daha heyecanlı)
      const aGoals = (a.goals.home ?? 0) + (a.goals.away ?? 0);
      const bGoals = (b.goals.home ?? 0) + (b.goals.away ?? 0);
      if (aGoals !== bGoals) return bGoals - aGoals;

      // 3. İleri dakikadakiler önce (daha fazla data)
      const aElapsed = a.fixture.status.elapsed ?? 0;
      const bElapsed = b.fixture.status.elapsed ?? 0;
      return bElapsed - aElapsed;
    });

    // İlk N maça detaylı istatistik çek (API limitleri için batch)
    const ENRICH_LIMIT = 50;
    const matchesToEnrich = new Set(prioritizedMatches.slice(0, ENRICH_LIMIT).map(m => m.fixture.id));

    // Tüm maçları paralel olarak zenginleştir
    const BATCH_SIZE = 15;
    const allEnriched: EnrichedLiveMatch[] = [];

    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (match) => {
          const fid = match.fixture.id;
          const shouldEnrich = matchesToEnrich.has(fid);

          // Detaylı istatistik sadece öncelikli maçlara
          let stats: FixtureStatisticsResponse[] | null = null;
          let events: FixtureEvent[] | null = null;
          let lineups: LineupResponse[] | null = null;

          if (shouldEnrich) {
            [stats, events, lineups] = await Promise.all([
              getFixtureStatistics(fid).catch(() => null),
              getFixtureEvents(fid).catch(() => null),
              getLineups(fid).catch(() => null),
            ]);
          }

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

          // HER MAÇ İÇİN analiz üret (stats yoksa skor bazlı çalışır)
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
      allEnriched.push(...batchResults);
    }

    return NextResponse.json({
      count: matches.length,
      enriched: allEnriched,
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
// CANLI ANALİZ MOTORu v2 — Momentum, Fırsat, Tehlike, Senaryo, Baskı
// =============================================

function getStat(stats: FixtureStatisticsResponse[], teamIdx: number, type: string): number {
  const s = stats[teamIdx]?.statistics?.find((st) => st.type === type);
  if (!s) return 0;
  return typeof s.value === "string" ? parseFloat(s.value) || 0 : (s.value as number) ?? 0;
}

// ------ BASKI ENDEKSİ (Pressure Index) ------
function calculatePressureIndex(
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
  fixtureId: number
): PressureData {
  let homePressure = 20;
  let awayPressure = 20;

  if (!stats || stats.length < 2) return { home: homePressure, away: awayPressure };

  const homeSoG = getStat(stats, 0, "Shots on Goal");
  const awaySoG = getStat(stats, 1, "Shots on Goal");
  const homeCorners = getStat(stats, 0, "Corner Kicks");
  const awayCorners = getStat(stats, 1, "Corner Kicks");
  const homePoss = getStat(stats, 0, "Ball Possession");
  const awayPoss = getStat(stats, 1, "Ball Possession");
  const homeDangerousAtk = getStat(stats, 0, "Dangerous Attacks") || getStat(stats, 0, "Shots insidebox");
  const awayDangerousAtk = getStat(stats, 1, "Dangerous Attacks") || getStat(stats, 1, "Shots insidebox");
  const homeXg = getStat(stats, 0, "expected_goals");
  const awayXg = getStat(stats, 1, "expected_goals");

  // Son 10dk yaklaşımı: Mevcut istatistikleri cache'le, diff hesapla
  const now = Date.now();
  const prev = previousStatsCache.get(fixtureId);
  let recentHomeDangerous = 0;
  let recentAwayDangerous = 0;
  let recentHomeCorners = 0;
  let recentAwayCorners = 0;
  let recentHomeSoG = 0;
  let recentAwaySoG = 0;

  if (prev && (now - prev.timestamp) < 300_000) { // 5dk içindeki önceki veriden diff
    const timeDeltaMin = Math.max(1, (now - prev.timestamp) / 60_000);
    recentHomeDangerous = Math.max(0, homeDangerousAtk - (prev.stats.homeDangerous || 0)) / timeDeltaMin;
    recentAwayDangerous = Math.max(0, awayDangerousAtk - (prev.stats.awayDangerous || 0)) / timeDeltaMin;
    recentHomeCorners = Math.max(0, homeCorners - (prev.stats.homeCorners || 0));
    recentAwayCorners = Math.max(0, awayCorners - (prev.stats.awayCorners || 0));
    recentHomeSoG = Math.max(0, homeSoG - (prev.stats.homeSoG || 0));
    recentAwaySoG = Math.max(0, awaySoG - (prev.stats.awaySoG || 0));
  }

  // Cache'i güncelle
  previousStatsCache.set(fixtureId, {
    timestamp: now,
    stats: { homeDangerous: homeDangerousAtk, awayDangerous: awayDangerousAtk, homeCorners, awayCorners, homeSoG, awaySoG },
  });

  // Pressure formülü (0-100):
  // recentCorners × 8 + recentSoG × 12 + possessionDelta × 0.6 + dangerousRate × 10 + trailing bonus + late bonus
  homePressure += recentHomeCorners * 8;
  homePressure += recentHomeSoG * 12;
  homePressure += Math.max(0, (homePoss - 50)) * 0.6;
  homePressure += recentHomeDangerous * 10;
  if (homeGoals < awayGoals) homePressure += 15; // trailing bonus
  if (elapsed > 75) homePressure += 10;          // late-game bonus

  awayPressure += recentAwayCorners * 8;
  awayPressure += recentAwaySoG * 12;
  awayPressure += Math.max(0, (awayPoss - 50)) * 0.6;
  awayPressure += recentAwayDangerous * 10;
  if (awayGoals < homeGoals) awayPressure += 15;
  if (elapsed > 75) awayPressure += 10;

  // xG etkisi
  homePressure += homeXg * 8;
  awayPressure += awayXg * 8;

  return {
    home: Math.max(0, Math.min(100, Math.round(homePressure))),
    away: Math.max(0, Math.min(100, Math.round(awayPressure))),
  };
}

// ------ SENARYO SINIFLANDIRICI ------
function classifyScenario(
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
  totalGoals: number,
  momentum: MomentumData,
  pressure: PressureData,
  danger: DangerLevel,
  liveXgDelta: number,
  stats: FixtureStatisticsResponse[] | null,
  homeName: string,
  awayName: string
): { type: ScenarioType; message: string } {
  const goalDiff = Math.abs(homeGoals - awayGoals);
  const trailingTeam = homeGoals < awayGoals ? "home" : awayGoals < homeGoals ? "away" : null;
  const trailingName = trailingTeam === "home" ? homeName : trailingTeam === "away" ? awayName : "";
  const trailingMomentum = trailingTeam === "home" ? momentum.homeScore : trailingTeam === "away" ? momentum.awayScore : 0;
  const trailingPressure = trailingTeam === "home" ? pressure.home : trailingTeam === "away" ? pressure.away : 0;

  // Son 15dk isabetli şut
  const totalSoG = stats && stats.length >= 2
    ? getStat(stats, 0, "Shots on Goal") + getStat(stats, 1, "Shots on Goal")
    : 0;
  const totalShots = stats && stats.length >= 2
    ? getStat(stats, 0, "Total Shots") + getStat(stats, 1, "Total Shots")
    : 0;

  // ERKEN FIRTINA: İlk 30dk'da 2+ gol
  if (elapsed <= 30 && totalGoals >= 2) {
    return {
      type: "ERKEN_FIRTINA",
      message: `⚡ İlk ${elapsed} dakikada ${totalGoals} gol! Savunmalar çökmüş, gol festivali devam edebilir.`,
    };
  }

  // GOL FESTİVALİ: 3+ gol ve hala süre var
  if (totalGoals >= 3 && elapsed <= 70) {
    return {
      type: "GOL_FESTIVALI",
      message: `⚽ ${totalGoals} gol ve daha ${90 - elapsed} dakika var! Tempo çok yüksek, savunmalar delik deşik.`,
    };
  }

  // SON DAKİKA HEYECANI: 80+ ve 1 fark
  if (elapsed >= 80 && goalDiff === 1 && trailingTeam) {
    const hasTrailingPressure = trailingPressure > 45 || trailingMomentum > 50;
    return {
      type: "SON_DAKIKA_HEYECANI",
      message: hasTrailingPressure
        ? `🔥 ${trailingName} son dakikalarda eşitlik arıyor! Baskı endeksi: ${trailingPressure}/100`
        : `⏰ ${elapsed}' ve 1 fark — ${trailingName} pek baskı yapamıyor, skor muhtemelen bu kalır.`,
    };
  }

  // BASKI_VAR: Geri kalan takım yoğun baskıda
  if (trailingTeam && trailingMomentum > 55 && trailingPressure > 45) {
    return {
      type: "BASKI_VAR",
      message: `🔥 ${trailingName} son dakikalarda yoğun baskı yapıyor! Momentum: ${trailingMomentum.toFixed(0)}/100, Baskı: ${trailingPressure}/100`,
    };
  }

  // COMEBACK KOKUSU: Geri kalan takım xG açısından şanssız
  if (trailingTeam && liveXgDelta > 0.6 && trailingPressure > 40) {
    return {
      type: "COMEBACK_KOKUSU",
      message: `⚡ Gol eksik! xG farkı +${liveXgDelta.toFixed(1)} — ${trailingName} pozisyon üretiyor ama bitiremedi. Gol an meselesi!`,
    };
  }

  // MAÇ UYUDU: Tempo düşük, pozisyon yok
  if (elapsed >= 50 && totalSoG <= 2 && totalShots < 12 && goalDiff <= 1) {
    return {
      type: "MAC_UYUDU",
      message: `😴 İki takım da rölantide. ${elapsed} dakikada sadece ${totalSoG} isabetli şut — tempo çok düşük.`,
    };
  }

  // SAVUNMA SAVASI: Az şut, sıkı defans
  if (totalShots < 10 && elapsed >= 50 && goalDiff <= 1) {
    return {
      type: "SAVUNMA_SAVASI",
      message: `🛡️ Savunma savaşı! ${elapsed} dakikada toplam ${totalShots} şut — iki takım da defansif.`,
    };
  }

  return { type: "NORMAL", message: "" };
}

// ------ ZENGİNLEŞTİRİLMİŞ MOMENTUM VERİLERİ ------
function buildEnrichedMomentum(
  stats: FixtureStatisticsResponse[] | null,
  events: FixtureEvent[] | null,
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
  totalGoals: number,
  momentum: MomentumData,
  danger: DangerLevel,
  homeName: string,
  awayName: string,
  fixtureId: number
): LiveMomentumEnrichedData {
  const pressure = calculatePressureIndex(stats, events, elapsed, homeGoals, awayGoals, fixtureId);

  // Canlı xG
  const homeXg = stats && stats.length >= 2 ? getStat(stats, 0, "expected_goals") : 0;
  const awayXg = stats && stats.length >= 2 ? getStat(stats, 1, "expected_goals") : 0;
  const liveXg = { home: homeXg, away: awayXg };
  const xgDelta = (homeXg + awayXg) - totalGoals;

  // Tehlikeli atak oranı (toplam / dakika)
  const homeDangerousAtk = stats && stats.length >= 2
    ? (getStat(stats, 0, "Dangerous Attacks") || getStat(stats, 0, "Shots insidebox")) : 0;
  const awayDangerousAtk = stats && stats.length >= 2
    ? (getStat(stats, 1, "Dangerous Attacks") || getStat(stats, 1, "Shots insidebox")) : 0;
  const minuteDiv = Math.max(1, elapsed);
  const recentDangerousRate = {
    home: Math.round((homeDangerousAtk / minuteDiv) * 10 * 100) / 100,
    away: Math.round((awayDangerousAtk / minuteDiv) * 10 * 100) / 100,
  };

  // Senaryo sınıflandırması
  const scenario = classifyScenario(
    elapsed, homeGoals, awayGoals, totalGoals,
    momentum, pressure, danger, xgDelta,
    stats, homeName, awayName
  );

  return {
    liveXg,
    xgDelta,
    pressureIndex: pressure,
    recentDangerousRate,
    scenarioType: scenario.type,
    scenarioMessage: scenario.message,
  };
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

  // === ZENGİNLEŞTİRİLMİŞ MOMENTUM (v2: xG, Baskı, Senaryo) ===
  const enrichedMomentum = buildEnrichedMomentum(
    stats, events, elapsed, homeGoals, awayGoals, totalGoals,
    momentum, danger, homeName, awayName, match.fixture.id
  );

  // === FIRSAT TESPİTİ (v2: filtreli + senaryo bazlı) ===
  const opportunities = detectOpportunities(
    match, stats, events, prediction, elapsed,
    homeGoals, awayGoals, totalGoals, homeName, awayName,
    momentum, danger, isHT, htHome, htAway, enrichedMomentum
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
      return (levelOrder[a.level] - levelOrder[b.level]) || (b.valueScore - a.valueScore) || (b.confidence - a.confidence);
    }),
    insights: [],
    matchTemperature,
    nextGoalTeam,
    scorePressure,
    enrichedMomentum,
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

// ------ FIRSAT TESPİTİ v2 (Akıllı Filtreler + Senaryo Bazlı) ------
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
  htAway: number,
  enriched: LiveMomentumEnrichedData
): LiveOpportunity[] {
  type RawOpportunity = Omit<LiveOpportunity, "valueScore" | "category">;
  const rawOpps: RawOpportunity[] = [];

  // ============ YARDIMCI ============
  // DİNAMİK BAREM: Gol temposuna göre akıllı Over hedef çizgisi
  const staticOverLine = totalGoals < 2 ? 1.5 : totalGoals < 3 ? 2.5 : totalGoals < 4 ? 3.5 : totalGoals < 5 ? 4.5 : totalGoals < 6 ? 5.5 : 6.5;
  const goalsPerMinute = totalGoals / Math.max(elapsed, 1);
  const projectedTotal = goalsPerMinute * 90;
  // Tempo yüksekse (projeksiyon baremi +2 aşıyor), bir üst baremi hedefle
  // Örn: 25'de 3 gol → projeksiyon 10.8 → Over 3.5 yerine Over 4.5 öner
  const nextOverLine = (elapsed <= 60 && totalGoals >= 2 && projectedTotal > staticOverLine + 2)
    ? totalGoals + 1.5
    : staticOverLine;
  const goalDiff = Math.abs(homeGoals - awayGoals);
  const leadingTeam = homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : "draw";
  const leadingName = leadingTeam === "home" ? homeName : leadingTeam === "away" ? awayName : "";
  const trailingName = leadingTeam === "home" ? awayName : leadingTeam === "away" ? homeName : "";
  const trailingMomentum = leadingTeam === "home" ? momentum.awayScore : leadingTeam === "away" ? momentum.homeScore : 0;
  const trailingPressure = leadingTeam === "home" ? enriched.pressureIndex.away : leadingTeam === "away" ? enriched.pressureIndex.home : 0;
  const scenario = enriched.scenarioType;

  // Market Under/Alt olup olmadığını kontrol eden helper
  const isUnderMarket = (market: string) => market.toLowerCase().includes("under") || market.toLowerCase().includes("alt");

  // ============================================
  // FAZ 3: SENARYO BAZLI ÖNERİLER (Hikayeler)
  // ============================================

  if (scenario === "BASKI_VAR" && trailingName) {
    // 🔥 Baskı yapan takım — Under YASAK, Sıradaki Gol / Beraberlik / Over öner
    const recentShots = stats && stats.length >= 2
      ? (leadingTeam === "home" ? getStat(stats, 1, "Shots on Goal") : getStat(stats, 0, "Shots on Goal"))
      : 0;
    rawOpps.push({
      level: "HOT",
      market: goalDiff === 1 ? "Sıradaki Gol" : `Over ${nextOverLine}`,
      message: `🔥 ${trailingName} son dakikalarda ${recentShots} isabetli şut çekti. ${goalDiff === 1 ? "Beraberlik arıyor!" : "Gol geliyor!"}`,
      reasoning: `Baskı endeksi: ${trailingPressure}/100. Momentum: ${trailingMomentum.toFixed(0)}/100. ${trailingName} ceza sahasına yığılmış durumda.`,
      confidence: Math.min(75, 50 + trailingPressure * 0.25),
      timeWindow: `Son ${90 - elapsed}dk`,
      scenario: "BASKI_VAR",
    });
    if (goalDiff === 1) {
      rawOpps.push({
        level: "WARM",
        market: "MS X",
        message: `🔥 ${trailingName} eşitlik peşinde — beraberlik kokusu var!`,
        reasoning: `Geriden gelen ${trailingName} yoğun baskıda. xG Delta: +${enriched.xgDelta.toFixed(1)}`,
        confidence: Math.min(65, 40 + trailingPressure * 0.2),
        timeWindow: `Son ${90 - elapsed}dk`,
        scenario: "BASKI_VAR",
      });
    }
  }

  if (scenario === "MAC_UYUDU") {
    rawOpps.push({
      level: elapsed >= 75 ? "HOT" : "WARM",
      market: goalDiff === 0 ? "MS X" : (leadingTeam === "home" ? "MS 1" : "MS 2"),
      message: `😴 İki takım da rölantide. Son ${Math.max(10, elapsed - 50)} dakikada isabetli şut yok.`,
      reasoning: `Tempo çok düşük, pozisyon üretimi minimal. Mevcut skor muhtemelen korunur.`,
      confidence: Math.min(70, 45 + (elapsed >= 75 ? 15 : 0) + (elapsed >= 80 ? 10 : 0)),
      timeWindow: `Son ${90 - elapsed}dk`,
      scenario: "MAC_UYUDU",
    });
  }

  if (scenario === "GOL_FESTIVALI") {
    rawOpps.push({
      level: "HOT",
      market: `Over ${nextOverLine}`,
      message: `⚽ ${totalGoals} gol ve daha ${90 - elapsed} dakika var! Savunmalar delik deşik!`,
      reasoning: `Tempo çok yüksek. Her iki takım da defansif yapısını kaybetmiş. Over ${nextOverLine} büyük ihtimalle tutar.`,
      confidence: Math.min(82, 50 + totalGoals * 5 + (elapsed < 60 ? 10 : 0)),
      timeWindow: `Son ${90 - elapsed}dk`,
      scenario: "GOL_FESTIVALI",
    });
    if (homeGoals > 0 && awayGoals > 0) {
      rawOpps.push({
        level: "WARM",
        market: "BTTS Var",
        message: `⚽ İki takım da gol attı ve gol temposu devam ediyor!`,
        reasoning: `BTTS zaten gerçekleşti. Savunmalar çökmüş, sıradaki gol her an gelebilir.`,
        confidence: 70,
        timeWindow: `Son ${90 - elapsed}dk`,
        scenario: "GOL_FESTIVALI",
      });
    }
  }

  if (scenario === "COMEBACK_KOKUSU" && trailingName) {
    rawOpps.push({
      level: "HOT",
      market: "Sıradaki Gol",
      message: `⚡ ${trailingName} xG: ${enriched.liveXg[leadingTeam === "home" ? "away" : "home"].toFixed(1)} ama skor hala ${homeGoals}-${awayGoals}. Gol kapıda!`,
      reasoning: `xG farkı +${enriched.xgDelta.toFixed(1)} — pozisyon üretimi golle ödüllendirilmemiş. İstatistiksel düzeltme bekleniyor.`,
      confidence: Math.min(75, 45 + enriched.xgDelta * 15),
      timeWindow: "Yakın",
      scenario: "COMEBACK_KOKUSU",
    });
    if (goalDiff === 1) {
      rawOpps.push({
        level: "WARM",
        market: leadingTeam === "home" ? "ÇS X2" : "ÇS 1X",
        message: `⚡ Comeback kokusu! ${trailingName} pozisyon üretiyor, sadece bitiricilik eksik.`,
        reasoning: `Baskı endeksi: ${trailingPressure}/100. xG regresyonu gösteriyor ki gol kaçınılmaz.`,
        confidence: Math.min(65, 40 + enriched.xgDelta * 10),
        timeWindow: `Son ${90 - elapsed}dk`,
        scenario: "COMEBACK_KOKUSU",
      });
    }
  }

  if (scenario === "SAVUNMA_SAVASI") {
    if (elapsed < LATE_GAME_UNDER_BLACKLIST_MINUTE) {
      rawOpps.push({
        level: "WARM",
        market: `Under ${nextOverLine > 2.5 ? nextOverLine : "2.5"}`,
        message: `🛡️ Savunma savaşı! İki takım da defansif, gol beklentisi düşük.`,
        reasoning: `Toplam şut sayısı çok düşük. Defansif taktikler hakim.`,
        confidence: Math.min(68, 45 + (elapsed >= 60 ? 12 : 0)),
        timeWindow: `Son ${90 - elapsed}dk`,
        scenario: "SAVUNMA_SAVASI",
      });
    }
    rawOpps.push({
      level: "INFO",
      market: goalDiff === 0 ? "MS X" : (leadingTeam === "home" ? "MS 1" : "MS 2"),
      message: `🛡️ Mevcut skor korunabilir.`,
      reasoning: `Düşük tempo maçlarında son durum genelde korunur.`,
      confidence: Math.min(60, 40 + (elapsed >= 70 ? 12 : 0)),
      timeWindow: `Son ${90 - elapsed}dk`,
      scenario: "SAVUNMA_SAVASI",
    });
  }

  if (scenario === "ERKEN_FIRTINA") {
    rawOpps.push({
      level: "HOT",
      market: `Over ${nextOverLine}`,
      message: `⚡ İlk ${elapsed} dakikada ${totalGoals} gol! Fırtına devam edecek!`,
      reasoning: `Erken goller oyun planlarını alt üst etti. Savunmalar açıldı, tempo çok yüksek.`,
      confidence: Math.min(78, 50 + totalGoals * 10),
      timeWindow: "Maç geneli",
      scenario: "ERKEN_FIRTINA",
    });
    rawOpps.push({
      level: "WARM",
      market: "BTTS Var",
      message: `⚡ Bu tempoda iki takım da mutlaka gol atar!`,
      reasoning: `Erken goller defansif yapıyı bozar, BTTS olasılığı yüksek.`,
      confidence: Math.min(68, 40 + totalGoals * 12),
      timeWindow: "Maç geneli",
      scenario: "ERKEN_FIRTINA",
    });
  }

  if (scenario === "SON_DAKIKA_HEYECANI" && trailingName) {
    // 80+ dakika, 1 fark — Under YASAK, sadece MS veya Beraberlik
    if (trailingPressure > 45 || trailingMomentum > 50) {
      rawOpps.push({
        level: "HOT",
        market: "MS X",
        message: `🔥 ${trailingName} son dakikalarda eşitlik arıyor! Baskı çok yoğun!`,
        reasoning: `Baskı endeksi: ${trailingPressure}/100. ${trailingName} ceza sahasına yükleniyor.`,
        confidence: Math.min(72, 50 + trailingPressure * 0.2),
        timeWindow: `Son ${90 - elapsed}dk`,
        scenario: "SON_DAKIKA_HEYECANI",
      });
    } else {
      rawOpps.push({
        level: "WARM",
        market: leadingTeam === "home" ? "MS 1" : "MS 2",
        message: `⏰ ${elapsed}' ve ${leadingName} önde. ${trailingName} pek baskı yapamıyor.`,
        reasoning: `Baskı endeksi düşük (${trailingPressure}/100). Mevcut skor muhtemelen korunacak.`,
        confidence: Math.min(70, 50 + (elapsed - 80) * 3),
        timeWindow: `Son ${90 - elapsed}dk`,
        scenario: "SON_DAKIKA_HEYECANI",
      });
    }
  }

  // ============================================
  // NORMAL SENARYO + KLASİK KURALLAR (senaryoya girmeyen durumlar)
  // ============================================

  // Erken gol temposu — Over 2.5 (henüz 2.5 tutulmamışsa)
  if (totalGoals >= 1 && totalGoals < 3 && elapsed <= 35 && scenario === "NORMAL") {
    rawOpps.push({
      level: totalGoals >= 2 ? "HOT" : "WARM",
      market: "Over 2.5",
      message: `Erken tempo! ${elapsed}'de ${totalGoals} gol — devamı gelir`,
      reasoning: `Erken gol(ler) oyun planlarını değiştirdi. Geri kalan takım açılmak zorunda.`,
      confidence: Math.min(70, 40 + totalGoals * 15),
      timeWindow: "Maç geneli",
    });
  }

  // 2+ gol var, yakın skor, henüz over tutulmamış — sıradaki hat
  if (elapsed >= 50 && totalGoals >= 2 && goalDiff <= 1 && elapsed <= 80 && scenario === "NORMAL") {
    rawOpps.push({
      level: totalGoals >= 3 ? "HOT" : "WARM",
      market: `Over ${nextOverLine}`,
      message: `Çekişmeli maç! ${homeGoals}-${awayGoals} — iki takım da atmaya devam eder`,
      reasoning: `Yakın skorlu maçlarda tempo düşmez. Sıradaki gol hattı: Over ${nextOverLine}.`,
      confidence: Math.min(72, 40 + totalGoals * 6),
      timeWindow: `Son ${90 - elapsed}dk`,
    });
  }

  // Son dakikalar + düşük gol = Under güçleniyor
  // ⚠️ FAZ 1.2: DAKIKA BAZLI KARALİSTE — 80+ dakikada Under tamamen engellenir
  if (elapsed >= LATE_GAME_UNDER_SOFT_MINUTE && elapsed < LATE_GAME_UNDER_BLACKLIST_MINUTE && totalGoals <= 1) {
    // 70-80 arası: Sıkı koşullarla Under
    const underLine = totalGoals === 0 ? 0.5 : 1.5;
    rawOpps.push({
      level: "WARM",
      market: `Under ${underLine === 0.5 ? "1.5" : "2.5"}`,
      message: `${elapsed}' ve sadece ${totalGoals} gol — Under güvende (ama dikkatli!)`,
      reasoning: `Kalan süre kısıtlı. Ancak son dakika gol riski her zaman var — güven sınırlı tutuldu.`,
      confidence: Math.min(LATE_GAME_UNDER_MAX_CONFIDENCE, 40 + (elapsed - 70) * 1.5),
      timeWindow: `Son ${90 - elapsed}dk`,
    });
  }
  // NOT: elapsed >= 80 ise Under hiç önerilmez (FAZ 1.2 karaliste)

  // 0-0 ve 60+ dakika — Under güçleniyor (FAZ 1.2: 80+ engeli)
  if (totalGoals === 0 && elapsed >= 60 && elapsed < LATE_GAME_UNDER_BLACKLIST_MINUTE) {
    rawOpps.push({
      level: "WARM",
      market: "Under 2.5",
      message: `${elapsed}' ve hâlâ golsüz — Under güçleniyor`,
      reasoning: `Uzun süre golsüz geçen maçlarda Under oranı güçlenir. Takımlar risk almayabilir.`,
      confidence: Math.min(LATE_GAME_UNDER_MAX_CONFIDENCE, 45 + (elapsed - 60) * 1.5),
      timeWindow: `Son ${90 - elapsed}dk`,
    });
  }

  // FAZ 1.3: 80+ DAKİKADA ALTERNATİF MARKETLER (Under yerine)
  if (elapsed >= LATE_GAME_UNDER_BLACKLIST_MINUTE && totalGoals <= 1 && scenario === "NORMAL") {
    // Under yerine MS / Beraberlik öner
    if (goalDiff >= 1) {
      rawOpps.push({
        level: "HOT",
        market: leadingTeam === "home" ? "MS 1" : "MS 2",
        message: `${elapsed}' ve ${leadingName} ${goalDiff} farkla önde — maç sonucu belli gibi`,
        reasoning: `Son dakikalar + düşük tempo. ${leadingName} skoru koruyacak.`,
        confidence: Math.min(85, 65 + (elapsed - 80) * 2),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    } else {
      rawOpps.push({
        level: "HOT",
        market: "MS X",
        message: `${elapsed}' ve ${homeGoals}-${awayGoals} berabere — beraberlik kaçınılmaz`,
        reasoning: `Son dakikalarda berabere giden maç genelde berabere biter.`,
        confidence: Math.min(80, 60 + (elapsed - 80) * 2),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    }
  }

  // Bir takım skor farkı açmışsa
  if (goalDiff >= 2 && elapsed >= 30 && elapsed <= 80 && scenario === "NORMAL") {
    if (totalGoals >= 3 && elapsed <= 70) {
      rawOpps.push({
        level: "WARM",
        market: `Over ${nextOverLine}`,
        message: `${homeGoals}-${awayGoals} — fark var ama maç bitmedi, gol devam eder`,
        reasoning: `Geriden gelen takım açılmak zorunda, aradaki takım rahat atak yapar.`,
        confidence: Math.min(70, 40 + totalGoals * 5),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    }
    if ((homeGoals === 0 || awayGoals === 0) && elapsed <= 75) {
      const scorelessTeam = homeGoals === 0 ? homeName : awayName;
      rawOpps.push({
        level: elapsed >= 60 ? "WARM" : "INFO",
        market: "BTTS Var",
        message: `${scorelessTeam} geri düşmüş ama teselli golü gelebilir`,
        reasoning: `${goalDiff}+ farkla geriden gelen takımlar genelde en az 1 gol atar.`,
        confidence: Math.min(60, 35 + (elapsed >= 60 ? 10 : 0)),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    }
  }

  // BTTS zaten oldu — sıradaki over hat
  if (homeGoals > 0 && awayGoals > 0 && elapsed <= 75 && totalGoals >= 2 && scenario === "NORMAL") {
    rawOpps.push({
      level: totalGoals >= 4 ? "HOT" : "WARM",
      market: `Over ${nextOverLine}`,
      message: `BTTS oldu (${homeGoals}-${awayGoals}) — savunmalar gevşedi, sıradaki: Over ${nextOverLine}`,
      reasoning: `İki takım da gol attığında savunmalar gevşer, daha fazla gol beklenir.`,
      confidence: Math.min(70, 35 + totalGoals * 7),
      timeWindow: `Son ${90 - elapsed}dk`,
    });
  }

  // Bir takım attı diğeri 0 — BTTS potansiyeli
  if ((homeGoals > 0 && awayGoals === 0 || awayGoals > 0 && homeGoals === 0) && elapsed >= 20 && elapsed <= 75 && scenario === "NORMAL") {
    const scoreless = homeGoals === 0 ? homeName : awayName;
    rawOpps.push({
      level: elapsed >= 55 ? "WARM" : "INFO",
      market: "BTTS Var",
      message: `${scoreless} henüz atamadı — baskı artıyor`,
      reasoning: `Geriden gelen ${scoreless} gol aramaya devam edecek.`,
      confidence: Math.min(55, 30 + (elapsed >= 55 ? 10 : 0) + (goalDiff <= 1 ? 10 : 0)),
      timeWindow: elapsed < 45 ? "2. Yarı" : `Son ${90 - elapsed}dk`,
    });
  }

  // Berabere ve geç dakika (70-88)
  if (homeGoals === awayGoals && elapsed >= 70 && elapsed <= 88 && scenario === "NORMAL") {
    if (totalGoals === 0) {
      rawOpps.push({
        level: elapsed >= 80 ? "HOT" : "WARM",
        market: "MS X",
        message: `${elapsed}' ve 0-0 — beraberlik güçleniyor`,
        reasoning: `Golsüz geçen maçın son bölümü. MS X olasılığı yüksek.`,
        confidence: Math.min(80, 55 + (elapsed - 70) * 2),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    } else if (scenario === "NORMAL") {
      rawOpps.push({
        level: "WARM",
        market: elapsed >= 80 ? "MS X" : `Over ${nextOverLine}`,
        message: elapsed >= 80
          ? `${homeGoals}-${awayGoals} berabere ve ${elapsed}' — berabere biter`
          : `${homeGoals}-${awayGoals} berabere — kazanan gol gelir mi?`,
        reasoning: elapsed >= 80
          ? `Son dakikalarda berabere giden maç genelde berabere biter.`
          : `Berabere durum iki takımı da ataklığa iter.`,
        confidence: Math.min(65, 45 + (elapsed >= 80 ? 12 : 0)),
        timeWindow: `Son ${90 - elapsed}dk`,
      });
    }
  }

  // Devre arası fırsatları
  if (isHT) {
    if (htHome + htAway === 0) {
      rawOpps.push({
        level: "WARM",
        market: "2. Yarı Gol Var",
        message: `İlk yarı 0-0 — 2. yarıda taktik değişiklikler gelir`,
        reasoning: `Hocalar 0-0'da ofansif hamle yapar. 0-0 İY maçların %70+'ında 2. yarı gol olur.`,
        confidence: 62,
        timeWindow: "2. Yarı",
      });
    }
    if (htHome + htAway >= 3) {
      rawOpps.push({
        level: "HOT",
        market: `Over ${nextOverLine}`,
        message: `İlk yarıda ${htHome + htAway} gol! 2. yarıda da devam eder`,
        reasoning: `Savunmalar çökmüş durumda. Bu tempoda sıradaki hat: Over ${nextOverLine}.`,
        confidence: 72,
        timeWindow: "2. Yarı",
      });
    }
    if (htHome + htAway >= 1 && htHome + htAway <= 2) {
      rawOpps.push({
        level: "INFO",
        market: `Over ${nextOverLine}`,
        message: `İY ${htHome}-${htAway} — 2. yarıda gol devam edebilir`,
        reasoning: `Gol olan maçlarda 2. yarıda da gol gelme olasılığı artar.`,
        confidence: 48,
        timeWindow: "2. Yarı",
      });
    }
  }

  // ============ İSTATİSTİK BAZLI FIRSATLAR (v2: xG Delta + Baskı Endeksi) ============

  if (stats && stats.length >= 2) {
    const homeShots = getStat(stats, 0, "Total Shots");
    const awayShots = getStat(stats, 1, "Total Shots");
    const homeSoG = getStat(stats, 0, "Shots on Goal");
    const awaySoG = getStat(stats, 1, "Shots on Goal");
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

    const redCards = events?.filter(e => e.type === "Card" && e.detail === "Red Card") || [];
    const hasRedCard = redCards.length > 0;

    // FAZ 2.2: Canlı xG Delta → "Gol Geliyor" sinyali
    // xG çok yüksek ama gol az — önce Under ÖNERİLMEZ kontrolü, sonra Over/Sıradaki Gol öner
    if (enriched.xgDelta > XG_GOAL_COMING_THRESHOLD && elapsed >= 30 && elapsed <= 80) {
      rawOpps.push({
        level: enriched.xgDelta > 1.5 ? "HOT" : "WARM",
        market: `Over ${nextOverLine}`,
        message: `📊 xG ${totalXg.toFixed(1)} ama sadece ${totalGoals} gol — istatistiksel düzeltme yakın!`,
        reasoning: `Beklenen gol (xG) ${totalXg.toFixed(1)} iken sadece ${totalGoals} gol atılmış. xG farkı: +${enriched.xgDelta.toFixed(1)}`,
        confidence: Math.min(80, Math.round(enriched.xgDelta * 25 + 35)),
        timeWindow: elapsed < 45 ? "2. Yarı" : "Son 30dk",
      });
    }

    // Çok fazla şut ama gol yok — baskı patlaması
    if (totalShots >= 20 && totalGoals <= 1 && elapsed >= 35 && elapsed <= 75) {
      rawOpps.push({
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
      rawOpps.push({
        level: "WARM",
        market: `Over ${nextOverLine}`,
        message: `İlk yarı 0-0 ama 2. yarıda tempo yükseldi (xG: ${totalXg.toFixed(1)})`,
        reasoning: `İlk yarı karşılıklı temkinliydi ama 2. yarıda pozisyonlar artıyor.`,
        confidence: 60,
        timeWindow: "Son 30dk",
      });
    }

    // BTTS — bir takım attı, diğeri baskılı
    if ((homeGoals > 0 && awayGoals === 0 && (awaySoG >= 3 || awayXg > 1.0 || awayDangerous >= 4)) ||
        (awayGoals > 0 && homeGoals === 0 && (homeSoG >= 3 || homeXg > 1.0 || homeDangerous >= 4))) {
      const attackingTeam = homeGoals === 0 ? homeName : awayName;
      const attackLevel = homeGoals === 0 ? danger.homeAttack : danger.awayAttack;
      rawOpps.push({
        level: attackLevel > 60 ? "HOT" : "WARM",
        market: "BTTS Var",
        message: `${attackingTeam} yoğun baskıda — gol an meselesi!`,
        reasoning: `Bir takım zaten attı. ${attackingTeam} ${homeGoals === 0 ? homeSoG : awaySoG} isabetli şutla kapıyı zorluyor.`,
        confidence: Math.min(80, 50 + attackLevel * 0.3),
        timeWindow: elapsed < 60 ? "2. Yarı" : "Son bölüm",
      });
    }

    // İki takım da atak — BTTS
    if (homeGoals === 0 && awayGoals === 0 && homeSoG >= 2 && awaySoG >= 2 && elapsed >= 25 && elapsed <= 70) {
      rawOpps.push({
        level: "WARM",
        market: "BTTS Var",
        message: `İki takım da şut buluyor (${homeSoG}-${awaySoG} isabetli) — BTTS muhtemel`,
        reasoning: `Her iki takım da gol pozisyonu üretiyor. xG: Ev ${homeXg.toFixed(1)} - Dep ${awayXg.toFixed(1)}`,
        confidence: Math.min(75, 40 + (homeSoG + awaySoG) * 4),
        timeWindow: "Devam eden",
      });
    }

    // Tek taraflı baskı — MS
    if (momentum.dominantTeam !== "balanced" && Math.abs(momentum.homeScore - momentum.awayScore) > 25 && goalDiff <= 1 && scenario === "NORMAL") {
      const dominant = momentum.dominantTeam === "home" ? homeName : awayName;
      const dominantGoals = momentum.dominantTeam === "home" ? homeGoals : awayGoals;
      const otherGoals = momentum.dominantTeam === "home" ? awayGoals : homeGoals;
      const market = momentum.dominantTeam === "home" ? "MS 1" : "MS 2";

      if (dominantGoals >= otherGoals && elapsed <= 80) {
        rawOpps.push({
          level: Math.abs(momentum.homeScore - momentum.awayScore) > 40 ? "HOT" : "WARM",
          market,
          message: `${dominant} istatistiklerde çok üstün — ${dominantGoals > otherGoals ? "skor da önde" : "berabere ama baskılı"}`,
          reasoning: `Momentum: ${momentum.homeScore.toFixed(0)}-${momentum.awayScore.toFixed(0)}. ${dominant} şut/xG/top hakimiyetinde baskın.`,
          confidence: Math.min(75, 45 + Math.abs(momentum.homeScore - momentum.awayScore) * 0.4),
          timeWindow: elapsed < 60 ? "Maç sonu" : `Son ${90 - elapsed}dk`,
        });
      }
    }

    // 10 kişi kalan takıma karşı
    if (hasRedCard && elapsed <= 75) {
      for (const rc of redCards) {
        const weakTeam = rc.team.name;
        const strongTeam = weakTeam === homeName ? awayName : homeName;
        const market = weakTeam === homeName ? "MS 2" : "MS 1";
        const timeSinceRed = elapsed - rc.time.elapsed;

        if (timeSinceRed <= 30) {
          rawOpps.push({
            level: "HOT",
            market,
            message: `${weakTeam} 10 kişi! ${strongTeam} için büyük fırsat`,
            reasoning: `Kırmızı kart sonrası ${strongTeam} sayısal üstünlükte. 10 kişi kalan takımlar son 30dk'da %35+ daha fazla gol yer.`,
            confidence: 70,
            timeWindow: `Son ${90 - elapsed}dk`,
          });
          rawOpps.push({
            level: "WARM",
            market: `Over ${nextOverLine}`,
            message: `Kırmızı kart maçı açtı — sıradaki gol gelir`,
            reasoning: `10 kişi kalan takım savunmada boşluk bırakır.`,
            confidence: 60,
            timeWindow: `Son ${90 - elapsed}dk`,
          });
        }
      }
    }

    // Korner projeksiyon
    if (totalCorners >= 8 && elapsed <= 70) {
      const perMin = totalCorners / Math.max(elapsed, 1);
      const projected = Math.round(perMin * 90);
      if (projected >= 12) {
        rawOpps.push({
          level: projected >= 14 ? "HOT" : "WARM",
          market: `Toplam Korner Üst ${projected >= 14 ? "11.5" : "9.5"}`,
          message: `${elapsed}'de ${totalCorners} korner — projeksiyon: ${projected}`,
          reasoning: `Mevcut tempoda maç sonunda ${projected} korner bekleniyor.`,
          confidence: Math.min(80, 50 + totalCorners * 2),
          timeWindow: "Maç sonu",
        });
      }
    }

    // Geri kalan takım baskılıysa — eşitlik/çevirme
    if (homeGoals !== awayGoals && elapsed >= 45 && elapsed <= 80 && scenario === "NORMAL") {
      const trailing = homeGoals < awayGoals ? "home" : "away";
      const tName = trailing === "home" ? homeName : awayName;
      const tMomentum = trailing === "home" ? momentum.homeScore : momentum.awayScore;
      const tAttack = trailing === "home" ? danger.homeAttack : danger.awayAttack;

      if (tMomentum > 55 && tAttack > 50) {
        rawOpps.push({
          level: tMomentum > 65 ? "HOT" : "WARM",
          market: trailing === "home" ? "ÇS 1X" : "ÇS X2",
          message: `${tName} geri ama çok baskılı! Eşitlik yakın`,
          reasoning: `Geri kalan ${tName} momentum skoru ${tMomentum.toFixed(0)} ile baskın. Atak: ${tAttack.toFixed(0)}/100`,
          confidence: Math.min(70, 40 + tMomentum * 0.3),
          timeWindow: `Son ${90 - elapsed}dk`,
        });
      }
    }

    // Devre arası + xG bazlı
    if (isHT && htHome + htAway === 0 && totalXg > 1.0) {
      rawOpps.push({
        level: "WARM",
        market: "2. Yarı Gol Var",
        message: `İlk yarı 0-0 ama xG ${totalXg.toFixed(1)} — 2. yarı patlar`,
        reasoning: `Pozisyon üretimi var ama bitiricilikte sıkıntı yaşandı.`,
        confidence: 65,
        timeWindow: "2. Yarı",
      });
    }
  }

  // ============================================
  // FAZ 4: DEĞER PUANI + KATEGORİ + FİLTRE
  // ============================================

  const maxDangerousRate = Math.max(enriched.recentDangerousRate.home, enriched.recentDangerousRate.away);
  const maxPressure = Math.max(enriched.pressureIndex.home, enriched.pressureIndex.away);

  // --- Değer Puanı (Value Score): Düşük oranlı "banko"ları cezalandırır ---
  function calcValueScore(opp: RawOpportunity): number {
    let value = opp.confidence;

    // Over marketleri: halihazırda tutmuş veya 1 gol kala kolay hedefse → değer düşük
    if (opp.market.startsWith("Over") || opp.market.includes("Üst")) {
      const lineParts = opp.market.match(/(\d+\.\d+)/);
      const line = lineParts ? parseFloat(lineParts[1]) : 0;
      const goalsNeeded = Math.max(0, Math.ceil(line) - totalGoals);
      const minutesLeft = Math.max(1, 90 - elapsed);
      if (goalsNeeded === 0) return 0;               // Zaten tutmuş → bahis kapanmış
      if (goalsNeeded === 1 && minutesLeft > 30) {
        value *= 0.35;                                // Kolay hedef → oran 1.05-1.15, değersiz
      }
      if (goalsNeeded === 1 && minutesLeft <= 15) {
        value *= 1.1;                                 // Son dk + 1 gol = makul oran olabilir
      }
      if (goalsNeeded >= 2) {
        value *= 1.3;                                 // Zor hedef = yüksek oran potansiyeli
      }
    }

    // Under: geç dakika + düşük gol = herkes görür
    if (isUnderMarket(opp.market) && elapsed >= 75 && totalGoals <= 1) {
      value *= 0.35;
    }

    // BTTS zaten olduysa bahis kapanmış
    if (opp.market === "BTTS Var" && homeGoals > 0 && awayGoals > 0) return 0;

    // MS X beraberelikte 85+: herkes görüyor
    if (opp.market === "MS X" && homeGoals === awayGoals && elapsed >= 85) {
      value *= 0.3;
    }

    // MS 1/2 ile 2+ fark + 80+: bahis kapanmış
    if ((opp.market === "MS 1" || opp.market === "MS 2") && goalDiff >= 2 && elapsed >= 80) return 0;

    // Sıradaki Gol marketi erken dakikada değerli
    if (opp.market === "Sıradaki Gol" && elapsed < 70) value *= 1.2;

    // ÇS (Çifte Şans): geri kalan takım baskılıysa gerçek değer
    if (opp.market.includes("ÇS") && trailingPressure > 50) value *= 1.3;

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  // --- Kategori Atayıcı: Maç durumuna göre fırsat sınıflandırması ---
  function assignCategory(): OpportunityCategory {
    if (totalGoals === 0 && elapsed >= 30 && (enriched.xgDelta > 0.5 || maxPressure > 45)) {
      return "UYUYAN_DEV";       // 😴 Golsüz ama baskılı — oranlar hâlâ yüksek
    }
    if (elapsed <= 45 && totalGoals >= 2) {
      return "ERKEN_PATLAMA";     // ⚡ Erken gol patlaması — barem yüksekten verilmeli
    }
    if (elapsed >= 75) {
      return "SON_DAKIKA_VURGUN"; // ⏰ Son bölüm fırsatları
    }
    return "STANDART";
  }

  const matchCategory = assignCategory();

  // Zenginleştir + Filtrele
  return rawOpps
    .map(opp => ({
      ...opp,
      valueScore: calcValueScore(opp),
      category: matchCategory,
    }))
    .filter(opp => {
      // Değer sıfırsa tamamen kaldır (bahis kapanmış veya değersiz)
      if (opp.valueScore === 0) return false;

      // FAZ 1.2: 80+ dakikada Under tamamen engelle
      if (elapsed >= LATE_GAME_UNDER_BLACKLIST_MINUTE && isUnderMarket(opp.market)) return false;

      // FAZ 1.2: 70-80 arası Under sıkı filtre
      if (elapsed >= LATE_GAME_UNDER_SOFT_MINUTE && elapsed < LATE_GAME_UNDER_BLACKLIST_MINUTE && isUnderMarket(opp.market)) {
        if (opp.confidence > LATE_GAME_UNDER_MAX_CONFIDENCE) {
          opp.confidence = LATE_GAME_UNDER_MAX_CONFIDENCE;
        }
      }

      // FAZ 2.3: xG Delta yüksek ise Under blokla
      if (enriched.xgDelta > XG_GOAL_COMING_THRESHOLD && isUnderMarket(opp.market)) return false;

      // FAZ 2.3: Tehlikeli atak/dk yüksek + under blokla
      if (maxDangerousRate > PRESSURE_UNDER_BLOCK_RATE && isUnderMarket(opp.market) && leadingTeam !== "draw") return false;

      // Minimum güven filtresi
      if (opp.level !== "INFO" && opp.confidence < 35) return false;

      return true;
    });
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
