/**
 * 100 → 10.000 TL Challenge Engine
 * 
 * Strateji: Bileşik faiz mantığıyla kademeli yatırım.
 * Her adımda kasanın belirli yüzdesini yatırarak 100 TL'den 10.000 TL'ye ulaşmak.
 * 
 * 4-5 kupon planı:
 * - Kupon 1: 100 TL → ~250 TL (2.50 oran, 2 maç düşük risk)
 * - Kupon 2: 250 TL → ~600 TL (2.40 oran, 2-3 maç)
 * - Kupon 3: 600 TL → ~1500 TL (2.50 oran, 2-3 maç)
 * - Kupon 4: 1500 TL → ~4000 TL (2.60 oran, 3 maç)
 * - Kupon 5: 4000 TL → ~10000 TL (2.50 oran, 2-3 maç)
 * 
 * Her kuponda:
 * - Minimum 2, maksimum 3 maç
 * - Güven skoru %55+ maçlar tercih
 * - Oran aralığı 1.40 - 2.80 per maç (1.20 gibi düşüklerden uzak dur)
 * - İY 1.5 Üst, İY/MS gibi erken kapanan bahisler tercih (ilk yarı biter bitmez para)
 * - Karışık bahis tipleri (MS, Ü/A 2.5, KG, Çift Şans, İY 1.5 Üst)
 * - Canlı maçlarda da fırsat varsa dahil edilir
 */

import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import type { BotMatch, BotCoupon, PredictionType } from './types';

// ============ CHALLENGE CONFIG ============

export interface ChallengeConfig {
  startAmount: number;       // 100 TL
  targetAmount: number;      // 10.000 TL
  maxCoupons: number;        // 5 kupon
  
  // Her kupon için
  minMatchesPerCoupon: number;  // 2
  maxMatchesPerCoupon: number;  // 3
  
  // Oran limitleri
  minOddsPerMatch: number;    // 1.40 (1.20'den uzak dur)
  maxOddsPerMatch: number;    // 2.80
  targetTotalOdds: number;    // ~2.50 (ideal toplam oran)
  minTotalOdds: number;       // 1.80 (2+ şart değil)
  maxTotalOdds: number;       // 5.00
  
  // Güven limitleri
  minConfidence: number;      // 55
  preferredConfidence: number; // 65+
  
  // Risk yönetimi
  maxStakePercent: number;    // Kasanın max %'si (100 = hepsini yatır)
}

export const DEFAULT_CHALLENGE_CONFIG: ChallengeConfig = {
  startAmount: 100,
  targetAmount: 10000,
  maxCoupons: 5,
  
  minMatchesPerCoupon: 2,
  maxMatchesPerCoupon: 3,
  
  minOddsPerMatch: 1.40,     // 1.20 gibi düşük oranlardan uzak dur
  maxOddsPerMatch: 2.80,     // Yüksek oranlar da olabilir
  targetTotalOdds: 2.50,
  minTotalOdds: 1.80,        // 2+ şart değil, 1.80 de kabul
  maxTotalOdds: 5.00,        // Geniş aralık
  
  minConfidence: 55,
  preferredConfidence: 65,
  
  maxStakePercent: 100, // Tüm kasayı yatır (challenge mode)
};

// ============ CHALLENGE STATE ============

export interface ChallengeState {
  id: string;
  startedAt: string;
  config: ChallengeConfig;
  
  // Kasa
  currentBalance: number;
  initialBalance: number;
  
  // Kuponlar
  coupons: ChallengeCoupon[];
  currentStep: number;        // 0-based, hangi adımdayız
  
  // Durum
  status: 'active' | 'won' | 'lost' | 'paused';
  
  // Plan
  plan: ChallengeStep[];
}

export interface ChallengeStep {
  step: number;               // 1-5
  stakeAmount: number;        // Yatırılacak tutar
  targetOdds: number;         // Hedef toplam oran
  expectedReturn: number;     // Beklenen dönüş
  description: string;        // "100→250 TL"
  status: 'pending' | 'active' | 'won' | 'lost';
}

export interface ChallengeCoupon {
  step: number;
  coupon: BotCoupon;
  stakeAmount: number;
  expectedReturn: number;
  settledAt?: string;
  won?: boolean;
}

// ============ MATCH SCORING ============

interface ScoredMatch {
  fixture: DailyMatchFixture;
  suggestion: BetSuggestion;
  score: number;
  reasons: string[];
}

