/**
 * Match Detail API Route
 * On-demand maç detayları (H2H, tahmin, hakem stats, bahis önerileri)
 * Redis cache ile optimize edilmiş
 */

import { NextResponse } from 'next/server';
import { getMatchDetail } from '@/lib/api-football/daily-matches';
import type { Referee, BetSuggestion, BetSuggestionInput } from '@/types/api-football';
import { analyzePoissonPrediction, type PoissonAnalysis } from '@/lib/prediction/poisson';
import { analyzeValueBet, type ValueBetAnalysis } from '@/lib/prediction/value-bet';
import { validateWithAPIpredictions } from '@/lib/prediction/engine';
import type { APIValidationResult } from '@/lib/prediction/types';
import {
  teamStatsCache,
  seasonStatsCache,
  refereeCache,
  playerCardsCache,
  cacheKeys,
  CACHE_TTL,
} from '@/lib/cache/memory-cache';
import { cacheGet, cacheSet, redisCacheKeys, REDIS_TTL } from '@/lib/cache/redis-cache';

export const dynamic = 'force-dynamic';

// =====================================
// WEIGHTED AVERAGE SYSTEM
// Sezon %40, Form %60 ağırlıklı
// =====================================
const WEIGHTS = {
  SEASON: 0.40,  // Sezon istatistikleri ağırlığı
  FORM: 0.60,    // Son 5 maç (form) ağırlığı
} as const;

/**
 * Ağırlıklı ortalama hesapla
 */
function weightedAverage(
  seasonValue: number,
  formValue: number,
  seasonWeight: number = WEIGHTS.SEASON,
  formWeight: number = WEIGHTS.FORM
): number {
  // Her iki değer de geçerliyse ağırlıklı ort.
  if (seasonValue > 0 && formValue > 0) {
    return (seasonValue * seasonWeight) + (formValue * formWeight);
  }
  // Sadece biri varsa onu kullan
  if (seasonValue > 0) return seasonValue;
  if (formValue > 0) return formValue;
  return 0;
}

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

// Mevcut sezon hesaplama (Temmuz-Haziran sezonu)
function getCurrentSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 0-indexed
  // Temmuz (7) ve sonrasıysa mevcut yıl, değilse önceki yıl
  return month >= 7 ? year : year - 1;
}

/**
 * Sezon ve Form istatistiklerini ağırlıklı olarak birleştir
 */
function calculateWeightedStats(stats: TeamFixtureStats): {
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgCards: number;
  cleanSheetRate: number;
  bttsRate: number;
} {
  const formMatchesPlayed = stats.matchesPlayed || 1;
  const seasonMatchesPlayed = stats.seasonStats?.played || 0;
  
  // Form bazlı değerler (son 5 maç)
  const formGoalsScored = stats.goalsScored / formMatchesPlayed;
  const formGoalsConceded = stats.goalsConceded / formMatchesPlayed;
  const formCards = stats.totalCards / formMatchesPlayed;
  const formCleanSheet = (stats.cleanSheets / formMatchesPlayed) * 100;
  const formBtts = (stats.bothTeamsScored / formMatchesPlayed) * 100;
  
  // Sezon bazlı değerler
  const seasonGoalsScored = seasonMatchesPlayed > 0 
    ? (stats.seasonStats?.goalsFor || 0) / seasonMatchesPlayed 
    : 0;
  const seasonGoalsConceded = seasonMatchesPlayed > 0 
    ? (stats.seasonStats?.goalsAgainst || 0) / seasonMatchesPlayed 
    : 0;
  const seasonCards = seasonMatchesPlayed > 0
    ? ((stats.seasonStats?.yellowCards || 0) + (stats.seasonStats?.redCards || 0)) / seasonMatchesPlayed
    : 0;
  const seasonCleanSheet = seasonMatchesPlayed > 0
    ? ((stats.seasonStats?.cleanSheets || 0) / seasonMatchesPlayed) * 100
    : 0;
  // BTTS sezon bazlı hesaplanamaz, form kullan
  
  return {
    avgGoalsScored: weightedAverage(seasonGoalsScored, formGoalsScored),
    avgGoalsConceded: weightedAverage(seasonGoalsConceded, formGoalsConceded),
    avgCards: weightedAverage(seasonCards, formCards),
    cleanSheetRate: weightedAverage(seasonCleanSheet, formCleanSheet),
    bttsRate: formBtts, // Sadece form bazlı
  };
}

interface TeamFixtureStats {
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
  bothTeamsScored: number;
  totalCards: number;
  matchesPlayed: number;
  // İlk yarı istatistikleri
  firstHalfGoalsScored: number;
  firstHalfGoalsConceded: number;
  firstHalfOver05: number; // İY 0.5 üstü maç sayısı
  firstHalfOver15: number; // İY 1.5 üstü maç sayısı
  // Ev/Deplasman performansı
  homeWins: number;
  homeLosses: number;
  homeDraws: number;
  awayWins: number;
  awayLosses: number;
  awayDraws: number;
  // İY sonuçları
  htWins: number;
  htDraws: number;
  htLosses: number;
  // Sezon bazlı (API /teams/statistics'ten)
  seasonStats?: {
    played: number;
    wins: number;
    draws: number;
    loses: number;
    goalsFor: number;
    goalsAgainst: number;
    yellowCards: number;
    redCards: number;
    form: string;
    cleanSheets: number;
    failedToScore: number;
  };
}

/**
 * Sezon bazlı takım istatistiklerini çek
 * /teams/statistics endpoint'i kullanır
 */
