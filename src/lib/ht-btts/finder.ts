// ============================================
// İlk Yarı Karşılıklı Gol (IY KG) — HT BTTS Finder
// 
// Monte Carlo simülasyon + çok faktörlü analiz ile
// İlk yarıda her iki takımın da gol bulma olasılığını hesaplar.
//
// Faktörler:
// 1. İlk yarı gol zamanlaması (takım bazlı first15/first45 yüzdeleri)
// 2. xG split (ilk yarı xG yaklaşımı)
// 3. Hücum/savunma dengeleri
// 4. H2H ilk yarı pattern'i
// 5. Hakem tempo etkisi (sert hakem → tempo düşer → az gol)
// 6. Sakatlık etkisi (forvet eksikliği → gol olasılığı düşer)
// 7. Match importance (motivasyon farkı)
// 8. Simülasyon sonuçları (10.000 iterasyon)
// ============================================

import type {
  MatchPrediction,
  HtBttsAnalysis,
  HtBttsFactor,
} from "@/types";

/**
 * Tüm maç tahminlerinden IY KG analizlerini üretir.
 * Her maç için çok faktörlü bir IY KG skoru hesaplar.
 */
export function analyzeHtBtts(predictions: MatchPrediction[]): HtBttsAnalysis[] {
  const results: HtBttsAnalysis[] = [];

  for (const pred of predictions) {
    if (!pred.analysis) continue;

    const analysis = pred.analysis;
    const sim = analysis.simulation;
    const factors: HtBttsFactor[] = [];

    // ===== FAKTÖR 1: İlk Yarı Gol Zamanlaması =====
    const goalTiming = analysis.goalTiming;
    let htGoalTimingScore = 0;
    if (goalTiming) {
      // Her takımın ilk yarıdaki gol yüzdesi (0-100 arası)
      const homeFirst45 = goalTiming.home.first45;
      const awayFirst45 = goalTiming.away.first45;

      // İlk yarıda gol atma eğilimi yüksekse pozitif
      htGoalTimingScore = ((homeFirst45 + awayFirst45) / 2 - 42) * 2; // 42 = median
      htGoalTimingScore = Math.max(-30, Math.min(40, htGoalTimingScore));

      factors.push({
        name: "İlk Yarı Gol Zamanlaması",
        value: Math.round(htGoalTimingScore),
        description: `Ev %${homeFirst45.toFixed(0)} — Dep %${awayFirst45.toFixed(0)} (ilk yarı gol oranı)`,
        weight: 0.20,
      });

      // Ek: Her iki takımın da ilk 15 dk gol eğilimi
      const earlyGoalBonus = (goalTiming.home.first15 + goalTiming.away.first15) / 2;
      if (earlyGoalBonus > 18) {
        factors.push({
          name: "Erken Gol Eğilimi",
          value: Math.round((earlyGoalBonus - 15) * 2),
          description: `İlk 15 dk gol eğilimi: Ev %${goalTiming.home.first15.toFixed(0)}, Dep %${goalTiming.away.first15.toFixed(0)}`,
          weight: 0.08,
        });
      }
    }

    // ===== FAKTÖR 2: Hücum Gücü Dengesi =====
    const homeAttack = analysis.homeAttack;
    const awayAttack = analysis.awayAttack;
    const minAttack = Math.min(homeAttack, awayAttack);
    const avgAttack = (homeAttack + awayAttack) / 2;

    // IY KG için her iki takımın da hücumda güçlü olması lazım
    // Min attack 50'nin altındaysa kötü, 65+ ise çok iyi
    let attackBalanceScore = 0;
    if (minAttack >= 60 && avgAttack >= 65) {
      attackBalanceScore = Math.min(40, (minAttack - 50) * 2 + (avgAttack - 60) * 1.5);
    } else if (minAttack < 45) {
      attackBalanceScore = -20; // Bir takım zayıf → IY KG zor
    } else {
      attackBalanceScore = (minAttack - 50) * 1.5;
    }

    factors.push({
      name: "Hücum Gücü Dengesi",
      value: Math.round(attackBalanceScore),
      description: `Ev hücum: ${homeAttack}, Dep hücum: ${awayAttack} (min: ${minAttack})`,
      weight: 0.18,
    });

    // ===== FAKTÖR 3: Savunma Zaafiyeti =====
    const homeDefense = analysis.homeDefense;
    const awayDefense = analysis.awayDefense;
    const avgDefense = (homeDefense + awayDefense) / 2;

    // Düşük savunma = gol yeme eğilimi yüksek → IY KG lehine
    let defenseWeaknessScore = 0;
    if (avgDefense < 45) {
      defenseWeaknessScore = (50 - avgDefense) * 2; // Zayıf savunma → iyi
    } else if (avgDefense > 65) {
      defenseWeaknessScore = -(avgDefense - 60) * 1.5; // Güçlü savunma → kötü
    }

    factors.push({
      name: "Savunma Zaafiyeti",
      value: Math.round(defenseWeaknessScore),
      description: `Ev savunma: ${homeDefense}, Dep savunma: ${awayDefense} (düşük = IY KG lehine)`,
      weight: 0.12,
    });

    // ===== FAKTÖR 4: xG Verileri =====
    const homeXg = analysis.homeXg ?? (homeAttack / 100) * 1.5;
    const awayXg = analysis.awayXg ?? (awayAttack / 100) * 1.5;
    const htFactor = 0.42;
    const homeXgHT = homeXg * htFactor;
    const awayXgHT = awayXg * htFactor;
    const combinedXgHT = homeXgHT + awayXgHT;

    // IY KG için ilk yarı toplam xG > 1.0 ideal, > 1.3 çok iyi
    let xgScore = 0;
    if (combinedXgHT >= 1.3) {
      xgScore = Math.min(35, (combinedXgHT - 0.8) * 40);
    } else if (combinedXgHT >= 1.0) {
      xgScore = (combinedXgHT - 0.8) * 25;
    } else {
      xgScore = -(1.0 - combinedXgHT) * 30;
    }

    // xG inefficiency bonus: Şanssız takım → patlama potansiyeli
    const xgDelta = analysis.xgDelta ?? 0;
    if (xgDelta > 0.5) {
      xgScore += 5;
      factors.push({
        name: "xG Verimsizlik Bonusu",
        value: 5,
        description: `xG verimlilik farkı ${xgDelta.toFixed(2)} — patlama potansiyeli`,
        weight: 0.05,
      });
    }

    factors.push({
      name: "İlk Yarı xG",
      value: Math.round(xgScore),
      description: `IY xG: Ev ${homeXgHT.toFixed(2)} + Dep ${awayXgHT.toFixed(2)} = ${combinedXgHT.toFixed(2)}`,
      weight: 0.15,
    });

    // ===== FAKTÖR 5: Hakem Tempo Etkisi =====
    let refScore = 0;
    if (analysis.refereeProfile) {
      const ref = analysis.refereeProfile;
      if (ref.cardTendency === "strict" || ref.tempoImpact === "low-tempo") {
        refScore = -12; // Sık düdük → tempo düşer → az gol
        factors.push({
          name: "Hakem Etkisi",
          value: refScore,
          description: `${ref.name} — kartçı/tempo düşürücü (ort. ${ref.avgCardsPerMatch} kart)`,
          weight: 0.08,
        });
      } else if (ref.cardTendency === "lenient" || ref.tempoImpact === "high-tempo") {
        refScore = 8; // Akıcı oyun → gol fırsatları artar
        factors.push({
          name: "Hakem Etkisi",
          value: refScore,
          description: `${ref.name} — akıcı oyun/sakin hakem (ort. ${ref.avgCardsPerMatch} kart)`,
          weight: 0.08,
        });
      }
    }

    // ===== FAKTÖR 6: Sakatlık Etkisi =====
    const keyMissing = analysis.keyMissingPlayers ?? [];
    const homeFwdMissing = keyMissing.filter((p) => p.team === "home" && (p.position === "FWD" || p.impactLevel === "critical")).length;
    const awayFwdMissing = keyMissing.filter((p) => p.team === "away" && (p.position === "FWD" || p.impactLevel === "critical")).length;

    let injuryScore = 0;
    if (homeFwdMissing > 0 || awayFwdMissing > 0) {
      injuryScore = -(homeFwdMissing + awayFwdMissing) * 8;
      const names = keyMissing
        .filter((p) => p.position === "FWD" || p.impactLevel === "critical")
        .map((p) => `${p.name} (${p.team === "home" ? "Ev" : "Dep"})`)
        .join(", ");
      factors.push({
        name: "Kilit Eksikler",
        value: injuryScore,
        description: `Eksik: ${names}`,
        weight: 0.07,
      });
    }

    // ===== FAKTÖR 7: H2H Gol Ortalaması =====
    const h2hGoalAvg = analysis.h2hGoalAvg ?? 0;
    let h2hScore = 0;
    if (h2hGoalAvg >= 3.0) {
      h2hScore = Math.min(25, (h2hGoalAvg - 2.0) * 15);
    } else if (h2hGoalAvg > 0 && h2hGoalAvg < 2.0) {
      h2hScore = -(2.0 - h2hGoalAvg) * 10;
    }

    if (h2hGoalAvg > 0) {
      // H2H benzerlik pattern: KG Var / Yok
      const simResult = analysis.similarity?.result?.toLowerCase() ?? "";
      if (simResult.includes("kg var")) {
        h2hScore += 8;
      } else if (simResult.includes("kg yok")) {
        h2hScore -= 8;
      }

      factors.push({
        name: "H2H Gol Ortalaması",
        value: Math.round(h2hScore),
        description: `H2H maç başı ${h2hGoalAvg.toFixed(1)} gol${simResult ? ` — ${simResult}` : ""}`,
        weight: 0.12,
      });
    }

    // ===== FAKTÖR 8: MS KG Var Olasılığı (simülasyondan) =====
    let simBttsBonus = 0;
    if (sim && sim.simBttsProb > 55) {
      simBttsBonus = Math.min(20, (sim.simBttsProb - 50) * 1);
      factors.push({
        name: "MS KG Simülasyon",
        value: Math.round(simBttsBonus),
        description: `Maç sonu KG Var olasılığı %${sim.simBttsProb.toFixed(1)} — IY için de sinerji`,
        weight: 0.10,
      });
    }

    // ===== SONUÇ HESABI =====
    // Ağırlıklı toplam skor (-100 to +100)
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedScore = factors.reduce((sum, f) => sum + f.value * (f.weight / totalWeight), 0);

    // Simülasyon bazlı IY KG olasılığı
    let htBttsProb: number;
    if (sim && sim.simHtBttsProb != null) {
      // Hybrid: Simülasyon + heuristik (ağırlıklar: sim %65, heuristik %35)
      const heuristicProb = scoreToProb(weightedScore);
      htBttsProb = sim.simHtBttsProb * 0.65 + heuristicProb * 0.35;
    } else {
      // Sadece heuristik
      htBttsProb = scoreToProb(weightedScore);
    }

    // İlk yarı ev sahibi / deplasman gol olasılıkları
    const htHomeGoalProb = sim?.simHtHomeGoalProb ?? Math.min(85, homeXgHT * 55 + 15);
    const htAwayGoalProb = sim?.simHtAwayGoalProb ?? Math.min(80, awayXgHT * 55 + 10);
    const htOver05Prob = sim?.simHtOver05Prob ?? Math.min(90, combinedXgHT * 50 + 25);
    const htOver15Prob = sim?.simHtOver15Prob ?? Math.min(75, combinedXgHT * 35 + 5);

    // Oran & edge hesabı
    const fairOdds = 1 / (htBttsProb / 100);
    const bttsYes = pred.odds?.bttsYes ?? 0;
    const bookmakerOdds = bttsYes > 1.0 ? bttsYes * 1.45 : undefined; // IY KG ≈ MS KG × 1.45 yaklaşımı
    const edge = bookmakerOdds ? ((bookmakerOdds / fairOdds) - 1) * 100 : 0;

    // Kelly criterion
    const kellyStake = bookmakerOdds
      ? Math.max(0, ((bookmakerOdds * (htBttsProb / 100) - 1) / (bookmakerOdds - 1)) * 100)
      : 0;

    // Confidence (0-100)
    const confidence = calculateConfidence(htBttsProb, factors, sim);

    // Grade (A+ → D)
    const grade = getGrade(confidence, htBttsProb, edge);

    // Reasoning
    const reasoning = buildReasoning(factors, htBttsProb, grade, pred);

    // İlk yarı skor tahminleri
    const topHtScores = sim?.htScorelines ?? calculateHtScorelines(homeXgHT, awayXgHT);

    results.push({
      fixtureId: pred.fixtureId,
      homeTeam: pred.homeTeam.name,
      awayTeam: pred.awayTeam.name,
      league: pred.league.name,
      leagueId: pred.league.id,
      kickoff: pred.kickoff,
      homeLambdaHT: Math.round(homeXgHT * 1000) / 1000,
      awayLambdaHT: Math.round(awayXgHT * 1000) / 1000,
      htBttsProb: Math.round(htBttsProb * 10) / 10,
      htHomeGoalProb: Math.round(htHomeGoalProb * 10) / 10,
      htAwayGoalProb: Math.round(htAwayGoalProb * 10) / 10,
      htOver05Prob: Math.round(htOver05Prob * 10) / 10,
      htOver15Prob: Math.round(htOver15Prob * 10) / 10,
      bookmakerOdds,
      fairOdds: Math.round(fairOdds * 100) / 100,
      edge: Math.round(edge * 10) / 10,
      kellyStake: Math.round(kellyStake * 10) / 10,
      factors,
      confidence,
      grade,
      reasoning,
      topHtScores,
    });
  }

  // En iyi IY KG fırsatlarını başa al
  return results.sort((a, b) => {
    // Önce grade'e göre, sonra confidence'a göre
    const gradeOrder = { "A+": 0, "A": 1, "B": 2, "C": 3, "D": 4 };
    const gradeDiff = gradeOrder[a.grade] - gradeOrder[b.grade];
    if (gradeDiff !== 0) return gradeDiff;
    return b.confidence - a.confidence;
  });
}