/**
 * Maç-bahis kombinasyonlarını skorla
 * Challenge için ideal maçları seçmek
 */
function scoreMatchForChallenge(
  fixture: DailyMatchFixture,
  suggestion: BetSuggestion,
  config: ChallengeConfig
): ScoredMatch | null {
  const { confidence, odds } = suggestion;
  
  // Temel filtreler
  if (confidence < config.minConfidence) return null;
  if (odds < config.minOddsPerMatch) return null;
  if (odds > config.maxOddsPerMatch) return null;
  if (fixture.status.isFinished) return null;
  
  // ⚠️ SADECE GERÇEK BOOKMAKER ORANLARI KABUL ET
  // calculated oranlar güvenilmez — bahis sitesiyle uyuşmuyor
  if (suggestion.oddsSource !== 'real') return null;
  
  // Challenge'a uygun olmayan bahis tiplerini filtrele
  // Kart, korner, golcü gibi "spesifik" bahisler challenge için uygun değil
  const betType = suggestion.type || inferBetType(suggestion.pick);
  const pickLower = suggestion.pick.toLowerCase();
  const isCardBet = betType === 'cards' || pickLower.includes('kart') || pickLower.includes('card');
  const isCornerBet = betType === 'corners' || pickLower.includes('korner') || pickLower.includes('corner');
  const isPlayerBet = pickLower.includes('gol atar') || pickLower.includes('golcü') || pickLower.includes('scorer');
  if (isCardBet || isCornerBet || isPlayerBet) return null;
  
  let score = 0;
  const reasons: string[] = [];
  
  // 1. Güven skoru (en önemli) — max 40 puan
  if (confidence >= 80) { score += 40; reasons.push('Çok yüksek güven'); }
  else if (confidence >= 70) { score += 35; reasons.push('Yüksek güven'); }
  else if (confidence >= 65) { score += 30; reasons.push('İyi güven'); }
  else if (confidence >= 60) { score += 25; reasons.push('Orta güven'); }
  else { score += 15; reasons.push('Temel güven'); }
  
  // 2. Oran değeri — max 25 puan (sweet spot: 1.45-1.90 — 1.20 gibi düşüklerden kaç)
  if (odds >= 1.45 && odds <= 1.90) { score += 25; reasons.push('İdeal oran aralığı'); }
  else if (odds >= 1.40 && odds <= 2.20) { score += 20; reasons.push('İyi oran'); }
  else if (odds >= 1.30 && odds < 1.40) { score += 8; reasons.push('Düşük oran - riskli'); }
  else if (odds > 2.20 && odds <= 2.80) { score += 15; reasons.push('Yüksek oran'); }
  else { score += 5; }
  
  // 3. Bahis tipi çeşitliliği bonusu — max 20 puan
  // (betType ve pickLower yukarıda zaten tanımlı)
  
  // İY bahisleri BONUS — erken kapanır, para hızlı gelir
  const isHalfTimeBet = pickLower.includes('iy') || pickLower.includes('ilk yarı') || pickLower.includes('ht') || pickLower.includes('1. yarı');
  if (isHalfTimeBet) { score += 20; reasons.push('İY bahisi (erken kapanır!)'); }
  else if (betType === 'result') { score += 15; reasons.push('MS'); }
  else if (betType === 'goals') { score += 14; reasons.push('Gol bahisi'); }
  else if (betType === 'btts') { score += 12; reasons.push('KG'); }
  else { score += 10; }
  
  // 4. Form ve H2H bonus — max 10 puan
  if (fixture.formComparison) {
    const homeForm = fixture.formComparison.homeLast5?.filter(r => r === 'W').length || 0;
    const awayForm = fixture.formComparison.awayLast5?.filter(r => r === 'W').length || 0;
    if (homeForm >= 4 || awayForm >= 4) { score += 10; reasons.push('Güçlü form'); }
    else if (homeForm >= 3 || awayForm >= 3) { score += 7; reasons.push('İyi form'); }
    else { score += 3; }
  }
  
  // 5. Canlı maç — DIKKAT: canlı maçta oran değişmiş olabilir
  // Henüz başlamamış maçlara bonus ver (gerçek bahis için daha güvenli)
  if (fixture.status.isLive) {
    // Canlı maçta oran farklı olabilir — hafif ceza
    score -= 5;
    reasons.push('🔴 CANLI (oran değişmiş olabilir)');
    // Gol durumuna göre ek bonus
    const goalDiff = (fixture.score?.home || 0) - (fixture.score?.away || 0);
    if (suggestion.pick.includes('1') && goalDiff > 0) { score += 5; reasons.push('Ev sahibi önde'); }
    if (suggestion.pick.includes('2') && goalDiff < 0) { score += 5; reasons.push('Deplasman önde'); }
  } else if (fixture.status.isUpcoming) {
    // Başlamamış maç = bahis kesin yapılabilir, oranlar sabit
    score += 10; reasons.push('✅ Başlamamış (kesin oran)');
  }
  
  return { fixture, suggestion, score, reasons };
}

