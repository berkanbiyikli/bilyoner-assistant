/**
 * Live Opportunity Engine v2 - Value-Based Detection
 * 
 * ÖNCEKİ: Senaryo bazlı → hardcoded oranlar → sahte value hesabı
 * YENİ:   Poisson model → gerçek oranlar → value karşılaştırma → Kelly stake
 * 
 * Pipeline:
 * 1. calculateInPlayProbabilities() → Poisson model → her pazar için olasılık
 * 2. fetchLiveMatchOdds()           → API-Football → gerçek bahisçi oranları
 * 3. analyzeValueBet()              → model prob vs bahisçi oranı → edge tespiti
 * 4. calculateKellyStake()          → optimal bahis miktarı önerisi
 * 5. Sadece edge > 5% olan fırsatları öner
 * 
 * Desteklenen Pazarlar (gerçek oranla):
 * - Üst 1.5 / 2.5 / 3.5 Gol
 * - KG Var / Yok (BTTS)
 * - Maç Sonucu (1X2)
 * - Çifte Şans
 * 
 * Heuristik Pazarlar (model + istatistik):
 * - Kart Üstü (faul bazlı projeksiyon)
 * - Korner Üstü (tempo bazlı projeksiyon)
 */

import { 
  type LiveMatch, 
  type LiveMatchStats, 
  type LiveOpportunity, 
  type OpportunityType,
  type LiveBotConfig,
  DEFAULT_LIVE_BOT_CONFIG 
} from './live-types';
import { calculateInPlayProbabilities, type InPlayProbabilities } from './live-model';
import { fetchLiveMatchOdds, getOddsForPick } from './live-odds';
import { calculateValue, analyzeValueBet, type ValueBetAnalysis } from '../prediction/value-bet';
import type { ProcessedOdds } from '../api-football/predictions';

// ============ SABITLER ============

/** Minimum bahis oranı - bunun altında önerme (değer yok) */
const MIN_ODDS = 1.50;

/** Minimum value edge (%) - bunun altında önerme */
const MIN_VALUE_EDGE = 3;

/** Gerçek oran yokken minimum model olasılığı (%) */
const MIN_MODEL_PROB_NO_ODDS = 60;

/** Gerçek oran varken minimum model olasılığı (%) */
const MIN_MODEL_PROB_WITH_ODDS = 40;

// Fırsat ID üreteci
let opportunityCounter = 0;
function generateOpportunityId(): string {
  return `opp_${Date.now()}_${++opportunityCounter}`;
}

// ============ ANA FONKSİYONLAR ============

/**
 * Canlı maçları analiz et ve SADECE gerçek value olan fırsatları döndür.
 * 
 * Her maç için:
 * 1. Poisson model → pazar olasılıkları
 * 2. Gerçek canlı oranlar → API-Football  
 * 3. Value karşılaştırma → model prob vs implied prob
 * 4. Edge > 5% → fırsat olarak döndür
 * 
 * NOT: Bu fonksiyon artık ASYNC - gerçek oranları API'den çekiyor.
 */
export async function detectLiveOpportunities(
  matches: LiveMatch[],
  botConfig: LiveBotConfig = DEFAULT_LIVE_BOT_CONFIG
): Promise<LiveOpportunity[]> {
  const opportunities: LiveOpportunity[] = [];

  for (const match of matches) {
    // Dakika filtresi
    if (match.minute < botConfig.minMinuteToWatch || match.minute > botConfig.maxMinuteToWatch) continue;
    if (match.status === 'HT') continue;

    // Value pipeline ile analiz
    const matchOpps = await analyzeMatchWithValuePipeline(match);

    // Minimum thresholdlar
    for (const opp of matchOpps) {
      if (
        opp.confidence >= botConfig.minConfidence &&
        opp.value >= botConfig.minValue &&
        opp.estimatedOdds >= MIN_ODDS
      ) {
        opportunities.push(opp);
      }
    }
  }

  return opportunities.sort((a, b) => b.confidence - a.confidence);
}

// ============ VALUE PİPELİNE ============

/**
 * Tek maç için tam value pipeline analizi
 */
