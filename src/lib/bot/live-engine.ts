/**
 * Live Opportunity Engine - Gerçek Fırsat Tespit Motoru
 * 
 * Sadece yüksek güvenilirlikli fırsatları tespit eder.
 * Her maça bahis yapmaz - gerçek value varsa atar!
 * 
 * Fırsat Kriterleri:
 * 1. Şut Baskısı + Golsüz = "Gol Geliyor" fırsatı
 * 2. Dominant Takım + Skor Aleyhte = "Comeback" fırsatı  
 * 3. Agresif Maç + Düşük Kart = "Kart Gelecek" fırsatı
 * 4. Korner Hakimiyeti = "Korner Üstü" fırsatı
 * 5. xG vs Gerçek Skor Farkı = "Value" fırsatı
 */

import { 
  type LiveMatch, 
  type LiveMatchStats, 
  type LiveOpportunity, 
  type OpportunityType,
  type LiveBotConfig,
  DEFAULT_LIVE_BOT_CONFIG 
} from './live-types';
import { config } from '@/config/settings';

// Fırsat ID üreteci
let opportunityCounter = 0;
function generateOpportunityId(): string {
  return `opp_${Date.now()}_${++opportunityCounter}`;
}

// ============ ANA FONKSİYON ============

/**
 * Canlı maçları analiz et ve SADECE gerçek fırsatları döndür
 */
export function detectLiveOpportunities(
  matches: LiveMatch[],
  botConfig: LiveBotConfig = DEFAULT_LIVE_BOT_CONFIG
): LiveOpportunity[] {
  const opportunities: LiveOpportunity[] = [];
  
  for (const match of matches) {
    // Dakika filtresi
    if (match.minute < botConfig.minMinuteToWatch || match.minute > botConfig.maxMinuteToWatch) {
      continue;
    }
    
    // Devre arası - bekle
    if (match.status === 'HT') {
      continue;
    }
    
    // Maç için fırsatları tespit et
    const matchOpportunities = analyzeMatch(match);
    
    // Sadece yeterli güvene sahip fırsatları ekle
    for (const opp of matchOpportunities) {
      if (opp.confidence >= botConfig.minConfidence && opp.value >= botConfig.minValue) {
        opportunities.push(opp);
      }
    }
  }
  
  // En yüksek güvenden düşüğe sırala
  return opportunities.sort((a, b) => b.confidence - a.confidence);
}

// ============ MAÇ ANALİZİ ============

/**
 * Tek bir maçı analiz et ve potansiyel fırsatları döndür
 */
function analyzeMatch(match: LiveMatch): LiveOpportunity[] {
  const opportunities: LiveOpportunity[] = [];
  const { stats, minute, homeScore, awayScore } = match;
  const totalGoals = homeScore + awayScore;
  
  // 1. GOL GELİYOR ANALİZİ (En önemli!)
  const goalOpportunity = analyzeGoalImminent(match);
  if (goalOpportunity) {
    opportunities.push(goalOpportunity);
  }
  
  // 2. SONRAKİ GOL TAHMİNİ
  const nextGoalOpportunity = analyzeNextGoal(match);
  if (nextGoalOpportunity) {
    opportunities.push(nextGoalOpportunity);
  }
  
  // 3. KART ANALİZİ
  const cardOpportunity = analyzeCardOpportunity(match);
  if (cardOpportunity) {
    opportunities.push(cardOpportunity);
  }
  
  // 4. KORNER ANALİZİ
  const cornerOpportunity = analyzeCornerOpportunity(match);
  if (cornerOpportunity) {
    opportunities.push(cornerOpportunity);
  }
  
  // 5. COMEBACK ANALİZİ (Geri dönüş potansiyeli)
  const comebackOpportunity = analyzeComebackPotential(match);
  if (comebackOpportunity) {
    opportunities.push(comebackOpportunity);
  }
  
  // 6. ÜST/ALT GOL ANALİZİ
  const overUnderOpportunity = analyzeOverUnder(match);
  if (overUnderOpportunity) {
    opportunities.push(overUnderOpportunity);
  }
  
  return opportunities;
}

// ============ FIRSAT TESPİT FONKSİYONLARI ============