function inferBetType(pick: string): string {
  const p = pick.toLowerCase();
  if (p.includes('iy') || p.includes('ilk yarı') || p.includes('ht') || p.includes('1. yarı')) return 'halftime';
  if (p.includes('ms') || p === '1' || p === '2' || p === 'x' || p.includes('1x') || p.includes('x2') || p.includes('12')) return 'result';
  if (p.includes('2.5') || p.includes('1.5') || p.includes('3.5') || p.includes('üst') || p.includes('ust') || p.includes('alt')) return 'goals';
  if (p.includes('kg') || p.includes('btts') || p.includes('var') || p.includes('yok')) return 'btts';
  return 'other';
}

// ============ CHALLENGE PLAN ============

/**
 * Challenge planı oluştur
 * 100 → 10.000 TL yol haritası
 */
export function createChallengePlan(config: ChallengeConfig = DEFAULT_CHALLENGE_CONFIG): ChallengeStep[] {
  const steps: ChallengeStep[] = [];
  let balance = config.startAmount;
  
  // Hedef: her adımda ~2.5x çarpan
  const targetMultipliers = [2.50, 2.40, 2.50, 2.60, 2.50];
  
  for (let i = 0; i < config.maxCoupons; i++) {
    const multiplier = targetMultipliers[i] || 2.50;
    const stake = balance; // Tüm kasayı yatır
    const expectedReturn = Math.round(stake * multiplier);
    
    steps.push({
      step: i + 1,
      stakeAmount: Math.round(stake),
      targetOdds: multiplier,
      expectedReturn,
      description: `${Math.round(balance)} → ${expectedReturn} TL`,
      status: 'pending',
    });
    
    balance = expectedReturn;
  }
  
  return steps;
}

// ============ SAAT DİLİMİ YÖNETİMİ ============

/**
 * Maçları saat dilimine göre grupla
 * Örn: 19:00-19:59, 20:00-20:59, 21:00-21:59
 * Canlı maçlar ayrı "live" slotuna gider
 */
function groupMatchesByTimeSlot(matches: ScoredMatch[]): Map<string, ScoredMatch[]> {
  const slots = new Map<string, ScoredMatch[]>();
  
  for (const m of matches) {
    let slotKey: string;
    
    if (m.fixture.status.isLive) {
      // Canlı maçlar: kaçıncı dakikada olduğuna göre grupla
      const elapsed = m.fixture.status.elapsed || 0;
      if (elapsed <= 45) slotKey = 'live-1h'; // İlk yarı
      else slotKey = 'live-2h'; // İkinci yarı
    } else {
      // Upcoming maçlar: saat dilimine göre grupla (Türkiye saati)
      const kickoff = new Date(m.fixture.timestamp * 1000);
      const trHour = parseInt(kickoff.toLocaleTimeString('tr-TR', { hour: '2-digit', timeZone: 'Europe/Istanbul' }));
      slotKey = `${String(trHour).padStart(2, '0')}:00`;
    }
    
    if (!slots.has(slotKey)) slots.set(slotKey, []);
    slots.get(slotKey)!.push(m);
  }
  
  return slots;
}

/**
 * En yakın oynayabileceğimiz saat dilimini seç
 * Öncelik: canlı > en yakın saat > sonraki saat
 * Minimum 2 maç olan slotu seçer
 */