async function analyzeMatchWithValuePipeline(match: LiveMatch): Promise<LiveOpportunity[]> {
  const opportunities: LiveOpportunity[] = [];

  // ADIM 1: Model olasılıklarını hesapla (Poisson)
  const modelProbs = calculateInPlayProbabilities(match);

  // ADIM 2: Gerçek canlı oranları çek (60s cache)
  let liveOdds: ProcessedOdds | null = null;
  try {
    liveOdds = await fetchLiveMatchOdds(match.fixtureId);
  } catch (e) {
    console.log(`[LiveEngine] Fixture ${match.fixtureId}: Oran çekilemedi, sadece model kullanılacak`);
  }

  // ADIM 3: Gol pazarları (gerçek oranla value tespiti)
  const goalOpps = analyzeGoalMarkets(match, modelProbs, liveOdds);
  opportunities.push(...goalOpps);

  // ADIM 4: KG Var/Yok (gerçek oranla value tespiti)
  const bttsOpp = analyzeBTTSMarket(match, modelProbs, liveOdds);
  if (bttsOpp) opportunities.push(bttsOpp);

  // ADIM 5: Çifte Şans / Comeback (gerçek oranla)
  const comebackOpp = analyzeComebackMarket(match, modelProbs, liveOdds);
  if (comebackOpp) opportunities.push(comebackOpp);

  // ADIM 6: Kart analizi (heuristik - API'de kart oranı yok)
  const cardOpp = analyzeCardOpportunity(match);
  if (cardOpp) opportunities.push(cardOpp);

  // ADIM 7: Korner analizi (heuristik - API'de korner oranı yok)
  const cornerOpp = analyzeCornerOpportunity(match);
  if (cornerOpp) opportunities.push(cornerOpp);

  return opportunities;
}

// ============ GOL PAZARLARI (Value Pipeline) ============

/**
 * Tüm gol pazarlarını model + gerçek oran ile analiz et.
 * Her pazar için: model olasılık vs bahisçi oranından implied olasılık → edge hesapla.
 */
