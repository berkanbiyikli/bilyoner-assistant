/**
 * Cluster Analysis - Takım Stili Kümeleme
 * Takımları oyun stillerine göre gruplar ve stil eşleşmelerini analiz eder
 * 
 * Stiller:
 * - OFFENSIVE: Hücumcu (yüksek gol, düşük savunma)
 * - COUNTER: Kontracı (düşük top tutma, hızlı atak)
 * - DEFENSIVE: Sert Savunmacı (düşük gol, düşük yenilen)
 * - CHAOTIC: Kaotik (tutarsız, yüksek gol hem atan hem yiyen)
 */

export type PlayStyle = 'OFFENSIVE' | 'COUNTER' | 'DEFENSIVE' | 'CHAOTIC';

export interface TeamProfile {
  teamId: number;
  teamName: string;
  style: PlayStyle;
  metrics: {
    goalsPerMatch: number;
    goalsConcededPerMatch: number;
    possessionAvg: number;
    shotsPerMatch: number;
    shotsAgainstPerMatch: number;
    passAccuracy: number;
    pressureIndex: number; // Yüksek pressing yapan takımlar
  };
  confidence: number; // Kümeleme güvenilirliği (0-1)
}

export interface StyleMatchup {
  homeStyle: PlayStyle;
  awayStyle: PlayStyle;
  prediction: {
    bttsBoost: number;      // KG Var olasılık artışı (-0.2 ile +0.3 arası)
    overBoost: number;       // Üst olasılık artışı
    homeWinBoost: number;    // Ev sahibi kazanma boost
    awayWinBoost: number;    // Deplasman kazanma boost
    drawBoost: number;       // Beraberlik boost
    chaosLevel: number;      // Maçın kaotiklik seviyesi (0-1)
  };
  reasoning: string;
}