/**
 * Sadece değerli IY KG fırsatlarını filtrele (A+ ve A grade)
 */
export function findBestHtBtts(predictions: MatchPrediction[], minGrade: "A+" | "A" | "B" | "C" = "B"): HtBttsAnalysis[] {
  const all = analyzeHtBtts(predictions);
  const gradeOrder = { "A+": 0, "A": 1, "B": 2, "C": 3, "D": 4 };
  return all.filter((a) => gradeOrder[a.grade] <= gradeOrder[minGrade]);
}

// ============================================
// Yardımcı Fonksiyonlar
// ============================================

/**
 * Weighted score'u olasılığa dönüştür (-100/+100 → %5-%45 arası)
 * IY KG oranları tipik olarak %15-30 arasında
 */
function scoreToProb(score: number): number {
  // Sigmoid benzeri dönüşüm: score → probability
  // score=-50 → ~%8, score=0 → ~%18, score=+50 → ~%35
  const base = 18; // Median IY KG olasılığı
  const prob = base + score * 0.35;
  return Math.max(5, Math.min(45, prob));
}

function calculateConfidence(
  htBttsProb: number,
  factors: HtBttsFactor[],
  sim?: { simHtBttsProb?: number } | null
): number {
  // Base confidence: olasılıktan türetilir
  let conf = Math.min(90, htBttsProb * 2.5);

  // Faktör uyumu: çoğu faktör pozitifse confidence artar
  const positiveFactors = factors.filter((f) => f.value > 5).length;
  const negativeFactors = factors.filter((f) => f.value < -5).length;
  const agreement = positiveFactors - negativeFactors;
  conf += agreement * 3;

  // Simülasyon desteği
  if (sim?.simHtBttsProb != null && sim.simHtBttsProb > 20) {
    conf += 5; // Simülasyon da yüksek diyorsa bonus
  }

  return Math.round(Math.max(10, Math.min(95, conf)));
}

