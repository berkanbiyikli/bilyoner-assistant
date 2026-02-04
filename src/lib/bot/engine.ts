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
 * PARALEL olarak tüm maçları aynı anda sorgular
 */
async function fetchBetSuggestions(matches: DailyMatchFixture[]): Promise<MatchWithBetSuggestions[]> {
  // Tüm maçlar için paralel istek at
  const BATCH_SIZE = 5; // Her seferde 5 paralel istek (rate limit için)
  const results: MatchWithBetSuggestions[] = [];
  
  console.log(`[Bot] ${matches.length} maç için paralel bet suggestions çekiliyor...`);
  
  // Batch'ler halinde işle
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (match) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 saniye timeout
        
        // TÜM GEREKLİ PARAMETRELERİ EKLE (fixtureId, homeTeamId, awayTeamId, leagueId)
        const params = new URLSearchParams({
          fixtureId: String(match.id),
          homeTeamId: String(match.homeTeam.id),
          awayTeamId: String(match.awayTeam.id),
          leagueId: String(match.league.id),
        });
        
        const res = await fetch(`${BASE_URL}/api/match-detail?${params}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          console.log(`[Bot] Match detail HTTP ${res.status}: ${match.id}`);
          return null;
        }
        
        const data = await res.json();
        
        if (data.betSuggestions && data.betSuggestions.length > 0) {
          console.log(`[Bot] ✓ ${match.homeTeam.name} vs ${match.awayTeam.name}: ${data.betSuggestions.length} öneri`);
          return {
            match,
            betSuggestions: data.betSuggestions as BetSuggestion[],
          };
        }
        
        return null;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        // AbortError'ı ayrı logla
        if (errMsg.includes('abort')) {
          console.log(`[Bot] Timeout: ${match.id} (${match.homeTeam.name})`);
        } else {
          console.log(`[Bot] Hata ${match.id}: ${errMsg.substring(0, 50)}`);
        }
        return null;
      }
    });
    
    // Bu batch'i bekle
    const batchResults = await Promise.all(batchPromises);
    
    // Başarılı sonuçları ekle
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }
    
    // Batch'ler arası kısa bekleme (rate limit için)
    if (i + BATCH_SIZE < matches.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`[Bot] ${results.length}/${matches.length} maç için bet suggestions alındı`);
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
    console.log('[Bot] BetSuggestions bulunamadı - kupon oluşturulamadı');
    // Fallback DEVRE DIŞI - sadece mor kutu önerileri kullanılsın
    // Mor kutu önerileri sitedeki analizlerle uyumlu olmalı
    return null;
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
  
  console.log(`[Bot] ========= KUPON DETAYI =========`);
  console.log(`[Bot] Kupon ID: ${coupon.id}`);
  console.log(`[Bot] Toplam oran: ${coupon.totalOdds}, Stake: ${coupon.stake} TL`);
  for (const m of selectedMatches) {
    console.log(`[Bot] ✓ ${m.match.homeTeam.name} vs ${m.match.awayTeam.name}`);
    console.log(`[Bot]   Tahmin: ${m.bestSuggestion.pick} @${m.bestSuggestion.odds} (Güven: %${m.bestSuggestion.confidence})`);
    console.log(`[Bot]   Value: ${m.bestSuggestion.value} | Sebep: ${m.bestSuggestion.reasoning?.substring(0, 60)}...`);
  }
  console.log(`[Bot] Mor kutu önerileri kullanıldı! ✅`);
  console.log(`[Bot] ===================================`);
  
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
  
  console.log(`[Bot] Filtre kriterleri: minConf=${config.minConfidence}%, odds=${config.minMatchOdds}-${config.maxMatchOdds}, kickoff=${config.minKickoffMinutes}dk-${config.maxKickoffHours}sa`);
  
  const candidates: CandidateMatch[] = [];
  let timeFiltered = 0;
  let noValidSuggestions = 0;
  
  for (const { match, betSuggestions } of matchesWithSuggestions) {
    const kickoff = new Date(match.timestamp * 1000);
    
    // Zaman filtresi
    if (kickoff < minKickoff || kickoff > maxKickoff) {
      timeFiltered++;
      continue;
    }
    
    // En iyi mor kutu önerisini bul (confidence'a göre)
    // SIKI FİLTRELER - Sadece kaliteli tahminler
    const validSuggestions = betSuggestions
      .filter(s => s.confidence >= config.minConfidence) // Config'den min güven (%70)
      .filter(s => s.odds >= config.minMatchOdds && s.odds <= config.maxMatchOdds)
      .filter(s => ['goals', 'btts', 'result'].includes(s.type)) // Sadece temel bahisler
      .filter(s => s.value === 'high' || s.value === 'medium') // Sadece değerli tahminler
      .sort((a, b) => b.confidence - a.confidence);
    
    if (validSuggestions.length === 0) {
      // Debug: Neden geçmedi?
      const bestSugg = betSuggestions[0];
      if (bestSugg) {
        console.log(`[Bot] ❌ ${match.homeTeam.name} vs ${match.awayTeam.name}: conf=${bestSugg.confidence}%, odds=${bestSugg.odds}, type=${bestSugg.type}, value=${bestSugg.value}`);
      }
      noValidSuggestions++;
      continue;
    }
    
    const bestSuggestion = validSuggestions[0];
    console.log(`[Bot] ✓ Aday: ${match.homeTeam.name} vs ${match.awayTeam.name} - ${bestSuggestion.pick} @${bestSuggestion.odds} (${bestSuggestion.confidence}%)`);
    
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
  
  console.log(`[Bot] Filtre sonucu: ${candidates.length} aday, ${timeFiltered} zaman dışı, ${noValidSuggestions} kriter dışı`);
  
  // Puana göre sırala
  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Mor kutu önerisi için puan hesaplar
 * SADECE BETSUGGESTİONS'DAN GELEN TAHMİNLERİ KULLANIR
 */
function calculateSuggestionScore(suggestion: BetSuggestion, match: DailyMatchFixture): number {
  let score = 0;
  
  // Confidence (0-100) - ANA ETKEN
  // %70+ = güvenilir, %80+ = çok güvenilir
  score += suggestion.confidence * 0.5; // Ağırlığı artırdık
  
  // Value değeri - ZORUNLU high veya medium olmalı
  // high = +20, medium = +10
  if (suggestion.value === 'high') score += 20;
  else if (suggestion.value === 'medium') score += 10;
  // low value zaten filtreleniyor
  
  // Oran bonusu (1.5-2.2 arası ideal - güvenli bölge)
  if (suggestion.odds >= 1.50 && suggestion.odds <= 2.20) {
    score += 15;
  } else if (suggestion.odds >= 1.35 && suggestion.odds <= 2.50) {
    score += 8;
  }
  
  // Reasoning kalitesi (detaylı analiz = daha iyi)
  if (suggestion.reasoning && suggestion.reasoning.length > 50) {
    score += 5;
  }
  
  // Bahis tipi bonusu (Üst 2.5 ve KG Var daha güvenilir)
  if (suggestion.pick === 'Üst 2.5' || suggestion.pick === 'KG Var') {
    score += 8;
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