function pickBestTimeSlot(
  slots: Map<string, ScoredMatch[]>,
  minMatches: number
): { slotKey: string; matches: ScoredMatch[] } | null {
  const now = new Date();
  const trHourNow = parseInt(now.toLocaleTimeString('tr-TR', { hour: '2-digit', timeZone: 'Europe/Istanbul' }));
  
  // 1. Önce canlı maç slotlarını kontrol et
  const liveSlots = ['live-1h', 'live-2h'];
  for (const ls of liveSlots) {
    const liveMatches = slots.get(ls);
    if (liveMatches && liveMatches.length >= minMatches) {
      return { slotKey: ls, matches: liveMatches };
    }
  }
  
  // 2. Canlı + en yakın slotu birleştirmeyi dene
  const allLive: ScoredMatch[] = [];
  for (const ls of liveSlots) {
    const liveMatches = slots.get(ls);
    if (liveMatches) allLive.push(...liveMatches);
  }
  
  // 3. Saat slotlarını yakınlık sırasına göre sırala
  const hourSlots = [...slots.entries()]
    .filter(([key]) => !key.startsWith('live'))
    .sort(([a], [b]) => {
      const hourA = parseInt(a);
      const hourB = parseInt(b);
      // Şu anki saate yakınlığa göre (geçmiş saatleri atla)
      const diffA = hourA >= trHourNow ? hourA - trHourNow : 100;
      const diffB = hourB >= trHourNow ? hourB - trHourNow : 100;
      return diffA - diffB;
    });
  
  // 4. İlk yeterli slotu bul
  for (const [slotKey, matches] of hourSlots) {
    if (matches.length >= minMatches) {
      return { slotKey, matches };
    }
  }
  
  // 5. Tek slot yetmiyorsa: canlı + en yakın slotu birleştir
  if (allLive.length > 0 && hourSlots.length > 0) {
    const combined = [...allLive, ...hourSlots[0][1]];
    if (combined.length >= minMatches) {
      return { slotKey: `live+${hourSlots[0][0]}`, matches: combined };
    }
  }
  
  // 6. Ardarda 2 slotu birleştir
  for (let i = 0; i < hourSlots.length - 1; i++) {
    const combined = [...hourSlots[i][1], ...hourSlots[i + 1][1]];
    if (combined.length >= minMatches) {
      return { slotKey: `${hourSlots[i][0]}+${hourSlots[i + 1][0]}`, matches: combined };
    }
  }
  
  // 7. Hiçbir şey bulunamazsa tümünü dön
  const all = [...slots.values()].flat();
  if (all.length >= minMatches) {
    return { slotKey: 'all', matches: all };
  }
  
  return null;
}

// ============ KUPON OLUŞTURMA ============

/**
 * Challenge için en iyi kupon kombinasyonunu seç
 * SAAT BAZLI: En yakın saat dilimindeki maçlardan kupon yapılır
 */
