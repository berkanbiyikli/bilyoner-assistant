// ============================================
// IY KG (İlk Yarı Karşılıklı Gol) API Route
// GET /api/ht-btts?grade=B&league=203
//
// Hafif mimari: getFixturesByDate (1 cached call) +
// getPrediction per fixture (cached 1hr) ile hızlı analiz.
// Full analyzeMatches kullanmaz (çok yavaş).
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getPrediction } from "@/lib/api-football";
import { getCached, setCache } from "@/lib/cache";
import type { HtBttsAnalysis, HtBttsFactor } from "@/types";
import type { FixtureResponse, PredictionResponse } from "@/types/api-football";

export const maxDuration = 300; // Vercel Pro max

interface HtBttsCache {
  date: string;
  allAnalyses: HtBttsAnalysis[];
  totalMatches: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minGrade = (searchParams.get("grade") as "A+" | "A" | "B" | "C") || "B";
    const leagueFilter = searchParams.get("league");
    const dateParam = searchParams.get("date");
    const forceRefresh = searchParams.get("refresh") === "true";

    const date = dateParam || new Date().toISOString().split("T")[0];
    const cacheKey = `ht-btts:${date}`;

    // ─── Cache kontrolü (10 dk TTL) ───
    let allAnalyses: HtBttsAnalysis[] = [];
    let totalMatches = 0;

    const cached = !forceRefresh ? getCached<HtBttsCache>(cacheKey) : null;

    if (cached) {
      allAnalyses = cached.allAnalyses;
      totalMatches = cached.totalMatches;
    } else {
      // 1) Günün fixture'larını çek (1 API call, 10dk cache)
      const allFixtures = await getFixturesByDate(date);
      let fixtures = allFixtures.filter((f) => f.fixture.status.short === "NS");

      if (leagueFilter) {
        const leagueIds = leagueFilter.split(",").map(Number);
        fixtures = fixtures.filter((f) => leagueIds.includes(f.league.id));
      }

      totalMatches = fixtures.length;

      if (fixtures.length === 0) {
        return NextResponse.json({
          date,
          totalMatches: 0,
          filteredCount: 0,
          minGrade,
          gradeDistribution: { "A+": 0, A: 0, B: 0, C: 0, D: 0 },
          avgHtBttsProb: 0,
          analyses: [],
          summary: "Bugün için uygun maç bulunamadı.",
        });
      }

      // 2) Her fixture için lightweight IY KG analizi
      //    getPrediction = 1 API call/maç (1hr cached)
      //    Batch 10 paralel
      for (let i = 0; i < fixtures.length; i += 10) {
        const batch = fixtures.slice(i, i + 10);
        const batchResults = await Promise.allSettled(
          batch.map((fix) => buildLightweightHtBtts(fix))
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            allAnalyses.push(result.value);
          }
        }
      }

      // Sıralama: grade → confidence
      allAnalyses.sort((a, b) => {
        const go: Record<string, number> = { "A+": 0, A: 1, B: 2, C: 3, D: 4 };
        const gd = go[a.grade] - go[b.grade];
        if (gd !== 0) return gd;
        return b.confidence - a.confidence;
      });