// Stil eşleşme matrisi - Her kombinasyon için özel boost değerleri
const STYLE_MATCHUP_MATRIX: Record<PlayStyle, Record<PlayStyle, StyleMatchup['prediction'] & { reasoning: string }>> = {
  OFFENSIVE: {
    OFFENSIVE: {
      bttsBoost: 0.25,
      overBoost: 0.30,
      homeWinBoost: 0.05,
      awayWinBoost: 0.05,
      drawBoost: -0.10,
      chaosLevel: 0.8,
      reasoning: 'İki hücumcu takım: Yüksek skorlu, açık maç beklenir'
    },
    COUNTER: {
      bttsBoost: 0.15,
      overBoost: 0.10,
      homeWinBoost: -0.10,
      awayWinBoost: 0.15,
      drawBoost: 0.0,
      chaosLevel: 0.5,
      reasoning: 'Hücumcu vs Kontracı: Kontra atan takım avantajlı, deplasman golü yüksek'
    },
    DEFENSIVE: {
      bttsBoost: -0.10,
      overBoost: -0.15,
      homeWinBoost: 0.10,
      awayWinBoost: -0.15,
      drawBoost: 0.10,
      chaosLevel: 0.3,
      reasoning: 'Hücumcu vs Savunmacı: Düşük skorlu, ev sahibi baskı kurar ama gol bulmakta zorlanabilir'
    },
    CHAOTIC: {
      bttsBoost: 0.20,
      overBoost: 0.25,
      homeWinBoost: 0.10,
      awayWinBoost: 0.0,
      drawBoost: -0.05,
      chaosLevel: 0.9,
      reasoning: 'Hücumcu vs Kaotik: Her şey olabilir, yüksek gollü maç'
    }
  },
  COUNTER: {
    OFFENSIVE: {
      bttsBoost: 0.15,
      overBoost: 0.10,
      homeWinBoost: 0.15,
      awayWinBoost: -0.10,
      drawBoost: 0.0,
      chaosLevel: 0.5,
      reasoning: 'Kontracı evde: Açık oynayan misafire kontra şansı yüksek'
    },
    COUNTER: {
      bttsBoost: -0.15,
      overBoost: -0.20,
      homeWinBoost: 0.05,
      awayWinBoost: -0.05,
      drawBoost: 0.15,
      chaosLevel: 0.2,
      reasoning: 'İki kontracı: Sıkıcı, düşük skorlu, beraberlik favori'
    },
    DEFENSIVE: {
      bttsBoost: -0.20,
      overBoost: -0.25,
      homeWinBoost: 0.05,
      awayWinBoost: -0.10,
      drawBoost: 0.20,
      chaosLevel: 0.1,
      reasoning: 'Kontracı vs Savunmacı: Çok kapalı maç, Alt 1.5 düşünülebilir'
    },
    CHAOTIC: {
      bttsBoost: 0.10,
      overBoost: 0.05,
      homeWinBoost: 0.10,
      awayWinBoost: -0.05,
      drawBoost: 0.0,
      chaosLevel: 0.6,
      reasoning: 'Kontracı vs Kaotik: Kontracı takım avantajlı, kaotik takım hata yapar'
    }
  },
  DEFENSIVE: {
    OFFENSIVE: {
      bttsBoost: -0.10,
      overBoost: -0.15,
      homeWinBoost: -0.15,
      awayWinBoost: 0.10,
      drawBoost: 0.10,
      chaosLevel: 0.3,
      reasoning: 'Savunmacı vs Hücumcu: Misafir baskı kurar, düşük skorlu'
    },
    COUNTER: {
      bttsBoost: -0.20,
      overBoost: -0.25,
      homeWinBoost: -0.10,
      awayWinBoost: 0.05,
      drawBoost: 0.20,
      chaosLevel: 0.1,
      reasoning: 'Savunmacı vs Kontracı: Çok kapalı maç, beraberlik yüksek'
    },
    DEFENSIVE: {
      bttsBoost: -0.25,
      overBoost: -0.30,
      homeWinBoost: 0.05,
      awayWinBoost: -0.05,
      drawBoost: 0.25,
      chaosLevel: 0.0,
      reasoning: 'İki savunmacı: Alt 1.5 banko adayı, 0-0 veya 1-0'
    },
    CHAOTIC: {
      bttsBoost: 0.0,
      overBoost: -0.05,
      homeWinBoost: 0.05,
      awayWinBoost: 0.0,
      drawBoost: 0.05,
      chaosLevel: 0.4,
      reasoning: 'Savunmacı vs Kaotik: Savunmacı kontrol eder, düşük skorlu'
    }
  },
  CHAOTIC: {
    OFFENSIVE: {
      bttsBoost: 0.20,
      overBoost: 0.25,
      homeWinBoost: 0.0,
      awayWinBoost: 0.10,
      drawBoost: -0.05,
      chaosLevel: 0.9,
      reasoning: 'Kaotik vs Hücumcu: Gol şöleni, her şey olabilir'
    },
    COUNTER: {
      bttsBoost: 0.10,
      overBoost: 0.05,
      homeWinBoost: -0.05,
      awayWinBoost: 0.10,
      drawBoost: 0.0,
      chaosLevel: 0.6,
      reasoning: 'Kaotik vs Kontracı: Kaotik takım hata yapar, kontra yenir'
    },
    DEFENSIVE: {
      bttsBoost: 0.0,
      overBoost: -0.05,
      homeWinBoost: 0.0,
      awayWinBoost: 0.05,
      drawBoost: 0.05,
      chaosLevel: 0.4,
      reasoning: 'Kaotik vs Savunmacı: Savunmacı takım kontrol altına alır'
    },
    CHAOTIC: {
      bttsBoost: 0.30,
      overBoost: 0.35,
      homeWinBoost: 0.05,
      awayWinBoost: 0.05,
      drawBoost: -0.15,
      chaosLevel: 1.0,
      reasoning: 'İki kaotik: Çılgın maç, 4-3, 3-4 gibi sonuçlar olası'
    }
  }
};

/**
 * Takım istatistiklerinden oyun stilini belirle
 */