/**
 * GOL GELİYOR ANALİZİ
 * Şut baskısı + golsüz durum = yüksek gol olasılığı
 */
function analyzeGoalImminent(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  const totalGoals = homeScore + awayScore;
  
  // Sadece 0-0 veya 1-0/0-1 skorlarda
  if (totalGoals > 1) return null;
  
  // Minimum 15. dakika
  if (minute < 15) return null;
  
  // Şut baskısı hesapla
  const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  
  // Az şut = fırsat yok
  if (totalShots < 8 || totalShotsOnTarget < 3) return null;
  
  // xG tahmini (basit formula)
  const estimatedXG = (totalShotsOnTarget * 0.3) + (totalShots * 0.08);
  
  // xG vs gerçek gol farkı
  const xgDifference = estimatedXG - totalGoals;
  
  // Güven skoru hesapla
  let confidence = 50;
  
  // Şut baskısı bonus
  if (totalShotsOnTarget >= 6) confidence += 15;
  else if (totalShotsOnTarget >= 4) confidence += 10;
  else if (totalShotsOnTarget >= 3) confidence += 5;
  
  // xG farkı bonus (gol gelmesi gereken ama gelmeyen)
  if (xgDifference >= 1.5) confidence += 20;
  else if (xgDifference >= 1.0) confidence += 15;
  else if (xgDifference >= 0.5) confidence += 8;
  
  // Dakika bonus (geç dakikalarda baskı artıyor)
  if (minute >= 60 && minute <= 75) confidence += 10;
  else if (minute >= 30 && minute < 60) confidence += 5;
  
  // Korner baskısı bonus
  const totalCorners = stats.homeCorners + stats.awayCorners;
  if (totalCorners >= 8) confidence += 8;
  else if (totalCorners >= 5) confidence += 4;
  
  // Minimum %70 güven gerekli
  if (confidence < 70) return null;
  
  // Value hesapla
  const impliedProb = confidence / 100;
  const estimatedOdds = totalGoals === 0 ? 1.25 : 1.50; // Next goal odds tahmini
  const fairOdds = 1 / impliedProb;
  const value = ((fairOdds / estimatedOdds) - 1) * 100;
  
  if (value < 10) return null; // Minimum %10 value
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: `${homeScore}-${awayScore}`,
      minute,
    },
    type: 'goal_imminent',
    market: 'Sonraki Gol',
    pick: 'Gol Olacak',
    confidence: Math.min(confidence, 95),
    reasoning: `${totalShotsOnTarget} isabetli şut, xG: ${estimatedXG.toFixed(1)} - gol bekleniyor!`,
    urgency: confidence >= 85 ? 'critical' : confidence >= 75 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 dakika geçerli
    action: confidence >= 80 ? 'bet' : 'notify',
  };
}

/**
 * SONRAKİ GOL ANALİZİ
 * Hangi takım sonraki golü atacak?
 */