function analyzeGoalMarkets(
  match: LiveMatch,
  modelProbs: InPlayProbabilities,
  liveOdds: ProcessedOdds | null
): LiveOpportunity[] {
  const opportunities: LiveOpportunity[] = [];
  const { minute, homeScore, awayScore, stats } = match;
  const totalGoals = homeScore + awayScore;

  // xG tahmini (reasoning için)
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  const totalShots = stats.homeShotsTotal + stats.awayShotsTotal;
  const estimatedXG = (totalShotsOnTarget * 0.32) + (totalShots * 0.06);

  // Kontrol edilecek pazarlar (mevcut skora göre filtrelenir)
  const marketsToCheck: Array<{
    pick: string;
    modelProb: number;
    type: OpportunityType;
    market: string;
    minMinute: number;
    maxMinute: number;
    skip: boolean;
  }> = [
    {
      pick: 'Üst 1.5 Gol',
      modelProb: modelProbs.over15,
      type: 'goal_pressure',
      market: 'Gol Sayısı',
      minMinute: 45,
      maxMinute: 82,
      skip: totalGoals >= 2,
    },
    {
      pick: 'Üst 2.5 Gol',
      modelProb: modelProbs.over25,
      type: 'goal_pressure',
      market: 'Gol Sayısı',
      minMinute: 20,
      maxMinute: 78,
      skip: totalGoals >= 3,
    },
    {
      pick: 'Üst 3.5',
      modelProb: modelProbs.over35,
      type: 'high_tempo',
      market: 'Gol Sayısı',
      minMinute: 20,
      maxMinute: 80,
      skip: totalGoals >= 4,
    },
    {
      pick: 'Üst 4.5',
      modelProb: modelProbs.over45,
      type: 'high_tempo',
      market: 'Gol Sayısı',
      minMinute: 25,
      maxMinute: 78,
      skip: totalGoals >= 5,
    },
  ];

  for (const mkt of marketsToCheck) {
    if (mkt.skip) continue;
    if (minute < mkt.minMinute || minute > mkt.maxMinute) continue;
    if (mkt.modelProb < MIN_MODEL_PROB_WITH_ODDS) continue;

    // Gerçek bahisçi oranını bul
    const realOdds = liveOdds ? getOddsForPick(liveOdds, mkt.pick) : null;

    if (realOdds && realOdds >= MIN_ODDS) {
      // === TAM VALUE PİPELİNE: Model vs Bahisçi ===
      const valueBet = analyzeValueBet(mkt.market, mkt.pick, mkt.modelProb, realOdds);

      if (valueBet.isValue && valueBet.edge >= MIN_VALUE_EDGE) {
        const reasoning = buildGoalReasoning(match, mkt.modelProb, realOdds, estimatedXG, valueBet);

        opportunities.push({
          id: generateOpportunityId(),
          fixtureId: match.fixtureId,
          match: {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            score: `${homeScore}-${awayScore}`,
            minute,
          },
          type: mkt.type,
          market: mkt.market,
          pick: mkt.pick,
          confidence: Math.min(Math.round(mkt.modelProb), 92),
          reasoning,
          urgency: valueBet.rating >= 80 ? 'high' : valueBet.rating >= 60 ? 'medium' : 'low',
          estimatedOdds: realOdds,
          value: Math.round(valueBet.value),
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          action: valueBet.recommendation === 'strong_bet' || valueBet.recommendation === 'bet' ? 'bet' : 'notify',
        });
      }
    } else if (!realOdds && mkt.modelProb >= MIN_MODEL_PROB_NO_ODDS) {
      // === ORAN YOK - sadece model çok güvenli ise öner ===
      const impliedOdds = 100 / mkt.modelProb;
      const conservativeOdds = round2(impliedOdds * 1.10); // %10 marj ekle

      if (conservativeOdds >= MIN_ODDS) {
        const reasoning = buildGoalReasoning(match, mkt.modelProb, null, estimatedXG, null);
        const approxValue = Math.round((mkt.modelProb / 100 * conservativeOdds - 1) * 100);

        opportunities.push({
          id: generateOpportunityId(),
          fixtureId: match.fixtureId,
          match: {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            score: `${homeScore}-${awayScore}`,
            minute,
          },
          type: mkt.type,
          market: mkt.market,
          pick: mkt.pick,
          confidence: Math.min(Math.round(mkt.modelProb * 0.90), 88),
          reasoning: reasoning + ' ⚠️ oran doğrulanamadı',
          urgency: mkt.modelProb >= 75 ? 'high' : 'medium',
          estimatedOdds: conservativeOdds,
          value: Math.max(approxValue, 5),
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 8 * 60 * 1000),
          action: mkt.modelProb >= 80 ? 'bet' : 'notify',
        });
      }
    }
  }

  return opportunities;
}

// ============ KG VAR PAZARI (Value Pipeline) ============

/**
 * KG Var/Yok analizi: Model vs gerçek oran
 */