export function buildChallengeCoupon(
  matches: DailyMatchFixture[],
  step: ChallengeStep,
  config: ChallengeConfig = DEFAULT_CHALLENGE_CONFIG,
  getSuggestions?: (fixture: DailyMatchFixture) => BetSuggestion[] | undefined
): {
  selectedMatches: ScoredMatch[];
  totalOdds: number;
  avgConfidence: number;
  reasoning: string;
  timeSlot: string;
} | null {
  // Tüm maç-bahis kombinasyonlarını skorla
  const allScored: ScoredMatch[] = [];
  const upcomingScored: ScoredMatch[] = [];
  
  for (const fixture of matches) {
    const suggestions = fixture.betSuggestions || (getSuggestions ? getSuggestions(fixture) : undefined);
    if (!suggestions) continue;
    
    for (const suggestion of suggestions) {
      const scored = scoreMatchForChallenge(fixture, suggestion, config);
      if (scored) {
        allScored.push(scored);
        // Canlı maçları ayır - challenge kuponu için önce sadece başlamamış maçlara bak
        if (fixture.status.isUpcoming) {
          upcomingScored.push(scored);
        }
      }
    }
  }
  
  console.log(`[Challenge] Skorlanan: ${allScored.length} toplam, ${upcomingScored.length} upcoming`);
  
  // ÖNCE SADECE UPCOMING MAÇLARLA DENE
  // Challenge kuponu = gerçek bahis, canlı maçlarda oranlar değişir
  const primaryMatches = upcomingScored.length >= config.minMatchesPerCoupon ? upcomingScored : allScored;
  const usingUpcomingOnly = upcomingScored.length >= config.minMatchesPerCoupon;
  
  if (primaryMatches.length < config.minMatchesPerCoupon) return null;
  
  console.log(`[Challenge] ${usingUpcomingOnly ? '✅ Sadece upcoming maçlar' : '⚠️ Upcoming yetersiz, tüm maçlar'} kullanılıyor`);

  // Saat dilimine göre grupla
  const timeSlots = groupMatchesByTimeSlot(primaryMatches);
  
  console.log('[Challenge] Saat dilimleri:');
  for (const [slot, slotMatches] of timeSlots) {
    const fixtureIds = new Set(slotMatches.map(m => m.fixture.id));
    console.log(`  ${slot}: ${fixtureIds.size} maç, ${slotMatches.length} bahis seçeneği`);
  }
  
  // En yakın uygun saat dilimini seç
  const bestSlot = pickBestTimeSlot(timeSlots, config.minMatchesPerCoupon);
  
  if (!bestSlot) {
    console.log('[Challenge] Uygun saat dilimi bulunamadı');
    return null;
  }
  
  console.log(`[Challenge] Seçilen saat dilimi: ${bestSlot.slotKey} (${bestSlot.matches.length} bahis)`);
  
  // Seçilen slottaki maçlardan en iyi kombinasyonu bul
  const slotMatches = bestSlot.matches.sort((a, b) => b.score - a.score);
  
  const bestCombos = findBestCombination(
    slotMatches,
    step.targetOdds,
    config.minMatchesPerCoupon,
    config.maxMatchesPerCoupon,
    config.minTotalOdds,
    config.maxTotalOdds
  );
  
  if (!bestCombos || bestCombos.length === 0) {
    console.log(`[Challenge] ${bestSlot.slotKey} slotunda uygun kombinasyon bulunamadı, tüm maçlara dönülüyor...`);
    // Fallback: tüm maçlardan dene
    const allSorted = allScored.sort((a, b) => b.score - a.score);
    const fallback = findBestCombination(allSorted, step.targetOdds, config.minMatchesPerCoupon, config.maxMatchesPerCoupon, config.minTotalOdds, config.maxTotalOdds);
    if (!fallback) return null;
    
    const totalOdds = fallback.reduce((acc, m) => acc * m.suggestion.odds, 1);
    const avgConf = fallback.reduce((acc, m) => acc + m.suggestion.confidence, 0) / fallback.length;
    return {
      selectedMatches: fallback,
      totalOdds: Number(totalOdds.toFixed(2)),
      avgConfidence: Number(avgConf.toFixed(0)),
      reasoning: fallback.map((m, i) => `${i + 1}. ${m.fixture.homeTeam.name} vs ${m.fixture.awayTeam.name}: ${m.suggestion.pick} @${m.suggestion.odds.toFixed(2)} (%${m.suggestion.confidence})`).join('\n'),
      timeSlot: 'all',
    };
  }
  
  const totalOdds = bestCombos.reduce((acc, m) => acc * m.suggestion.odds, 1);
  const avgConfidence = bestCombos.reduce((acc, m) => acc + m.suggestion.confidence, 0) / bestCombos.length;
  
  // Reasoning oluştur
  const reasons = bestCombos.map((m, i) => {
    const kickoff = new Date(m.fixture.timestamp * 1000);
    const timeStr = kickoff.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
    return `${i + 1}. ${m.fixture.homeTeam.name} vs ${m.fixture.awayTeam.name}: ${m.suggestion.pick} @${m.suggestion.odds.toFixed(2)} (%${m.suggestion.confidence}) ⏰${timeStr}`;
  }).join('\n');
  
  return {
    selectedMatches: bestCombos,
    totalOdds: Number(totalOdds.toFixed(2)),
    avgConfidence: Number(avgConfidence.toFixed(0)),
    reasoning: reasons,
    timeSlot: bestSlot.slotKey,
  };
}

/**
 * En iyi maç kombinasyonunu bul
 * Greedy yaklaşım: en yüksek skorlu maçları al, toplam oran hedefine ulaş
 */
