/**
 * Bot Engine - Merkezi Tahmin ve Kupon Seçim Motoru
 * 
 * UI'daki mor kutu önerilerini (betSuggestions) kullanarak
 * en iyi 3'lü kupon kombinasyonunu seçer.
 */

import { 
  scanMatches, 
  type MatchAnalysis, 
  type ScannerResult,
  type ScanInput 
} from '../prediction/scanner';
import {
  createTeamProfile,
  analyzeStyleMatchup,
  runMonteCarloSimulation,
  createSimStats,
  STYLE_DESCRIPTIONS,
  type PlayStyle,
  type TeamProfile,
} from '../analysis';
import { calculateKellyStake } from '../prediction/value-bet';
import { getDailyMatches } from '../api-football/daily-matches';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { 
  DEFAULT_BOT_CONFIG,
  type BotMatch, 
  type BotCoupon, 
  type BotConfig,
} from './types';

import { LEAGUE_DNA } from '../prediction/scanner';

// Base URL for internal API calls
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// ============ VERİ DÖNÜŞTÜRME ============

// Default odds - League DNA yoksa kullanılacak
const DEFAULT_ODDS = {
  home: 2.10,
  draw: 3.40,
  away: 3.20,
  over25: 1.90,
  under25: 1.90,
  bttsYes: 1.85,
  bttsNo: 1.95,
};

/**
 * League DNA'dan odds hesaplar
 */
function calculateOddsFromDNA(leagueId: number): ScanInput['odds'] {
  const dna = LEAGUE_DNA[leagueId];
  
  if (!dna) {
    return DEFAULT_ODDS;
  }
  
  // Olasılıktan oran hesapla (1/probability + margin)
  const margin = 1.08; // %8 margin
  
  const homeProb = dna.homeWinRate;
  const drawProb = dna.drawRate;
  const awayProb = 1 - homeProb - drawProb;
  
  return {
    home: Math.round((1 / homeProb) * margin * 100) / 100,
    draw: Math.round((1 / drawProb) * margin * 100) / 100,
    away: Math.round((1 / awayProb) * margin * 100) / 100,
    over25: Math.round((1 / dna.over25Rate) * margin * 100) / 100,
    under25: Math.round((1 / (1 - dna.over25Rate)) * margin * 100) / 100,
    bttsYes: Math.round((1 / dna.bttsRate) * margin * 100) / 100,
    bttsNo: Math.round((1 / (1 - dna.bttsRate)) * margin * 100) / 100,
  };
}

/**
 * DailyMatchFixture'dan ScanInput formatına dönüştürür
 */
function convertToScanInput(match: DailyMatchFixture): ScanInput {
  // Odds: Önce betSuggestions, yoksa League DNA'dan hesapla
  let odds: ScanInput['odds'];
  
  if (match.betSuggestions && match.betSuggestions.length > 0) {
    odds = {
      home: match.betSuggestions.find(b => b.pick === 'Ev Sahibi')?.odds,
      draw: match.betSuggestions.find(b => b.pick === 'Beraberlik')?.odds,
      away: match.betSuggestions.find(b => b.pick === 'Deplasman')?.odds,
      over25: match.betSuggestions.find(b => b.pick === 'Üst 2.5')?.odds,
      under25: match.betSuggestions.find(b => b.pick === 'Alt 2.5')?.odds,
      bttsYes: match.betSuggestions.find(b => b.pick === 'KG Var')?.odds,
      bttsNo: match.betSuggestions.find(b => b.pick === 'KG Yok')?.odds,
    };
  } else {
    // League DNA'dan varsayılan odds hesapla
    odds = calculateOddsFromDNA(match.league.id);
  }
  
  // Default stats - veri yoksa ortalama değerler kullan
  const defaultHomeStats = {
    goalsScored: 7,  // 5 maçta ~1.4 gol ortalaması
    goalsConceded: 5, // 5 maçta ~1.0 gol yeme
    matchesPlayed: 5,
  };
  
  const defaultAwayStats = {
    goalsScored: 5,  // Deplasmanlar biraz daha az gol
    goalsConceded: 6,
    matchesPlayed: 5,
  };

  return {
    fixtureId: match.id,
    homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
    awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
    league: { id: match.league.id, name: match.league.name },
    kickoff: new Date(match.timestamp * 1000).toISOString(),
    homeStats: match.teamStats ? {
      goalsScored: match.teamStats.homeGoalsScored || 0,
      goalsConceded: match.teamStats.homeGoalsConceded || 0,
      matchesPlayed: 5,
    } : defaultHomeStats,
    awayStats: match.teamStats ? {
      goalsScored: match.teamStats.awayGoalsScored || 0,
      goalsConceded: match.teamStats.awayGoalsConceded || 0,
      matchesPlayed: 5,
    } : defaultAwayStats,
    odds,
    h2h: match.h2hSummary ? {
      homeWins: match.h2hSummary.homeWins,
      draws: match.h2hSummary.draws,
      awayWins: match.h2hSummary.awayWins,
      totalMatches: match.h2hSummary.totalMatches,
    } : undefined,
  };
}

