// ============================================
// Exponential Form Decay (EFD) + Streak Detector
//
// Problem: Mevcut sistem son 5 maçı eşit ağırlıkta değerlendiriyor.
// Çözüm: Üstel azalan ağırlık → son maç en ağır, eski maçlar hafifler.
//
// Ayrıca: Seri (streak) tespiti → 4+ maç serisi olan takımlara
// momentum bonusu/cezası uygulanıyor.
//
// Formül: w_i = e^(-λ * i)  (i = 0 en son maç, λ = decay rate)
// Default λ = 0.35 → son maç %100, 3 maç önceki %35 ağırlık
// ============================================

export interface FormAnalysis {
  /** Ağırlıklı form skoru (0-100) — recency ağırlıklı */
  weightedForm: number;
  /** Son 5 maç ham form skoru (0-100) — ağırlıksız */
  rawForm: number;
  /** Seri bilgisi */
  streak: StreakInfo;
  /** Form momentumu (-30 ile +30 arası) */
  momentum: number;
  /** Form trendi: yükselen / düşen / sabit */
  trend: "rising" | "falling" | "stable";
  /** Ağırlıklı gol ortalaması (son maçlar daha ağır) */
  weightedGoalsScored: number;
  /** Ağırlıklı yenilen gol ortalaması */
  weightedGoalsConceded: number;
}

export interface StreakInfo {
  /** Seri tipi */
  type: "win" | "draw" | "loss" | "unbeaten" | "winless" | "none";
  /** Seri uzunluğu */
  length: number;
  /** Seri momentum çarpanı (>1 pozitif, <1 negatif) */
  multiplier: number;
}

type MatchResult = "W" | "D" | "L";

/**
 * Form string'ini (ör. "WDLWW") analiz et
 * Exponential decay + streak detection
 * 
 * @param formString "WWDLW" formatında son 5+ maç sonuçları (soldan→sağa: eski→yeni)
 * @param goalsFor Son maçlardaki atılan gol dizisi (opsiyonel)
 * @param goalsAgainst Son maçlardaki yenilen gol dizisi (opsiyonel) 
 * @param decayRate Üstel azalma oranı (default 0.35 — 3 maçta %35'e düşer)
 */
export function analyzeForm(
  formString: string,
  goalsFor?: number[],
  goalsAgainst?: number[],
  decayRate: number = 0.35
): FormAnalysis {
  if (!formString || formString.length === 0) {
    return getDefaultFormAnalysis();
  }

  // Form string'ini parse et (son maç sağda)
  const results: MatchResult[] = formString
    .toUpperCase()
    .split("")
    .filter((c): c is MatchResult => c === "W" || c === "D" || c === "L");

  if (results.length === 0) return getDefaultFormAnalysis();

  // Sonuçları ters çevir → indeks 0 = en son maç
  const reversed = [...results].reverse();

  // === Ağırlıklı Form Skoru ===
  const resultPoints: Record<MatchResult, number> = { W: 3, D: 1, L: 0 };
  const maxPointsPerMatch = 3;

  let weightedSum = 0;
  let totalWeight = 0;
  let rawSum = 0;

  for (let i = 0; i < reversed.length; i++) {
    const weight = Math.exp(-decayRate * i);
    const points = resultPoints[reversed[i]];
    weightedSum += points * weight;
    totalWeight += maxPointsPerMatch * weight;
    rawSum += points;
  }

  // 0-100 arası normalize
  const weightedForm = totalWeight > 0 
    ? Math.round((weightedSum / totalWeight) * 100) 
    : 50;
  const rawForm = Math.round((rawSum / (reversed.length * maxPointsPerMatch)) * 100);

  // === Seri (Streak) Tespiti ===
  const streak = detectStreak(reversed);

  // === Momentum Hesaplama ===
  // Son 2 maç vs önceki 3 maç karşılaştırması
  const momentum = calculateMomentum(reversed);

  // === Trend Tespiti ===
  const trend = determineTrend(reversed);

  // === Ağırlıklı Gol İstatistikleri ===
  let weightedGoalsScored = 1.2; // default
  let weightedGoalsConceded = 1.0; // default

  if (goalsFor && goalsFor.length > 0) {
    const gfReversed = [...goalsFor].reverse();
    let gfWeightedSum = 0;
    let gfTotalWeight = 0;
    for (let i = 0; i < gfReversed.length; i++) {
      const w = Math.exp(-decayRate * i);
      gfWeightedSum += gfReversed[i] * w;
      gfTotalWeight += w;
    }
    weightedGoalsScored = gfTotalWeight > 0 ? gfWeightedSum / gfTotalWeight : 1.2;
  }

  if (goalsAgainst && goalsAgainst.length > 0) {
    const gaReversed = [...goalsAgainst].reverse();
    let gaWeightedSum = 0;
    let gaTotalWeight = 0;
    for (let i = 0; i < gaReversed.length; i++) {
      const w = Math.exp(-decayRate * i);
      gaWeightedSum += gaReversed[i] * w;
      gaTotalWeight += w;
    }
    weightedGoalsConceded = gaTotalWeight > 0 ? gaWeightedSum / gaTotalWeight : 1.0;
  }

  return {
    weightedForm,
    rawForm,
    streak,
    momentum,
    trend,
    weightedGoalsScored: Math.round(weightedGoalsScored * 100) / 100,
    weightedGoalsConceded: Math.round(weightedGoalsConceded * 100) / 100,
  };
}