function findBestCombination(
  sortedMatches: ScoredMatch[],
  targetOdds: number,
  minMatches: number,
  maxMatches: number,
  minTotalOdds: number,
  maxTotalOdds: number
): ScoredMatch[] | null {
  // Farklı fixture ID'lerden seç (aynı maçtan 2 bahis alma)
  const uniqueByFixture: ScoredMatch[] = [];
  const usedFixtures = new Set<number>();
  
  for (const match of sortedMatches) {
    if (!usedFixtures.has(match.fixture.id)) {
      uniqueByFixture.push(match);
      usedFixtures.add(match.fixture.id);
    }
  }
  
  if (uniqueByFixture.length < minMatches) return null;
  
  // En iyi 2'li ve 3'lü kombinasyonları dene
  let bestCombo: ScoredMatch[] | null = null;
  let bestScore = -1;
  
  // 2'li kombinasyonlar
  for (let i = 0; i < Math.min(uniqueByFixture.length, 15); i++) {
    for (let j = i + 1; j < Math.min(uniqueByFixture.length, 15); j++) {
      const combo = [uniqueByFixture[i], uniqueByFixture[j]];
      const odds = combo[0].suggestion.odds * combo[1].suggestion.odds;
      
      if (odds >= minTotalOdds && odds <= maxTotalOdds) {
        const comboScore = combo.reduce((s, m) => s + m.score, 0) + 
          (Math.abs(odds - targetOdds) < 0.5 ? 20 : 0); // Hedefe yakınlık bonusu
        
        if (comboScore > bestScore) {
          bestScore = comboScore;
          bestCombo = combo;
        }
      }
    }
  }
  
  // 3'lü kombinasyonlar (daha çeşitli, biraz daha riskli ama daha yüksek oran)
  for (let i = 0; i < Math.min(uniqueByFixture.length, 10); i++) {
    for (let j = i + 1; j < Math.min(uniqueByFixture.length, 10); j++) {
      for (let k = j + 1; k < Math.min(uniqueByFixture.length, 10); k++) {
        const combo = [uniqueByFixture[i], uniqueByFixture[j], uniqueByFixture[k]];
        const odds = combo[0].suggestion.odds * combo[1].suggestion.odds * combo[2].suggestion.odds;
        
        if (odds >= minTotalOdds && odds <= maxTotalOdds) {
          const comboScore = combo.reduce((s, m) => s + m.score, 0) +
            (Math.abs(odds - targetOdds) < 0.3 ? 25 : 0); // 3'lüde hedefe yakınlık daha önemli
          
          if (comboScore > bestScore) {
            bestScore = comboScore;
            bestCombo = combo;
          }
        }
      }
    }
  }
  
  return bestCombo;
}

// ============ CHALLENGE COUPON → BOT COUPON ============

/**
 * Challenge kuponu formatını BotCoupon'a çevir
 */
export function createBotCouponFromChallenge(
  selectedMatches: ScoredMatch[],
  stepNumber: number,
  stakeAmount: number,
  totalOdds: number,
): BotCoupon {
  const now = new Date();
  const id = `CH${stepNumber}-${now.getTime().toString(36).toUpperCase()}`;
  
  const matches: BotMatch[] = selectedMatches.map(sm => ({
    fixtureId: sm.fixture.id,
    homeTeam: sm.fixture.homeTeam.name,
    awayTeam: sm.fixture.awayTeam.name,
    homeTeamId: sm.fixture.homeTeam.id,
    awayTeamId: sm.fixture.awayTeam.id,
    league: sm.fixture.league.name,
    leagueId: sm.fixture.league.id,
    kickoff: new Date(sm.fixture.timestamp * 1000),
    isLive: sm.fixture.status.isLive || false,
    statusCode: sm.fixture.status.code,
    elapsed: sm.fixture.status.elapsed || null,
    oddsSource: sm.suggestion.oddsSource || 'calculated',
    bookmaker: sm.suggestion.bookmaker || 'unknown',
    prediction: {
      type: mapPickToType(sm.suggestion.pick) as PredictionType,
      label: sm.suggestion.pick,
      probability: sm.suggestion.confidence / 100,
      odds: sm.suggestion.odds,
    },
    confidenceScore: sm.suggestion.confidence,
    valuePercent: sm.suggestion.value === 'high' ? 25 : sm.suggestion.value === 'medium' ? 15 : 5,
    chaosLevel: 0.2,
    homeStyle: 'balanced' as any,
    awayStyle: 'balanced' as any,
  }));
  
  return {
    id,
    createdAt: now,
    matches,
    totalOdds,
    stake: stakeAmount,
    potentialWin: Number((stakeAmount * totalOdds).toFixed(2)),
    status: 'pending',
  };
}