/**
 * Günün maçlarını çeker ve ScanInput formatına dönüştürür
 */
async function fetchAndPrepareMatches(): Promise<ScanInput[]> {
  const dailyMatches = await getDailyMatches();
  
  if (!dailyMatches || dailyMatches.length === 0) {
    console.log('[Bot] Günün maçları bulunamadı');
    return [];
  }
  
  // Sadece yaklaşan maçları al (canlı veya bitmiş olanları atla)
  const upcomingMatches = dailyMatches.filter(m => m.status.isUpcoming);
  
  console.log(`[Bot] ${upcomingMatches.length}/${dailyMatches.length} yaklaşan maç bulundu`);
  
  return upcomingMatches.map(convertToScanInput);
}

// ============ BET SUGGESTIONS (MOR KUTU) ============

interface MatchWithBetSuggestions {
  match: DailyMatchFixture;
  betSuggestions: BetSuggestion[];
}

/**
 * Her maç için mor kutu önerilerini (betSuggestions) çeker
 */
async function fetchBetSuggestions(matches: DailyMatchFixture[]): Promise<MatchWithBetSuggestions[]> {
  const results: MatchWithBetSuggestions[] = [];
  
  for (const match of matches) {
    try {
      // match-detail API'sinden betSuggestions çek
      const res = await fetch(`${BASE_URL}/api/match-detail?fixtureId=${match.id}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!res.ok) {
        console.log(`[Bot] Match detail alınamadı: ${match.id}`);
        continue;
      }
      
      const data = await res.json();
      
      if (data.betSuggestions && data.betSuggestions.length > 0) {
        results.push({
          match,
          betSuggestions: data.betSuggestions,
        });
        console.log(`[Bot] ${match.homeTeam.name} vs ${match.awayTeam.name}: ${data.betSuggestions.length} öneri`);
      }
    } catch (error) {
      console.error(`[Bot] BetSuggestions alınamadı: ${match.id}`, error);
    }
  }
  
  return results;
}

// ============ KUPON SEÇİM ALGORİTMASI ============

interface CandidateMatch {
  match: DailyMatchFixture;
  bestSuggestion: BetSuggestion;
  score: number;              // Toplam puan (sıralama için)
  prediction: BotMatch['prediction'];
}

/**
 * Günün maçlarından en iyi 3'lü kuponu oluşturur
 * Mor kutu önerilerini (betSuggestions) kullanır
 */
export async function generateBotCoupon(
  config: BotConfig = DEFAULT_BOT_CONFIG,
  currentBankroll: number
): Promise<BotCoupon | null> {
  // 1. Günün maçlarını çek
  const dailyMatches = await getDailyMatches();
  
  if (!dailyMatches || dailyMatches.length === 0) {
    console.log('[Bot] Günün maçları bulunamadı');
    return null;
  }
  
  // Sadece yaklaşan maçları al
  const upcomingMatches = dailyMatches.filter(m => m.status.isUpcoming);
  console.log(`[Bot] ${upcomingMatches.length}/${dailyMatches.length} yaklaşan maç bulundu`);
  
  if (upcomingMatches.length === 0) {
    console.log('[Bot] Yaklaşan maç bulunamadı');
    return null;
  }
  
  // 2. Her maç için mor kutu önerilerini çek
  const matchesWithSuggestions = await fetchBetSuggestions(upcomingMatches);
  
  if (matchesWithSuggestions.length === 0) {
    console.log('[Bot] BetSuggestions bulunamadı, fallback to scanner...');
    // Fallback: Eski Poisson sistemini kullan
    return await generateBotCouponFallback(config, currentBankroll);
  }
  
  console.log(`[Bot] ${matchesWithSuggestions.length} maçta mor kutu önerileri bulundu`);
  
  // 3. En iyi önerileri filtrele ve puanla
  const candidates = filterAndScoreBetSuggestions(matchesWithSuggestions, config);
  
  if (candidates.length < config.matchCount) {
    console.log(`[Bot] Yeterli aday bulunamadı: ${candidates.length}/${config.matchCount}`);
    return null;
  }
  
  // 4. En iyi kombinasyonu seç
  const selectedMatches = selectBestTripleFromSuggestions(candidates, config);
  
  if (selectedMatches.length < config.matchCount) {
    console.log('[Bot] Optimal kombinasyon bulunamadı');
    return null;
  }
  
  // 5. Stake hesapla
  const totalOdds = selectedMatches.reduce((acc, m) => acc * m.prediction.odds, 1);
  
  // Sabit stake 
  let stake = Math.min(currentBankroll, config.maxStake);
  stake = Math.round(stake * 100) / 100;
  
  // 6. Kupon oluştur
  const coupon: BotCoupon = {
    id: generateCouponId(),
    createdAt: new Date(),
    matches: selectedMatches.map(c => convertCandidateToBotMatch(c)),
    totalOdds: Math.round(totalOdds * 100) / 100,
    stake,
    potentialWin: Math.round(stake * totalOdds * 100) / 100,
    status: 'pending',
  };
  
  console.log(`[Bot] Kupon oluşturuldu: ${coupon.id}`);
  console.log(`[Bot] Toplam oran: ${coupon.totalOdds}, Stake: ${coupon.stake} TL`);
  console.log(`[Bot] Mor kutu önerileri kullanıldı! ✅`);
  
  return coupon;
}

/**
 * Mor kutu önerilerini filtreler ve puanlar
 */
function filterAndScoreBetSuggestions(
  matchesWithSuggestions: MatchWithBetSuggestions[],
  config: BotConfig
): CandidateMatch[] {
  const now = new Date();
  const minKickoff = new Date(now.getTime() + config.minKickoffMinutes * 60 * 1000);
  const maxKickoff = new Date(now.getTime() + config.maxKickoffHours * 60 * 60 * 1000);
  
  const candidates: CandidateMatch[] = [];
  
  for (const { match, betSuggestions } of matchesWithSuggestions) {
    const kickoff = new Date(match.timestamp * 1000);
    
    // Zaman filtresi
    if (kickoff < minKickoff || kickoff > maxKickoff) continue;
    
    // En iyi mor kutu önerisini bul (confidence'a göre)
    const validSuggestions = betSuggestions
      .filter(s => s.confidence >= 60) // Min %60 güven
      .filter(s => s.odds >= config.minMatchOdds && s.odds <= config.maxMatchOdds)
      .filter(s => ['goals', 'btts', 'result'].includes(s.type)) // Sadece temel bahisler
      .sort((a, b) => b.confidence - a.confidence);
    
    if (validSuggestions.length === 0) continue;
    
    const bestSuggestion = validSuggestions[0];
    
    // Prediction oluştur
    const prediction: BotMatch['prediction'] = {
      type: mapBetPickToType(bestSuggestion.pick),
      label: `${bestSuggestion.pick} (${bestSuggestion.confidence}%)`,
      probability: bestSuggestion.confidence / 100,
      odds: bestSuggestion.odds,
    };
    
    // Skor hesapla
    const score = calculateSuggestionScore(bestSuggestion, match);
    
    candidates.push({
      match,
      bestSuggestion,
      score,
      prediction,
    });
  }
  
  // Puana göre sırala
  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Mor kutu önerisi için puan hesaplar
 */
function calculateSuggestionScore(suggestion: BetSuggestion, match: DailyMatchFixture): number {
  let score = 0;
  
  // Confidence (0-100) - ana etken
  score += suggestion.confidence * 0.4;
  
  // Value değeri (high = +15, medium = +8, low = +0)
  if (suggestion.value === 'high') score += 15;
  else if (suggestion.value === 'medium') score += 8;
  
  // Oran bonusu (1.5-2.0 arası ideal)
  if (suggestion.odds >= 1.5 && suggestion.odds <= 2.5) {
    score += 10;
  }
  
  // Reasoning uzunluğu (detaylı analiz = daha iyi)
  if (suggestion.reasoning && suggestion.reasoning.length > 50) {
    score += 5;
  }
  
  return score;
}

/**
 * En iyi 3'lü kombinasyonu seçer (mor kutu versiyonu)
 */
function selectBestTripleFromSuggestions(
  candidates: CandidateMatch[],
  config: BotConfig
): CandidateMatch[] {
  const selected: CandidateMatch[] = [];
  const usedLeagues = new Set<number>();
  
  // Önce farklı liglerden seç
  for (const candidate of candidates) {
    if (selected.length >= config.matchCount) break;
    
    const leagueId = candidate.match.league.id;
    
    // Aynı ligden sadece 1 maç
    if (usedLeagues.has(leagueId)) continue;
    
    selected.push(candidate);
    usedLeagues.add(leagueId);
  }
  
  // Yeterli değilse, aynı ligden de ekle
  if (selected.length < config.matchCount) {
    for (const candidate of candidates) {
      if (selected.length >= config.matchCount) break;
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
    }
  }
  
  return selected;
}

/**
 * Bet pick'ini prediction type'a çevirir
 */
function mapBetPickToType(pick: string): BotMatch['prediction']['type'] {
  const pickLower = pick.toLowerCase();
  if (pickLower.includes('ev sahibi') || pickLower.includes('ms 1') || pick === '1') return 'home';
  if (pickLower.includes('beraberlik') || pickLower.includes('ms x') || pick === 'X') return 'draw';
  if (pickLower.includes('deplasman') || pickLower.includes('ms 2') || pick === '2') return 'away';
  if (pickLower.includes('üst') || pickLower.includes('over')) return 'over25';
  if (pickLower.includes('kg var') || pickLower.includes('btts')) return 'btts';
  if (pickLower.includes('alt') || pickLower.includes('under')) return 'over25'; // Alt bahis olarak over25 kullan
  return 'home';
}

/**
 * CandidateMatch'i BotMatch'e dönüştürür
 */
function convertCandidateToBotMatch(candidate: CandidateMatch): BotMatch {
  const { match, prediction, bestSuggestion } = candidate;
  
  return {
    fixtureId: match.id,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    homeTeamId: match.homeTeam.id,
    awayTeamId: match.awayTeam.id,
    league: match.league.name,
    leagueId: match.league.id,
    kickoff: new Date(match.timestamp * 1000),
    prediction,
    confidenceScore: bestSuggestion.confidence,
    valuePercent: bestSuggestion.value === 'high' ? 25 : bestSuggestion.value === 'medium' ? 15 : 5,
    chaosLevel: 0.3, // Default
    homeStyle: 'BALANCED' as PlayStyle,
    awayStyle: 'BALANCED' as PlayStyle,
  };
}

// ============ FALLBACK: ESKİ SİSTEM ============

/**
 * Fallback: Eski Poisson/Value bet sistemini kullanır
 */
async function generateBotCouponFallback(
  config: BotConfig,
  currentBankroll: number
): Promise<BotCoupon | null> {
  console.log('[Bot] Fallback sisteme geçiliyor (Poisson/ValueBet)...');
  
  const scanInputs = await fetchAndPrepareMatches();
  if (scanInputs.length === 0) return null;
  
  const scanResult = await scanMatches(scanInputs);
  if (!scanResult || scanResult.all.length === 0) return null;
  
  const candidates = filterAndScoreCandidatesFallback(scanResult.all, config);
  if (candidates.length < config.matchCount) return null;
  
  const selectedMatches = selectBestTripleFallback(candidates, config);
  if (selectedMatches.length < config.matchCount) return null;
  
  const totalOdds = selectedMatches.reduce((acc, m) => acc * m.prediction.odds, 1);
  let stake = Math.min(currentBankroll, config.maxStake);
  stake = Math.round(stake * 100) / 100;
  
  const coupon: BotCoupon = {
    id: generateCouponId(),
    createdAt: new Date(),
    matches: selectedMatches.map(c => convertToBotMatchFallback(c)),
    totalOdds: Math.round(totalOdds * 100) / 100,
    stake,
    potentialWin: Math.round(stake * totalOdds * 100) / 100,
    status: 'pending',
  };
  
  console.log(`[Bot] Fallback kupon oluşturuldu: ${coupon.id}`);
  return coupon;
}

interface CandidateMatchFallback {
  analysis: MatchAnalysis;
  score: number;
  prediction: BotMatch['prediction'];
}

/**
 * Fallback: Kriterlere uyan maçları filtreler ve puanlar
 */
function filterAndScoreCandidatesFallback(
  matches: MatchAnalysis[],
  config: BotConfig
): CandidateMatchFallback[] {
  const now = new Date();
  const minKickoff = new Date(now.getTime() + config.minKickoffMinutes * 60 * 1000);
  const maxKickoff = new Date(now.getTime() + config.maxKickoffHours * 60 * 60 * 1000);
  
  const candidates: CandidateMatchFallback[] = [];
  
  for (const match of matches) {
    const kickoff = new Date(match.kickoff);
    
    // Zaman filtresi
    if (kickoff < minKickoff || kickoff > maxKickoff) continue;
    
    // Confidence filtresi
    if (match.confidenceScore < config.minConfidence) continue;
    
    // Chaos filtresi
    if (match.chaosLevel > config.maxChaosLevel) continue;
    
    // Value bet kontrolü - en iyi value bet'i bul
    const bestValueBet = match.valueBets
      .filter(vb => vb.value >= config.minValue)
      .filter(vb => vb.bookmakerOdds >= config.minMatchOdds && vb.bookmakerOdds <= config.maxMatchOdds)
      .sort((a, b) => b.value - a.value)[0];
    
    if (!bestValueBet) continue;
    
    // Prediction oluştur
    const prediction: BotMatch['prediction'] = {
      type: mapBetTypeToPredictionFallback(bestValueBet.market),
      label: bestValueBet.market,
      probability: bestValueBet.probability,
      odds: bestValueBet.bookmakerOdds,
    };
    
    // Skor hesapla
    const score = calculateMatchScore(match, bestValueBet.value, config);
    
    candidates.push({
      analysis: match,
      score,
      prediction,
    });
  }
  
  // Puana göre sırala
  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Maç için toplam puan hesaplar
 */
function calculateMatchScore(
  match: MatchAnalysis,
  valuePercent: number,
  config: BotConfig
): number {
  let score = 0;
  
  // Base: Confidence (0-100)
  score += match.confidenceScore * 0.3;
  
  // Value bonus (15-30% arası)
  score += Math.min(valuePercent, 30) * 0.25;
  
  // Chaos penalty (düşük chaos = yüksek skor)
  score += (1 - match.chaosLevel) * 20;
  
  // Monte Carlo confidence bonus
  if (match.monteCarloResult) {
    const mcConfidence = match.monteCarloResult.confidenceLevel;
    if (mcConfidence === 'high') score += 15;
    else if (mcConfidence === 'medium') score += 8;
    else if (mcConfidence === 'low') score += 0;
    else score -= 10; // avoid
  }
  
  // Stil eşleşmesi bonus
  if (match.styleAnalysis?.matchup?.prediction) {
    const boost = Math.abs(match.styleAnalysis.matchup.prediction.homeWinBoost) +
                  Math.abs(match.styleAnalysis.matchup.prediction.bttsBoost);
    score += boost * 10;
  }
  
  // Banko bonus
  if (match.isBanko) score += 10;
  
  return score;
}

/**
 * Fallback: En iyi 3'lü kombinasyonu seçer
 */
function selectBestTripleFallback(
  candidates: CandidateMatchFallback[],
  config: BotConfig
): CandidateMatchFallback[] {
  const selected: CandidateMatchFallback[] = [];
  const usedLeagues = new Set<number>();
  
  // Önce farklı liglerden seç
  for (const candidate of candidates) {
    if (selected.length >= config.matchCount) break;
    
    const leagueId = candidate.analysis.leagueId;
    
    // Aynı ligden sadece 1 maç
    if (usedLeagues.has(leagueId)) continue;
    
    selected.push(candidate);
    usedLeagues.add(leagueId);
  }
  
  // Yeterli değilse, aynı ligden de ekle
  if (selected.length < config.matchCount) {
    for (const candidate of candidates) {
      if (selected.length >= config.matchCount) break;
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
    }
  }
  
  return selected;
}

/**
 * Fallback: CandidateMatchFallback'i BotMatch'e dönüştürür
 */
function convertToBotMatchFallback(candidate: CandidateMatchFallback): BotMatch {
  const { analysis, prediction } = candidate;
  
  // Stil bilgilerini al
  let homeStyle: PlayStyle = 'CHAOTIC';
  let awayStyle: PlayStyle = 'CHAOTIC';
  
  if (analysis.styleAnalysis) {
    homeStyle = analysis.styleAnalysis.homeProfile.style;
    awayStyle = analysis.styleAnalysis.awayProfile.style;
  }
  
  return {
    fixtureId: analysis.fixtureId,
    homeTeam: analysis.homeTeam,
    awayTeam: analysis.awayTeam,
    homeTeamId: 0,
    awayTeamId: 0,
    league: analysis.league,
    leagueId: analysis.leagueId,
    kickoff: new Date(analysis.kickoff),
    prediction,
    confidenceScore: analysis.confidenceScore,
    valuePercent: candidate.prediction.probability * candidate.prediction.odds * 100 - 100,
    chaosLevel: analysis.chaosLevel,
    homeStyle,
    awayStyle,
    styleMatchup: analysis.styleAnalysis?.matchup,
    monteCarlo: analysis.monteCarloResult,
  };
}

/**
 * Fallback: Bet tipini prediction tipine çevirir
 */
function mapBetTypeToPredictionFallback(betType: string): BotMatch['prediction']['type'] {
  if (betType.includes('Ev') || betType.includes('MS 1')) return 'home';
  if (betType.includes('Beraberlik') || betType.includes('MS X')) return 'draw';
  if (betType.includes('Deplasman') || betType.includes('MS 2')) return 'away';
  if (betType.includes('Ü2.5') || betType.includes('Over')) return 'over25';
  if (betType.includes('KG') || betType.includes('BTTS')) return 'btts';
  return 'home';
}

/**
 * Benzersiz kupon ID'si oluşturur
 */
function generateCouponId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `BOT-${timestamp}-${random}`.toUpperCase();
}

// ============ MAÇ SONUÇ KONTROLÜ ============

export interface MatchResult {
  fixtureId: number;
  homeScore: number;
  awayScore: number;
  status: 'finished' | 'live' | 'upcoming';
}

/**
 * Kupondaki maçların sonuçlarını kontrol eder
 */
export async function checkCouponResults(coupon: BotCoupon): Promise<BotCoupon> {
  // Her maç için sonuç al (API-Football'dan direkt)
  const results: MatchResult[] = [];
  
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  
  for (const match of coupon.matches) {
    try {
      const res = await fetch(`${baseUrl}/fixtures?id=${match.fixtureId}`, {
        headers: {
          'x-apisports-key': apiKey || '',
        },
      });
      const data = await res.json();
      const fixture = data?.response?.[0];
      
      if (fixture?.fixture?.status?.short === 'FT') {
        results.push({
          fixtureId: match.fixtureId,
          homeScore: fixture.goals?.home ?? 0,
          awayScore: fixture.goals?.away ?? 0,
          status: 'finished',
        });
      } else if (['1H', '2H', 'HT'].includes(fixture?.fixture?.status?.short)) {
        results.push({
          fixtureId: match.fixtureId,
          homeScore: fixture.goals?.home ?? 0,
          awayScore: fixture.goals?.away ?? 0,
          status: 'live',
        });
      } else {
        results.push({
          fixtureId: match.fixtureId,
          homeScore: 0,
          awayScore: 0,
          status: 'upcoming',
        });
      }
    } catch (error) {
      console.error(`[Bot] Maç sonucu alınamadı: ${match.fixtureId}`, error);
    }
  }
  
  // Tüm maçlar bitti mi kontrol et
  const allFinished = results.every(r => r.status === 'finished');
  
  if (!allFinished) {
    return coupon; // Henüz bitmemiş
  }
  
  // Sonuçları değerlendir
  const matchResults = coupon.matches.map(match => {
    const result = results.find(r => r.fixtureId === match.fixtureId)!;
    const predictionWon = checkPredictionWon(match.prediction, result);
    
    return {
      fixtureId: match.fixtureId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      predictionWon,
    };
  });
  
  const allWon = matchResults.every(r => r.predictionWon);
  const totalWon = allWon ? coupon.potentialWin : 0;
  const profit = totalWon - coupon.stake;
  
  return {
    ...coupon,
    status: allWon ? 'won' : 'lost',
    result: {
      settledAt: new Date(),
      matchResults,
      totalWon,
      profit,
    },
  };
}

/**
 * Tahmin tuttu mu kontrol eder
 */
function checkPredictionWon(
  prediction: BotMatch['prediction'],
  result: MatchResult
): boolean {
  const { homeScore, awayScore } = result;
  const totalGoals = homeScore + awayScore;
  
  switch (prediction.type) {
    case 'home':
      return homeScore > awayScore;
    case 'draw':
      return homeScore === awayScore;
    case 'away':
      return awayScore > homeScore;
    case 'over25':
      return totalGoals > 2.5;
    case 'btts':
      return homeScore > 0 && awayScore > 0;
    default:
      return false;
  }
}

// Export DEFAULT_BOT_CONFIG from types
export { DEFAULT_BOT_CONFIG } from './types';
