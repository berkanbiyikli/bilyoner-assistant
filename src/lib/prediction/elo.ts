// ============================================
// Elo Power Rating Sistemi
//
// Problem: Mevcut sistem "homeAttack: 60, awayDefense: 45" gibi
// API-Football'un anlık snapshot'larına bağımlı. Güvenilir değil.
//
// Çözüm: H2H ve son maçlardan dinamik Elo rating hesapla.
// Her maç sonucu rating'i günceller. Zaman geçtikçe
// ortalamaya regresyon (regression to mean) uygulanır.
//
// Elo formülü: R_new = R_old + K * (S - E)
// K = güncelleme hızı (mevcut ligde 32, kupa 24, hazırlık 16)
// S = gerçek sonuç (1=galibiyet, 0.5=beraberlik, 0=mağlubiyet)
// E = beklenen sonuç (1 / (1 + 10^((R_opp - R_self) / 400)))
//
// Gol farklı bonus: Elo farkına gol farkı çarpanı ekler
// ============================================

export interface EloRating {
  rating: number;          // Mevcut Elo (1500 = ortalama)
  attackRating: number;    // Hücum Elo (gol atma gücü)
  defenseRating: number;   // Savunma Elo (gol yeme direnci)
  confidence: number;      // Rating güvenilirliği (0-1, maç sayısına bağlı)
}

interface MatchInput {
  homeGoals: number;
  awayGoals: number;
  isHomeTeam: boolean;
  /** Maçın ağırlığı: 1.0 = normal lig, 0.8 = kupa, 0.6 = hazırlık */
  weight?: number;
  /** Maç ne kadar eski (0 = en yeni) */
  recencyIndex?: number;
}

const BASE_RATING = 1500;
const BASE_K_FACTOR = 32;     // Temel güncelleme hızı
const GOAL_DIFF_POWER = 0.7;  // Gol farkı ağırlığı (< 1.0 = diminishing returns)
const MAX_GOAL_BONUS = 1.5;   // Gol farkından gelen max çarpan
const RECENCY_DECAY = 0.15;   // Eski maçların ağırlık azalma hızı

/**
 * Adaptif K-Factor hesaplama
 * Sezon başında daha yüksek (hızlı öğrenme), sonunda daha düşük (stabil)
 * Sürpriz sonuçlarda K artırılır (sistemi hızlı adapte etmek için)
 */
function getAdaptiveKFactor(expectedScore: number, actualScore: number): number {
  let k = BASE_K_FACTOR;

  // 1) Sezon evresi düzeltmesi
  const month = new Date().getMonth(); // 0-indexed
  if (month >= 7 && month <= 9) {
    // Ağu-Eki (sezon başı): Takımlar değişiyor, daha hızlı öğrenme gerekli
    k *= 1.25;
  } else if (month >= 2 && month <= 4) {
    // Mar-May (sezon sonu): Rating'ler stabilize, daha yavaş güncelle
    k *= 0.85;
  }

  // 2) Sürpriz sonuç düzeltmesi
  const surprise = Math.abs(actualScore - expectedScore);
  if (surprise > 0.6) {
    k *= 1.35; // Büyük sürpriz (favori yenildi)
  } else if (surprise > 0.35) {
    k *= 1.12; // Orta sürpriz
  }

  return k;
}

/**
 * Son maçlardan Elo rating hesapla
 * 
 * @param matches Son maçlar (kronolojik: eski → yeni)
 * @param opponentStrengths Rakiplerin tahmini güçleri (0-100 arası, API veya önceki Elo)
 * @returns Hesaplanan Elo profili
 */
