// ============================================
// Safety Check Katmanları
// Yanlış/eksik veri paylaşımını engeller
// ============================================

import type { MatchPrediction, MatchAnalysis, Pick } from "@/types";

export interface SafetyResult {
  pass: boolean;
  reason?: string;
  riskLevel: "safe" | "caution" | "skip";
  warnings: string[];
}

/**
 * 3 aşamalı doğrulama:
 * 1. Veri Tamlık Kontrolü
 * 2. Odd Drift Guard
 * 3. Conflict Resolver (engine vs simulator)
 */
export function runSafetyChecks(prediction: MatchPrediction): SafetyResult {
  const warnings: string[] = [];
  let riskLevel: SafetyResult["riskLevel"] = "safe";

  // ===== Aşama 1: Veri Tamlık Kontrolü =====
  const completeness = checkDataCompleteness(prediction.analysis);
  if (!completeness.pass) {
    return {
      pass: false,
      reason: completeness.reason,
      riskLevel: "skip",
      warnings: [completeness.reason!],
    };
  }
  if (completeness.warnings.length > 0) {
    warnings.push(...completeness.warnings);
  }

  // ===== Aşama 2: Odd Drift Guard =====
  const oddDrift = checkOddDrift(prediction);
  if (!oddDrift.pass) {
    return {
      pass: false,
      reason: oddDrift.reason,
      riskLevel: "skip",
      warnings: [...warnings, oddDrift.reason!],
    };
  }
  if (oddDrift.caution) {
    riskLevel = "caution";
    warnings.push(oddDrift.caution);
  }

  // ===== Aşama 3: Conflict Resolver =====
  const conflict = checkConflicts(prediction);
  if (!conflict.pass) {
    return {
      pass: false,
      reason: conflict.reason,
      riskLevel: "skip",
      warnings: [...warnings, conflict.reason!],
    };
  }
  if (conflict.caution) {
    riskLevel = "caution";
    warnings.push(conflict.caution);
  }

  return { pass: true, riskLevel, warnings };
}

// ---- Aşama 1: Veri Tamlık ----
function checkDataCompleteness(analysis: MatchAnalysis): {
  pass: boolean;
  reason?: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Zorunlu alanlar: form, hücum, savunma skoru
  if (analysis.homeForm <= 0 || analysis.awayForm <= 0) {
    return { pass: false, reason: "Form verisi eksik (0 veya negatif)", warnings: [] };
  }

  if (analysis.homeAttack <= 0 || analysis.awayAttack <= 0) {
    return { pass: false, reason: "Hücum verisi eksik", warnings: [] };
  }

  // xG verisi yoksa uyarı (ama skip etme)
  if (!analysis.homeXg && !analysis.awayXg) {
    warnings.push("xG verisi bulunamadı — analiz derinliği azaltıldı");
  }

  // Simülasyon yoksa uyarı
  if (!analysis.simulation) {
    warnings.push("Monte Carlo simülasyonu çalıştırılamadı");
  }

  // Hakem verisi yoksa bilgi notu
  if (!analysis.refereeProfile) {
    warnings.push("Hakem verisi mevcut değil");
  }

  return { pass: true, warnings };
}

// ---- Aşama 2: Odd Drift Guard ----
function checkOddDrift(prediction: MatchPrediction): {
  pass: boolean;
  reason?: string;
  caution?: string;
} {
  if (!prediction.odds) return { pass: true }; // Oran yoksa kontrol edemeyiz

  const bestPick = prediction.picks[0];
  if (!bestPick) return { pass: true };

  // Pick'in karşılık geldiği oranı bul
  const currentOdds = getPickOdds(bestPick, prediction.odds);
  if (!currentOdds || currentOdds <= 1.0) return { pass: true };

  // Oran çok düştüyse value kaybolmuştur
  const impliedProb = 1 / currentOdds;
  const ourProb = bestPick.confidence / 100;
  const edge = ((ourProb * currentOdds) - 1) * 100;

  // Value tamamen kayboldu
  if (edge < -5) {
    return {
      pass: false,
      reason: `Oran çok düştü — edge artık negatif (${edge.toFixed(1)}%). Value kaybolmuş.`,
    };
  }

  // Edge zayıfladı ama hala var
  if (edge < 3 && bestPick.isValueBet) {
    return {
      pass: true,
      caution: `Edge zayıfladı (${edge.toFixed(1)}%) — oran düşmüş olabilir`,
    };
  }

  return { pass: true };
}

