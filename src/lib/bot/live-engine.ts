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

// Minimum bahis oranı - bunun altında öneri yapmıyoruz (değer yok)
const MIN_ODDS = 1.50;

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
    
    // Sadece yeterli güvene sahip ve mantıklı oranlı fırsatları ekle
    for (const opp of matchOpportunities) {
      if (opp.confidence >= botConfig.minConfidence && opp.value >= botConfig.minValue && opp.estimatedOdds >= MIN_ODDS) {
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
  
  // 1. GOL BASKISI ANALİZİ (Genel bahisler: Üst 2.5, KG Var, Üst 1.5)
  const goalOpportunity = analyzeGoalImminent(match);
  if (goalOpportunity) {
    opportunities.push(goalOpportunity);
  }
  
  // 2. AKILLI ÜST GOL FIRSATI (3.5 / 4.5 Üst)
  const smartOverOpportunity = analyzeSmartOverGoals(match);
  if (smartOverOpportunity) {
    opportunities.push(smartOverOpportunity);
  }
  
  // 3. KART ANALİZİ (Faul bazlı üst kart)
  const cardOpportunity = analyzeCardOpportunity(match);
  if (cardOpportunity) {
    opportunities.push(cardOpportunity);
  }
  
  // 4. KORNER ANALİZİ
  const cornerOpportunity = analyzeCornerOpportunity(match);
  if (cornerOpportunity) {
    opportunities.push(cornerOpportunity);
  }
  
  // 5. KG VAR ANALİZİ (Karşılıklı Gol)
  const bttsOpportunity = analyzeBTTS(match);
  if (bttsOpportunity) {
    opportunities.push(bttsOpportunity);
  }
  
  // 6. COMEBACK ANALİZİ (Geri dönüş potansiyeli)
  const comebackOpportunity = analyzeComebackPotential(match);
  if (comebackOpportunity) {
    opportunities.push(comebackOpportunity);
  }
  
  // 7. ÜST/ALT GOL ANALİZİ
  const overUnderOpportunity = analyzeOverUnder(match);
  if (overUnderOpportunity) {
    opportunities.push(overUnderOpportunity);
  }
  
  return opportunities;
}

// ============ FIRSAT TESPİT FONKSİYONLARI ============

/**
 * GOL BASKISI ANALİZİ (Genel Bahisler)
 * 
 * "Sıradaki Gol" yerine anlamlı genel bahisler önerir:
 * - 0-0 + baskı → Üst 2.5 Gol (iyi oran: ~2.10-2.40)
 * - 1-0/0-1 + gerideki baskı yapıyor → KG Var (~1.80-2.10)
 * - 1-0/0-1 + genel baskı → Üst 2.5 Gol (~1.90-2.20)
 * - 75+ dk baskı ama gol yok → Üst 1.5 sadece burada (makul oran)
 * 
 * NOT: "Üst 1.5" 1.25 oranla vermek saçma - kimse oynamaz.
 */
function analyzeGoalImminent(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  const totalGoals = homeScore + awayScore;
  
  // Sadece 0-1 gol durumunda (2+ gol varsa analyzeOverUnder halleder)
  if (totalGoals > 1) return null;
  
  // Minimum 20. dakika (15 dk çok erken, veri yetersiz)
  if (minute < 20) return null;
  
  // 80+ dk geç, genel bahis için zaman yok (sadece spesifik bahisler mantıklı)
  if (minute > 78) return null;
  
  // Şut baskısı hesapla
  const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  
  // Az şut = fırsat yok
  if (totalShots < 8 || totalShotsOnTarget < 3) return null;
  
  // xG tahmini
  const estimatedXG = (totalShotsOnTarget * 0.3) + (totalShots * 0.08);
  const xgDifference = estimatedXG - totalGoals;
  const remainingMinutes = 90 - minute;
  
  // Korner baskısı
  const totalCorners = stats.homeCorners + stats.awayCorners;
  
  // === SENARYO A: 0-0, baskı var → Üst 2.5 Gol (iyi oran!) ===
  if (totalGoals === 0 && minute >= 25 && minute <= 65) {
    let confidence = 48;
    const reasons: string[] = [];
    
    // Şut baskısı bonus
    if (totalShotsOnTarget >= 7) { confidence += 18; reasons.push(`${totalShotsOnTarget} isabetli şut`); }
    else if (totalShotsOnTarget >= 5) { confidence += 12; reasons.push(`${totalShotsOnTarget} isabetli şut`); }
    else if (totalShotsOnTarget >= 3) { confidence += 6; }
    
    // xG farkı (gol olması gerekirdi ama olmadı)
    if (xgDifference >= 1.5) { confidence += 18; reasons.push(`xG: ${estimatedXG.toFixed(1)} vs 0 gol`); }
    else if (xgDifference >= 1.0) { confidence += 12; reasons.push(`xG: ${estimatedXG.toFixed(1)}`); }
    else if (xgDifference >= 0.5) { confidence += 6; }
    
    // Kalan süre bonus (daha fazla süre = daha fazla gol şansı)
    if (remainingMinutes >= 45) confidence += 10;
    else if (remainingMinutes >= 30) confidence += 6;
    
    // Korner baskısı (gol habercisi)
    if (totalCorners >= 8) { confidence += 8; reasons.push(`${totalCorners} korner`); }
    else if (totalCorners >= 5) confidence += 4;
    
    // İki takım da baskı yapıyorsa (açılacak maç)
    if (stats.homeShotsOnTarget >= 2 && stats.awayShotsOnTarget >= 2) {
      confidence += 5;
      reasons.push('iki taraf da baskıda');
    }
    
    if (confidence >= 68) {
      const estimatedOdds = remainingMinutes >= 40 ? 2.30 : remainingMinutes >= 25 ? 2.10 : 1.90;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'goal_pressure',
          market: 'Gol Sayısı',
          pick: 'Üst 2.5 Gol',
          confidence: Math.min(confidence, 88),
          reasoning: reasons.join(', ') || `Baskı var ama gol yok - patlama bekleniyor`,
          urgency: confidence >= 80 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          action: confidence >= 78 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  // === SENARYO B: 1-0/0-1, gerideki takım baskı yapıyor → KG Var ===
  if (totalGoals === 1 && minute >= 25 && minute <= 72) {
    const losingTeam = homeScore === 0 ? 'home' : 'away';
    const loserShotsOn = losingTeam === 'home' ? stats.homeShotsOnTarget : stats.awayShotsOnTarget;
    const loserShots = losingTeam === 'home' ? stats.homeShotsTotal : stats.awayShotsTotal;
    const loserPossession = losingTeam === 'home' ? stats.homePossession : (100 - stats.homePossession);
    const loserTeamName = losingTeam === 'home' ? match.homeTeam : match.awayTeam;
    
    let confidence = 48;
    const reasons: string[] = [];
    
    // Gerideki takımın şut baskısı
    if (loserShotsOn >= 4) { confidence += 18; reasons.push(`${loserTeamName} ${loserShotsOn} isabetli şut`); }
    else if (loserShotsOn >= 3) { confidence += 12; reasons.push(`${loserTeamName} ${loserShotsOn} isabetli şut`); }
    else if (loserShotsOn >= 2) { confidence += 6; }
    
    // Gerideki takım topa sahip
    if (loserPossession >= 55) { confidence += 10; reasons.push(`%${loserPossession} top kontrolü`); }
    else if (loserPossession >= 48) { confidence += 5; }
    
    // xG farkı
    if (xgDifference >= 1.0) { confidence += 10; reasons.push(`xG: ${estimatedXG.toFixed(1)}`); }
    else if (xgDifference >= 0.5) { confidence += 5; }
    
    // Kalan süre
    if (remainingMinutes >= 35) confidence += 8;
    else if (remainingMinutes >= 20) confidence += 4;
    
    // Korner baskısı
    if (totalCorners >= 7) confidence += 5;
    
    if (confidence >= 68) {
      const estimatedOdds = remainingMinutes >= 35 ? 1.85 : remainingMinutes >= 20 ? 1.95 : 2.10;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'goal_pressure',
          market: 'KG Var/Yok',
          pick: 'Karşılıklı Gol Var',
          confidence: Math.min(confidence, 88),
          reasoning: reasons.join(', ') || `Gerideki takım baskı yapıyor`,
          urgency: confidence >= 78 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          action: confidence >= 76 ? 'bet' : 'notify',
        };
      }
    }
    
    // KG Var tutmadıysa → Üst 2.5 Gol alternatifi
    if (totalShotsOnTarget >= 5) {
      let conf2 = 50;
      const reasons2: string[] = [];
      
      if (totalShotsOnTarget >= 8) { conf2 += 16; reasons2.push(`${totalShotsOnTarget} isabetli şut`); }
      else if (totalShotsOnTarget >= 6) { conf2 += 10; reasons2.push(`${totalShotsOnTarget} isabetli şut`); }
      else { conf2 += 5; }
      
      if (xgDifference >= 1.0) { conf2 += 12; reasons2.push(`xG: ${estimatedXG.toFixed(1)}`); }
      else if (xgDifference >= 0.5) { conf2 += 6; }
      
      if (remainingMinutes >= 35) conf2 += 8;
      else if (remainingMinutes >= 20) conf2 += 4;
      
      if (totalCorners >= 7) { conf2 += 5; reasons2.push(`${totalCorners} korner`); }
      
      if (conf2 >= 68) {
        const odds2 = remainingMinutes >= 35 ? 2.00 : 1.80;
        const val2 = ((100 / conf2) / odds2 - 1) * 100;
        
        if (val2 >= 8) {
          return {
            id: generateOpportunityId(),
            fixtureId,
            match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
            type: 'goal_pressure',
            market: 'Gol Sayısı',
            pick: 'Üst 2.5 Gol',
            confidence: Math.min(conf2, 85),
            reasoning: reasons2.join(', ') || `Yüksek şut baskısı, gol geliyor`,
            urgency: conf2 >= 78 ? 'high' : 'medium',
            estimatedOdds: odds2,
            value: Math.round(val2),
            detectedAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            action: 'notify',
          };
        }
      }
    }
  }
  
  // === SENARYO C: 0-0, geç dakika (65-78), baskı → Üst 1.5 (şimdi makul oran) ===
  if (totalGoals === 0 && minute >= 65 && minute <= 78 && totalShotsOnTarget >= 5) {
    let confidence = 55;
    
    if (totalShotsOnTarget >= 8) confidence += 15;
    else if (totalShotsOnTarget >= 6) confidence += 10;
    
    if (xgDifference >= 1.5) confidence += 12;
    else if (xgDifference >= 1.0) confidence += 8;
    
    if (totalCorners >= 8) confidence += 6;
    
    if (confidence >= 70) {
      // Geç dakika + 0-0 → Üst 1.5 orta düzeyde oran verir
      const estimatedOdds = 1.65;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'goal_pressure',
          market: 'Gol Sayısı',
          pick: 'Üst 1.5 Gol',
          confidence: Math.min(confidence, 85),
          reasoning: `0-0 ama ${totalShotsOnTarget} isabetli şut, xG: ${estimatedXG.toFixed(1)} - patlama yakın`,
          urgency: confidence >= 78 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 8 * 60 * 1000),
          action: confidence >= 76 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  return null;
}

/**
 * AKILLI ÜST GOL FIRSATI (3.5 Üst / 4.5 Üst)
 * Mevcut gol sayısına ve momentum'a göre güvenilir üst bahis önerisi
 * - 3 gol varsa → 3.5 Üst (düşük oran ama güvenilir)
 * - 3+ gol + yüksek tempo → 4.5 Üst (daha yüksek oran)
 * - 2 gol + güçlü baskı + zaman varsa → 3.5 Üst
 */
function analyzeSmartOverGoals(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  const totalGoals = homeScore + awayScore;
  
  // Minimum 25. dakika
  if (minute < 25) return null;
  
  // Şut istatistikleri
  const totalShotsOnTarget = (stats.homeShotsOnTarget || 0) + (stats.awayShotsOnTarget || 0);
  const totalShots = (stats.homeShotsTotal || 0) + (stats.awayShotsTotal || 0);
  const estimatedXG = (totalShotsOnTarget * 0.32) + (totalShots * 0.06);
  const remainingMinutes = 90 - minute;
  
  // Gol hızı (dakika başına gol)
  const goalRate = totalGoals / minute;
  // Şut yoğunluğu (dakika başına isabetli şut)
  const shotRate = totalShotsOnTarget / minute;
  
  // === SENARYO 1: 3 gol var → 3.5 Üst (en güvenilir) ===
  if (totalGoals >= 3 && minute <= 80) {
    let confidence = 68;
    
    // Gol hızı yüksekse güven artar
    if (goalRate >= 0.06) confidence += 12; // 90 dk'da 5.4+ gol temposu
    else if (goalRate >= 0.04) confidence += 8;
    
    // Şut baskısı devam ediyorsa
    if (totalShotsOnTarget >= 8) confidence += 10;
    else if (totalShotsOnTarget >= 5) confidence += 5;
    
    // Kalan süre yeterliyse
    if (remainingMinutes >= 30) confidence += 8;
    else if (remainingMinutes >= 15) confidence += 4;
    
    // xG hâlâ gol bekliyor mu
    if (estimatedXG > totalGoals) confidence += 8;
    
    // Her iki takım da gol attıysa (açık maç)
    if (homeScore > 0 && awayScore > 0) confidence += 7;
    
    if (confidence >= 72) {
      // Gerçek bahis oranları: 3+ gol varsa Üst 3.5 orta-düşük oran
      // Kalan süre azsa oran düşer → önermiyoruz (değer yok)
      const estimatedOdds = remainingMinutes >= 35 ? 1.75 : remainingMinutes >= 25 ? 1.60 : 1.40;
      if (estimatedOdds < MIN_ODDS) return null; // Oran çok düşük, değmez
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            score: `${homeScore}-${awayScore}`,
            minute,
          },
          type: 'high_tempo',
          market: 'Gol Sayısı',
          pick: 'Üst 3.5',
          confidence: Math.min(confidence, 92),
          reasoning: `${totalGoals} gol ${minute}' - gol hızı: ${(goalRate * 90).toFixed(1)}/maç, ${totalShotsOnTarget} isabetli şut, xG: ${estimatedXG.toFixed(1)}`,
          urgency: confidence >= 85 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          action: confidence >= 80 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  // === SENARYO 2: 4+ gol var + zaman var → 4.5 Üst ===
  if (totalGoals >= 4 && minute <= 78) {
    let confidence = 65;
    
    // Gol temposu çok yüksek
    if (goalRate >= 0.07) confidence += 15;
    else if (goalRate >= 0.05) confidence += 10;
    
    // Açık maç (iki takım da gol atıyor)
    if (homeScore >= 2 && awayScore >= 2) confidence += 12;
    else if (homeScore > 0 && awayScore > 0) confidence += 7;
    
    // Şut baskısı hâlâ sürüyorsa
    if (totalShotsOnTarget >= 10) confidence += 10;
    else if (totalShotsOnTarget >= 7) confidence += 5;
    
    // Kalan süre yeterli mi
    if (remainingMinutes >= 20) confidence += 8;
    else if (remainingMinutes >= 12) confidence += 4;
    
    if (confidence >= 72) {
      // 4+ gol varsa Üst 4.5 → gerçek oranlar daha yüksek
      const estimatedOdds = remainingMinutes >= 30 ? 1.85 : remainingMinutes >= 20 ? 1.65 : 1.45;
      if (estimatedOdds < MIN_ODDS) return null;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            score: `${homeScore}-${awayScore}`,
            minute,
          },
          type: 'high_tempo',
          market: 'Gol Sayısı',
          pick: 'Üst 4.5',
          confidence: Math.min(confidence, 90),
          reasoning: `Festival maç! ${totalGoals} gol ${minute}' - tempo: ${(goalRate * 90).toFixed(1)}/maç, iki taraf da atak`,
          urgency: confidence >= 82 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          action: confidence >= 78 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  // === SENARYO 3: 2 gol + güçlü baskı + zaman → 3.5 Üst ===
  if (totalGoals === 2 && minute >= 30 && minute <= 65) {
    let confidence = 55;
    
    // Şut baskısı çok güçlü
    if (totalShotsOnTarget >= 10) confidence += 18;
    else if (totalShotsOnTarget >= 7) confidence += 12;
    else if (totalShotsOnTarget >= 5) confidence += 6;
    
    // xG gol bekliyor
    if (estimatedXG >= totalGoals + 1.0) confidence += 15;
    else if (estimatedXG >= totalGoals + 0.5) confidence += 8;
    
    // Gol temposu yüksek
    if (goalRate >= 0.05) confidence += 10;
    
    // Her iki takım da gol attıysa (açık maç sinyali)
    if (homeScore > 0 && awayScore > 0) confidence += 8;
    
    // Tehlikeli atak yoğunluğu
    const totalDangerous = (stats.homeDangerousAttacks || 0) + (stats.awayDangerousAttacks || 0);
    if (totalDangerous >= 80) confidence += 8;
    else if (totalDangerous >= 50) confidence += 4;
    
    if (confidence >= 72) {
      const estimatedOdds = 1.85;
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
          type: 'high_tempo',
          market: 'Gol Sayısı',
          pick: 'Üst 3.5',
          confidence: Math.min(confidence, 85),
          reasoning: `2 gol + güçlü baskı: ${totalShotsOnTarget} isab. şut, xG: ${estimatedXG.toFixed(1)}, ${remainingMinutes} dk kaldı`,
          urgency: confidence >= 80 ? 'high' : 'medium',
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

/**
 * KART ANALİZİ - Dakikaya Göre Akıllı Kart Üst Bahisleri
 * 
 * Mantık: Mevcut kart sayısı + kalan süre + faul yoğunluğuna göre
 * hedef eşiği belirle. Eşik mevcut sayıdan EN AZ 2 fazla olmalı (mantıklı oran için).
 * 
 * Sabit eşikler: 2.5, 3.5, 4.5, 5.5, 6.5
 * Örnek: 3 kart, 50' → hedef 5.5 (2 kart daha lazım, 40 dk var, makul)
 * Örnek: 2 kart, 35' → hedef 4.5 (2.5 kart daha lazım, 55 dk var, iyi)
 * Örnek: 5 kart, 65' → hedef 6.5 (zaman az, 1.5 yeterli)
 * 
 * ÖNEMLİ: Kart bahisleri genelde iyi value verir çünkü faul verisinden
 * geleceği tahmin edilebilir. Bahisçiler geç tepki verir.
 */
function analyzeCardOpportunity(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  if (minute < 18 || minute > 82) return null;
  
  const totalCards = stats.homeYellowCards + stats.awayYellowCards + 
                    stats.homeRedCards + stats.awayRedCards;
  const totalFouls = stats.homeFouls + stats.awayFouls;
  
  // Faul yoksa analiz yapılamaz
  if (totalFouls < 6) return null;
  
  const foulRate = totalFouls / minute;
  const cardRate = totalCards / minute;
  const remainingMinutes = 90 - minute;
  const projectedCards = cardRate * 90;
  
  const isTenseMatch = Math.abs(homeScore - awayScore) <= 1;
  const isSecondHalf = minute >= 45;
  
  // Kalan sürede beklenen ek kart (faul bazlı daha akıllı)
  // Her 7-8 faulde ortalama 1 kart → faul temposundan kart tahmini
  const foulBasedCardRate = foulRate / 7.5; // faulden kart oranı
  const blendedCardRate = totalCards > 0 
    ? (cardRate * 0.4) + (foulBasedCardRate * 0.6)  // Faul bazlı daha ağırlıklı
    : foulBasedCardRate; // Henüz kart yoksa tamamen faul bazlı
  const expectedRemainingCards = blendedCardRate * remainingMinutes;
  
  // Sabit eşikler
  const thresholds = [2.5, 3.5, 4.5, 5.5, 6.5];
  
  // Akıllı eşik seçimi: mevcut sayıdan EN AZ 2 fazla olan ilk eşik
  // Ama kalan süre kısaysa (< 20 dk) 1.5 fark da kabul et
  const minGap = remainingMinutes >= 25 ? 2 : 1.5;
  const targetThreshold = thresholds.find(t => t >= totalCards + minGap);
  
  if (!targetThreshold) return null;
  
  // Projeksiyona göre hedefe ulaşabilir miyiz?
  const cardsNeeded = targetThreshold - totalCards + 0.5;
  const canReach = expectedRemainingCards >= cardsNeeded * 0.65; // %65 güvenle yeterli
  
  if (!canReach) return null;
  
  // Güven hesapla
  let confidence = 48;
  
  // Projeksiyon hedefe yeterli mi
  const projectionRatio = expectedRemainingCards / cardsNeeded;
  if (projectionRatio >= 1.5) confidence += 18;
  else if (projectionRatio >= 1.2) confidence += 12;
  else if (projectionRatio >= 1.0) confidence += 8;
  else if (projectionRatio >= 0.8) confidence += 4;
  
  // Faul yoğunluğu (kartların ön göstergesi) - daha agresif bonuslar
  if (foulRate >= 0.55) confidence += 16;
  else if (foulRate >= 0.45) confidence += 12;
  else if (foulRate >= 0.35) confidence += 7;
  else if (foulRate >= 0.25) confidence += 3;
  
  // Gergin maç bonusu (skora yakın = faul artar)
  if (isTenseMatch) confidence += 8;
  
  // 2. yarı bonusu (kartlar genelde 2. yarıda artar)
  if (isSecondHalf) confidence += 6;
  
  // Her iki takım da kart gördüyse (agresif maç)
  if (stats.homeYellowCards >= 1 && stats.awayYellowCards >= 1) confidence += 6;
  
  // Kart açığı bonusu: faul çok ama kart az = hakem "cömert" olacak
  const expectedCardsFromFouls = totalFouls / 7.5;
  if (expectedCardsFromFouls > totalCards + 1.5) confidence += 10;
  else if (expectedCardsFromFouls > totalCards + 0.5) confidence += 5;
  
  // İki takım da agresif faul yapıyorsa
  if (stats.homeFouls >= 5 && stats.awayFouls >= 5) confidence += 4;
  
  if (confidence < 66) return null;
  
  // Oran tahmini: hedefe uzaklık + kalan süreye göre (gerçekçi oranlar)
  const difficulty = cardsNeeded / (remainingMinutes / 30);
  let estimatedOdds: number;
  if (difficulty <= 0.8) estimatedOdds = 1.60;
  else if (difficulty <= 1.2) estimatedOdds = 1.80;
  else if (difficulty <= 1.6) estimatedOdds = 2.00;
  else estimatedOdds = 2.30;
  if (estimatedOdds < MIN_ODDS) return null;
  
  const value = ((100 / confidence) / estimatedOdds - 1) * 100;
  if (value < 6) return null;
  
  const projectedTotal = totalCards + expectedRemainingCards;
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
    type: 'card_risk',
    market: 'Kart Sayısı',
    pick: `Üst ${targetThreshold} Kart`,
    confidence: Math.min(confidence, 88),
    reasoning: `${totalCards} kart ${minute}' (${totalFouls} faul, tempo: ${(foulRate * 90).toFixed(0)}/maç) - projeksiyon: ${projectedTotal.toFixed(1)} kart${isTenseMatch ? ', gergin maç' : ''}`,
    urgency: confidence >= 80 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: confidence >= 76 ? 'bet' : 'notify',
  };
}

/**
 * KORNER ANALİZİ - Dakikaya Göre Akıllı Korner Üst Bahisleri
 * 
 * Mantık: Mevcut korner + kalan süre + şut baskısına göre
 * hedef eşiği belirle. Eşik mevcut sayıdan EN AZ 2-3 fazla olmalı.
 * 
 * Sabit eşikler: 7.5, 8.5, 9.5, 10.5, 11.5
 * Örnek: 5 korner, 35' → hedef 9.5 (4.5 daha lazım, 55 dk var, makul)
 * Örnek: 7 korner, 50' → hedef 10.5 (3.5 daha, 40 dk, iyi)
 * Örnek: 9 korner, 70' → hedef 11.5 (2.5 daha, 20 dk, olabilir)
 */
function analyzeCornerOpportunity(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  if (minute < 20 || minute > 82) return null;
  
  const homeCorners = stats.homeCorners || 0;
  const awayCorners = stats.awayCorners || 0;
  const totalCorners = homeCorners + awayCorners;
  
  const cornerRate = totalCorners / minute;
  const remainingMinutes = 90 - minute;
  const projectedCorners = cornerRate * 90;
  
  const totalShots = (stats.homeShotsTotal || 0) + (stats.awayShotsTotal || 0);
  
  // Kalan sürede beklenen ek korner
  const expectedRemainingCorners = cornerRate * remainingMinutes;
  
  // Sabit eşikler
  const thresholds = [7.5, 8.5, 9.5, 10.5, 11.5];
  
  // Akıllı eşik seçimi: mevcut sayıdan EN AZ 2.5 fazla olan ilk eşik
  // Kalan süre kısaysa (< 20 dk) 1.5 fark da kabul
  const minGap = remainingMinutes >= 25 ? 2.5 : remainingMinutes >= 15 ? 2 : 1.5;
  const targetThreshold = thresholds.find(t => t >= totalCorners + minGap);
  
  if (!targetThreshold) return null;
  
  // Projeksiyona göre hedefe ulaşabilir miyiz?
  const cornersNeeded = targetThreshold - totalCorners + 0.5;
  const canReach = expectedRemainingCorners >= cornersNeeded * 0.7;
  
  if (!canReach) return null;
  
  // Güven hesapla
  let confidence = 50;
  
  // Projeksiyon hedefe yeterli mi
  const projectionRatio = expectedRemainingCorners / cornersNeeded;
  if (projectionRatio >= 1.5) confidence += 18;
  else if (projectionRatio >= 1.2) confidence += 12;
  else if (projectionRatio >= 1.0) confidence += 6;
  
  // Şut baskısı (şut = korner potansiyeli)
  if (totalShots >= 20) confidence += 12;
  else if (totalShots >= 15) confidence += 8;
  else if (totalShots >= 10) confidence += 4;
  
  // Dengeli maç bonus (iki taraf da atakta = daha fazla korner)
  if (homeCorners >= 3 && awayCorners >= 3) confidence += 7;
  else if (homeCorners >= 2 && awayCorners >= 2) confidence += 3;
  
  // Korner temposu bonusu
  if (cornerRate >= 0.15) confidence += 8; // Çok yüksek (~13.5/maç)
  else if (cornerRate >= 0.12) confidence += 5; // Yüksek (~10.8/maç)
  
  if (confidence < 70) return null;
  
  // Oran tahmini: hedefe uzaklık + kalan süreye göre (gerçekçi oranlar)
  const difficulty = cornersNeeded / (remainingMinutes / 15); // 15 dk'da ~2 korner normal
  let estimatedOdds: number;
  if (difficulty <= 0.7) estimatedOdds = 1.60;
  else if (difficulty <= 1.0) estimatedOdds = 1.80;
  else if (difficulty <= 1.4) estimatedOdds = 2.00;
  else estimatedOdds = 2.30;
  if (estimatedOdds < MIN_ODDS) return null;
  
  const value = ((100 / confidence) / estimatedOdds - 1) * 100;
  if (value < 8) return null;
  
  return {
    id: generateOpportunityId(),
    fixtureId,
    match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
    type: 'corner_fest',
    market: 'Korner Sayısı',
    pick: `Üst ${targetThreshold} Korner`,
    confidence: Math.min(confidence, 88),
    reasoning: `${totalCorners} korner ${minute}' (tempo: ${(cornerRate * 90).toFixed(1)}/maç) - hedef ${targetThreshold}, ${totalShots} şut baskısı`,
    urgency: confidence >= 82 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: confidence >= 78 ? 'bet' : 'notify',
  };
}

/**
 * KG VAR (Karşılıklı Gol / Both Teams To Score) ANALİZİ
 * 
 * Çalışır:
 * - Tek taraflı skor (1-0, 2-0, 0-1, 0-2) + gerideki baskıda
 * - 0-0 + iki taraf da aktif
 * - 2-1, 1-2 gibi açık skorlarda (iki takım da zaten gol atmış - 
 *   ama bu zaten KG var olmuş o yüzden sadece henüz olmamış durumlar)
 */
function analyzeBTTS(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  
  // Zaten KG var ise bu fonksiyon gereksiz
  if (homeScore > 0 && awayScore > 0) return null;
  
  // 25-72 dakika arası (erken = veri az, geç = zaman yok)
  if (minute < 25 || minute > 72) return null;
  
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  const remainingMinutes = 90 - minute;
  
  // === SENARYO 1: Tek taraflı skor (1-0/0-1/2-0/0-2) ===
  if ((homeScore > 0 && awayScore === 0) || (homeScore === 0 && awayScore > 0)) {
    const nonScoringShots = homeScore === 0 ? stats.homeShotsOnTarget : stats.awayShotsOnTarget;
    const nonScoringTotalShots = homeScore === 0 ? stats.homeShotsTotal : stats.awayShotsTotal;
    const nonScoringPossession = homeScore === 0 ? stats.homePossession : (100 - stats.homePossession);
    const nonScoringTeam = homeScore === 0 ? match.homeTeam : match.awayTeam;
    const nonScoringCorners = homeScore === 0 ? stats.homeCorners : stats.awayCorners;
    
    let confidence = 48;
    const reasons: string[] = [];
    
    // Gol atamayan takımın şut baskısı
    if (nonScoringShots >= 5) { confidence += 20; reasons.push(`${nonScoringTeam} ${nonScoringShots} isabetli şut`); }
    else if (nonScoringShots >= 3) { confidence += 14; reasons.push(`${nonScoringTeam} ${nonScoringShots} isabetli şut`); }
    else if (nonScoringShots >= 2) { confidence += 8; reasons.push(`${nonScoringTeam} ${nonScoringShots} isabetli şut`); }
    else return null; // 1'den az isabetli şut = pek ümit yok
    
    // Top kontrolü
    if (nonScoringPossession >= 55) { confidence += 8; reasons.push(`%${nonScoringPossession} top`); }
    else if (nonScoringPossession >= 48) confidence += 3;
    
    // Korner baskısı (gol habercisi)
    if (nonScoringCorners >= 4) { confidence += 6; reasons.push(`${nonScoringCorners} korner`); }
    
    // Kalan süre bonus
    if (remainingMinutes >= 40) confidence += 8;
    else if (remainingMinutes >= 25) confidence += 5;
    
    // Skor farkı az ise takım motive (1-0 vs 2-0)
    const scoreDiff = Math.abs(homeScore - awayScore);
    if (scoreDiff === 1) confidence += 5;
    
    if (confidence >= 66) {
      const estimatedOdds = remainingMinutes >= 35 ? 1.90 : remainingMinutes >= 22 ? 2.10 : 2.30;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'goal_pressure',
          market: 'KG Var/Yok',
          pick: 'Karşılıklı Gol Var',
          confidence: Math.min(confidence, 85),
          reasoning: reasons.join(', '),
          urgency: confidence >= 78 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 12 * 60 * 1000),
          action: confidence >= 75 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  // === SENARYO 2: 0-0 + iki taraf da aktif ===
  if (homeScore === 0 && awayScore === 0 && minute >= 30) {
    const homeActive = stats.homeShotsOnTarget >= 2;
    const awayActive = stats.awayShotsOnTarget >= 2;
    
    if (homeActive && awayActive) {
      let confidence = 50;
      const reasons: string[] = [];
      
      reasons.push(`iki taraf aktif: ${stats.homeShotsOnTarget}+${stats.awayShotsOnTarget} isabetli şut`);
      
      if (totalShotsOnTarget >= 8) confidence += 16;
      else if (totalShotsOnTarget >= 6) confidence += 10;
      else confidence += 5;
      
      // xG hesapla
      const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
      const estimatedXG = (totalShotsOnTarget * 0.3) + (totalShots * 0.08);
      if (estimatedXG >= 2.0) { confidence += 10; reasons.push(`xG: ${estimatedXG.toFixed(1)}`); }
      else if (estimatedXG >= 1.5) confidence += 5;
      
      // Kalan süre
      if (remainingMinutes >= 40) confidence += 8;
      else if (remainingMinutes >= 25) confidence += 4;
      
      if (confidence >= 66) {
        const estimatedOdds = remainingMinutes >= 35 ? 1.80 : 1.95;
        const value = ((100 / confidence) / estimatedOdds - 1) * 100;
        
        if (value >= 8) {
          return {
            id: generateOpportunityId(),
            fixtureId,
            match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
            type: 'goal_pressure',
            market: 'KG Var/Yok',
            pick: 'Karşılıklı Gol Var',
            confidence: Math.min(confidence, 85),
            reasoning: reasons.join(', '),
            urgency: confidence >= 75 ? 'high' : 'medium',
            estimatedOdds,
            value: Math.round(value),
            detectedAt: new Date(),
            expiresAt: new Date(Date.now() + 12 * 60 * 1000),
            action: confidence >= 74 ? 'bet' : 'notify',
          };
        }
      }
    }
  }
  
  return null;
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
    type: losingTeam === 'home' ? 'home_momentum' : 'away_momentum',
    market: 'Çifte Şans',
    pick: `${teamName} Kazanır veya Berabere`,
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
 * ÜST/ALT GOL ANALİZİ (Geliştirilmiş - 2.5 / 3.5 / 4.5 Üst)
 * Mevcut skora ve istatistiklere göre en uygun üst bahsi önerir
 */
function analyzeOverUnder(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;
  const totalGoals = homeScore + awayScore;
  
  // 25-80 dakika arası (geniş pencere)
  if (minute < 25 || minute > 80) return null;
  
  // xG hesapla
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
  const estimatedXG = (totalShotsOnTarget * 0.32) + (totalShots * 0.06);
  
  // Projeksiyon gol
  const remainingMinutes = 90 - minute;
  const projectedGoals = (totalGoals + estimatedXG) * (90 / minute);
  const goalRate = totalGoals / minute;
  
  // Açık maç mı? (iki takım da gol attı)
  const isOpenMatch = homeScore > 0 && awayScore > 0;
  
  // === ÖNCELİK 1: 3+ gol varsa → 3.5 Üst (güvenilir) ===
  if (totalGoals >= 3 && minute <= 80 && remainingMinutes >= 10) {
    let confidence = 70;
    
    if (goalRate >= 0.06) confidence += 10; // Yüksek tempo
    if (totalShotsOnTarget >= 8) confidence += 8;
    if (isOpenMatch) confidence += 7;
    if (estimatedXG > totalGoals) confidence += 5;
    if (remainingMinutes >= 25) confidence += 5;
    
    if (confidence >= 72) {
      // Üst 3.5: 3 gol var, kalan süreye göre oranlar
      // 25+ dk kaldı → makul oran, 10-25 dk → düşük oran (değmez)
      const estimatedOdds = remainingMinutes >= 30 ? 1.70 : remainingMinutes >= 20 ? 1.55 : 1.35;
      if (estimatedOdds < MIN_ODDS) return null; // Gerçek oran çok düşük, value yok
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'high_tempo',
          market: 'Gol Sayısı',
          pick: 'Üst 3.5',
          confidence: Math.min(confidence, 92),
          reasoning: `${totalGoals} gol ${minute}' - tempo yüksek, ${totalShotsOnTarget} isab. şut, xG: ${estimatedXG.toFixed(1)}`,
          urgency: confidence >= 85 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          action: confidence >= 80 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  // === ÖNCELİK 2: 4+ gol varsa → 4.5 Üst ===
  if (totalGoals >= 4 && minute <= 78 && remainingMinutes >= 12) {
    let confidence = 65;
    
    if (goalRate >= 0.07) confidence += 15;
    else if (goalRate >= 0.05) confidence += 8;
    if (isOpenMatch && homeScore >= 2 && awayScore >= 2) confidence += 12;
    else if (isOpenMatch) confidence += 6;
    if (totalShotsOnTarget >= 10) confidence += 8;
    if (remainingMinutes >= 20) confidence += 5;
    
    if (confidence >= 72) {
      // Üst 4.5: 4 gol var, hala zor hedef → daha yüksek oran
      const estimatedOdds = remainingMinutes >= 25 ? 1.85 : remainingMinutes >= 15 ? 1.60 : 1.40;
      if (estimatedOdds < MIN_ODDS) return null;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 8) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'high_tempo',
          market: 'Gol Sayısı',
          pick: 'Üst 4.5',
          confidence: Math.min(confidence, 88),
          reasoning: `Gol festivali! ${totalGoals} gol ${minute}', hız: ${(goalRate * 90).toFixed(1)}/maç, şut baskısı devam ediyor`,
          urgency: confidence >= 82 ? 'high' : 'medium',
          estimatedOdds,
          value: Math.round(value),
          detectedAt: new Date(),
          action: confidence >= 78 ? 'bet' : 'notify',
        };
      }
    }
  }
  
  // === ÖNCELİK 3: Klasik 2.5 Üst (1-2 gol + baskı) ===
  if (totalGoals >= 1 && totalGoals <= 2 && projectedGoals >= 3.2 && totalShotsOnTarget >= 5 && minute <= 70) {
    let confidence = 55;
    
    if (totalShotsOnTarget >= 8) confidence += 18;
    else if (totalShotsOnTarget >= 6) confidence += 12;
    if (totalGoals >= 2) confidence += 10;
    if (estimatedXG > totalGoals + 0.5) confidence += 10;
    if (isOpenMatch) confidence += 5;
    
    if (confidence >= 72) {
      // Üst 2.5: 1-2 gol + baskı → oran hala iyi
      const estimatedOdds = totalGoals >= 2 ? 1.60 : 1.90;
      if (estimatedOdds < MIN_ODDS) return null;
      const value = ((100 / confidence) / estimatedOdds - 1) * 100;
      
      if (value >= 10) {
        return {
          id: generateOpportunityId(),
          fixtureId,
          match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, score: `${homeScore}-${awayScore}`, minute },
          type: 'high_tempo',
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
  
  const typeEmoji: Record<OpportunityType, string> = {
    'goal_pressure': '⚽',
    'home_momentum': '🏠⚽',
    'away_momentum': '✈️⚽',
    'high_tempo': '📈',
    'low_scoring': '📉',
    'corner_fest': '🚩',
    'card_risk': '🟨',
    'red_card_advantage': '🟥',
    'xg_value': '💎',
    'momentum_surge': '⚡',
    'golden_chance': '🏆',
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


// ============================================================
// CANLI AVCI MODU - HUNTER MODE
// ============================================================

import type { 
  MomentumData, 
  LiveXGData, 
  RedCardEvent, 
  LiveMatchHunter, 
  HunterOpportunity, 
  HunterOpportunityType,
  DynamicPollingConfig 
} from './live-types';

/**
 * Momentum İndeksi Hesaplama (Geliştirilmiş)
 * Şut, korner, top kontrolü ve faul verilerinden momentum hesaplar
 * API-Football dangerousAttacks verisi sağlamadığı için genellikle fallback kullanılır
 */
export function calculateMomentumIndex(
  dangerousAttacks: number,
  shotsOnTarget: number,
  corners: number,
  minute: number,
  possession: number,
  totalShots?: number,
  fouls?: number
): number {
  if (minute <= 0) return 0;
  
  // Baz skor: Tehlikeli ataklar varsa direkt kullan, yoksa şut/korner'dan hesapla
  let attackScore: number;
  if (dangerousAttacks > 0) {
    attackScore = dangerousAttacks;
  } else {
    // Şut baskısı + korner baskısı
    attackScore = (shotsOnTarget * 5) + ((totalShots || 0) * 2) + (corners * 4);
  }
  
  // Dakika bazlı tempo (dakika başına ne kadar atak)
  const tempoScore = (attackScore / minute) * 15;
  
  // Top kontrolü bonusu (50% = nötr, 65%+ = yüksek bonus)
  let possessionBonus = 0;
  if (possession > 55) {
    possessionBonus = (possession - 50) * 0.6;
  } else if (possession < 40) {
    // Düşük top kontrolü = defansif → negatif momentum
    possessionBonus = -5;
  }
  
  // İsabetli şut bonusu (3+ isabetli şut = extra momentum)
  const shotBonus = shotsOnTarget >= 5 ? 15 : shotsOnTarget >= 3 ? 8 : shotsOnTarget >= 1 ? 3 : 0;
  
  // Korner bonusu (5+ korner = extra momentum)
  const cornerBonus = corners >= 6 ? 10 : corners >= 3 ? 5 : 0;
  
  // Toplam momentum (0-100 arası)
  const rawMomentum = tempoScore + possessionBonus + shotBonus + cornerBonus;
  const momentum = Math.max(0, Math.min(Math.round(rawMomentum), 100));
  
  return momentum;
}

/**
 * Full Momentum Analizi - Her iki takım için
 */
export function analyzeMomentum(stats: LiveMatchStats, minute: number): MomentumData {
  const homeMomentum = calculateMomentumIndex(
    stats.homeDangerousAttacks,
    stats.homeShotsOnTarget,
    stats.homeCorners,
    minute,
    stats.homePossession,
    stats.homeShotsTotal,
    stats.homeFouls
  );
  
  const awayMomentum = calculateMomentumIndex(
    stats.awayDangerousAttacks,
    stats.awayShotsOnTarget,
    stats.awayCorners,
    minute,
    stats.awayPossession,
    stats.awayShotsTotal,
    stats.awayFouls
  );
  
  // Dominant takım belirleme
  const diff = homeMomentum - awayMomentum;
  let dominant: 'home' | 'away' | 'balanced' = 'balanced';
  if (diff > 15) dominant = 'home';
  else if (diff < -15) dominant = 'away';
  
  // Trend belirleme
  let trend: MomentumData['trend'] = 'stable';
  const totalMomentum = homeMomentum + awayMomentum;
  if (totalMomentum > 120) trend = 'chaotic';
  else if (diff > 20) trend = 'home_rising';
  else if (diff < -20) trend = 'away_rising';
  
  // Gol kapıda mı? (momentum > 80 ve 0-0)
  const goalImminent = Math.max(homeMomentum, awayMomentum) > 80;
  
  return {
    homeMomentum,
    awayMomentum,
    trend,
    dominant,
    delta: diff,
    goalImminent,
    estimatedGoalMinute: goalImminent ? minute + Math.floor(Math.random() * 10) + 3 : undefined
  };
}

/**
 * Canlı xG Hesaplama
 * Formül: (ShotsOnTarget * 0.35) + (TotalShots * 0.08) + (DangerousAttacks * 0.02)
 */
export function calculateLiveXG(
  shotsOnTarget: number,
  totalShots: number,
  dangerousAttacks: number
): number {
  const xg = (shotsOnTarget * 0.35) + (totalShots * 0.08) + (dangerousAttacks * 0.02);
  return Math.round(xg * 100) / 100;
}

/**
 * Full xG Analizi - Her iki takım için
 */
export function analyzeLiveXG(
  stats: LiveMatchStats, 
  homeGoals: number, 
  awayGoals: number
): LiveXGData {
  const homeXG = calculateLiveXG(
    stats.homeShotsOnTarget,
    stats.homeShotsTotal,
    stats.homeDangerousAttacks
  );
  
  const awayXG = calculateLiveXG(
    stats.awayShotsOnTarget,
    stats.awayShotsTotal,
    stats.awayDangerousAttacks
  );
  
  const totalXG = homeXG + awayXG;
  const actualGoals = homeGoals + awayGoals;
  const xgDifferential = totalXG - actualGoals;
  
  // Value fırsatı kontrolü
  // xG >= 1.5 ve skor 0-0 ise GOLDEN_CHANCE
  // xG >= 1.2 ve skor < 1 ise value var
  let hasValueOpportunity = false;
  let opportunityMessage: string | undefined;
  let confidence: number | undefined;
  
  if (totalXG >= 1.5 && actualGoals === 0) {
    hasValueOpportunity = true;
    opportunityMessage = "🏆 ALTIN FIRSAT: xG 1.5+ ama hala 0-0! Gol Kapıda!";
    confidence = 88;
  } else if (xgDifferential >= 1.2) {
    hasValueOpportunity = true;
    opportunityMessage = "💎 xG BASKISI: Gol gelişi gecikiyor, fırsat!";
    confidence = 75;
  } else if (xgDifferential >= 0.8 && actualGoals === 0) {
    hasValueOpportunity = true;
    opportunityMessage = "⚡ xG Değeri: Skor xG'yi yansıtmıyor";
    confidence = 65;
  }
  
  return {
    homeXG,
    awayXG,
    totalXG,
    xgDifferential,
    hasValueOpportunity,
    opportunityMessage,
    confidence
  };
}

/**
 * Kırmızı Kart Olayı İşleme
 * 10 kişi kalan takıma karşı +0.75 totalGoals beklentisi
 */
export function handleRedCardEvent(
  stats: LiveMatchStats,
  minute: number,
  homeGoals: number,
  awayGoals: number
): { hasAdvantage: boolean; advantageTeam: 'home' | 'away' | null; adjustedOverExpectation: number; opportunity: HunterOpportunity | null } {
  
  const homeReds = stats.homeRedCards;
  const awayReds = stats.awayRedCards;
  
  // Kırmızı kart yoksa çık
  if (homeReds === 0 && awayReds === 0) {
    return { hasAdvantage: false, advantageTeam: null, adjustedOverExpectation: 0, opportunity: null };
  }
  
  // Hangi takım avantajlı?
  let advantageTeam: 'home' | 'away' | null = null;
  if (awayReds > homeReds) {
    advantageTeam = 'home';
  } else if (homeReds > awayReds) {
    advantageTeam = 'away';
  }
  
  // 10 kişiye karşı oynuyorsa +0.75 gol beklentisi
  const redCardDiff = Math.abs(homeReds - awayReds);
  const adjustedOverExpectation = redCardDiff * 0.75;
  
  // Fırsat oluştur
  let opportunity: HunterOpportunity | null = null;
  
  if (advantageTeam && minute < 80) {
    const remainingMinutes = 90 - minute;
    const expectedGoals = (adjustedOverExpectation / 45) * remainingMinutes;
    const totalCurrentGoals = homeGoals + awayGoals;
    
    if (expectedGoals >= 0.5) {
      opportunity = {
        id: `red-card-${Date.now()}`,
        type: 'red_card_advantage',
        title: `🟥 Kırmızı Kart Avantajı: ${advantageTeam === 'home' ? 'Ev Sahibi' : 'Deplasman'}`,
        market: totalCurrentGoals < 2 ? '2.5 Üst' : totalCurrentGoals < 3 ? '3.5 Üst' : '4.5 Üst',
        pick: totalCurrentGoals < 2 ? 'Üst 2.5' : totalCurrentGoals < 3 ? 'Üst 3.5' : 'Üst 4.5',
        confidence: Math.min(85, 60 + (redCardDiff * 15)),
        value: Math.round(adjustedOverExpectation * 20),
        urgency: redCardDiff >= 2 ? 'critical' : 'high',
        reasoning: `Rakip ${redCardDiff} kırmızı kart gördü. ${remainingMinutes} dk kaldı, gol beklentisi +${adjustedOverExpectation.toFixed(2)}`,
        detectedAt: new Date(),
        expiresIn: 300, // 5 dk
        playSound: true
      };
    }
  }
  
  return {
    hasAdvantage: !!advantageTeam,
    advantageTeam,
    adjustedOverExpectation,
    opportunity
  };
}

/**
 * xG Value Fırsatı Tespiti
 */
export function detectXGValueOpportunity(
  liveXG: LiveXGData,
  homeGoals: number,
  awayGoals: number,
  minute: number
): HunterOpportunity | null {
  if (!liveXG.hasValueOpportunity) return null;
  
  const isGoldenChance = liveXG.totalXG >= 1.5 && (homeGoals + awayGoals) === 0;
  
  const totalCurrentGoals = homeGoals + awayGoals;
  
  return {
    id: `xg-value-${Date.now()}`,
    type: isGoldenChance ? 'golden_chance' : 'xg_value',
    title: liveXG.opportunityMessage || 'xG Value Fırsatı',
    market: totalCurrentGoals < 2 ? '2.5 Üst' : totalCurrentGoals < 3 ? '3.5 Üst' : '4.5 Üst',
    pick: totalCurrentGoals < 2 ? 'Üst 2.5' : totalCurrentGoals < 3 ? 'Üst 3.5' : 'Üst 4.5',
    confidence: liveXG.confidence || 70,
    value: Math.round(liveXG.xgDifferential * 25),
    urgency: isGoldenChance ? 'critical' : (liveXG.xgDifferential >= 1.2 ? 'high' : 'medium'),
    reasoning: `xG: ${liveXG.totalXG.toFixed(2)} vs Skor: ${homeGoals + awayGoals}. xG farkı: ${liveXG.xgDifferential.toFixed(2)}`,
    detectedAt: new Date(),
    expiresIn: isGoldenChance ? 180 : 300,
    playSound: isGoldenChance
  };
}

/**
 * Momentum Surge Fırsatı (Momentum > 80)
 */
export function detectMomentumSurge(
  momentum: MomentumData,
  minute: number,
  homeTeam: string,
  awayTeam: string
): HunterOpportunity | null {
  if (!momentum.goalImminent) return null;
  
  const surgeTeam = momentum.homeMomentum > momentum.awayMomentum ? 'home' : 'away';
  const teamName = surgeTeam === 'home' ? homeTeam : awayTeam;
  const peakMomentum = Math.max(momentum.homeMomentum, momentum.awayMomentum);
  
  return {
    id: `momentum-surge-${Date.now()}`,
    type: 'momentum_surge',
    title: `⚡ ${teamName} Baskısı Zirve!`,
    market: 'Sonraki Gol',
    pick: `${teamName} Atacak`,
    confidence: Math.min(85, 55 + Math.floor(peakMomentum / 3)),
    value: peakMomentum - 50,
    urgency: peakMomentum >= 90 ? 'critical' : 'high',
    reasoning: `${teamName} momentum: ${peakMomentum}%. Trend: ${momentum.trend}. Gol yaklaşıyor!`,
    detectedAt: new Date(),
    expiresIn: 120,
    playSound: peakMomentum >= 90
  };
}

/**
 * Dinamik Polling Interval Hesaplama
 */
export function getDynamicPollingInterval(
  momentum: MomentumData,
  minute: number,
  homeGoals: number,
  awayGoals: number,
  hasRedCard: boolean
): DynamicPollingConfig {
  const totalGoals = homeGoals + awayGoals;
  const maxMomentum = Math.max(momentum.homeMomentum, momentum.awayMomentum);
  
  // HIZLI (15s): Kritik durumlar
  if (
    maxMomentum >= 80 ||
    (totalGoals === 0 && minute >= 70) ||
    hasRedCard ||
    momentum.goalImminent
  ) {
    return {
      normalInterval: 60000,
      fastInterval: 15000,
      slowInterval: 90000,
      currentInterval: 15000,
      reason: maxMomentum >= 80 ? 'Yüksek momentum' : 
              (totalGoals === 0 && minute >= 70) ? 'Geç dakika 0-0' :
              hasRedCard ? 'Kırmızı kart' : 'Gol kapıda'
    };
  }
  
  // YAVAŞ (90s): Sakin maçlar
  if (
    maxMomentum < 30 &&
    minute < 60 &&
    totalGoals >= 2
  ) {
    return {
      normalInterval: 60000,
      fastInterval: 15000,
      slowInterval: 90000,
      currentInterval: 90000,
      reason: 'Sakin tempo, gol gelmiş'
    };
  }
  
  // NORMAL (60s): Standart
  return {
    normalInterval: 60000,
    fastInterval: 15000,
    slowInterval: 90000,
    currentInterval: 60000,
    reason: 'Standart izleme'
  };
}

/**
 * Tüm Hunter Fırsatlarını Tespit Et
 */
export function detectHunterOpportunities(match: LiveMatch): HunterOpportunity[] {
  const opportunities: HunterOpportunity[] = [];
  const { stats, minute, homeScore, awayScore, homeTeam, awayTeam } = match;
  
  // Momentum analizi
  const momentum = analyzeMomentum(stats, minute);
  
  // xG analizi
  const liveXG = analyzeLiveXG(stats, homeScore, awayScore);
  
  // Kırmızı kart kontrolü
  const redCardResult = handleRedCardEvent(stats, minute, homeScore, awayScore);
  
  // 1. Momentum Surge fırsatı
  const momentumOpp = detectMomentumSurge(momentum, minute, homeTeam, awayTeam);
  if (momentumOpp) opportunities.push(momentumOpp);
  
  // 2. xG Value fırsatı
  const xgOpp = detectXGValueOpportunity(liveXG, homeScore, awayScore, minute);
  if (xgOpp) opportunities.push(xgOpp);
  
  // 3. Kırmızı kart fırsatı
  if (redCardResult.opportunity) {
    opportunities.push(redCardResult.opportunity);
  }
  
  // 4. GOLDEN CHANCE kontrolü (çoklu sinyal)
  const goldenChanceSignals = [
    momentum.goalImminent,
    liveXG.hasValueOpportunity && liveXG.totalXG >= 1.5,
    homeScore + awayScore === 0 && minute >= 60,
    redCardResult.hasAdvantage
  ].filter(Boolean).length;
  
  const goldenTotalGoals = homeScore + awayScore;
  if (goldenChanceSignals >= 3) {
    opportunities.push({
      id: `golden-${Date.now()}`,
      type: 'golden_chance',
      title: '🏆 ALTIN FIRSAT - ÇOKLU SİNYAL!',
      market: goldenTotalGoals >= 3 ? '3.5 Üst' : goldenTotalGoals >= 2 ? '2.5 Üst' : 'Üst 1.5 Gol',
      pick: goldenTotalGoals >= 3 ? 'Üst 3.5' : goldenTotalGoals >= 2 ? 'Üst 2.5' : 'Üst 1.5',
      confidence: 90,
      value: 40,
      urgency: 'critical',
      reasoning: `${goldenChanceSignals} kritik sinyal aktif! Momentum: ${Math.max(momentum.homeMomentum, momentum.awayMomentum)}%, xG: ${liveXG.totalXG.toFixed(2)}`,
      detectedAt: new Date(),
      expiresIn: 120,
      playSound: true
    });
  }
  
  return opportunities;
}

/**
 * Hunter Dashboard için Maç Özeti
 */
export function createHunterMatchSummary(match: LiveMatch): LiveMatchHunter {
  const momentum = analyzeMomentum(match.stats, match.minute);
  const liveXG = analyzeLiveXG(match.stats, match.homeScore, match.awayScore);
  const opportunities = detectHunterOpportunities(match);
  
  // Hunter durumu belirleme
  let hunterStatus: LiveMatchHunter['hunterStatus'] = 'watching';
  if (opportunities.some(o => o.type === 'golden_chance')) {
    hunterStatus = 'golden_chance';
  } else if (opportunities.length > 0) {
    hunterStatus = 'alert';
  }
  
  return {
    matchId: match.fixtureId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    score: { home: match.homeScore, away: match.awayScore },
    minute: match.minute,
    liveStats: {
      possession: { home: match.stats.homePossession, away: match.stats.awayPossession },
      dangerousAttacks: { home: match.stats.homeDangerousAttacks, away: match.stats.awayDangerousAttacks },
      shotsOnTarget: { home: match.stats.homeShotsOnTarget, away: match.stats.awayShotsOnTarget },
      shotsTotal: { home: match.stats.homeShotsTotal, away: match.stats.awayShotsTotal },
      corners: { home: match.stats.homeCorners, away: match.stats.awayCorners },
      fouls: { home: match.stats.homeFouls, away: match.stats.awayFouls },
      yellowCards: { home: match.stats.homeYellowCards, away: match.stats.awayYellowCards },
      redCards: { home: match.stats.homeRedCards, away: match.stats.awayRedCards }
    },
    momentum,
    liveXG,
    redCardEvents: [],
    hunterStatus,
    activeOpportunities: opportunities
  };
}