/**
 * Seri tespiti: Galibiyet/mağlubiyet/beraberlik serileri + yenilmezlik
 */
function detectStreak(results: MatchResult[]): StreakInfo {
  if (results.length === 0) return { type: "none", length: 0, multiplier: 1.0 };

  // Galibiyet serisi
  let winStreak = 0;
  for (const r of results) {
    if (r === "W") winStreak++;
    else break;
  }

  // Mağlubiyet serisi
  let lossStreak = 0;
  for (const r of results) {
    if (r === "L") lossStreak++;
    else break;
  }

  // Beraberlik serisi
  let drawStreak = 0;
  for (const r of results) {
    if (r === "D") drawStreak++;
    else break;
  }

  // Yenilmezlik serisi (W veya D)
  let unbeatenStreak = 0;
  for (const r of results) {
    if (r === "W" || r === "D") unbeatenStreak++;
    else break;
  }

  // Galibiyet-siz seri (D veya L)
  let winlessStreak = 0;
  for (const r of results) {
    if (r === "D" || r === "L") winlessStreak++;
    else break;
  }

  // En anlamlı seriyi belirle
  if (winStreak >= 3) {
    // 3+ galibiyet serisi: güven çarpanı artır
    // 3 maç = 1.06, 4 maç = 1.09, 5+ = 1.12
    const multiplier = 1.0 + Math.min(0.12, (winStreak - 2) * 0.03);
    return { type: "win", length: winStreak, multiplier };
  }

  if (lossStreak >= 3) {
    // 3+ mağlubiyet serisi: güven çarpanı azalt
    const multiplier = 1.0 - Math.min(0.15, (lossStreak - 2) * 0.04);
    return { type: "loss", length: lossStreak, multiplier };
  }

  if (unbeatenStreak >= 5) {
    const multiplier = 1.0 + Math.min(0.08, (unbeatenStreak - 4) * 0.02);
    return { type: "unbeaten", length: unbeatenStreak, multiplier };
  }

  if (winlessStreak >= 4) {
    const multiplier = 1.0 - Math.min(0.10, (winlessStreak - 3) * 0.025);
    return { type: "winless", length: winlessStreak, multiplier };
  }

  if (drawStreak >= 3) {
    return { type: "draw", length: drawStreak, multiplier: 0.97 }; // Beraberlik alışkanlığı
  }

  return { type: "none", length: 0, multiplier: 1.0 };
}