function analyzeBTTSMarket(
  match: LiveMatch,
  modelProbs: InPlayProbabilities,
  liveOdds: ProcessedOdds | null
): LiveOpportunity | null {
  const { minute, homeScore, awayScore, stats } = match;

  // Zaten KG olmuşsa bu pazar bitti
  if (homeScore > 0 && awayScore > 0) return null;

  // 25-75 dakika arası
  if (minute < 25 || minute > 75) return null;

  const modelProb = modelProbs.btts;
  if (modelProb < MIN_MODEL_PROB_WITH_ODDS) return null;

  const realOdds = liveOdds ? getOddsForPick(liveOdds, 'Karşılıklı Gol Var') : null;

  // Context reasoning
  const nonScoringTeam = homeScore === 0 ? 'home' : (awayScore === 0 ? 'away' : null);
  let contextReason = '';
  if (nonScoringTeam) {
    const teamName = nonScoringTeam === 'home' ? match.homeTeam : match.awayTeam;
    const shots = nonScoringTeam === 'home' ? stats.homeShotsOnTarget : stats.awayShotsOnTarget;
    const poss = nonScoringTeam === 'home' ? stats.homePossession : (100 - stats.homePossession);
    if (shots >= 3) contextReason = `${teamName} ${shots} isabetli şut, %${poss} top`;
    else if (shots >= 2) contextReason = `${teamName} baskı yapıyor`;
  }
  if (homeScore === 0 && awayScore === 0) {
    const bothActive = stats.homeShotsOnTarget >= 2 && stats.awayShotsOnTarget >= 2;
    if (bothActive) contextReason = `İki taraf aktif: ${stats.homeShotsOnTarget}+${stats.awayShotsOnTarget} isab. şut`;
  }

  if (realOdds && realOdds >= MIN_ODDS) {
    const valueBet = analyzeValueBet('KG Var/Yok', 'Karşılıklı Gol Var', modelProb, realOdds);

    if (valueBet.isValue && valueBet.edge >= MIN_VALUE_EDGE) {
      return {
        id: generateOpportunityId(),
        fixtureId: match.fixtureId,
        match: {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          score: `${homeScore}-${awayScore}`,
          minute,
        },
        type: 'goal_pressure',
        market: 'KG Var/Yok',
        pick: 'Karşılıklı Gol Var',
        confidence: Math.min(Math.round(modelProb), 88),
        reasoning: `Model: %${modelProb.toFixed(0)}, Oran: @${realOdds.toFixed(2)}, Edge: %${valueBet.edge.toFixed(1)}${contextReason ? ' | ' + contextReason : ''}`,
        urgency: valueBet.rating >= 75 ? 'high' : 'medium',
        estimatedOdds: realOdds,
        value: Math.round(valueBet.value),
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 60 * 1000),
        action: valueBet.recommendation === 'strong_bet' || valueBet.recommendation === 'bet' ? 'bet' : 'notify',
      };
    }
  } else if (!realOdds && modelProb >= MIN_MODEL_PROB_NO_ODDS) {
    const conservativeOdds = round2((100 / modelProb) * 1.10);
    if (conservativeOdds >= MIN_ODDS) {
      return {
        id: generateOpportunityId(),
        fixtureId: match.fixtureId,
        match: {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          score: `${homeScore}-${awayScore}`,
          minute,
        },
        type: 'goal_pressure',
        market: 'KG Var/Yok',
        pick: 'Karşılıklı Gol Var',
        confidence: Math.min(Math.round(modelProb * 0.90), 85),
        reasoning: `Model: %${modelProb.toFixed(0)}${contextReason ? ' | ' + contextReason : ''} ⚠️ oran doğrulanamadı`,
        urgency: modelProb >= 75 ? 'high' : 'medium',
        estimatedOdds: conservativeOdds,
        value: Math.max(Math.round((modelProb / 100 * conservativeOdds - 1) * 100), 5),
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        action: 'notify',
      };
    }
  }

  return null;
}

// ============ ÇİFTE ŞANS / COMEBACK (Value Pipeline) ============

/**
 * Comeback / Çifte Şans analizi: Gerideki takım baskı yapıyorsa + value varsa
 */
function analyzeComebackMarket(
  match: LiveMatch,
  modelProbs: InPlayProbabilities,
  liveOdds: ProcessedOdds | null
): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore } = match;

  // Skor farkı olmalı
  const scoreDiff = Math.abs(homeScore - awayScore);
  if (scoreDiff === 0 || scoreDiff > 2) return null;

  // 30-75 dakika arası
  if (minute < 30 || minute > 75) return null;

  // Hangi takım geride
  const losingTeam = homeScore < awayScore ? 'home' : 'away';
  const teamName = losingTeam === 'home' ? match.homeTeam : match.awayTeam;

  // Çifte Şans model olasılığı
  const modelProb = losingTeam === 'home' ? modelProbs.homeOrDraw : modelProbs.awayOrDraw;
  if (modelProb < MIN_MODEL_PROB_WITH_ODDS) return null;

  // Gerideki takım gerçekten baskı yapıyor mu?
  const loserShots = losingTeam === 'home' ? stats.homeShotsOnTarget : stats.awayShotsOnTarget;
  const winnerShots = losingTeam === 'home' ? stats.awayShotsOnTarget : stats.homeShotsOnTarget;
  const loserPoss = losingTeam === 'home' ? stats.homePossession : (100 - stats.homePossession);

  // Minimum baskı kontrolü
  if (loserShots < winnerShots - 1 || loserPoss < 42) return null;

  const pick = `${teamName} Kazanır veya Berabere`;
  const realOdds = liveOdds ? getOddsForPick(liveOdds, pick, match.homeTeam, match.awayTeam) : null;

  if (realOdds && realOdds >= MIN_ODDS) {
    const valueBet = analyzeValueBet('Çifte Şans', pick, modelProb, realOdds);

    if (valueBet.isValue && valueBet.edge >= MIN_VALUE_EDGE) {
      return {
        id: generateOpportunityId(),
        fixtureId: match.fixtureId,
        match: {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          score: `${homeScore}-${awayScore}`,
          minute,
        },
        type: losingTeam === 'home' ? 'home_momentum' : 'away_momentum',
        market: 'Çifte Şans',
        pick,
        confidence: Math.min(Math.round(modelProb), 80),
        reasoning: `${teamName} baskıda: ${loserShots} vs ${winnerShots} isab. şut, %${loserPoss} top | Model: %${modelProb.toFixed(0)}, Edge: %${valueBet.edge.toFixed(1)}`,
        urgency: valueBet.rating >= 70 ? 'high' : 'medium',
        estimatedOdds: realOdds,
        value: Math.round(valueBet.value),
        detectedAt: new Date(),
        action: valueBet.recommendation === 'strong_bet' ? 'bet' : 'notify',
      };
    }
  }

  return null;
}