async function fetchSeasonTeamStats(teamId: number, leagueId: number): Promise<TeamFixtureStats['seasonStats'] | null> {
  if (!API_KEY) return null;
  
  const season = getCurrentSeason();
  
  try {
    const response = await fetch(
      `${API_BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
      {
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
        next: { revalidate: 3600 }, // 1 saat cache
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const stats = data.response;

    if (!stats) return null;

    // Kart istatistiklerini topla (dakikalara göre)
    let yellowCards = 0;
    let redCards = 0;
    
    if (stats.cards?.yellow) {
      for (const period of Object.values(stats.cards.yellow)) {
        yellowCards += (period as { total: number | null })?.total || 0;
      }
    }
    if (stats.cards?.red) {
      for (const period of Object.values(stats.cards.red)) {
        redCards += (period as { total: number | null })?.total || 0;
      }
    }

    return {
      played: stats.fixtures?.played?.total || 0,
      wins: stats.fixtures?.wins?.total || 0,
      draws: stats.fixtures?.draws?.total || 0,
      loses: stats.fixtures?.loses?.total || 0,
      goalsFor: stats.goals?.for?.total?.total || 0,
      goalsAgainst: stats.goals?.against?.total?.total || 0,
      yellowCards,
      redCards,
      form: stats.form || '',
      cleanSheets: (stats.clean_sheet?.total || 0),
      failedToScore: (stats.failed_to_score?.total || 0),
    };
  } catch (error) {
    console.error(`[Season Stats] Error for team ${teamId}:`, error);
    return null;
  }
}

async function fetchTeamStats(teamId: number, leagueId: number, last: number = 5): Promise<TeamFixtureStats | null> {
  if (!API_KEY) return null;
  
  try {
    const response = await fetch(
      `${API_BASE_URL}/fixtures?team=${teamId}&last=${last}`,
      {
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const fixtures = data.response || [];

    if (fixtures.length === 0) return null;

    let goalsScored = 0;
    let goalsConceded = 0;
    let cleanSheets = 0;
    let bothTeamsScored = 0;
    let totalCards = 0;
    let firstHalfGoalsScored = 0;
    let firstHalfGoalsConceded = 0;
    let firstHalfOver05 = 0;
    let firstHalfOver15 = 0;
    let homeWins = 0, homeLosses = 0, homeDraws = 0;
    let awayWins = 0, awayLosses = 0, awayDraws = 0;
    let htWins = 0, htDraws = 0, htLosses = 0;

    for (const fixture of fixtures) {
      const isHome = fixture.teams.home.id === teamId;
      const ownGoals = isHome ? fixture.goals.home : fixture.goals.away;
      const oppGoals = isHome ? fixture.goals.away : fixture.goals.home;

      goalsScored += ownGoals ?? 0;
      goalsConceded += oppGoals ?? 0;

      if ((oppGoals ?? 0) === 0) cleanSheets++;
      if ((ownGoals ?? 0) > 0 && (oppGoals ?? 0) > 0) bothTeamsScored++;

      // İlk yarı skorları
      const htHome = fixture.score?.halftime?.home ?? 0;
      const htAway = fixture.score?.halftime?.away ?? 0;
      const ownHtGoals = isHome ? htHome : htAway;
      const oppHtGoals = isHome ? htAway : htHome;
      
      firstHalfGoalsScored += ownHtGoals;
      firstHalfGoalsConceded += oppHtGoals;
      
      const totalHtGoals = htHome + htAway;
      if (totalHtGoals >= 1) firstHalfOver05++;
      if (totalHtGoals >= 2) firstHalfOver15++;

      // İY sonucu
      if (ownHtGoals > oppHtGoals) htWins++;
      else if (ownHtGoals < oppHtGoals) htLosses++;
      else htDraws++;

      // Maç sonucu (ev/deplasman bazlı)
      if (isHome) {
        if ((ownGoals ?? 0) > (oppGoals ?? 0)) homeWins++;
        else if ((ownGoals ?? 0) < (oppGoals ?? 0)) homeLosses++;
        else homeDraws++;
      } else {
        if ((ownGoals ?? 0) > (oppGoals ?? 0)) awayWins++;
        else if ((ownGoals ?? 0) < (oppGoals ?? 0)) awayLosses++;
        else awayDraws++;
      }

      // Kart sayısı (events'ten)
      if (fixture.events) {
        for (const event of fixture.events) {
          if (event.type === 'Card' && event.team.id === teamId) {
            totalCards++;
          }
        }
      }
    }

    const result: TeamFixtureStats = {
      goalsScored,
      goalsConceded,
      cleanSheets,
      bothTeamsScored,
      totalCards,
      matchesPlayed: fixtures.length,
      firstHalfGoalsScored,
      firstHalfGoalsConceded,
      firstHalfOver05,
      firstHalfOver15,
      homeWins,
      homeLosses,
      homeDraws,
      awayWins,
      awayLosses,
      awayDraws,
      htWins,
      htDraws,
      htLosses,
    };

    // Sezon istatistiklerini de çek (lig ID varsa)
    if (leagueId > 0) {
      const seasonStats = await fetchSeasonTeamStats(teamId, leagueId);
      if (seasonStats) {
        result.seasonStats = seasonStats;
        // Sezon bazlı kart istatistiklerini kullan (daha doğru)
        result.totalCards = seasonStats.yellowCards + seasonStats.redCards;
      }
    }

    return result;
  } catch {
    return null;
  }
}

// Oyuncu kart istatistikleri
interface PlayerCardStats {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  yellowCards: number;
  redCards: number;
  totalCards: number;
  matchesPlayed: number;
  cardRate: number; // Maç başına kart oranı
}

async function fetchPlayerCardStats(teamId: number, season?: number): Promise<PlayerCardStats[]> {
  if (!API_KEY) return [];
  
  const currentSeason = season || getCurrentSeason();
  
  try {
    // Takımın oyuncu istatistiklerini çek
    const response = await fetch(
      `${API_BASE_URL}/players?team=${teamId}&season=${currentSeason}`,
      {
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const players = data.response || [];

    const cardStats: PlayerCardStats[] = [];

    for (const playerData of players) {
      const player = playerData.player;
      const statistics = playerData.statistics || [];
      
      // Tüm liglerdeki kartları topla
      let yellowCards = 0;
      let redCards = 0;
      let matchesPlayed = 0;
      let teamName = '';

      for (const stat of statistics) {
        if (stat.team?.id === teamId) {
          teamName = stat.team?.name || '';
          yellowCards += stat.cards?.yellow || 0;
          redCards += stat.cards?.red || 0;
          matchesPlayed += stat.games?.appearences || 0;
        }
      }

      const totalCards = yellowCards + redCards;
      
      // Sadece kart gören oyuncuları ekle
      if (totalCards > 0 && matchesPlayed > 0) {
        cardStats.push({
          playerId: player.id,
          playerName: player.name,
          teamId,
          teamName,
          yellowCards,
          redCards,
          totalCards,
          matchesPlayed,
          cardRate: totalCards / matchesPlayed,
        });
      }
    }

    // Kart oranına göre sırala
    return cardStats.sort((a, b) => b.cardRate - a.cardRate).slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchRefereeStatsInternal(refereeName: string): Promise<Referee | null> {
  if (!API_KEY || API_KEY === 'your_api_key_here' || !refereeName) {
    return null;
  }

  try {
    // Hakem adıyla maç ara
    const response = await fetch(
      `${API_BASE_URL}/fixtures?referee=${encodeURIComponent(refereeName)}&last=20`,
      {
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
        next: { revalidate: 43200 }, // 12 saat cache
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const fixtures = data.response || [];

    if (fixtures.length === 0) return null;

    // İstatistikleri aggregate et
    let yellowCards = 0;
    let redCards = 0;
    let penalties = 0;
    let homePenalties = 0;
    let awayPenalties = 0;

    for (const fixture of fixtures) {
      if (fixture.events) {
        for (const event of fixture.events) {
          if (event.type === 'Card') {
            if (event.detail === 'Yellow Card') yellowCards++;
            else if (event.detail === 'Red Card' || event.detail === 'Second Yellow card') redCards++;
          }
          if (event.type === 'Goal' && event.detail === 'Penalty') {
            penalties++;
            if (event.team.id === fixture.teams.home.id) homePenalties++;
            else awayPenalties++;
          }
        }
      }
    }

    const totalMatches = fixtures.length;
    const insights: string[] = [];

    const yellowAvg = yellowCards / totalMatches;
    if (yellowAvg >= 5) {
      insights.push(`🟨 Maç başına ${yellowAvg.toFixed(1)} sarı kart`);
    }
    if (penalties > 3) {
      const homeRatio = homePenalties / penalties;
      if (homeRatio >= 0.7) {
        insights.push(`🏠 Penaltıların %${Math.round(homeRatio * 100)}'ını ev sahibine veriyor`);
      } else if (homeRatio <= 0.3) {
        insights.push(`✈️ Penaltıların çoğunu deplasmana veriyor`);
      }
    }

    return {
      id: 0,
      name: refereeName,
      nationality: 'Unknown',
      appearance: totalMatches,
      yellow_cards: yellowCards,
      red_cards: redCards,
      penalties,
      averages: {
        yellow_per_match: Math.round((yellowCards / totalMatches) * 10) / 10,
        red_per_match: Math.round((redCards / totalMatches) * 100) / 100,
        pens_per_match: Math.round((penalties / totalMatches) * 100) / 100,
      },
      insights,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fixtureId = searchParams.get('fixtureId');
    const homeTeamId = searchParams.get('homeTeamId');
    const awayTeamId = searchParams.get('awayTeamId');
    const refereeName = searchParams.get('referee');
    const leagueId = searchParams.get('leagueId'); // Lig ID (sezon istatistikleri için)

    if (!fixtureId || !homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Redis cache kontrolü (tüm response)
    const cacheKey = redisCacheKeys.matchDetail(parseInt(fixtureId));
    const cachedResponse = await cacheGet<object>(cacheKey);
    if (cachedResponse) {
      return NextResponse.json({
        success: true,
        data: cachedResponse,
        cached: true,
      });
    }

    const leagueIdNum = leagueId ? parseInt(leagueId) : 0;

    // Paralel olarak tüm verileri çek
    const [matchDetail, refereeStats, homeStats, awayStats, homePlayerCards, awayPlayerCards] = await Promise.all([
      getMatchDetail(
        parseInt(fixtureId),
        parseInt(homeTeamId),
        parseInt(awayTeamId)
      ),
      refereeName ? fetchRefereeStatsInternal(refereeName) : null,
      fetchTeamStats(parseInt(homeTeamId), leagueIdNum, 5),
      fetchTeamStats(parseInt(awayTeamId), leagueIdNum, 5),
      fetchPlayerCardStats(parseInt(homeTeamId)),
      fetchPlayerCardStats(parseInt(awayTeamId)),
    ]);

    // Bahis önerilerini oluştur
    const betSuggestions = generateBetSuggestions(
      matchDetail,
      refereeStats,
      homeStats,
      awayStats,
      homePlayerCards,
      awayPlayerCards
    );

    // Ağırlıklı istatistikleri hesapla (Sezon %40, Form %60)
    const homeWeightedStats = homeStats ? calculateWeightedStats(homeStats) : null;
    const awayWeightedStats = awayStats ? calculateWeightedStats(awayStats) : null;

    // Poisson Analizi (Bilimsel skor tahmini)
    let poissonAnalysis: PoissonAnalysis | null = null;
    if (homeWeightedStats && awayWeightedStats) {
      poissonAnalysis = analyzePoissonPrediction({
        homeGoalsScored: homeWeightedStats.avgGoalsScored,
        awayGoalsScored: awayWeightedStats.avgGoalsScored,
        homeGoalsConceded: homeWeightedStats.avgGoalsConceded,
        awayGoalsConceded: awayWeightedStats.avgGoalsConceded,
        homeAdvantage: 1.1, // %10 ev avantajı
      });
      
      // 🆕 Poisson bazlı MS tahmini ekle (eğer result tipi yoksa)
      const hasResultSuggestion = betSuggestions.some(s => s.type === 'result');
      if (!hasResultSuggestion) {
        const { homeWin, draw, awayWin } = poissonAnalysis.probabilities;
        const maxProb = Math.max(homeWin, draw, awayWin);
        
        // Sadece yeterince güvenilir tahminleri ekle (%55+)
        if (maxProb >= 55) {
          let pick: string;
          let reasoning: string;
          const conf = Math.round(maxProb);
          
          if (homeWin === maxProb) {
            pick = 'Ev Sahibi';
            reasoning = `Poisson: Ev %${conf}, Beraberlik %${Math.round(draw)}, Deplasman %${Math.round(awayWin)}. xG: ${poissonAnalysis.xg.homeXG.toFixed(1)}-${poissonAnalysis.xg.awayXG.toFixed(1)}`;
          } else if (awayWin === maxProb) {
            pick = 'Deplasman';
            reasoning = `Poisson: Ev %${Math.round(homeWin)}, Beraberlik %${Math.round(draw)}, Deplasman %${conf}. xG: ${poissonAnalysis.xg.homeXG.toFixed(1)}-${poissonAnalysis.xg.awayXG.toFixed(1)}`;
          } else {
            pick = 'Beraberlik';
            reasoning = `Poisson: Ev %${Math.round(homeWin)}, Beraberlik %${conf}, Deplasman %${Math.round(awayWin)}. xG: ${poissonAnalysis.xg.homeXG.toFixed(1)}-${poissonAnalysis.xg.awayXG.toFixed(1)}`;
          }
          
          // Olasılıktan oran hesapla (implied odds + margin)
          const impliedOdds = 100 / maxProb;
          const margin = 0.12;
          const odds = Math.max(1.50, Math.min(5.0, impliedOdds * (1 + margin)));
          
          betSuggestions.push({
            type: 'result',
            market: 'Maç Sonucu',
            pick,
            confidence: conf,
            reasoning,
            value: conf >= 65 ? 'high' : 'medium',
            odds: parseFloat(odds.toFixed(2)),
          });
        }
      }
    }

    // API Ensemble Validation (Faz 2)
    // Poisson modelimiz ile API-Football prediction'ını karşılaştır
    let apiValidation: APIValidationResult | null = null;
    if (poissonAnalysis && matchDetail.prediction) {
      const apiPrediction = matchDetail.prediction;
      
      // Model tahmini
      const modelPrediction = {
        homeWin: poissonAnalysis.probabilities.homeWin,
        draw: poissonAnalysis.probabilities.draw,
        awayWin: poissonAnalysis.probabilities.awayWin,
      };
      
      // API prediction'dan olasılık hesapla (winner + confidence)
      const conf = apiPrediction.confidence || 50;
      let apiProbs = { 
        homeWinPercent: 33.3, 
        drawPercent: 33.3, 
        awayWinPercent: 33.3 
      };
      
      // API winner'a göre olasılıkları hesapla
      if (apiPrediction.winner) {
        const winnerLower = apiPrediction.winner.toLowerCase();
        const isHomeWinner = winnerLower.includes('home') || winnerLower.includes('ev');
        const isAwayWinner = winnerLower.includes('away') || winnerLower.includes('deplasman');
        const isDraw = winnerLower.includes('draw') || winnerLower.includes('berabere');
        
        if (isHomeWinner) {
          apiProbs = { 
            homeWinPercent: conf, 
            drawPercent: (100 - conf) / 2, 
            awayWinPercent: (100 - conf) / 2 
          };
        } else if (isAwayWinner) {
          apiProbs = { 
            homeWinPercent: (100 - conf) / 2, 
            drawPercent: (100 - conf) / 2, 
            awayWinPercent: conf 
          };
        } else if (isDraw) {
          apiProbs = { 
            homeWinPercent: (100 - conf) / 2, 
            drawPercent: conf, 
            awayWinPercent: (100 - conf) / 2 
          };
        }
      }
      
      apiValidation = validateWithAPIpredictions(modelPrediction, apiProbs);
    }

    // Value Bet Analizi (en iyi 3 öneri için)
    const valueBetAnalyses: ValueBetAnalysis[] = betSuggestions
      .slice(0, 5)
      .map(bet => analyzeValueBet(
        bet.market,
        bet.pick,
        bet.confidence,
        bet.odds || 1.5
      ))
      .filter(v => v.isValue);

    // Takım istatistiklerini birleştir (ağırlıklı ortalama ile)
    const teamStats = (homeStats && awayStats) ? {
      // Ağırlıklı ortalamalar (Sezon %40 + Form %60)
      homeGoalsScored: homeWeightedStats?.avgGoalsScored ?? homeStats.goalsScored / (homeStats.matchesPlayed || 1),
      homeGoalsConceded: homeWeightedStats?.avgGoalsConceded ?? homeStats.goalsConceded / (homeStats.matchesPlayed || 1),
      awayGoalsScored: awayWeightedStats?.avgGoalsScored ?? awayStats.goalsScored / (awayStats.matchesPlayed || 1),
      awayGoalsConceded: awayWeightedStats?.avgGoalsConceded ?? awayStats.goalsConceded / (awayStats.matchesPlayed || 1),
      // Clean sheet ve BTTS oranları
      homeCleanSheetRate: homeWeightedStats?.cleanSheetRate ?? (homeStats.cleanSheets / homeStats.matchesPlayed) * 100,
      awayCleanSheetRate: awayWeightedStats?.cleanSheetRate ?? (awayStats.cleanSheets / awayStats.matchesPlayed) * 100,
      homeBttsRate: homeWeightedStats?.bttsRate ?? (homeStats.bothTeamsScored / homeStats.matchesPlayed) * 100,
      awayBttsRate: awayWeightedStats?.bttsRate ?? (awayStats.bothTeamsScored / awayStats.matchesPlayed) * 100,
      // Raw değerler (geriye uyumluluk)
      homeCleanSheets: homeStats.cleanSheets,
      awayCleanSheets: awayStats.cleanSheets,
      homeBothTeamsScored: homeStats.bothTeamsScored,
      awayBothTeamsScored: awayStats.bothTeamsScored,
      // Ağırlıklı kart istatistikleri
      homeAvgCards: homeWeightedStats?.avgCards ?? (homeStats.totalCards / homeStats.matchesPlayed),
      awayAvgCards: awayWeightedStats?.avgCards ?? (awayStats.totalCards / awayStats.matchesPlayed),
      // Sezon geneli istatistikler
      homeSeasonStats: homeStats.seasonStats,
      awaySeasonStats: awayStats.seasonStats,
      // Ağırlık bilgisi
      weights: WEIGHTS,
    } : undefined;

    // Response data'yı oluştur
    const responseData = {
      ...matchDetail,
      refereeStats,
      betSuggestions,
      teamStats,
      playerCards: {
        home: homePlayerCards,
        away: awayPlayerCards,
      },
      // Yeni: Poisson analizi
      poissonAnalysis: poissonAnalysis ? {
        expectedHomeGoals: poissonAnalysis.xg.homeXG,
        expectedAwayGoals: poissonAnalysis.xg.awayXG,
        expectedTotalGoals: poissonAnalysis.xg.totalXG,
        mostLikelyScore: poissonAnalysis.mostLikelyScore,
        probabilities: {
          homeWin: poissonAnalysis.probabilities.homeWin,
          draw: poissonAnalysis.probabilities.draw,
          awayWin: poissonAnalysis.probabilities.awayWin,
          over15: poissonAnalysis.probabilities.over15,
          over25: poissonAnalysis.probabilities.over25,
          over35: poissonAnalysis.probabilities.over35,
          bttsYes: poissonAnalysis.probabilities.bttsYes,
        },
        topScores: poissonAnalysis.probabilities.exactScores.slice(0, 5),
      } : null,
      // Yeni: Value bet analizi
      valueBets: valueBetAnalyses.length > 0 ? {
        count: valueBetAnalyses.length,
        bets: valueBetAnalyses.map(v => ({
          market: v.market,
          pick: v.pick,
          value: v.value,
          edge: v.edge,
          fairOdds: v.fairOdds,
          kellyStake: v.kelly.halfKelly,
          recommendation: v.recommendation,
        })),
        bestBet: valueBetAnalyses[0] ? {
          market: valueBetAnalyses[0].market,
          pick: valueBetAnalyses[0].pick,
          value: valueBetAnalyses[0].value,
        } : null,
      } : null,
      // Faz 2: API Ensemble Validation
      apiValidation: apiValidation ? {
        label: apiValidation.confidenceLabel,
        deviation: apiValidation.deviation,
        message: apiValidation.message,
      } : null,
    };

    // Redis cache'e kaydet (async)
    cacheSet(cacheKey, responseData, REDIS_TTL.MATCH_DETAIL).catch(() => {});

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('[Match Detail API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch match details' },
      { status: 500 }
    );
  }
}