/**
 * Momentum: Son 2 maç vs önceki 3 maç performans farkı
 * Pozitif = yükselen form, negatif = düşen form
 * Aralık: -30 ile +30
 */
function calculateMomentum(results: MatchResult[]): number {
  if (results.length < 4) return 0;

  const resultPoints: Record<MatchResult, number> = { W: 3, D: 1, L: 0 };
  
  // Son 2 maç ortalaması
  const recent = results.slice(0, 2);
  const recentAvg = recent.reduce((s, r) => s + resultPoints[r], 0) / recent.length;

  // Önceki maçlar ortalaması
  const older = results.slice(2, Math.min(5, results.length));
  if (older.length === 0) return 0;
  const olderAvg = older.reduce((s, r) => s + resultPoints[r], 0) / older.length;

  // Fark: -3 ile +3 arası → -30 ile +30'a ölçekle
  const diff = recentAvg - olderAvg;
  return Math.round(diff * 10);
}

/**
 * Trend: Son maçların yönü
 */
function determineTrend(results: MatchResult[]): "rising" | "falling" | "stable" {
  if (results.length < 3) return "stable";

  const resultPoints: Record<MatchResult, number> = { W: 3, D: 1, L: 0 };
  
  // Son 3 maçın puanlarını bak
  const recent3 = results.slice(0, 3).map(r => resultPoints[r]);
  
  // Yükselen: Her maç bir öncekinden eşit veya iyi
  if (recent3[0] >= recent3[1] && recent3[1] > recent3[2]) return "rising";
  
  // Düşen: Her maç bir öncekinden eşit veya kötü  
  if (recent3[0] <= recent3[1] && recent3[1] < recent3[2]) return "falling";

  // Son 2 maç galibiyet = yükselen
  if (recent3[0] === 3 && recent3[1] === 3) return "rising";
  
  // Son 2 maç mağlubiyet = düşen
  if (recent3[0] === 0 && recent3[1] === 0) return "falling";

  return "stable";
}

function getDefaultFormAnalysis(): FormAnalysis {
  return {
    weightedForm: 50,
    rawForm: 50,
    streak: { type: "none", length: 0, multiplier: 1.0 },
    momentum: 0,
    trend: "stable",
    weightedGoalsScored: 1.2,
    weightedGoalsConceded: 1.0,
  };
}

/**
 * Form analizini lambda çarpanına dönüştür
 * Simülasyon motorunda kullanılmak üzere
 * 
 * @returns Çarpan (0.85 - 1.15 arası)
 */
export function formToLambdaMultiplier(form: FormAnalysis): {
  attackMultiplier: number;
  defenseMultiplier: number;
} {
  // Hücum çarpanı: form + streaks + momentum
  let attackMul = 1.0;

  // Form etkisi (50 = nötr)
  if (form.weightedForm > 60) {
    attackMul += (form.weightedForm - 60) * 0.002; // Max +0.08 (form=100)
  } else if (form.weightedForm < 40) {
    attackMul -= (40 - form.weightedForm) * 0.002; // Max -0.08 (form=0)
  }

  // Streak etkisi
  attackMul *= form.streak.multiplier;

  // Momentum etkisi (hafif)
  attackMul += form.momentum * 0.001; // Max ±0.03

  // Savunma çarpanı: Ters yönde etki
  let defenseMul = 1.0;
  
  // İyi formdaki takımlar daha az gol de yer
  if (form.weightedForm > 65) {
    defenseMul -= (form.weightedForm - 65) * 0.001; // Savunma iyileşir
  } else if (form.weightedForm < 35) {
    defenseMul += (35 - form.weightedForm) * 0.001; // Savunma kötüleşir
  }

  // Sınırla
  attackMul = Math.max(0.85, Math.min(1.15, attackMul));
  defenseMul = Math.max(0.90, Math.min(1.10, defenseMul));

  return {
    attackMultiplier: Math.round(attackMul * 1000) / 1000,
    defenseMultiplier: Math.round(defenseMul * 1000) / 1000,
  };
}