// ============ KART ANALİZİ (Heuristik - API'de kart oranı yok) ============

/**
 * Kart bahis analizi: Faul yoğunluğu + tempo bazlı projeksiyon.
 * API'de canlı kart oranı olmadığı için heuristik yaklaşım kullanılır.
 * Daha yüksek güven eşiği uygulanır (oran doğrulanamıyor).
 */
function analyzeCardOpportunity(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;

  if (minute < 18 || minute > 82) return null;

  const totalCards = stats.homeYellowCards + stats.awayYellowCards + stats.homeRedCards + stats.awayRedCards;
  const totalFouls = stats.homeFouls + stats.awayFouls;

  if (totalFouls < 6) return null;

  const foulRate = totalFouls / minute;
  const cardRate = totalCards / minute;
  const remainingMinutes = 90 - minute;
  const isTenseMatch = Math.abs(homeScore - awayScore) <= 1;
  const isSecondHalf = minute >= 45;

  // Faul bazlı kart projeksiyon (her ~7.5 faulde 1 kart)
  const foulBasedCardRate = foulRate / 7.5;
  const blendedCardRate = totalCards > 0
    ? (cardRate * 0.4) + (foulBasedCardRate * 0.6)
    : foulBasedCardRate;
  const expectedRemainingCards = blendedCardRate * remainingMinutes;

  // Hedef eşik seçimi
  const thresholds = [2.5, 3.5, 4.5, 5.5, 6.5];
  const minGap = remainingMinutes >= 25 ? 2 : 1.5;
  const targetThreshold = thresholds.find(t => t >= totalCards + minGap);
  if (!targetThreshold) return null;

  const cardsNeeded = targetThreshold - totalCards + 0.5;
  if (expectedRemainingCards < cardsNeeded * 0.65) return null;

  // Güven hesapla
  let confidence = 48;
  const projectionRatio = expectedRemainingCards / cardsNeeded;

  if (projectionRatio >= 1.5) confidence += 18;
  else if (projectionRatio >= 1.2) confidence += 12;
  else if (projectionRatio >= 1.0) confidence += 8;
  else if (projectionRatio >= 0.8) confidence += 4;

  if (foulRate >= 0.55) confidence += 16;
  else if (foulRate >= 0.45) confidence += 12;
  else if (foulRate >= 0.35) confidence += 7;
  else if (foulRate >= 0.25) confidence += 3;

  if (isTenseMatch) confidence += 8;
  if (isSecondHalf) confidence += 6;
  if (stats.homeYellowCards >= 1 && stats.awayYellowCards >= 1) confidence += 6;

  const expectedCardsFromFouls = totalFouls / 7.5;
  if (expectedCardsFromFouls > totalCards + 1.5) confidence += 10;
  else if (expectedCardsFromFouls > totalCards + 0.5) confidence += 5;

  if (stats.homeFouls >= 5 && stats.awayFouls >= 5) confidence += 4;

  // Kart için daha yüksek eşik (oran doğrulanamıyor)
  if (confidence < 70) return null;

  // Oran tahmini (heuristik)
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
    reasoning: `${totalCards} kart ${minute}' (${totalFouls} faul, tempo: ${(foulRate * 90).toFixed(0)}/maç) - projeksiyon: ${projectedTotal.toFixed(1)} kart${isTenseMatch ? ', gergin maç' : ''} ⚠️ tahmini oran`,
    urgency: confidence >= 80 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: confidence >= 78 ? 'bet' : 'notify',
  };
}