function getPickOdds(pick: Pick, odds: NonNullable<MatchPrediction["odds"]>): number | null {
  switch (pick.type) {
    case "1": return odds.home;
    case "X": return odds.draw;
    case "2": return odds.away;
    case "Over 2.5": return odds.over25;
    case "Under 2.5": return odds.under25;
    case "Over 1.5": return odds.over15;
    case "Under 1.5": return odds.under15;
    case "Over 3.5": return odds.over35;
    case "Under 3.5": return odds.under35;
    case "BTTS Yes": return odds.bttsYes;
    case "BTTS No": return odds.bttsNo;
    default: return null;
  }
}

// ---- Aşama 3: Conflict Resolver ----
function checkConflicts(prediction: MatchPrediction): {
  pass: boolean;
  reason?: string;
  caution?: string;
} {
  const sim = prediction.analysis.simulation;
  const bestPick = prediction.picks[0];
  if (!sim || !bestPick) return { pass: true };

  // Engine pick vs Simulation olasılık çelişkisi
  const pickType = bestPick.type;
  let simProb: number | null = null;

  switch (pickType) {
    case "1": simProb = sim.simHomeWinProb; break;
    case "X": simProb = sim.simDrawProb; break;
    case "2": simProb = sim.simAwayWinProb; break;
    case "Over 2.5": simProb = sim.simOver25Prob; break;
    case "Under 2.5": simProb = 100 - sim.simOver25Prob; break;
    case "Over 1.5": simProb = sim.simOver15Prob; break;
    case "Under 1.5": simProb = 100 - sim.simOver15Prob; break;
    case "Over 3.5": simProb = sim.simOver35Prob; break;
    case "Under 3.5": simProb = 100 - sim.simOver35Prob; break;
    case "BTTS Yes": simProb = sim.simBttsProb; break;
    case "BTTS No": simProb = 100 - sim.simBttsProb; break;
  }

  if (simProb === null) return { pass: true };

  const engineConf = bestPick.confidence;
  const difference = Math.abs(engineConf - simProb);

  // Ağır çelişki: Motor "yüksek güven" diyor ama simülasyon tam tersini gösteriyor
  if (difference > 30) {
    // Motor Üst diyor ama sim %70+ Alt diyor (veya tersi)
    const isDirectConflict =
      (engineConf >= 60 && simProb < 35) || // Motor güveniyor ama sim düşük
      (simProb >= 65 && engineConf < 40);    // Sim güveniyor ama motor düşük

    if (isDirectConflict) {
      return {
        pass: false,
        reason: `Motor (%${engineConf}) ve Simülasyon (%${simProb.toFixed(0)}) arasında ciddi çelişki — riskli maç`,
      };
    }
  }

  // Orta çelişki: Uyarı ver ama paylaş
  if (difference > 15) {
    return {
      pass: true,
      caution: `Motor (%${engineConf}) ve Sim (%${simProb.toFixed(0)}) arasında ${difference.toFixed(0)} puan fark var`,
    };
  }

  return { pass: true };
}

/**
 * Birden fazla tahmin için toplu güvenlik kontrolü
 * Sadece güvenli olanları döndürür
 */
export function filterSafePredictions(predictions: MatchPrediction[]): {
  safe: MatchPrediction[];
  skipped: { prediction: MatchPrediction; reason: string }[];
  cautioned: { prediction: MatchPrediction; warnings: string[] }[];
} {
  const safe: MatchPrediction[] = [];
  const skipped: { prediction: MatchPrediction; reason: string }[] = [];
  const cautioned: { prediction: MatchPrediction; warnings: string[] }[] = [];

  for (const pred of predictions) {
    if (pred.picks.length === 0) {
      skipped.push({ prediction: pred, reason: "Pick üretilemedi" });
      continue;
    }

    const result = runSafetyChecks(pred);

    if (!result.pass) {
      skipped.push({ prediction: pred, reason: result.reason || "Güvenlik kontrolü geçemedi" });
      console.log(`[SAFETY] SKIP: ${pred.homeTeam.name} vs ${pred.awayTeam.name} — ${result.reason}`);
    } else if (result.riskLevel === "caution") {
      cautioned.push({ prediction: pred, warnings: result.warnings });
      safe.push(pred); // Yine de paylaş ama uyarılarla
    } else {
      safe.push(pred);
    }
  }

  return { safe, skipped, cautioned };
}