function analyzeNextGoal(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  // Minimum 20. dakika
  if (minute < 20) return null;
  
  // Şut oranları
  const homeShots = stats.homeShotsOnTarget || 0;
  const awayShots = stats.awayShotsOnTarget || 0;
  const totalShots = homeShots + awayShots;
  
  if (totalShots < 4) return null;
  
  const homeShotRatio = homeShots / totalShots;
  const awayShotRatio = awayShots / totalShots;
  
  // Top kontrolü
  const homePossession = stats.homePossession || 50;
  
  // Tehlikeli atak
  const homeDangerous = stats.homeDangerousAttacks || 0;
  const awayDangerous = stats.awayDangerousAttacks || 0;
  
  // Dominant takımı belirle
  let dominantTeam: 'home' | 'away' | null = null;
  let dominanceScore = 0;
  
  // Ev sahibi dominant mı?
  if (homeShotRatio >= 0.65 && homePossession >= 55) {
    dominantTeam = 'home';
    dominanceScore = (homeShotRatio * 40) + ((homePossession - 50) * 2);
  }
  // Deplasman dominant mı?
  else if (awayShotRatio >= 0.65 && homePossession <= 45) {
    dominantTeam = 'away';
    dominanceScore = (awayShotRatio * 40) + ((50 - homePossession) * 2);
  }
  
  if (!dominantTeam || dominanceScore < 35) return null;
  
  // Güven hesapla
  let confidence = 50 + dominanceScore;
  
  // Tehlikeli atak bonus
  if (dominantTeam === 'home' && homeDangerous > awayDangerous * 1.5) confidence += 10;
  if (dominantTeam === 'away' && awayDangerous > homeDangerous * 1.5) confidence += 10;
  
  // Korner bonus
  const homeCorners = stats.homeCorners || 0;
  const awayCorners = stats.awayCorners || 0;
  if (dominantTeam === 'home' && homeCorners > awayCorners + 2) confidence += 5;
  if (dominantTeam === 'away' && awayCorners > homeCorners + 2) confidence += 5;
  
  if (confidence < 72) return null;
  
  const estimatedOdds = dominantTeam === 'home' ? 1.80 : 2.10;
  const value = ((100 / confidence) / estimatedOdds - 1) * 100;
  
  if (value < 12) return null;
  
  const teamName = dominantTeam === 'home' ? match.homeTeam : match.awayTeam;
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: `${homeScore}-${awayScore}`,
      minute,
    },
    type: dominantTeam === 'home' ? 'next_goal_home' : 'next_goal_away',
    market: 'Sonraki Gol',
    pick: teamName,
    confidence: Math.min(confidence, 92),
    reasoning: `${teamName} maça hakim: %${Math.round(dominantTeam === 'home' ? homeShotRatio * 100 : awayShotRatio * 100)} şut, %${dominantTeam === 'home' ? homePossession : 100 - homePossession} top`,
    urgency: confidence >= 85 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: 'notify',
  };
}

/**
 * KART ANALİZİ
 * Agresif maç + düşük kart sayısı = kart fırsatı
 */
function analyzeCardOpportunity(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  // 20-75 dakika arası
  if (minute < 20 || minute > 75) return null;
  
  const totalCards = stats.homeYellowCards + stats.awayYellowCards + 
                    stats.homeRedCards + stats.awayRedCards;
  const totalFouls = stats.homeFouls + stats.awayFouls;
  
  // Faul oranı (dakika başına)
  const foulRate = totalFouls / minute;
  
  // Az faul = fırsat yok
  if (foulRate < 0.35) return null; // Dakikada 0.35+ faul lazım
  
  // Çok kart çıkmışsa = fırsat azalır
  if (totalCards >= 5) return null;
  
  // Kart/faul oranı
  const cardPerFoul = totalFouls > 0 ? totalCards / totalFouls : 0;
  
  // Normal kartlaşma = 1 kart / 8-10 faul
  // Düşük kartlaşma = fırsat!
  const expectedCards = totalFouls / 8;
  const cardDeficit = expectedCards - totalCards;
  
  if (cardDeficit < 0.5) return null; // En az 0.5 kart açığı lazım
  
  // Güven hesapla
  let confidence = 50;
  
  // Faul yoğunluğu bonus
  if (foulRate >= 0.5) confidence += 20;
  else if (foulRate >= 0.4) confidence += 12;
  
  // Kart açığı bonus
  if (cardDeficit >= 1.5) confidence += 20;
  else if (cardDeficit >= 1.0) confidence += 12;
  else confidence += 6;
  
  // Gergin maç bonus (yakın skor)
  if (Math.abs(homeScore - awayScore) <= 1) confidence += 8;
  
  // 2. yarı bonus (kartlar genelde 2. yarıda çıkar)
  if (minute >= 45) confidence += 5;
  
  if (confidence < 70) return null;
  
  const estimatedOdds = 1.65;
  const value = ((100 / confidence) / estimatedOdds - 1) * 100;
  
  if (value < 10) return null;
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: `${homeScore}-${awayScore}`,
      minute,
    },
    type: 'card_coming',
    market: 'Kart Bahisi',
    pick: `Üst ${totalCards + 0.5} Kart`,
    confidence: Math.min(confidence, 88),
    reasoning: `${totalFouls} faul, sadece ${totalCards} kart - kart gelecek!`,
    urgency: confidence >= 80 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: 'notify',
  };
}