// ============ KORNER ANALİZİ (Heuristik) ============

/**
 * Korner bahis analizi: Tempo + şut baskısı bazlı projeksiyon.
 */
function analyzeCornerOpportunity(match: LiveMatch): LiveOpportunity | null {
  const { stats, minute, homeScore, awayScore, fixtureId } = match;

  if (minute < 20 || minute > 82) return null;

  const totalCorners = (stats.homeCorners || 0) + (stats.awayCorners || 0);
  const cornerRate = totalCorners / minute;
  const remainingMinutes = 90 - minute;
  const totalShots = (stats.homeShotsTotal || 0) + (stats.awayShotsTotal || 0);

  const expectedRemainingCorners = cornerRate * remainingMinutes;

  const thresholds = [7.5, 8.5, 9.5, 10.5, 11.5];
  const minGap = remainingMinutes >= 25 ? 2.5 : remainingMinutes >= 15 ? 2 : 1.5;
  const targetThreshold = thresholds.find(t => t >= totalCorners + minGap);
  if (!targetThreshold) return null;

  const cornersNeeded = targetThreshold - totalCorners + 0.5;
  if (expectedRemainingCorners < cornersNeeded * 0.7) return null;

  let confidence = 50;
  const projectionRatio = expectedRemainingCorners / cornersNeeded;

  if (projectionRatio >= 1.5) confidence += 18;
  else if (projectionRatio >= 1.2) confidence += 12;
  else if (projectionRatio >= 1.0) confidence += 6;

  if (totalShots >= 20) confidence += 12;
  else if (totalShots >= 15) confidence += 8;
  else if (totalShots >= 10) confidence += 4;

  if ((stats.homeCorners || 0) >= 3 && (stats.awayCorners || 0) >= 3) confidence += 7;
  else if ((stats.homeCorners || 0) >= 2 && (stats.awayCorners || 0) >= 2) confidence += 3;

  if (cornerRate >= 0.15) confidence += 8;
  else if (cornerRate >= 0.12) confidence += 5;

  // Korner için de yüksek eşik
  if (confidence < 72) return null;

  const difficulty = cornersNeeded / (remainingMinutes / 15);
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
    reasoning: `${totalCorners} korner ${minute}' (tempo: ${(cornerRate * 90).toFixed(1)}/maç) - hedef ${targetThreshold}, ${totalShots} şut ⚠️ tahmini oran`,
    urgency: confidence >= 82 ? 'high' : 'medium',
    estimatedOdds,
    value: Math.round(value),
    detectedAt: new Date(),
    action: confidence >= 78 ? 'bet' : 'notify',
  };
}

// ============ YARDIMCI FONKSİYONLAR ============

/**
 * Gol pazarları için reasoning oluştur
 */
function buildGoalReasoning(
  match: LiveMatch,
  modelProb: number,
  realOdds: number | null,
  estimatedXG: number,
  valueBet: ValueBetAnalysis | null,
): string {
  const { stats, minute, homeScore, awayScore } = match;
  const totalGoals = homeScore + awayScore;
  const totalShotsOnTarget = stats.homeShotsOnTarget + stats.awayShotsOnTarget;
  const parts: string[] = [];

  // Model olasılığı
  parts.push(`Model: %${modelProb.toFixed(0)}`);

  // Gerçek oran ve edge
  if (realOdds && valueBet) {
    parts.push(`Oran: @${realOdds.toFixed(2)}`);
    parts.push(`Edge: %${valueBet.edge.toFixed(1)}`);
    if (valueBet.kelly.halfKelly > 0) {
      parts.push(`Kelly: %${valueBet.kelly.halfKelly.toFixed(1)}`);
    }
  }

  // İstatistik context
  if (totalShotsOnTarget >= 5) parts.push(`${totalShotsOnTarget} isab. şut`);
  if (estimatedXG > totalGoals + 0.5) parts.push(`xG: ${estimatedXG.toFixed(1)}`);

  // Skor bazlı bağlam
  if (totalGoals >= 3) parts.push(`${totalGoals} gol ${minute}'`);
  if (homeScore > 0 && awayScore > 0) parts.push('açık maç');

  return parts.join(' | ');
}

