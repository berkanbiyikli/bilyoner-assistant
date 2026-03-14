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
 * 4 aşamalı doğrulama:
 * 1. Veri Tamlık Kontrolü
 * 2. Odd Drift Guard
 * 3. Conflict Resolver (engine vs simulator)
 * 4. Minimum Oran Eşiği (FAZ 1.1)
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

  // ===== Aşama 4: Minimum Oran Eşiği (FAZ 1.1) =====
  const minOdds = checkMinOdds(prediction);
  if (minOdds.caution) {
    riskLevel = "caution";
    warnings.push(minOdds.caution);
  }

  // ===== Aşama 5: Cross-Market Çelişki Kontrolü =====
  const crossMarket = checkCrossMarketConflicts(prediction);
  if (crossMarket.length > 0) {
    riskLevel = "caution";
    warnings.push(...crossMarket);
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

// ---- Aşama 4: Minimum Oran Eşiği (FAZ 1.1) ----
const MIN_PICK_ODDS = 1.40;

function checkMinOdds(prediction: MatchPrediction): {
  pass: boolean;
  caution?: string;
} {
  if (!prediction.odds) return { pass: true };
  
  const bestPick = prediction.picks[0];
  if (!bestPick) return { pass: true };

  const currentOdds = getPickOdds(bestPick, prediction.odds);
  if (!currentOdds) return { pass: true };

  if (currentOdds < MIN_PICK_ODDS) {
    return {
      pass: true,
      caution: `Ana pick oranı ${currentOdds.toFixed(2)} — minimum eşik ${MIN_PICK_ODDS} altında, düşük değer`,
    };
  }

  return { pass: true };
}

// ---- Aşama 5: Cross-Market Çelişki Kontrolü ----
function checkCrossMarketConflicts(prediction: MatchPrediction): string[] {
  const warnings: string[] = [];
  const picks = prediction.picks;
  if (picks.length < 2) return warnings;

  const findPick = (type: string) => picks.find(p => p.type === type);

  // 1. BTTS No + BTTS Yes çelişkisi
  const bttsNo = findPick("BTTS No");
  const bttsYes = findPick("BTTS Yes");
  if (bttsNo && bttsYes) {
    warnings.push(`BTTS No (%${bttsNo.confidence}) ve BTTS Yes (%${bttsYes.confidence}) aynı anda mevcut — çelişki`);
  }

  // 2. Over/Under aynı eşik çelişkisi
  for (const threshold of ["1.5", "2.5", "3.5"]) {
    const over = findPick(`Over ${threshold}`);
    const under = findPick(`Under ${threshold}`);
    if (over && under) {
      warnings.push(`Over ${threshold} (%${over.confidence}) ve Under ${threshold} (%${under.confidence}) aynı anda — çelişki`);
    }
  }

  // 3. BTTS No yüksek + HT BTTS Yes çelişkisi
  if (bttsNo && bttsNo.confidence >= 80) {
    const bttsYesHT = findPick("HT BTTS Yes");
    if (bttsYesHT && bttsYesHT.confidence >= 50) {
      warnings.push(`BTTS No (%${bttsNo.confidence}) çok güçlü ama HT BTTS Yes (%${bttsYesHT.confidence}) da mevcut`);
    }
  }

  // 4. Under 1.5 yüksek + Over 2.5/3.5 çelişkisi
  const under15 = findPick("Under 1.5");
  if (under15 && under15.confidence >= 60) {
    const over25 = findPick("Over 2.5");
    const over35 = findPick("Over 3.5");
    if (over25) warnings.push(`Under 1.5 (%${under15.confidence}) ile Over 2.5 (%${over25.confidence}) çelişiyor`);
    if (over35) warnings.push(`Under 1.5 (%${under15.confidence}) ile Over 3.5 (%${over35.confidence}) çelişiyor`);
  }

  // 5. 1X2 + zıt DC çelişkisi
  const homePick = findPick("1");
  const awayPick = findPick("2");
  const x2Pick = findPick("X2");
  const dc1xPick = findPick("1X");
  if (homePick && homePick.confidence >= 65 && x2Pick && x2Pick.confidence >= 65) {
    warnings.push(`Ev galibiyeti (%${homePick.confidence}) ile X2 (%${x2Pick.confidence}) çelişiyor`);
  }
  if (awayPick && awayPick.confidence >= 65 && dc1xPick && dc1xPick.confidence >= 65) {
    warnings.push(`Dep galibiyeti (%${awayPick.confidence}) ile 1X (%${dc1xPick.confidence}) çelişiyor`);
  }

  return warnings;
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