/**
 * Bahis önerilerini oluştur
 * Hakem etkisi ve ağırlıklı istatistikler dahil
 */
function generateBetSuggestions(
  matchDetail: Awaited<ReturnType<typeof getMatchDetail>>,
  refereeStats: Referee | null,
  homeStats: TeamFixtureStats | null,
  awayStats: TeamFixtureStats | null,
  homePlayerCards: PlayerCardStats[] = [],
  awayPlayerCards: PlayerCardStats[] = []
): BetSuggestion[] {
  // =====================================
  // REFEREE IMPACT FACTOR
  // Hakem etkisi çarpanı
  // =====================================
  const getRefereeMultiplier = (): { cards: number; goals: number; penalties: number } => {
    if (!refereeStats || !refereeStats.averages) {
      return { cards: 1.0, goals: 1.0, penalties: 1.0 };
    }
    
    const avgYellow = refereeStats.averages.yellow_per_match || 3.5;
    const avgRed = refereeStats.averages.red_per_match || 0.1;
    const avgPens = refereeStats.averages.pens_per_match || 0.2;
    
    // Kart çarpanı: 3.5 kart/maç = 1.0, 5+ = 1.3, 2- = 0.7
    let cardMultiplier = 1.0;
    if (avgYellow >= 5) cardMultiplier = 1.3;
    else if (avgYellow >= 4.5) cardMultiplier = 1.2;
    else if (avgYellow >= 4) cardMultiplier = 1.1;
    else if (avgYellow <= 2.5) cardMultiplier = 0.7;
    else if (avgYellow <= 3) cardMultiplier = 0.85;
    
    // Kırmızı kart etkisi
    if (avgRed >= 0.2) cardMultiplier += 0.1;
    
    // Penaltı çarpanı
    let penaltyMultiplier = 1.0;
    if (avgPens >= 0.4) penaltyMultiplier = 1.3;
    else if (avgPens >= 0.3) penaltyMultiplier = 1.15;
    else if (avgPens <= 0.1) penaltyMultiplier = 0.8;
    
    // Gol çarpanı (penaltılar golleri etkiler)
    const goalMultiplier = 1.0 + ((penaltyMultiplier - 1) * 0.3);
    
    return { 
      cards: cardMultiplier, 
      goals: goalMultiplier, 
      penalties: penaltyMultiplier 
    };
  };

  const refereeMultiplier = getRefereeMultiplier();

  // Helper: Güvenden oran hesapla - GERÇEKÇİ ORANLAR
  // Bahis siteleri tipik olarak %10-15 margin koyar
  // Ayrıca düşük olasılıklı bahislere daha yüksek margin uygulanır
  const calculateOdds = (confidence: number, market: string): number => {
    // Bahis sitesi margin'i (%12 ortalama)
    const margin = 0.12;
    
    // Temel oran: 1 / (probability * (1 - margin))
    // Ama siteler düşük güvene daha çok margin koyar
    const probability = confidence / 100;
    const adjustedMargin = margin + (1 - probability) * 0.05; // Düşük olasılık = daha fazla margin
    
    let baseOdds = 1 / (probability * (1 - adjustedMargin));
    
    // Market tipine göre ek margin (bazı marketler daha karlı)
    if (market.includes('Kart') || market.includes('kart')) {
      baseOdds = baseOdds * 1.15; // Kart bahisleri yüksek margin
    } else if (market.includes('İY/MS')) {
      baseOdds = baseOdds * 1.25; // İY/MS çok yüksek margin
    } else if (market.includes('Oyuncu')) {
      baseOdds = baseOdds * 1.20; // Oyuncu bahisleri
    } else if (market.includes('KG') || market.includes('Gol')) {
      baseOdds = baseOdds * 1.08; // Gol marketleri standart
    }
    
    // Gerçekçi aralık: 1.25 - 15.00
    // %90 güven bile 1.25'ten düşük olamaz (siteler o kadar düşük vermez)
    return Math.max(1.25, Math.min(15.00, Number(baseOdds.toFixed(2))));
  };

  const suggestions: BetSuggestionInput[] = [];

  // 1. Gol bahisleri (Alt/Üst)
  if (homeStats && awayStats) {
    const homeAvgGoals = (homeStats.goalsScored + homeStats.goalsConceded) / (homeStats.matchesPlayed || 1);
    const awayAvgGoals = (awayStats.goalsScored + awayStats.goalsConceded) / (awayStats.matchesPlayed || 1);
    const avgTotalGoals = (homeAvgGoals + awayAvgGoals) / 2;

    if (avgTotalGoals >= 3.2) {
      suggestions.push({
        type: 'goals',
        market: 'Ü2.5 Gol',
        pick: 'Üst 2.5',
        confidence: Math.min(85, 60 + Math.round((avgTotalGoals - 2.5) * 30)),
        reasoning: `Ev sahibi maç başı ${(homeStats.goalsScored / homeStats.matchesPlayed).toFixed(1)} gol, deplasman ${(awayStats.goalsScored / awayStats.matchesPlayed).toFixed(1)} gol atıyor`,
        value: avgTotalGoals >= 3.5 ? 'high' : 'medium',
      });
    } else if (avgTotalGoals <= 2.2) {
      suggestions.push({
        type: 'goals',
        market: 'A2.5 Gol',
        pick: 'Alt 2.5',
        confidence: Math.min(80, 55 + Math.round((2.5 - avgTotalGoals) * 35)),
        reasoning: `Her iki takım da düşük skorlu maçlar oynuyor (ort. ${avgTotalGoals.toFixed(1)} gol)`,
        value: avgTotalGoals <= 1.8 ? 'high' : 'medium',
      });
    }

    // KG (Her İki Takım da Gol Atar)
    const bttsRate = ((homeStats.bothTeamsScored + awayStats.bothTeamsScored) / 
                      (homeStats.matchesPlayed + awayStats.matchesPlayed)) * 100;
    if (bttsRate >= 65) {
      suggestions.push({
        type: 'btts',
        market: 'KG',
        pick: 'Var',
        confidence: Math.min(85, Math.round(bttsRate)),
        reasoning: `Son maçların %${bttsRate.toFixed(0)}'ında her iki takım da gol attı`,
        value: bttsRate >= 75 ? 'high' : 'medium',
      });
    } else if (bttsRate <= 30) {
      suggestions.push({
        type: 'btts',
        market: 'KG',
        pick: 'Yok',
        confidence: Math.min(80, 50 + Math.round((40 - bttsRate))),
        reasoning: `Son maçların sadece %${bttsRate.toFixed(0)}'ında karşılıklı gol var`,
        value: bttsRate <= 20 ? 'high' : 'medium',
      });
    }

    // 🆕 İLK YARI GOL BAHİSLERİ
    const htOver05Rate = ((homeStats.firstHalfOver05 + awayStats.firstHalfOver05) / 
                          (homeStats.matchesPlayed + awayStats.matchesPlayed)) * 100;
    const htOver15Rate = ((homeStats.firstHalfOver15 + awayStats.firstHalfOver15) / 
                          (homeStats.matchesPlayed + awayStats.matchesPlayed)) * 100;

    if (htOver05Rate >= 80) {
      suggestions.push({
        type: 'goals',
        market: 'İY Ü0.5',
        pick: 'Üst 0.5',
        confidence: Math.min(90, Math.round(htOver05Rate)),
        reasoning: `Maçların %${htOver05Rate.toFixed(0)}'ında ilk yarı gol var`,
        value: htOver05Rate >= 90 ? 'high' : 'medium',
      });
    } else if (htOver05Rate <= 40) {
      suggestions.push({
        type: 'goals',
        market: 'İY A0.5',
        pick: 'Alt 0.5',
        confidence: Math.min(75, 50 + Math.round((50 - htOver05Rate))),
        reasoning: `Maçların %${(100 - htOver05Rate).toFixed(0)}'ında ilk yarı gol yok`,
        value: htOver05Rate <= 25 ? 'high' : 'medium',
      });
    }

    if (htOver15Rate >= 60) {
      suggestions.push({
        type: 'goals',
        market: 'İY Ü1.5',
        pick: 'Üst 1.5',
        confidence: Math.min(80, Math.round(htOver15Rate + 10)),
        reasoning: `Maçların %${htOver15Rate.toFixed(0)}'ında ilk yarı 2+ gol var`,
        value: htOver15Rate >= 70 ? 'high' : 'medium',
      });
    }

    // 🆕 İY/MS BAHİSLERİ
    // Ev sahibi için İY/MS analizi
    const homeHtWinRate = (homeStats.htWins / homeStats.matchesPlayed) * 100;
    const homeFullWinRate = (homeStats.homeWins / (homeStats.homeWins + homeStats.homeLosses + homeStats.homeDraws || 1)) * 100;
    
    // Deplasman için İY/MS analizi
    const awayHtWinRate = (awayStats.htWins / awayStats.matchesPlayed) * 100;
    const awayFullWinRate = (awayStats.awayWins / (awayStats.awayWins + awayStats.awayLosses + awayStats.awayDraws || 1)) * 100;

    // 1/1 (Ev sahibi ilk yarı, ev sahibi maç sonu)
    if (homeHtWinRate >= 50 && homeFullWinRate >= 60) {
      suggestions.push({
        type: 'htft',
        market: 'İY/MS',
        pick: '1/1',
        confidence: Math.min(75, Math.round((homeHtWinRate + homeFullWinRate) / 2.5)),
        reasoning: `Ev sahibi İY'de %${homeHtWinRate.toFixed(0)} önde, MS %${homeFullWinRate.toFixed(0)} kazanıyor`,
        value: homeHtWinRate >= 60 && homeFullWinRate >= 70 ? 'high' : 'medium',
      });
    }

    // 2/2 (Deplasman ilk yarı, deplasman maç sonu)
    if (awayHtWinRate >= 45 && awayFullWinRate >= 55) {
      suggestions.push({
        type: 'htft',
        market: 'İY/MS',
        pick: '2/2',
        confidence: Math.min(70, Math.round((awayHtWinRate + awayFullWinRate) / 2.5)),
        reasoning: `Deplasman İY'de %${awayHtWinRate.toFixed(0)} önde, MS %${awayFullWinRate.toFixed(0)} kazanıyor`,
        value: awayHtWinRate >= 55 && awayFullWinRate >= 65 ? 'high' : 'medium',
      });
    }

    // X/1 veya X/2 (İlk yarı berabere, maç sonunda kazanan)
    const homeHtDrawRate = (homeStats.htDraws / homeStats.matchesPlayed) * 100;
    const awayHtDrawRate = (awayStats.htDraws / awayStats.matchesPlayed) * 100;
    const avgHtDrawRate = (homeHtDrawRate + awayHtDrawRate) / 2;

    if (avgHtDrawRate >= 50) {
      // Hangi takım ikinci yarıda daha güçlü?
      if (homeFullWinRate > awayFullWinRate + 20) {
        suggestions.push({
          type: 'htft',
          market: 'İY/MS',
          pick: 'X/1',
          confidence: Math.min(70, Math.round(avgHtDrawRate * 0.7 + homeFullWinRate * 0.3)),
          reasoning: `İY beraberlik oranı %${avgHtDrawRate.toFixed(0)}, ev sahibi 2. yarı güçlü`,
          value: avgHtDrawRate >= 60 ? 'high' : 'medium',
        });
      } else if (awayFullWinRate > homeFullWinRate + 15) {
        suggestions.push({
          type: 'htft',
          market: 'İY/MS',
          pick: 'X/2',
          confidence: Math.min(65, Math.round(avgHtDrawRate * 0.7 + awayFullWinRate * 0.3)),
          reasoning: `İY beraberlik oranı %${avgHtDrawRate.toFixed(0)}, deplasman 2. yarı güçlü`,
          value: avgHtDrawRate >= 60 ? 'high' : 'medium',
        });
      }
    }
  }

  // 2. Kart bahisleri (hakem etkisi çarpanı ile)
  if (refereeStats && refereeStats.averages) {
    const avgCards = refereeStats.averages.yellow_per_match + refereeStats.averages.red_per_match;
    
    // Hakem çarpanı ile düzeltilmiş güven
    const cardConfidenceBoost = Math.round((refereeMultiplier.cards - 1) * 20);
    
    if (avgCards >= 5) {
      suggestions.push({
        type: 'cards',
        market: 'Kart',
        pick: 'Ü4.5',
        confidence: Math.min(90, 60 + Math.round((avgCards - 4.5) * 15) + cardConfidenceBoost),
        reasoning: `Hakem ${refereeStats.name} maç başına ${avgCards.toFixed(1)} kart çıkarıyor (×${refereeMultiplier.cards.toFixed(2)} çarpan)`,
        value: avgCards >= 6 ? 'high' : 'medium',
      });
    } else if (avgCards <= 3.5) {
      suggestions.push({
        type: 'cards',
        market: 'Kart',
        pick: 'A4.5',
        confidence: Math.min(80, 55 + Math.round((4.5 - avgCards) * 12) - cardConfidenceBoost),
        reasoning: `Hakem ${refereeStats.name} kart konusunda ılımlı (ort. ${avgCards.toFixed(1)} kart)`,
        value: avgCards <= 2.5 ? 'high' : 'low',
      });
    }

    // Takım kart istatistikleri de varsa kombine et (ağırlıklı ortalama kullan)
    if (homeStats && awayStats) {
      const homeWeighted = homeStats.seasonStats 
        ? calculateWeightedStats(homeStats) 
        : null;
      const awayWeighted = awayStats.seasonStats 
        ? calculateWeightedStats(awayStats) 
        : null;
      
      const teamAvgCards = (homeWeighted?.avgCards ?? homeStats.totalCards / homeStats.matchesPlayed) + 
                           (awayWeighted?.avgCards ?? awayStats.totalCards / awayStats.matchesPlayed);
      
      // Hakem çarpanı ile düzeltilmiş takım kart ortalaması
      const adjustedTeamCards = teamAvgCards * refereeMultiplier.cards;
      
      if (avgCards >= 5 && adjustedTeamCards >= 3.5) {
        const existing = suggestions.find(s => s.market === 'Toplam Kart');
        if (existing) {
          existing.confidence = Math.min(95, existing.confidence + 10);
          existing.reasoning += `. Takımlar da kartlı (ort. ${adjustedTeamCards.toFixed(1)} kart/maç, hakem çarpanı dahil)`;
          existing.value = 'high';
        }
      }
    }
  } else if (homeStats && awayStats) {
    // Hakem yoksa sadece takım kartlarına bak
    const teamAvgCards = homeStats.totalCards / homeStats.matchesPlayed + awayStats.totalCards / awayStats.matchesPlayed;
    if (teamAvgCards >= 4) {
      suggestions.push({
        type: 'cards',
        market: 'Toplam Kart',
        pick: 'Üst 3.5 Kart',
        confidence: Math.min(70, 50 + Math.round(teamAvgCards * 5)),
        reasoning: `Takımlar maç başına toplam ${teamAvgCards.toFixed(1)} kart görüyor`,
        value: teamAvgCards >= 5 ? 'high' : 'medium',
      });
    }
  }

  // 3. Maç sonucu (H2H + form'a göre)
  if (matchDetail.h2hSummary && matchDetail.prediction) {
    const { homeWins, awayWins, draws, totalMatches } = matchDetail.h2hSummary;
    const { confidence, winner } = matchDetail.prediction;

    if (confidence >= 60 && winner) {
      suggestions.push({
        type: 'result',
        market: 'Maç Sonucu',
        pick: winner,
        confidence,
        reasoning: `H2H: ${homeWins}-${draws}-${awayWins} (${totalMatches} maç). Form analizi %${confidence} güven veriyor`,
        value: confidence >= 70 ? 'high' : 'medium',
      });
    }

    // Beraberlik potansiyeli
    if (draws >= 3 && totalMatches >= 5) {
      const drawRate = (draws / totalMatches) * 100;
      if (drawRate >= 40) {
        suggestions.push({
          type: 'result',
          market: 'Maç Sonucu',
          pick: 'Beraberlik',
          confidence: Math.min(70, Math.round(drawRate + 15)),
          reasoning: `Son ${totalMatches} karşılaşmanın ${draws} tanesi berabere bitti (%${drawRate.toFixed(0)})`,
          value: drawRate >= 50 ? 'high' : 'medium',
        });
      }
    }
  }

  // 4. 🆕 OYUNCU BAZLI KART BAHİSLERİ
  const allPlayerCards = [...homePlayerCards, ...awayPlayerCards];
  
  // En çok kart gören oyuncuları bul (cardRate > 0.4 = her 2-3 maçta 1 kart)
  const cardRiskyPlayers = allPlayerCards.filter(p => p.cardRate >= 0.35 && p.matchesPlayed >= 5);
  
  for (const player of cardRiskyPlayers.slice(0, 3)) {
    const cardPercentage = Math.round(player.cardRate * 100);
    suggestions.push({
      type: 'cards',
      market: 'Oyuncu Kart',
      pick: `${player.playerName} Kart Görecek`,
      confidence: Math.min(80, 50 + cardPercentage),
      reasoning: `${player.matchesPlayed} maçta ${player.totalCards} kart (${cardPercentage}% oran)`,
      value: player.cardRate >= 0.5 ? 'high' : player.cardRate >= 0.4 ? 'medium' : 'low',
    });
  }

  // Hakem + yüksek kartlı oyuncu kombinasyonu
  if (refereeStats && refereeStats.averages && refereeStats.averages.yellow_per_match >= 4) {
    const topCardPlayer = cardRiskyPlayers[0];
    if (topCardPlayer && topCardPlayer.cardRate >= 0.4) {
      const existing = suggestions.find(s => s.pick === `${topCardPlayer.playerName} Kart Görecek`);
      if (existing) {
        existing.confidence = Math.min(90, existing.confidence + 15);
        existing.reasoning += `. Hakem ${refereeStats.name} kartçı (${refereeStats.averages.yellow_per_match.toFixed(1)} sarı/maç)`;
        existing.value = 'high';
      }
    }
  }

  // Önerileri güven oranına göre sırala ve odds ekle
  return suggestions
    .map(s => ({
      ...s,
      odds: calculateOdds(s.confidence, s.market),
    }))
    .sort((a, b) => b.confidence - a.confidence);
}