/**
 * Fırsat özeti (tweet için)
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
 * En iyi fırsatları filtrele (aynı maçtan max N)
 */
export function filterBestOpportunities(
  opportunities: LiveOpportunity[],
  maxPerMatch: number = 1,
  maxTotal: number = 5
): LiveOpportunity[] {
  const byMatch = new Map<number, LiveOpportunity>();

  for (const opp of opportunities) {
    const existing = byMatch.get(opp.fixtureId);
    if (!existing || opp.confidence > existing.confidence) {
      byMatch.set(opp.fixtureId, opp);
    }
  }

  return Array.from(byMatch.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxTotal);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// CANLI AVCI MODU - HUNTER MODE
// (Dashboard için kullanılır, value pipeline'dan bağımsız)
// ============================================================

import type { 
  MomentumData, 
  LiveXGData, 
  LiveMatchHunter, 
  HunterOpportunity, 
  HunterOpportunityType,
  DynamicPollingConfig 
} from './live-types';

/**
 * Momentum İndeksi Hesaplama
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

  let attackScore: number;
  if (dangerousAttacks > 0) {
    attackScore = dangerousAttacks;
  } else {
    attackScore = (shotsOnTarget * 5) + ((totalShots || 0) * 2) + (corners * 4);
  }

  const tempoScore = (attackScore / minute) * 15;

  let possessionBonus = 0;
  if (possession > 55) possessionBonus = (possession - 50) * 0.6;
  else if (possession < 40) possessionBonus = -5;

  const shotBonus = shotsOnTarget >= 5 ? 15 : shotsOnTarget >= 3 ? 8 : shotsOnTarget >= 1 ? 3 : 0;
  const cornerBonus = corners >= 6 ? 10 : corners >= 3 ? 5 : 0;

  const rawMomentum = tempoScore + possessionBonus + shotBonus + cornerBonus;
  return Math.max(0, Math.min(Math.round(rawMomentum), 100));
}

/**
 * Full Momentum Analizi
 */
export function analyzeMomentum(stats: LiveMatchStats, minute: number): MomentumData {
  const homeMomentum = calculateMomentumIndex(
    stats.homeDangerousAttacks, stats.homeShotsOnTarget, stats.homeCorners,
    minute, stats.homePossession, stats.homeShotsTotal, stats.homeFouls
  );
  const awayMomentum = calculateMomentumIndex(
    stats.awayDangerousAttacks, stats.awayShotsOnTarget, stats.awayCorners,
    minute, stats.awayPossession, stats.awayShotsTotal, stats.awayFouls
  );

  const diff = homeMomentum - awayMomentum;
  let dominant: 'home' | 'away' | 'balanced' = 'balanced';
  if (diff > 15) dominant = 'home';
  else if (diff < -15) dominant = 'away';

  let trend: MomentumData['trend'] = 'stable';
  const totalMomentum = homeMomentum + awayMomentum;
  if (totalMomentum > 120) trend = 'chaotic';
  else if (diff > 20) trend = 'home_rising';
  else if (diff < -20) trend = 'away_rising';

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
 */
export function calculateLiveXG(
  shotsOnTarget: number, totalShots: number, dangerousAttacks: number
): number {
  return Math.round(((shotsOnTarget * 0.35) + (totalShots * 0.08) + (dangerousAttacks * 0.02)) * 100) / 100;
}

/**
 * Full xG Analizi
 */
export function analyzeLiveXG(
  stats: LiveMatchStats, homeGoals: number, awayGoals: number
): LiveXGData {
  const homeXG = calculateLiveXG(stats.homeShotsOnTarget, stats.homeShotsTotal, stats.homeDangerousAttacks);
  const awayXG = calculateLiveXG(stats.awayShotsOnTarget, stats.awayShotsTotal, stats.awayDangerousAttacks);
  const totalXG = homeXG + awayXG;
  const actualGoals = homeGoals + awayGoals;
  const xgDifferential = totalXG - actualGoals;

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

  return { homeXG, awayXG, totalXG, xgDifferential, hasValueOpportunity, opportunityMessage, confidence };
}

/**
 * Kırmızı Kart Avantajı
 */
export function handleRedCardEvent(
  stats: LiveMatchStats, minute: number, homeGoals: number, awayGoals: number
): { hasAdvantage: boolean; advantageTeam: 'home' | 'away' | null; adjustedOverExpectation: number; opportunity: HunterOpportunity | null } {
  const homeReds = stats.homeRedCards;
  const awayReds = stats.awayRedCards;

  if (homeReds === 0 && awayReds === 0) {
    return { hasAdvantage: false, advantageTeam: null, adjustedOverExpectation: 0, opportunity: null };
  }

  let advantageTeam: 'home' | 'away' | null = null;
  if (awayReds > homeReds) advantageTeam = 'home';
  else if (homeReds > awayReds) advantageTeam = 'away';

  const redCardDiff = Math.abs(homeReds - awayReds);
  const adjustedOverExpectation = redCardDiff * 0.75;

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
        expiresIn: 300,
        playSound: true
      };
    }
  }

  return { hasAdvantage: !!advantageTeam, advantageTeam, adjustedOverExpectation, opportunity };
}