function mapPickToType(pick: string): string {
  const p = pick.toLowerCase();
  if (p.includes('ms 1') || p === '1' || p.includes('ev')) return 'home';
  if (p.includes('ms 2') || p === '2' || p.includes('dep')) return 'away';
  if (p.includes('ms x') || p === 'x' || p.includes('berabere')) return 'draw';
  if (p.includes('üst 2.5') || p.includes('ust 2.5') || p.includes('ü2.5')) return 'over25';
  if (p.includes('alt 2.5') || p.includes('a2.5')) return 'under25';
  if (p.includes('üst 1.5') || p.includes('ust 1.5') || p.includes('ü1.5')) return 'over15';
  if (p.includes('alt 1.5') || p.includes('a1.5')) return 'under15';
  if (p.includes('iy üst') || p.includes('iy ust') || p.includes('iy 1.5') || p.includes('ht over')) return 'ht_over15';
  if (p.includes('iy alt') || p.includes('ht under')) return 'ht_under15';
  if (p.includes('iy/ms') || p.includes('ht/ft')) return 'htft';
  if (p.includes('kg var') || p.includes('btts') || p === 'var') return 'btts';
  if (p.includes('kg yok') || p === 'yok') return 'btts_no';
  if (p.includes('1x')) return 'home';
  if (p.includes('x2')) return 'away';
  return 'home';
}

// ============ TWITTER FORMATLAMA ============

/**
 * Challenge başlangıç tweeti
 */
export function formatChallengeStartTweet(state: ChallengeState): string {
  const lines: string[] = [];
  
  lines.push('🚀 100 → 10.000 TL CHALLENGE BAŞLIYOR!');
  lines.push('');
  lines.push('📋 Plan:');
  
  for (const step of state.plan) {
    const emoji = step.status === 'won' ? '✅' : step.status === 'active' ? '🔥' : '⏳';
    lines.push(`${emoji} Adım ${step.step}: ${step.description} (x${step.targetOdds.toFixed(2)})`);
  }
  
  lines.push('');
  lines.push(`💰 Başlangıç: ${state.config.startAmount} TL`);
  lines.push(`🎯 Hedef: ${state.config.targetAmount.toLocaleString('tr-TR')} TL`);
  lines.push('');
  lines.push('Algoritmamız maçları analiz ediyor...');
  lines.push('Her adımı buradan takip edin! 👇');
  lines.push('');
  lines.push('🔗 bilyoner-assistant.vercel.app');
  lines.push('#100to10K #Challenge #Bahis');
  
  return lines.join('\n');
}

/**
 * Challenge kupon tweeti (her adım için)
 */
export function formatChallengeCouponTweet(
  state: ChallengeState,
  step: ChallengeStep,
  coupon: BotCoupon
): string {
  const lines: string[] = [];
  
  const stepEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  const emoji = stepEmojis[step.step - 1] || '🔢';
  
  lines.push(`${emoji} CHALLENGE ADIM ${step.step}/5`);
  lines.push(`📊 ${step.description}`);
  lines.push('');
  
  // Maçlar
  let latestKickoff = new Date(0);
  coupon.matches.forEach((match) => {
    const kickoff = new Date(match.kickoff);
    if (kickoff > latestKickoff) latestKickoff = kickoff;
    const timeStr = kickoff.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
    // isLive bilgisini direkt kullan (JSON serialize/deserialize'da kaybolmaz)
    const matchAny = match as any;
    const isLive = matchAny.isLive === true;
    const elapsed = matchAny.elapsed;
    const liveTag = isLive ? ` 🔴CANLI${elapsed ? ` ${elapsed}'` : ''}` : '';
    
    lines.push(`⚽ ${match.homeTeam} vs ${match.awayTeam}${liveTag}`);
    lines.push(`   📌 ${match.prediction.label} @${match.prediction.odds.toFixed(2)} | ⏰ ${timeStr}`);
  });
  
  // Tahmini sonuçlanma saati (en geç maç + ~2 saat)
  const estimatedEnd = new Date(latestKickoff.getTime() + 2 * 60 * 60 * 1000);
  const endTimeStr = estimatedEnd.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  
  lines.push('');
  lines.push(`💻 Toplam Oran: ${coupon.totalOdds.toFixed(2)}`);
  lines.push(`💰 Yatırım: ${step.stakeAmount} TL`);
  lines.push(`🎯 Hedef: ${step.expectedReturn.toLocaleString('tr-TR')} TL`);
  lines.push(`⏱️ Tahmini Sonuç: ~${endTimeStr}`);
  lines.push('');
  
  // İlerleme çubuğu
  const progress = state.currentStep / state.config.maxCoupons * 100;
  const filledBlocks = Math.round(progress / 10);
  const progressBar = '▓'.repeat(filledBlocks) + '░'.repeat(10 - filledBlocks);
  lines.push(`📈 İlerleme: [${progressBar}] ${Math.round(progress)}%`);
  lines.push(`💼 Kasa: ${state.currentBalance.toLocaleString('tr-TR')} TL`);
  lines.push('');
  lines.push('#100to10K #Challenge #Bahis');
  
  return lines.join('\n');
}