      // Cache'e kaydet (10 dk)
      if (allAnalyses.length > 0) {
        setCache(cacheKey, { date, allAnalyses, totalMatches }, 600);
      }
    }

    // ─── Filtreleme ───
    const gradeOrder: Record<string, number> = { "A+": 5, A: 4, B: 3, C: 2, D: 1 };
    const minGradeValue = gradeOrder[minGrade] || 1;
    const filtered = allAnalyses.filter(
      (a) => (gradeOrder[a.grade] || 0) >= minGradeValue
    );

    const finalFiltered = leagueFilter && !cached
      ? filtered.filter((a) => {
          const leagueIds = leagueFilter.split(",").map(Number);
          return leagueIds.includes(a.leagueId);
        })
      : filtered;

    const gradeDistribution = {
      "A+": allAnalyses.filter((a) => a.grade === "A+").length,
      A: allAnalyses.filter((a) => a.grade === "A").length,
      B: allAnalyses.filter((a) => a.grade === "B").length,
      C: allAnalyses.filter((a) => a.grade === "C").length,
      D: allAnalyses.filter((a) => a.grade === "D").length,
    };

    const avgHtBttsProb =
      finalFiltered.length > 0
        ? Math.round(
            (finalFiltered.reduce((s, a) => s + a.htBttsProb, 0) / finalFiltered.length) * 10
          ) / 10
        : 0;

    return NextResponse.json({
      date,
      source: cached ? "cache" : "live",
      totalMatches,
      filteredCount: finalFiltered.length,
      minGrade,
      gradeDistribution,
      avgHtBttsProb,
      analyses: finalFiltered,
      allAnalyses: searchParams.get("all") === "true" ? allAnalyses : undefined,
      summary:
        finalFiltered.length > 0
          ? `${finalFiltered.length} maçta IY KG Var fırsatı bulundu (min. ${minGrade}). Ort: %${avgHtBttsProb}`
          : `${minGrade}+ IY KG fırsatı bulunamadı. ${totalMatches} maç analiz edildi.`,
    });
  } catch (error) {
    console.error("HT BTTS API error:", error);
    return NextResponse.json(
      { error: "IY KG analizi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}

// ============================================
// Lightweight IY KG Analiz
// Full engine yerine sadece API-Football prediction datası kullanır
// 1 API call/maç (getPrediction, 1hr cached)
// ============================================

async function buildLightweightHtBtts(
  fixture: FixtureResponse
): Promise<HtBttsAnalysis | null> {
  try {
    const pred = await getPrediction(fixture.fixture.id).catch(() => null);
    if (!pred) return buildFromFixtureOnly(fixture);

    const home = pred.teams.home;
    const away = pred.teams.away;
    const factors: HtBttsFactor[] = [];

    // ── 1) İlk Yarı Gol Zamanlaması ──
    // API-Football goals.for.minute verisinden "0-15", "16-30", "31-45" dakikalarını al
    const homeMinutes = home.league.goals.for.minute;
    const awayMinutes = away.league.goals.for.minute;

    const getMinutePercent = (min: Record<string, { total: number | null; percentage: string | null }>, ranges: string[]): number => {
      return ranges.reduce((sum, r) => {
        const pct = min[r]?.percentage;
        return sum + (pct ? parseFloat(pct) : 0);
      }, 0);
    };

    const homeFirst45 = getMinutePercent(homeMinutes, ["0-15", "16-30", "31-45"]);
    const awayFirst45 = getMinutePercent(awayMinutes, ["0-15", "16-30", "31-45"]);
    const homeFirst15 = getMinutePercent(homeMinutes, ["0-15"]);
    const awayFirst15 = getMinutePercent(awayMinutes, ["0-15"]);

    let timingScore = ((homeFirst45 + awayFirst45) / 2 - 42) * 2;
    timingScore = Math.max(-30, Math.min(40, timingScore));

    factors.push({
      name: "İlk Yarı Gol Zamanlaması",
      value: Math.round(timingScore),
      description: `Ev %${homeFirst45.toFixed(0)} — Dep %${awayFirst45.toFixed(0)} (ilk yarı gol oranı)`,
      weight: 0.22,
    });

    if ((homeFirst15 + awayFirst15) / 2 > 18) {
      factors.push({
        name: "Erken Gol Eğilimi",
        value: Math.round(((homeFirst15 + awayFirst15) / 2 - 15) * 2),
        description: `İlk 15 dk: Ev %${homeFirst15.toFixed(0)}, Dep %${awayFirst15.toFixed(0)}`,
        weight: 0.08,
      });
    }

    // ── 2) Hücum Gücü ──
    const homeAtt = parseInt(home.last_5.att) || 50;
    const awayAtt = parseInt(away.last_5.att) || 50;
    const minAtt = Math.min(homeAtt, awayAtt);
    const avgAtt = (homeAtt + awayAtt) / 2;

    let attackScore = 0;
    if (minAtt >= 60 && avgAtt >= 65) {
      attackScore = Math.min(40, (minAtt - 50) * 2 + (avgAtt - 60) * 1.5);
    } else if (minAtt < 45) {
      attackScore = -20;
    } else {
      attackScore = (minAtt - 50) * 1.5;
    }

    factors.push({
      name: "Hücum Gücü Dengesi",
      value: Math.round(attackScore),
      description: `Ev hücum: ${homeAtt}%, Dep hücum: ${awayAtt}% (min: ${minAtt}%)`,
      weight: 0.18,
    });

    // ── 3) Savunma Zaafiyeti ──
    const homeDef = parseInt(home.last_5.def) || 50;
    const awayDef = parseInt(away.last_5.def) || 50;
    const avgDef = (homeDef + awayDef) / 2;

    let defScore = 0;
    if (avgDef < 45) {
      defScore = (50 - avgDef) * 2;
    } else if (avgDef > 65) {
      defScore = -(avgDef - 60) * 1.5;
    }

    factors.push({
      name: "Savunma Zaafiyeti",
      value: Math.round(defScore),
      description: `Ev savunma: ${homeDef}%, Dep savunma: ${awayDef}% (düşük = IY KG lehine)`,
      weight: 0.12,
    });

    // ── 4) Gol Ortalaması ──
    const homeGoalAvg = parseFloat(home.league.goals.for.average.total || "0");
    const awayGoalAvg = parseFloat(away.league.goals.for.average.total || "0");
    const homeConcedeAvg = parseFloat(home.league.goals.against.average.total || "0");
    const awayConcedeAvg = parseFloat(away.league.goals.against.average.total || "0");

    // İlk yarıda beklenen goller (sezon gol ortalaması × IY faktörü)
    const htFactor = 0.42;
    const homeLambdaHT = (homeGoalAvg * htFactor + awayConcedeAvg * htFactor) / 2;
    const awayLambdaHT = (awayGoalAvg * htFactor + homeConcedeAvg * htFactor) / 2;
    const combinedHT = homeLambdaHT + awayLambdaHT;

    let goalAvgScore = 0;
    if (combinedHT >= 1.3) {
      goalAvgScore = Math.min(35, (combinedHT - 0.8) * 40);
    } else if (combinedHT >= 1.0) {
      goalAvgScore = (combinedHT - 0.8) * 25;
    } else {
      goalAvgScore = -(1.0 - combinedHT) * 30;
    }

    factors.push({
      name: "İY Beklenen Gol",
      value: Math.round(goalAvgScore),
      description: `İY λ: Ev ${homeLambdaHT.toFixed(2)} + Dep ${awayLambdaHT.toFixed(2)} = ${combinedHT.toFixed(2)}`,
      weight: 0.18,
    });

    // ── 5) Failed to Score (gol atamama oranı) ──
    const homeFTS = home.league.failed_to_score.total ?? 0;
    const awayFTS = away.league.failed_to_score.total ?? 0;
    const homePlayedTotal = (home.league.fixtures.played?.total ?? 1);
    const awayPlayedTotal = (away.league.fixtures.played?.total ?? 1);
    const homeFTSPct = (homeFTS / homePlayedTotal) * 100;
    const awayFTSPct = (awayFTS / awayPlayedTotal) * 100;

    let ftsScore = 0;
    const maxFTS = Math.max(homeFTSPct, awayFTSPct);
    if (maxFTS > 35) {
      ftsScore = -Math.min(25, (maxFTS - 25) * 1.5);
    } else if (maxFTS < 20) {
      ftsScore = Math.min(15, (25 - maxFTS) * 1);
    }

    factors.push({
      name: "Gol Atamama Oranı",
      value: Math.round(ftsScore),
      description: `Ev %${homeFTSPct.toFixed(0)} — Dep %${awayFTSPct.toFixed(0)} maçta gol atamıyor`,
      weight: 0.10,
    });

    // ── 6) H2H Pattern (en son 5 maç) ──
    let h2hScore = 0;
    if (pred.h2h && pred.h2h.length > 0) {
      const recent = pred.h2h.slice(0, 5);
      let bttsCount = 0;
      let totalGoals = 0;
      for (const match of recent) {
        const hg = match.goals.home ?? 0;
        const ag = match.goals.away ?? 0;
        if (hg > 0 && ag > 0) bttsCount++;
        totalGoals += hg + ag;
      }
      const bttsRate = bttsCount / recent.length;
      const avgGoals = totalGoals / recent.length;

      h2hScore = (bttsRate - 0.5) * 40 + (avgGoals - 2.5) * 5;
      h2hScore = Math.max(-20, Math.min(25, h2hScore));

      factors.push({
        name: "H2H Pattern",
        value: Math.round(h2hScore),
        description: `Son ${recent.length} H2H: KG ${bttsCount}/${recent.length}, ort. ${avgGoals.toFixed(1)} gol`,
        weight: 0.12,
      });
    }

    // ── HESAPLA ──
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const weightedScore = factors.reduce((s, f) => s + f.value * (f.weight / totalWeight), 0);

    // Poisson tabanlı IY KG olasılığı
    const poissonHtBtts = poissonBTTS(homeLambdaHT, awayLambdaHT);
    const heuristicProb = scoreToProb(weightedScore);
    const htBttsProb = poissonHtBtts * 0.60 + heuristicProb * 0.40;

    // Poisson IY gol olasılıkları
    const htHomeGoalProb = (1 - poisson(0, homeLambdaHT)) * 100;
    const htAwayGoalProb = (1 - poisson(0, awayLambdaHT)) * 100;
    const htOver05Prob = (1 - poisson(0, homeLambdaHT) * poisson(0, awayLambdaHT) +
      (1 - poisson(0, homeLambdaHT)) * poisson(0, awayLambdaHT) * 0 +
      poisson(0, homeLambdaHT) * (1 - poisson(0, awayLambdaHT)) * 0) * 100;
    // Simplified: P(total >= 1)
    const htOver05 = (1 - poisson(0, combinedHT)) * 100;
    const htOver15 = (1 - poisson(0, combinedHT) - poisson(1, combinedHT)) * 100;

    const fairOdds = 1 / (htBttsProb / 100);
    const confidence = calcConfidence(htBttsProb, factors);
    const grade = calcGrade(confidence, htBttsProb, 0);

    // Top IY skor tahminleri
    const topHtScores = calcHtScorelines(homeLambdaHT, awayLambdaHT);

    // Reasoning
    const strongPos = factors.filter((f) => f.value > 10).sort((a, b) => b.value * b.weight - a.value * a.weight)[0];
    const strongNeg = factors.filter((f) => f.value < -5).sort((a, b) => a.value * a.weight - b.value * b.weight)[0];
    const parts: string[] = [];
    if (strongPos) parts.push(`✅ ${strongPos.name}: ${strongPos.description}`);
    if (strongNeg) parts.push(`⚠️ ${strongNeg.name}: ${strongNeg.description}`);
    parts.push(`📊 IY KG: %${htBttsProb.toFixed(1)} [${grade}]`);
    if (topHtScores.length > 0) {
      parts.push(`🎲 İY skor: ${topHtScores.slice(0, 3).map((s) => `${s.score} (%${s.probability})`).join(", ")}`);
    }

    return {
      fixtureId: fixture.fixture.id,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      league: fixture.league.name,
      leagueId: fixture.league.id,
      kickoff: fixture.fixture.date,
      homeLambdaHT: Math.round(homeLambdaHT * 1000) / 1000,
      awayLambdaHT: Math.round(awayLambdaHT * 1000) / 1000,
      htBttsProb: Math.round(htBttsProb * 10) / 10,
      htHomeGoalProb: Math.round(htHomeGoalProb * 10) / 10,
      htAwayGoalProb: Math.round(htAwayGoalProb * 10) / 10,
      htOver05Prob: Math.round(htOver05 * 10) / 10,
      htOver15Prob: Math.round(htOver15 * 10) / 10,
      fairOdds: Math.round(fairOdds * 100) / 100,
      edge: 0,
      kellyStake: 0,
      factors,
      confidence,
      grade,
      reasoning: parts.join(" | "),
      topHtScores,
    };
  } catch (err) {
    console.error(`HT BTTS lightweight error (${fixture.fixture.id}):`, err);
    return buildFromFixtureOnly(fixture);
  }
}

/**
 * Prediction verisi yoksa sadece fixture'dan basit analiz
 */
function buildFromFixtureOnly(fixture: FixtureResponse): HtBttsAnalysis {
  const homeLambda = 0.55;
  const awayLambda = 0.45;
  const htBttsProb = poissonBTTS(homeLambda, awayLambda);

  return {
    fixtureId: fixture.fixture.id,
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    league: fixture.league.name,
    leagueId: fixture.league.id,
    kickoff: fixture.fixture.date,
    homeLambdaHT: homeLambda,
    awayLambdaHT: awayLambda,
    htBttsProb: Math.round(htBttsProb * 10) / 10,
    htHomeGoalProb: Math.round((1 - poisson(0, homeLambda)) * 1000) / 10,
    htAwayGoalProb: Math.round((1 - poisson(0, awayLambda)) * 1000) / 10,
    htOver05Prob: Math.round((1 - poisson(0, homeLambda + awayLambda)) * 1000) / 10,
    htOver15Prob: Math.round((1 - poisson(0, 1) - poisson(1, 1)) * 1000) / 10,
    fairOdds: Math.round((1 / (htBttsProb / 100)) * 100) / 100,
    edge: 0,
    kellyStake: 0,
    factors: [{ name: "Veri Yetersiz", value: 0, description: "Prediction verisi bulunamadı — varsayılan değerler", weight: 1 }],
    confidence: 25,
    grade: "D",
    reasoning: "⚠️ Prediction verisi bulunamadı. Varsayılan Poisson değerleri kullanıldı.",
    topHtScores: calcHtScorelines(homeLambda, awayLambda),
  };
}

// ── Yardımcılar ──

function poisson(k: number, lambda: number): number {
  let r = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) r *= lambda / i;
  return r;
}

function poissonBTTS(homeLambda: number, awayLambda: number): number {
  const pHomeNoGoal = poisson(0, homeLambda);
  const pAwayNoGoal = poisson(0, awayLambda);
  return (1 - pHomeNoGoal) * (1 - pAwayNoGoal) * 100;
}

function scoreToProb(score: number): number {
  const base = 18;
  return Math.max(5, Math.min(45, base + score * 0.35));
}

function calcConfidence(prob: number, factors: HtBttsFactor[]): number {
  let conf = Math.min(90, prob * 2.5);
  const pos = factors.filter((f) => f.value > 5).length;
  const neg = factors.filter((f) => f.value < -5).length;
  conf += (pos - neg) * 3;
  return Math.round(Math.max(10, Math.min(95, conf)));
}

function calcGrade(conf: number, prob: number, edge: number): "A+" | "A" | "B" | "C" | "D" {
  if (conf >= 75 && prob >= 28 && edge > 10) return "A+";
  if (conf >= 65 && prob >= 24) return "A";
  if (conf >= 55 && prob >= 20) return "B";
  if (conf >= 40 && prob >= 15) return "C";
  return "D";
}

function calcHtScorelines(hL: number, aL: number): { score: string; probability: number }[] {
  const r: { score: string; probability: number }[] = [];
  for (let h = 0; h <= 4; h++) {
    for (let a = 0; a <= 4; a++) {
      const p = poisson(h, hL) * poisson(a, aL) * 100;
      if (p >= 0.5) r.push({ score: `${h}-${a}`, probability: Math.round(p * 10) / 10 });
    }
  }
  return r.sort((a, b) => b.probability - a.probability).slice(0, 5);
}