export function calculateEloFromMatches(
  matches: MatchInput[],
  opponentStrengths?: number[]
): EloRating {
  let rating = BASE_RATING;
  let attackRating = BASE_RATING;
  let defenseRating = BASE_RATING;

  if (matches.length === 0) {
    return { rating, attackRating, defenseRating, confidence: 0 };
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const opponentStrength = opponentStrengths?.[i] 
      ? strengthToElo(opponentStrengths[i]) 
      : BASE_RATING;

    // Recency ağırlığı: Son maçlar daha ağır
    const recencyWeight = Math.exp(-RECENCY_DECAY * (match.recencyIndex ?? (matches.length - 1 - i)));
    const matchWeight = (match.weight ?? 1.0) * recencyWeight;

    // Beklenen sonuç
    const expectedScore = 1 / (1 + Math.pow(10, (opponentStrength - rating) / 400));

    // Gerçek sonuç
    const goalsFor = match.isHomeTeam ? match.homeGoals : match.awayGoals;
    const goalsAgainst = match.isHomeTeam ? match.awayGoals : match.homeGoals;
    const actualScore = goalsFor > goalsAgainst ? 1 : goalsFor === goalsAgainst ? 0.5 : 0;

    // Gol farkı bonusu (margin of victory)
    const goalDiff = Math.abs(goalsFor - goalsAgainst);
    const goalBonus = goalDiff > 0 
      ? Math.min(MAX_GOAL_BONUS, 1 + Math.pow(goalDiff - 1, GOAL_DIFF_POWER) * 0.3)
      : 1.0;

    // Rating güncelle
    const k = getAdaptiveKFactor(expectedScore, actualScore) * matchWeight * goalBonus;
    rating += k * (actualScore - expectedScore);

    // Hücum Elo: Atılan gol sayısına göre
    const expectedGoals = 1.3; // Ortalama gol beklentisi
    const goalEfficiency = goalsFor / Math.max(0.5, expectedGoals);
    attackRating += (BASE_K_FACTOR * 0.5 * matchWeight) * (Math.min(2, goalEfficiency) - 1);

    // Savunma Elo: Yenilen gol sayısına göre (düşük = iyi)
    const concededEfficiency = goalsAgainst / Math.max(0.5, expectedGoals);
    defenseRating -= (BASE_K_FACTOR * 0.5 * matchWeight) * (Math.min(2, concededEfficiency) - 1);
  }

  // Confidence: Maç sayısına bağlı (5 maç = 0.6, 10 maç = 0.85, 15+ = 0.95)
  const confidence = Math.min(0.95, 1 - Math.exp(-0.12 * matches.length));

  // Aralığı sınırla
  rating = Math.max(1200, Math.min(1900, rating));
  attackRating = Math.max(1200, Math.min(1900, attackRating));
  defenseRating = Math.max(1200, Math.min(1900, defenseRating));

  return {
    rating: Math.round(rating),
    attackRating: Math.round(attackRating),
    defenseRating: Math.round(defenseRating),
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * İki takımın Elo'suna göre beklenen maç sonucu olasılıkları
 */
export function eloToWinProbabilities(
  homeElo: number,
  awayElo: number,
  homeAdvantage: number = 65 // Ev sahibi Elo bonusu
): { homeWin: number; draw: number; awayWin: number } {
  const adjustedHomeElo = homeElo + homeAdvantage;
  
  // Beklenen skor (0-1)
  const expectedHome = 1 / (1 + Math.pow(10, (awayElo - adjustedHomeElo) / 400));
  const expectedAway = 1 - expectedHome;

  // Beraberlik olasılığı: Elo farkı küçükse beraberlik daha olası
  const eloDiff = Math.abs(adjustedHomeElo - awayElo);
  const drawBase = 0.26; // Base beraberlik oranı (%26)
  const drawAdjust = Math.max(0, (200 - eloDiff) / 200) * 0.08; // Elo yakınsa +%8
  const drawProb = drawBase + drawAdjust;

  // Kalan olasılığı dağıt
  const remaining = 1 - drawProb;
  const homeWin = remaining * expectedHome;
  const awayWin = remaining * expectedAway;

  return {
    homeWin: Math.round(homeWin * 1000) / 10,
    draw: Math.round(drawProb * 1000) / 10,
    awayWin: Math.round(awayWin * 1000) / 10,
  };
}

/**
 * Elo rating'i lambda (beklenen gol) değerine dönüştür
 * Simülasyon motorunda kullanılır
 * 
 * @param attackElo Takımın hücum Elo'su
 * @param opponentDefenseElo Rakibin savunma Elo'su
 * @param baseGoalExpectancy Liga gol ortalaması (genelde 1.25-1.45)
 * @returns lambda (beklenen gol sayısı)
 */
export function eloToLambda(
  attackElo: number,
  opponentDefenseElo: number,
  baseGoalExpectancy: number = 1.35
): number {
  // Hücum avantajı: attackElo yüksekse daha çok gol
  const attackFactor = Math.pow(10, (attackElo - BASE_RATING) / 600);
  
  // Savunma dezavantajı: opponentDefenseElo yüksekse daha az gol
  const defenseFactor = Math.pow(10, (BASE_RATING - opponentDefenseElo) / 600);

  const lambda = baseGoalExpectancy * attackFactor * defenseFactor;
  
  // Sınırla: 0.3 - 3.5 arası makul
  return Math.max(0.30, Math.min(3.5, lambda));
}

/**
 * API-Football güç yüzdelerini Elo'ya çevir
 * 50 = 1500, 80 = 1650, 20 = 1350
 */
function strengthToElo(strength: number): number {
  return BASE_RATING + (strength - 50) * 5;
}

/**
 * Elo'yu 0-100 arası güç yüzdesine çevir
 */
export function eloToStrength(elo: number): number {
  return Math.max(0, Math.min(100, Math.round(50 + (elo - BASE_RATING) / 5)));
}

/**
 * H2H maçlarından iki takımın göreceli Elo'sunu hesapla
 */
export function calculateH2HElo(
  h2hMatches: Array<{
    homeGoals: number;
    awayGoals: number;
    /** true ise analiz edilen takım ev sahibiydi */
    wasHome: boolean;
  }>
): { relativeAdvantage: number; confidence: number } {
  if (h2hMatches.length < 2) {
    return { relativeAdvantage: 0, confidence: 0 };
  }

  const matches: MatchInput[] = h2hMatches.map((m, i) => ({
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    isHomeTeam: m.wasHome,
    recencyIndex: h2hMatches.length - 1 - i,
    weight: 0.8, // H2H maçları biraz daha az ağırlıklı
  }));

  const elo = calculateEloFromMatches(matches);
  
  return {
    relativeAdvantage: elo.rating - BASE_RATING, // Pozitif = analiz edilen takım üstün
    confidence: Math.min(0.8, elo.confidence), // H2H'de max 0.8 güven
  };
}