export function classifyTeamStyle(metrics: TeamProfile['metrics']): { style: PlayStyle; confidence: number } {
  const {
    goalsPerMatch,
    goalsConcededPerMatch,
    possessionAvg,
    shotsPerMatch,
    pressureIndex
  } = metrics;

  // Skor hesaplama
  const scores = {
    OFFENSIVE: 0,
    COUNTER: 0,
    DEFENSIVE: 0,
    CHAOTIC: 0
  };

  // Hücumcu göstergeleri
  if (goalsPerMatch >= 1.8) scores.OFFENSIVE += 2;
  else if (goalsPerMatch >= 1.4) scores.OFFENSIVE += 1;
  
  if (possessionAvg >= 55) scores.OFFENSIVE += 2;
  else if (possessionAvg >= 50) scores.OFFENSIVE += 1;
  
  if (shotsPerMatch >= 14) scores.OFFENSIVE += 2;
  else if (shotsPerMatch >= 11) scores.OFFENSIVE += 1;
  
  if (pressureIndex >= 0.7) scores.OFFENSIVE += 1;

  // Kontracı göstergeleri
  if (possessionAvg <= 45) scores.COUNTER += 2;
  else if (possessionAvg <= 48) scores.COUNTER += 1;
  
  if (goalsPerMatch >= 1.2 && goalsConcededPerMatch <= 1.2) scores.COUNTER += 2;
  
  if (shotsPerMatch <= 10 && goalsPerMatch >= 1.0) scores.COUNTER += 2; // Verimli
  
  if (pressureIndex <= 0.4) scores.COUNTER += 1;

  // Savunmacı göstergeleri
  if (goalsConcededPerMatch <= 0.8) scores.DEFENSIVE += 3;
  else if (goalsConcededPerMatch <= 1.0) scores.DEFENSIVE += 2;
  else if (goalsConcededPerMatch <= 1.2) scores.DEFENSIVE += 1;
  
  if (goalsPerMatch <= 1.0) scores.DEFENSIVE += 1;
  
  if (shotsPerMatch <= 9) scores.DEFENSIVE += 1;

  // Kaotik göstergeleri
  if (goalsPerMatch >= 1.5 && goalsConcededPerMatch >= 1.5) scores.CHAOTIC += 3;
  
  const totalGoals = goalsPerMatch + goalsConcededPerMatch;
  if (totalGoals >= 3.5) scores.CHAOTIC += 2;
  else if (totalGoals >= 3.0) scores.CHAOTIC += 1;
  
  // Tutarsızlık (yüksek gol hem atan hem yiyen)
  if (Math.abs(goalsPerMatch - goalsConcededPerMatch) <= 0.3 && totalGoals >= 2.5) {
    scores.CHAOTIC += 2;
  }

  // En yüksek skoru bul
  const entries = Object.entries(scores) as [PlayStyle, number][];
  entries.sort((a, b) => b[1] - a[1]);
  
  const topStyle = entries[0][0];
  const topScore = entries[0][1];
  const secondScore = entries[1][1];
  
  // Güven hesapla (fark ne kadar büyükse o kadar güvenli)
  const maxPossible = 10;
  const confidence = Math.min(1, (topScore - secondScore + topScore) / (maxPossible * 1.5));

  return { style: topStyle, confidence: Math.max(0.3, confidence) };
}

/**
 * İki takım arasındaki stil eşleşmesini analiz et
 */
export function analyzeStyleMatchup(homeProfile: TeamProfile, awayProfile: TeamProfile): StyleMatchup {
  const matchupData = STYLE_MATCHUP_MATRIX[homeProfile.style][awayProfile.style];
  
  return {
    homeStyle: homeProfile.style,
    awayStyle: awayProfile.style,
    prediction: {
      bttsBoost: matchupData.bttsBoost,
      overBoost: matchupData.overBoost,
      homeWinBoost: matchupData.homeWinBoost,
      awayWinBoost: matchupData.awayWinBoost,
      drawBoost: matchupData.drawBoost,
      chaosLevel: matchupData.chaosLevel
    },
    reasoning: matchupData.reasoning
  };
}

/**
 * Takım profilini oluştur
 */
export function createTeamProfile(
  teamId: number,
  teamName: string,
  stats: {
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
    possession?: number;
    shots?: number;
    shotsAgainst?: number;
    passAccuracy?: number;
  }
): TeamProfile {
  const goalsPerMatch = stats.goalsScored / Math.max(1, stats.matchesPlayed);
  const goalsConcededPerMatch = stats.goalsConceded / Math.max(1, stats.matchesPlayed);
  
  const metrics: TeamProfile['metrics'] = {
    goalsPerMatch,
    goalsConcededPerMatch,
    possessionAvg: stats.possession ?? 50,
    shotsPerMatch: stats.shots ?? 10,
    shotsAgainstPerMatch: stats.shotsAgainst ?? 10,
    passAccuracy: stats.passAccuracy ?? 75,
    pressureIndex: (stats.shots ?? 10) / 15 // Basit pressing indeksi
  };
  
  const { style, confidence } = classifyTeamStyle(metrics);
  
  return {
    teamId,
    teamName,
    style,
    metrics,
    confidence
  };
}

// Stil açıklamaları
export const STYLE_DESCRIPTIONS: Record<PlayStyle, { name: string; emoji: string; description: string }> = {
  OFFENSIVE: {
    name: 'Hücumcu',
    emoji: '⚔️',
    description: 'Yüksek baskı, top tutma, çok şut'
  },
  COUNTER: {
    name: 'Kontracı',
    emoji: '🎯',
    description: 'Düşük top tutma, hızlı kontra atak'
  },
  DEFENSIVE: {
    name: 'Savunmacı',
    emoji: '🛡️',
    description: 'Kapalı oyun, az gol yeme, set-piece odaklı'
  },
  CHAOTIC: {
    name: 'Kaotik',
    emoji: '🎲',
    description: 'Tutarsız, hem çok atar hem çok yer'
  }
};