/**
 * KORNER ANALİZİ
 */
function analyzeCornerOpportunity(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  // 25-70 dakika arası
  if (minute < 25 || minute > 70) return null;
  
  const totalCorners = stats.homeCorners + stats.awayCorners;
  
  // Korner oranı (dakika başına)
  const cornerRate = totalCorners / minute;
  
  // Mevcut korner sayısı
  const projectedCorners = cornerRate * 90;
  
  // Hedef korner sayısı için uygun mu?
  // Örnek: 30. dakikada 5 korner = dakikada 0.17 = 90 dakikada 15 korner projeksiyon
  
  let targetOver = 0;
  let confidence = 0;
  
  if (projectedCorners >= 12 && totalCorners >= 4) {
    targetOver = 9.5;
    confidence = 55 + (projectedCorners - 12) * 3;
  } else if (projectedCorners >= 10 && totalCorners >= 3) {
    targetOver = 7.5;
    confidence = 55 + (projectedCorners - 10) * 4;
  }
  
  if (confidence < 68) return null;
  
  // Şut baskısı bonus (şut varsa korner de gelir)
  const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
  if (totalShots >= 15) confidence += 8;
  else if (totalShots >= 10) confidence += 4;
  
  if (confidence < 72) return null;
  
  const estimatedOdds = targetOver === 9.5 ? 1.85 : 1.55;
  const value = ((100 / confidence) / estimatedOdds - 1) * 100;
  
  if (value < 10) return null;
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: `${homeScore}-${awayScore}`,
      minute,
    },
    type: 'corner_over',
    market: 'Korner',
    pick: `Üst ${targetOver}`,
    confidence: Math.min(confidence, 85),
    reasoning: `${totalCorners} korner ${minute}. dk'da - projeksiyon: ${projectedCorners.toFixed(1)} korner`,
    urgency: 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: 'notify',
  };
}

/**
 * COMEBACK ANALİZİ
 * Geri kalan takım baskı yapıyor = comeback fırsatı
 */
function analyzeComebackPotential(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  // Skor farkı lazım
  const scoreDiff = Math.abs(homeScore - awayScore);
  if (scoreDiff === 0 || scoreDiff > 2) return null;
  
  // 30-75 dakika arası (comeback için zaman lazım)
  if (minute < 30 || minute > 75) return null;
  
  // Hangi takım geride?
  const losingTeam = homeScore < awayScore ? 'home' : 'away';
  
  // Geriden gelen takımın istatistikleri
  const loserShots = losingTeam === 'home' ? stats.homeShotsOnTarget : stats.awayShotsOnTarget;
  const winnerShots = losingTeam === 'home' ? stats.awayShotsOnTarget : stats.homeShotsOnTarget;
  const loserPossession = losingTeam === 'home' ? stats.homePossession : (100 - stats.homePossession);
  const loserCorners = losingTeam === 'home' ? stats.homeCorners : stats.awayCorners;
  const winnerCorners = losingTeam === 'home' ? stats.awayCorners : stats.homeCorners;
  
  // Geriden gelen takım baskı yapıyor mu?
  const isDominating = loserShots > winnerShots && loserPossession >= 52 && loserCorners >= winnerCorners;
  
  if (!isDominating) return null;
  
  // Güven hesapla
  let confidence = 50;
  
  // Şut üstünlüğü bonus
  if (loserShots >= winnerShots + 3) confidence += 20;
  else if (loserShots >= winnerShots + 2) confidence += 12;
  else confidence += 6;
  
  // Top kontrolü bonus
  if (loserPossession >= 60) confidence += 15;
  else if (loserPossession >= 55) confidence += 8;
  
  // Dakika bonus (erken = daha fazla şans)
  if (minute <= 50) confidence += 10;
  else if (minute <= 65) confidence += 5;
  
  // 1 fark bonus (2 fark zor)
  if (scoreDiff === 1) confidence += 8;
  
  if (confidence < 70) return null;
  
  const teamName = losingTeam === 'home' ? match.homeTeam : match.awayTeam;
  const estimatedOdds = scoreDiff === 1 ? 2.20 : 3.50;
  const value = ((100 / confidence) / estimatedOdds - 1) * 100;
  
  if (value < 15) return null;
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: `${homeScore}-${awayScore}`,
      minute,
    },
    type: 'comeback',
    market: 'Çifte Şans',
    pick: `${teamName} Kazanır/Berabere`,
    confidence: Math.min(confidence, 80),
    reasoning: `${teamName} geride ama maça hakim: ${loserShots} vs ${winnerShots} isabetli şut, %${loserPossession} top`,
    urgency: confidence >= 75 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: 'notify',
  };
}