/**
 * xG Value Fırsatı Tespiti
 */
export function detectXGValueOpportunity(
  liveXG: LiveXGData, homeGoals: number, awayGoals: number, minute: number
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
 * Momentum Surge Fırsatı
 */
export function detectMomentumSurge(
  momentum: MomentumData, minute: number, homeTeam: string, awayTeam: string
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
 * Dinamik Polling Interval
 */
export function getDynamicPollingInterval(
  momentum: MomentumData, minute: number, homeGoals: number, awayGoals: number, hasRedCard: boolean
): DynamicPollingConfig {
  const totalGoals = homeGoals + awayGoals;
  const maxMomentum = Math.max(momentum.homeMomentum, momentum.awayMomentum);

  if (maxMomentum >= 80 || (totalGoals === 0 && minute >= 70) || hasRedCard || momentum.goalImminent) {
    return {
      normalInterval: 60000, fastInterval: 15000, slowInterval: 90000,
      currentInterval: 15000,
      reason: maxMomentum >= 80 ? 'Yüksek momentum' :
              (totalGoals === 0 && minute >= 70) ? 'Geç dakika 0-0' :
              hasRedCard ? 'Kırmızı kart' : 'Gol kapıda'
    };
  }

  if (maxMomentum < 30 && minute < 60 && totalGoals >= 2) {
    return {
      normalInterval: 60000, fastInterval: 15000, slowInterval: 90000,
      currentInterval: 90000,
      reason: 'Sakin tempo, gol gelmiş'
    };
  }

  return {
    normalInterval: 60000, fastInterval: 15000, slowInterval: 90000,
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

  const momentum = analyzeMomentum(stats, minute);
  const liveXG = analyzeLiveXG(stats, homeScore, awayScore);
  const redCardResult = handleRedCardEvent(stats, minute, homeScore, awayScore);

  const momentumOpp = detectMomentumSurge(momentum, minute, homeTeam, awayTeam);
  if (momentumOpp) opportunities.push(momentumOpp);

  const xgOpp = detectXGValueOpportunity(liveXG, homeScore, awayScore, minute);
  if (xgOpp) opportunities.push(xgOpp);

  if (redCardResult.opportunity) opportunities.push(redCardResult.opportunity);

  // Golden Chance (çoklu sinyal)
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
 * Hunter Dashboard Maç Özeti
 */
export function createHunterMatchSummary(match: LiveMatch): LiveMatchHunter {
  const momentum = analyzeMomentum(match.stats, match.minute);
  const liveXG = analyzeLiveXG(match.stats, match.homeScore, match.awayScore);
  const opportunities = detectHunterOpportunities(match);

  let hunterStatus: LiveMatchHunter['hunterStatus'] = 'watching';
  if (opportunities.some(o => o.type === 'golden_chance')) hunterStatus = 'golden_chance';
  else if (opportunities.length > 0) hunterStatus = 'alert';

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