/**
 * Challenge sonuç tweeti (kazanç/kayıp)
 */
export function formatChallengeResultTweet(
  state: ChallengeState,
  step: ChallengeStep,
  won: boolean,
  newBalance: number
): string {
  const lines: string[] = [];
  
  if (won) {
    lines.push(`✅ ADIM ${step.step}/5 BAŞARILI!`);
    lines.push('');
    lines.push(`💰 ${step.stakeAmount} TL → ${newBalance.toLocaleString('tr-TR')} TL`);
    
    if (state.currentStep >= state.config.maxCoupons) {
      lines.push('');
      lines.push('🏆🏆🏆 CHALLENGE TAMAMLANDI! 🏆🏆🏆');
      lines.push(`🎉 ${state.config.startAmount} TL → ${newBalance.toLocaleString('tr-TR')} TL`);
      lines.push(`📈 ${((newBalance / state.config.startAmount - 1) * 100).toFixed(0)}x getiri!`);
    } else {
      lines.push('');
      lines.push(`➡️ Sıradaki: Adım ${step.step + 1}/5`);
      lines.push(`🎯 Hedef: ${state.plan[step.step]?.description || '10.000 TL'}`);
    }
  } else {
    lines.push(`❌ ADIM ${step.step}/5 KAYIP`);
    lines.push('');
    lines.push(`💔 ${step.stakeAmount} TL kaybedildi`);
    lines.push('');
    lines.push('🔄 Challenge sona erdi. Yeni challenge yakında!');
    lines.push(`📊 Ulaşılan en yüksek: ${Math.max(state.currentBalance, step.stakeAmount).toLocaleString('tr-TR')} TL`);
  }
  
  lines.push('');
  lines.push('🔗 bilyoner-assistant.vercel.app');
  lines.push('#100to10K #Challenge #Bahis');
  
  return lines.join('\n');
}

// ============ STATE YÖNETİMİ ============

/**
 * Yeni challenge başlat
 */
export function initializeChallenge(config: ChallengeConfig = DEFAULT_CHALLENGE_CONFIG): ChallengeState {
  const plan = createChallengePlan(config);
  
  return {
    id: `CH-${Date.now().toString(36).toUpperCase()}`,
    startedAt: new Date().toISOString(),
    config,
    currentBalance: config.startAmount,
    initialBalance: config.startAmount,
    coupons: [],
    currentStep: 0,
    status: 'active',
    plan,
  };
}

/**
 * Challenge adımını tamamla
 */
export function advanceChallengeStep(
  state: ChallengeState,
  coupon: BotCoupon,
  won: boolean
): ChallengeState {
  const step = state.plan[state.currentStep];
  if (!step) return state;
  
  const newCoupon: ChallengeCoupon = {
    step: step.step,
    coupon,
    stakeAmount: step.stakeAmount,
    expectedReturn: step.expectedReturn,
    settledAt: new Date().toISOString(),
    won,
  };
  
  let newBalance: number;
  let newStatus: ChallengeState['status'];
  
  if (won) {
    newBalance = Number((step.stakeAmount * coupon.totalOdds).toFixed(2));
    const nextStep = state.currentStep + 1;
    
    if (nextStep >= state.config.maxCoupons || newBalance >= state.config.targetAmount) {
      newStatus = 'won';
    } else {
      newStatus = 'active';
      // Sonraki adımların stake'lerini güncelle
      state.plan[nextStep].stakeAmount = Math.round(newBalance);
    }
    
    return {
      ...state,
      currentBalance: newBalance,
      coupons: [...state.coupons, newCoupon],
      currentStep: state.currentStep + 1,
      status: newStatus,
      plan: state.plan.map((s, i) => ({
        ...s,
        status: i < state.currentStep ? 'won' as const : 
                i === state.currentStep ? (won ? 'won' as const : 'lost' as const) :
                s.status,
      })),
    };
  } else {
    newBalance = 0;
    newStatus = 'lost';
    
    return {
      ...state,
      currentBalance: newBalance,
      coupons: [...state.coupons, newCoupon],
      status: newStatus,
      plan: state.plan.map((s, i) => ({
        ...s,
        status: i < state.currentStep ? s.status : 
                i === state.currentStep ? 'lost' as const :
                s.status,
      })),
    };
  }
}