function getGrade(
  confidence: number,
  htBttsProb: number,
  edge: number
): "A+" | "A" | "B" | "C" | "D" {
  if (confidence >= 75 && htBttsProb >= 28 && edge > 10) return "A+";
  if (confidence >= 65 && htBttsProb >= 24) return "A";
  if (confidence >= 55 && htBttsProb >= 20) return "B";
  if (confidence >= 40 && htBttsProb >= 15) return "C";
  return "D";
}

function buildReasoning(
  factors: HtBttsFactor[],
  htBttsProb: number,
  grade: string,
  pred: MatchPrediction
): string {
  const parts: string[] = [];

  // En güçlü pozitif faktör
  const strongPositive = factors
    .filter((f) => f.value > 10)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)[0];

  // En güçlü negatif faktör
  const strongNegative = factors
    .filter((f) => f.value < -5)
    .sort((a, b) => a.value * a.weight - b.value * b.weight)[0];

  if (strongPositive) {
    parts.push(`✅ ${strongPositive.name}: ${strongPositive.description}`);
  }
  if (strongNegative) {
    parts.push(`⚠️ ${strongNegative.name}: ${strongNegative.description}`);
  }

  parts.push(`📊 IY KG olasılığı: %${htBttsProb.toFixed(1)} [${grade}]`);

  // Simülasyon skor bilgisi
  const sim = pred.analysis.simulation;
  if (sim?.htScorelines?.length) {
    const top3 = sim.htScorelines.slice(0, 3).map((s) => `${s.score} (%${s.probability})`).join(", ");
    parts.push(`🎲 İY skor: ${top3}`);
  }

  return parts.join(" | ");
}

/**
 * Poisson dağılımı ile İY skor olasılıklarını hesapla (simülasyon yoksa fallback)
 */
function calculateHtScorelines(
  homeLambda: number,
  awayLambda: number
): { score: string; probability: number }[] {
  const results: { score: string; probability: number }[] = [];

  const poisson = (k: number, lambda: number): number => {
    let result = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) {
      result *= lambda / i;
    }
    return result;
  };

  for (let h = 0; h <= 4; h++) {
    for (let a = 0; a <= 4; a++) {
      const prob = poisson(h, homeLambda) * poisson(a, awayLambda) * 100;
      if (prob >= 0.5) {
        results.push({
          score: `${h}-${a}`,
          probability: Math.round(prob * 10) / 10,
        });
      }
    }
  }

  return results.sort((a, b) => b.probability - a.probability).slice(0, 5);
}