/**
 * ÜST/ALT GOL ANALİZİ
 */
function analyzeOverUnder(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  const totalGoals = homeScore + awayScore;
  
  // 35-70 dakika arası
  if (minute < 35 || minute > 70) return null;
  
  // xG hesapla
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
  const estimatedXG = (totalShotsOnTarget * 0.32) + (totalShots * 0.06);
  
  // Projeksiyon gol
  const projectedGoals = (totalGoals + estimatedXG) * (90 / minute);
  
  // Üst 2.5 fırsatı
  if (totalGoals >= 1 && projectedGoals >= 3.2 && totalShotsOnTarget >= 5) {
    let confidence = 55;
    
    // Şut baskısı
    if (totalShotsOnTarget >= 8) confidence += 18;
    else if (totalShotsOnTarget >= 6) confidence += 12;
    
    // Mevcut gol sayısı
    if (totalGoals >= 2) confidence += 10;
    
    // xG farkı
    if (estimatedXG > totalGoals + 0.5) confidence += 10;
    
    if (confidence >= 72) {
      const estimatedOdds = totalGoals >= 2 ? 1.40 : 1.75;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 10) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            score: `${homeScore}-${awayScore}`,
            minute,
          },
          type: 'over_25',
          market: 'Gol Sayısı',
          pick: 'Üst 2.5',
          confidence: Math.min(confidence, 88),
          reasoning: `${totalShotsOnTarget} isabetli şut, xG: ${estimatedXG.toFixed(1)}, projeksiyon: ${projectedGoals.toFixed(1)} gol`,
          urgency: confidence >= 82 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          action: 'notify',
        };
      }
    }
  }
  
  return null;
}

// ============ YARDIMCI FONKSİYONLAR ============

/**
 * Fırsat özeti oluştur (tweet için)
 */
export function formatOpportunityForTweet(opp: LiveOpportunity): string {
  const urgencyEmoji = {
    'critical': '🔥🔥🔥',
    'high': '🔥🔥',
    'medium': '🔥',
    'low': '👀',
  };
  
  const typeEmoji = {
    'goal_imminent': '⚽',
    'next_goal_home': '🏠⚽',
    'next_goal_away': '✈️⚽',
    'over_15': '📈',
    'over_25': '📈📈',
    'corner_over': '🚩',
    'card_coming': '🟨',
    'btts_yes': '⚽⚽',
    'comeback': '🔄',
    'momentum_shift': '📊',
  };
  
  return `${urgencyEmoji[opp.urgency]} ${typeEmoji[opp.type]} CANLI FIRSAT!

${opp.match.homeTeam} vs ${opp.match.awayTeam}
📊 ${opp.match.score} (${opp.match.minute}')

💎 ${opp.market}: ${opp.pick}
📈 Güven: %${opp.confidence}
💰 Value: %${opp.value}

📝 ${opp.reasoning}

#CanlıBahis #LiveBet`;
}

/**
 * En iyi fırsatları filtrele (aynı maçtan max 1)
 */
export function filterBestOpportunities(
  opportunities: LiveOpportunity[],
  maxPerMatch: number = 1,
  maxTotal: number = 5
): LiveOpportunity[] {
  const byMatch = new Map<number, LiveOpportunity>();
  
  // Her maç için en iyi fırsatı seç
  for (const opp of opportunities) {
    const existing = byMatch.get(opp.fixtureId);
    if (!existing || opp.confidence > existing.confidence) {
      byMatch.set(opp.fixtureId, opp);
    }
  }
  
  // En iyi N fırsatı döndür
  return Array.from(byMatch.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxTotal);
}
