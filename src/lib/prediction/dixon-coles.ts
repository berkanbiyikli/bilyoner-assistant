// ============================================
// Dixon-Coles Bivariate Poisson Korelasyon Modeli
// 
// Neden gerekli:
// Standart Poisson modeli ev/deplasman gollerini bağımsız kabul eder.
// Gerçekte düşük skorlu maçlarda (0-0, 1-0, 0-1, 1-1) pozitif korelasyon var.
// Dixon-Coles (1997) bu korelasyonu τ (tau) parametresiyle düzeltir.
//
// Etki: 0-0, 1-0, 0-1, 1-1 skorlarının olasılığı %5-15 daha doğru.
// Bu özellikle Under 2.5 ve BTTS No pazarlarında büyük fark yaratır.
// ============================================

/**
 * Dixon-Coles τ (tau) düzeltme faktörü
 * 
 * Sadece düşük skorlara (0-0, 1-0, 0-1, 1-1) uygulanır.
 * rho < 0 → düşük skorlar daha olası (defansif maçlar)
 * rho > 0 → düşük skorlar daha az olası (ofansif maçlar)
 * 
 * @param homeGoals Ev sahibi gol sayısı (0 veya 1)
 * @param awayGoals Deplasman gol sayısı (0 veya 1)
 * @param homeLambda Ev sahibi beklenen gol (Poisson lambda)
 * @param awayLambda Deplasman beklenen gol (Poisson lambda)
 * @param rho Korelasyon parametresi (-0.15 ile +0.15 arası)
 */
export function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  homeLambda: number,
  awayLambda: number,
  rho: number
): number {
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - homeLambda * awayLambda * rho;
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return 1 + homeLambda * rho;
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return 1 + awayLambda * rho;
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }
  // 2+ gol için düzeltme yok
  return 1.0;
}

/**
 * Maç profiline göre optimal rho değerini hesapla
 * 
 * Akademik araştırma: rho tipik olarak -0.13 ile -0.03 arası
 * Negatif rho = düşük skorlar beklentiden daha olası
 * 
 * Defansif maçlar (düşük xG) → daha negatif rho (-0.12)
 * Ofansif maçlar (yüksek xG) → sıfıra yakın rho (-0.02)
 * Çok yüksek hücumlu açık maçlar → hafif pozitif rho (+0.05)
 * 
 * @param homeLambda Ev sahibi beklenen gol
 * @param awayLambda Deplasman beklenen gol
 * @param homeDefense Ev sahibi savunma gücü (0-100)
 * @param awayDefense Deplasman savunma gücü (0-100)
 * @param leagueId Liga ID (bazı ligler daha defansif)
 */
export function estimateRho(
  homeLambda: number,
  awayLambda: number,
  homeDefense: number,
  awayDefense: number,
  leagueId?: number
): number {
  const totalXg = homeLambda + awayLambda;
  const avgDefense = (homeDefense + awayDefense) / 2;

  // Base rho: Akademik ortanca = -0.07
  let rho = -0.07;

  // xG etkisi: Düşük gollü → daha negatif (düşük skorlar daha olası)
  if (totalXg < 1.8) {
    rho -= 0.05; // Çok defansif → -0.12
  } else if (totalXg < 2.3) {
    rho -= 0.02; // Defansif → -0.09
  } else if (totalXg > 3.5) {
    rho += 0.05; // Çok ofansif → -0.02
  } else if (totalXg > 3.0) {
    rho += 0.03; // Ofansif → -0.04
  }

  // Savunma etkisi: Güçlü savunmalar düşük skor korelasyonunu artırır
  if (avgDefense > 65) {
    rho -= 0.02; // Her iki savunma güçlü → düşük skor daha olası
  } else if (avgDefense < 40) {
    rho += 0.02; // Zayıf savunmalar → düşük skor daha az olası
  }

  // Liga etkisi: Bazı ligler doğası gereği daha defansif
  const defensiveLeagues = new Set([135, 203, 94]); // Serie A, Süper Lig, Liga Portekiz
  const offensiveLeagues = new Set([78, 88]); // Bundesliga, Eredivisie

  if (leagueId && defensiveLeagues.has(leagueId)) {
    rho -= 0.015;
  } else if (leagueId && offensiveLeagues.has(leagueId)) {
    rho += 0.015;
  }

  // Sınırla: -0.15 ile +0.10 arası (fiziksel anlam kaybetmesin)
  return Math.max(-0.15, Math.min(0.10, rho));
}

/**
 * Dixon-Coles bivariate Poisson olasılığı
 * P(X=x, Y=y) = P_poisson(x, λ1) * P_poisson(y, λ2) * τ(x, y, λ1, λ2, ρ)
 */
export function bivariatePoisson(
  homeGoals: number,
  awayGoals: number,
  homeLambda: number,
  awayLambda: number,
  rho: number
): number {
  const poissonProb = (k: number, lambda: number): number => {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  };

  const pHome = poissonProb(homeGoals, homeLambda);
  const pAway = poissonProb(awayGoals, awayLambda);
  const tau = dixonColesTau(homeGoals, awayGoals, homeLambda, awayLambda, rho);

  return pHome * pAway * tau;
}

/**
 * Tam skor matrisi oluştur (0-0'dan maxGoals-maxGoals'a kadar)
 * Dixon-Coles düzeltmeli tüm skor olasılıkları
 */
export function buildScoreMatrix(
  homeLambda: number,
  awayLambda: number,
  rho: number,
  maxGoals: number = 7
): number[][] {
  const matrix: number[][] = [];
  
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      matrix[h][a] = bivariatePoisson(h, a, homeLambda, awayLambda, rho);
    }
  }

  // Normalizasyon: Tüm olasılıklar toplamı 1 olmalı
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      total += matrix[h][a];
    }
  }

  if (total > 0 && Math.abs(total - 1) > 0.001) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        matrix[h][a] /= total;
      }
    }
  }

  return matrix;
}

/**
 * Skor matrisinden pazar olasılıklarını hesapla
 * Monte Carlo'ya gerek kalmadan analitik olasılıklar
 */
export interface AnalyticProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  bttsYes: number;
  // İlk yarı da eklenebilir (ileride)
  /** Skor olasılık haritası: "2-1" → 0.085 */
  scoreProbabilities: Map<string, number>;
}

export function calculateAnalyticProbabilities(
  homeLambda: number,
  awayLambda: number,
  rho: number
): AnalyticProbabilities {
  const matrix = buildScoreMatrix(homeLambda, awayLambda, rho);
  const maxGoals = matrix.length - 1;

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;
  const scoreProbabilities = new Map<string, number>();

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = matrix[h][a];
      const totalGoals = h + a;

      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;

      if (totalGoals > 1) over15 += prob;
      if (totalGoals > 2) over25 += prob;
      if (totalGoals > 3) over35 += prob;
      if (h > 0 && a > 0) bttsYes += prob;

      if (prob > 0.003) { // %0.3'ten yüksek skorları kaydet
        scoreProbabilities.set(`${h}-${a}`, Math.round(prob * 10000) / 100);
      }
    }
  }

  return {
    homeWin: Math.round(homeWin * 1000) / 10,
    draw: Math.round(draw * 1000) / 10,
    awayWin: Math.round(awayWin * 1000) / 10,
    over15: Math.round(over15 * 1000) / 10,
    over25: Math.round(over25 * 1000) / 10,
    over35: Math.round(over35 * 1000) / 10,
    bttsYes: Math.round(bttsYes * 1000) / 10,
    scoreProbabilities,
  };
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}
