/**
 * Surprise Coupon Engine - 3 Farklı Strateji ile Günlük Kupon Üretici
 * 
 * Saat 13:00 TSİ'de çalışır, 3 adet bağımsız kupon üretir:
 * 1. GOL KUPONU: Bol gollü maçlar (3.5 Üst, 2.5 Üst, KG Var)
 * 2. FAVORİ KUPONU: Güçlü takım galibiyet + İY/MS
 * 3. SÜRPRIZ KUPONU: Yüksek oran value bet'ler (Deplasman, İY/MS, HT/FT)
 * 
 * Her kupon maç sayısında bağımsız (2-5 maç arası)
 * İstatistik bazlı seçim yapar ve gerekçe sunar
 */

import { getDailyMatches } from '../api-football/daily-matches';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { getRealOddsForPrediction } from '../api-football/odds';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// ============ TYPES ============

export interface SurpriseMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  league: string;
  leagueId: number;
  kickoff: Date;
  prediction: string;         // "3.5 Üst", "MS 1", "İY/MS 1/1" vb.
  odds: number;
  confidence: number;         // 0-100
  reasoning: string;          // İstatistik bazlı gerekçe
  statLine: string;           // Kısa istatistik satırı (tweet için)
}

export interface SurpriseCoupon {
  id: string;
  strategy: 'gol' | 'favori' | 'surpriz';
  title: string;
  emoji: string;
  description: string;
  matches: SurpriseMatch[];
  totalOdds: number;
  avgConfidence: number;
}

interface MatchWithDetail {
  match: DailyMatchFixture;
  betSuggestions: BetSuggestion[];
  teamStats?: {
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
    homeCleanSheetRate?: number;
    awayCleanSheetRate?: number;
    homeBttsRate?: number;
    awayBttsRate?: number;
    homeAvgCards?: number;
    awayAvgCards?: number;
  };
  poissonAnalysis?: {
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    expectedTotalGoals: number;
    probabilities: {
      homeWin: number;
      draw: number;
      awayWin: number;
      over15: number;
      over25: number;
      over35: number;
      bttsYes: number;
    };
  };
  h2hSummary?: {
    totalMatches: number;
    homeWins: number;
    awayWins: number;
    draws: number;
  };
}

// ============ DATA FETCHING ============

/**
 * Tüm yaklaşan maçları detaylarıyla birlikte çeker
 */
async function fetchMatchesWithDetails(): Promise<MatchWithDetail[]> {
  const dailyMatches = await getDailyMatches();
  if (!dailyMatches || dailyMatches.length === 0) return [];

  const upcomingMatches = dailyMatches.filter(m => m.status.isUpcoming);
  if (upcomingMatches.length === 0) return [];

  console.log(`[SurpriseEngine] ${upcomingMatches.length} yaklaşan maç bulundu`);

  const results: MatchWithDetail[] = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < upcomingMatches.length; i += BATCH_SIZE) {
    const batch = upcomingMatches.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (match) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const params = new URLSearchParams({
          fixtureId: String(match.id),
          homeTeamId: String(match.homeTeam.id),
          awayTeamId: String(match.awayTeam.id),
          leagueId: String(match.league.id),
        });
        if (match.referee?.name) {
          params.set('referee', match.referee.name);
        }

        const res = await fetch(`${BASE_URL}/api/match-detail?${params}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const json = await res.json();
        const data = json.data || json;

        if (!data.betSuggestions || data.betSuggestions.length === 0) return null;

        return {
          match,
          betSuggestions: data.betSuggestions as BetSuggestion[],
          teamStats: data.teamStats,
          poissonAnalysis: data.poissonAnalysis,
          h2hSummary: data.h2hSummary,
        };
      } catch {
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }

    if (i + BATCH_SIZE < upcomingMatches.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`[SurpriseEngine] ${results.length} maç detaylı veri alındı`);
  return results;
}

// ============ STRATEGY 1: GOL KUPONU ============

function buildGolCoupon(matches: MatchWithDetail[]): SurpriseCoupon | null {
  const candidates: SurpriseMatch[] = [];

  for (const { match, betSuggestions, teamStats, poissonAnalysis } of matches) {
    // 3.5 Üst adayları
    if (poissonAnalysis && poissonAnalysis.probabilities.over35 >= 40) {
      const over35Sug = betSuggestions.find(s => s.pick === 'Üst 3.5' || s.pick.includes('3.5'));
      const over25Sug = betSuggestions.find(s => s.pick === 'Üst 2.5');
      const bttsSug = betSuggestions.find(s => s.pick === 'KG Var');

      const xG = poissonAnalysis.expectedTotalGoals;
      const avgHome = teamStats ? teamStats.homeGoalsScored : 0;
      const avgAway = teamStats ? teamStats.awayGoalsScored : 0;

      // 3.5 Üst: xG >= 3.2 ve prob >= 42%
      if (over35Sug && xG >= 3.2 && over35Sug.odds >= 1.60) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: '3.5 Üst',
          odds: over35Sug.odds,
          confidence: Math.round(poissonAnalysis.probabilities.over35),
          reasoning: `Poisson xG: ${xG.toFixed(1)} | Ev ${avgHome.toFixed(1)} gol/maç, Dep ${avgAway.toFixed(1)} gol/maç`,
          statLine: `xG ${xG.toFixed(1)} · %${Math.round(poissonAnalysis.probabilities.over35)} olasılık`,
        });
        continue;
      }

      // 2.5 Üst: xG >= 2.5 ve prob >= 55%
      if (over25Sug && xG >= 2.5 && poissonAnalysis.probabilities.over25 >= 55 && over25Sug.odds >= 1.40) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: '2.5 Üst',
          odds: over25Sug.odds,
          confidence: Math.round(poissonAnalysis.probabilities.over25),
          reasoning: `Poisson xG: ${xG.toFixed(1)} | Her iki takım da gol atabiliyor`,
          statLine: `xG ${xG.toFixed(1)} · %${Math.round(poissonAnalysis.probabilities.over25)} olasılık`,
        });
        continue;
      }

      // KG Var: btts >= 55%
      if (bttsSug && poissonAnalysis.probabilities.bttsYes >= 55 && bttsSug.odds >= 1.50) {
        const bttsRate = teamStats ? ((teamStats.homeBttsRate || 0) + (teamStats.awayBttsRate || 0)) / 2 : 0;
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'KG Var',
          odds: bttsSug.odds,
          confidence: Math.round(poissonAnalysis.probabilities.bttsYes),
          reasoning: `KG oranı: %${bttsRate.toFixed(0)} | Her iki takım da ağ buluyor`,
          statLine: `KG %${Math.round(poissonAnalysis.probabilities.bttsYes)} · xG ${xG.toFixed(1)}`,
        });
      }
    }
  }

  // En iyi adayları seç (confidence * odds dengesi)
  const sorted = candidates.sort((a, b) => {
    const scoreA = a.confidence * 0.6 + (a.odds > 1.80 ? 15 : 0) + (a.prediction === '3.5 Üst' ? 10 : 0);
    const scoreB = b.confidence * 0.6 + (b.odds > 1.80 ? 15 : 0) + (b.prediction === '3.5 Üst' ? 10 : 0);
    return scoreB - scoreA;
  });

  // Farklı liglerden seç, 2-5 maç
  const selected = pickFromDifferentLeagues(sorted, 2, 5);
  if (selected.length < 2) return null;

  const totalOdds = selected.reduce((acc, m) => acc * m.odds, 1);
  const avgConf = selected.reduce((sum, m) => sum + m.confidence, 0) / selected.length;

  return {
    id: `GOL-${Date.now().toString(36).toUpperCase()}`,
    strategy: 'gol',
    title: '⚽ GOL KUPONU',
    emoji: '⚽',
    description: 'Bol gollü maçlar · Poisson xG modeline dayalı',
    matches: selected,
    totalOdds: Math.round(totalOdds * 100) / 100,
    avgConfidence: Math.round(avgConf),
  };
}

// ============ STRATEGY 2: FAVORİ KUPONU ============

function buildFavoriCoupon(matches: MatchWithDetail[], _usedFixtures: Set<number>): SurpriseCoupon | null {
  // Favori kuponu MS/İY/MS kullanıyor, Gol kuponu gol marketleri — fixture paylaşımına izin ver
  const candidates: SurpriseMatch[] = [];

  for (const { match, betSuggestions, poissonAnalysis, h2hSummary } of matches) {
    if (!poissonAnalysis) continue;
    const { homeWin, awayWin } = poissonAnalysis.probabilities;

    // Güçlü ev sahibi MS 1
    if (homeWin >= 48) {
      const ms1 = betSuggestions.find(s =>
        s.pick === 'Ev Sahibi' || s.pick === 'MS 1' || s.type === 'result'
      );
      if (ms1 && ms1.odds >= 1.20 && ms1.odds <= 2.50) {
        const h2hNote = h2hSummary
          ? `H2H: ${h2hSummary.homeWins}G ${h2hSummary.draws}B ${h2hSummary.awayWins}M`
          : '';
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'MS 1',
          odds: ms1.odds,
          confidence: Math.round(homeWin),
          reasoning: `Ev sahibi kazanma: %${Math.round(homeWin)} ${h2hNote}`,
          statLine: `Ev %${Math.round(homeWin)} · @${ms1.odds.toFixed(2)}`,
        });
        continue;
      }
    }

    // Güçlü deplasman MS 2
    if (awayWin >= 45) {
      const ms2 = betSuggestions.find(s =>
        s.pick === 'Deplasman' || s.pick === 'MS 2'
      );
      if (ms2 && ms2.odds >= 1.30 && ms2.odds <= 2.80) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'MS 2',
          odds: ms2.odds,
          confidence: Math.round(awayWin),
          reasoning: `Deplasman kazanma: %${Math.round(awayWin)}`,
          statLine: `Dep %${Math.round(awayWin)} · @${ms2.odds.toFixed(2)}`,
        });
        continue;
      }
    }

    // İY/MS - Favori hem ilk yarı hem maç sonu (güçlü baskı)
    if (homeWin >= 53) {
      // İY/MS 1/1 olarak puanla
      const iyOdds = Math.round((1 / (homeWin / 100 * 0.75)) * 1.08 * 100) / 100; // IY/MS hesapla
      if (iyOdds >= 1.50 && iyOdds <= 3.00) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'İY/MS 1/1',
          odds: iyOdds,
          confidence: Math.round(homeWin * 0.75),
          reasoning: `Ev sahibi dominant: %${Math.round(homeWin)} MS kazanma, İY de önde olma olasılığı yüksek`,
          statLine: `MS %${Math.round(homeWin)} · İY/MS @${iyOdds.toFixed(2)}`,
        });
      }
    }
  }

  const sorted = candidates.sort((a, b) => {
    const scoreA = a.confidence * 0.7 + (a.prediction.includes('İY/MS') ? 8 : 0);
    const scoreB = b.confidence * 0.7 + (b.prediction.includes('İY/MS') ? 8 : 0);
    return scoreB - scoreA;
  });

  const selected = pickFromDifferentLeagues(sorted, 2, 4);
  if (selected.length < 2) return null;

  const totalOdds = selected.reduce((acc, m) => acc * m.odds, 1);
  const avgConf = selected.reduce((sum, m) => sum + m.confidence, 0) / selected.length;

  return {
    id: `FAV-${Date.now().toString(36).toUpperCase()}`,
    strategy: 'favori',
    title: '🏆 FAVORİ KUPONU',
    emoji: '🏆',
    description: 'Güçlü takım galibiyetleri · MS & İY/MS modeli',
    matches: selected,
    totalOdds: Math.round(totalOdds * 100) / 100,
    avgConfidence: Math.round(avgConf),
  };
}

// ============ STRATEGY 3: SÜRPRİZ KUPONU ============

function buildSurprizCoupon(matches: MatchWithDetail[], _usedFixtures: Set<number>): SurpriseCoupon | null {
  const candidates: SurpriseMatch[] = [];

  for (const { match, betSuggestions, poissonAnalysis, teamStats } of matches) {
    if (!poissonAnalysis) continue;

    const { homeWin, draw: drawProb, awayWin, over35, bttsYes } = poissonAnalysis.probabilities;
    const xG = poissonAnalysis.expectedTotalGoals;

    // Beraberlik: draw >= 24% ve oran yüksek
    if (drawProb >= 24) {
      const drawSug = betSuggestions.find(s => s.pick === 'Beraberlik' || s.pick === 'X');
      if (drawSug && drawSug.odds >= 2.60 && drawSug.odds <= 5.00) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'MS X',
          odds: drawSug.odds,
          confidence: Math.round(drawProb),
          reasoning: `Beraberlik olasılığı: %${Math.round(drawProb)} - Dengeli güç`,
          statLine: `X %${Math.round(drawProb)} · @${drawSug.odds.toFixed(2)}`,
        });
        continue;
      }
    }

    // Deplasman sürprizi: awayWin >= 30% ama oran yüksek (2.3+)
    if (awayWin >= 30 && awayWin < 50) {
      const ms2 = betSuggestions.find(s => s.pick === 'Deplasman' || s.pick === 'MS 2');
      if (ms2 && ms2.odds >= 2.30 && ms2.odds <= 5.50) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'MS 2 (Sürpriz)',
          odds: ms2.odds,
          confidence: Math.round(awayWin),
          reasoning: `Deplasman value: %${Math.round(awayWin)} olasılık, @${ms2.odds.toFixed(2)} oran`,
          statLine: `Dep %${Math.round(awayWin)} · @${ms2.odds.toFixed(2)} value`,
        });
        continue;
      }
    }

    // KG Var + 3.5 Üst combo - çok gollü sürpriz
    if (bttsYes >= 52 && over35 >= 32 && xG >= 2.8) {
      const bttsOdds = betSuggestions.find(s => s.pick === 'KG Var')?.odds || 1.70;
      const over35Odds = betSuggestions.find(s => s.pick === 'Üst 3.5' || s.pick.includes('3.5'))?.odds;
      if (over35Odds && over35Odds >= 1.80) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: '3.5 Üst',
          odds: over35Odds,
          confidence: Math.round(over35),
          reasoning: `Gol canavarları: xG ${xG.toFixed(1)}, KG %${Math.round(bttsYes)}, 3.5Ü %${Math.round(over35)}`,
          statLine: `xG ${xG.toFixed(1)} · KG %${Math.round(bttsYes)}`,
        });
        continue;
      }
    }

    // Karşılıklı gol + Üst combo
    if (bttsYes >= 50) {
      const bttsSug = betSuggestions.find(s => s.pick === 'KG Var');
      if (bttsSug && bttsSug.odds >= 1.50 && bttsSug.odds <= 2.30) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: 'KG Var',
          odds: bttsSug.odds,
          confidence: Math.round(bttsYes),
          reasoning: `xG ${xG.toFixed(1)} - Her iki takım da ağ buluyor`,
          statLine: `KG %${Math.round(bttsYes)} · xG ${xG.toFixed(1)}`,
        });
      }
    }

    // Çifte Şans 1X - Beraberlik ya da ev sahibi
    if (homeWin + drawProb >= 62 && homeWin < 55 && drawProb >= 22) {
      const dsCombinedProb = homeWin + drawProb;
      const dsOdds = Math.round((1 / (dsCombinedProb / 100)) * 1.08 * 100) / 100;
      if (dsOdds >= 1.35 && dsOdds <= 1.80) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: '1X',
          odds: dsOdds,
          confidence: Math.round(dsCombinedProb),
          reasoning: `Çifte şans: Ev %${Math.round(homeWin)} + X %${Math.round(drawProb)} = %${Math.round(dsCombinedProb)}`,
          statLine: `1X %${Math.round(dsCombinedProb)} · @${dsOdds.toFixed(2)}`,
        });
      }
    }

    // 2.5 Alt - Düşük gollü maç sürprizi
    if (poissonAnalysis.probabilities.over25 < 45 && xG < 2.3) {
      const altOdds = Math.round((1 / ((100 - poissonAnalysis.probabilities.over25) / 100)) * 1.08 * 100) / 100;
      if (altOdds >= 1.50 && altOdds <= 2.50) {
        candidates.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          league: match.league.name,
          leagueId: match.league.id,
          kickoff: new Date(match.timestamp * 1000),
          prediction: '2.5 Alt',
          odds: altOdds,
          confidence: Math.round(100 - poissonAnalysis.probabilities.over25),
          reasoning: `Düşük gol beklentisi: xG ${xG.toFixed(1)} | Alt %${Math.round(100 - poissonAnalysis.probabilities.over25)}`,
          statLine: `Alt %${Math.round(100 - poissonAnalysis.probabilities.over25)} · xG ${xG.toFixed(1)}`,
        });
      }
    }
  }

  const sorted = candidates.sort((a, b) => {
    // Sürpriz kuponu: oran öncelikli sıralama (yüksek oran = iyi)
    const scoreA = a.odds * 15 + a.confidence * 0.4;
    const scoreB = b.odds * 15 + b.confidence * 0.4;
    return scoreB - scoreA;
  });

  const selected = pickFromDifferentLeagues(sorted, 1, 4);
  if (selected.length < 1) return null;

  const totalOdds = selected.reduce((acc, m) => acc * m.odds, 1);
  const avgConf = selected.reduce((sum, m) => sum + m.confidence, 0) / selected.length;

  return {
    id: `SUR-${Date.now().toString(36).toUpperCase()}`,
    strategy: 'surpriz',
    title: '🎲 SÜRPRİZ KUPONU',
    emoji: '🎲',
    description: 'Value bet\'ler · Yüksek oran fırsatları',
    matches: selected,
    totalOdds: Math.round(totalOdds * 100) / 100,
    avgConfidence: Math.round(avgConf),
  };
}

// ============ HELPERS ============

/**
 * Farklı liglerden maç seç - min/max arası
 */
function pickFromDifferentLeagues(
  candidates: SurpriseMatch[],
  min: number,
  max: number
): SurpriseMatch[] {
  const selected: SurpriseMatch[] = [];
  const usedLeagues = new Set<number>();
  const usedFixtures = new Set<number>();

  // Önce farklı liglerden
  for (const c of candidates) {
    if (selected.length >= max) break;
    if (usedLeagues.has(c.leagueId) || usedFixtures.has(c.fixtureId)) continue;
    selected.push(c);
    usedLeagues.add(c.leagueId);
    usedFixtures.add(c.fixtureId);
  }

  // Min'e ulaşılmadıysa aynı ligden de al
  if (selected.length < min) {
    for (const c of candidates) {
      if (selected.length >= min) break;
      if (usedFixtures.has(c.fixtureId)) continue;
      selected.push(c);
      usedFixtures.add(c.fixtureId);
    }
  }

  return selected;
}

/**
 * Gerçek oranları çek ve güncelle (mümkünse)
 */
async function enrichWithRealOdds(coupon: SurpriseCoupon): Promise<SurpriseCoupon> {
  for (const match of coupon.matches) {
    try {
      const realOdds = await getRealOddsForPrediction(match.fixtureId, match.prediction);
      if (realOdds) {
        match.odds = realOdds.odds;
      }
    } catch {
      // Hesaplanan oranı kullan
    }
  }
  coupon.totalOdds = Math.round(
    coupon.matches.reduce((acc, m) => acc * m.odds, 1) * 100
  ) / 100;
  return coupon;
}

// ============ MAIN FUNCTION ============

/**
 * 3 farklı strateji ile sürpriz kuponlar üret
 * @returns 0-3 arası kupon (yeterli maç yoksa boş dönebilir)
 */
export async function generateSurpriseCoupons(): Promise<SurpriseCoupon[]> {
  console.log('[SurpriseEngine] 3 strateji ile kupon üretimi başlıyor...');

  const matches = await fetchMatchesWithDetails();
  if (matches.length < 2) {
    console.log(`[SurpriseEngine] Yeterli maç yok (${matches.length} maç bulundu)`);
    return [];
  }

  console.log(`[SurpriseEngine] ${matches.length} maç ile kupon üretimi yapılıyor`);

  const coupons: SurpriseCoupon[] = [];

  // 1. Gol Kuponu
  const golCoupon = buildGolCoupon(matches);
  if (golCoupon) {
    const enriched = await enrichWithRealOdds(golCoupon);
    coupons.push(enriched);
    console.log(`[SurpriseEngine] ⚽ Gol Kuponu: ${enriched.matches.length} maç, toplam oran ${enriched.totalOdds}`);
  } else {
    console.log('[SurpriseEngine] ⚽ Gol Kuponu: kriterlere uygun maç bulunamadı');
  }

  // 2. Favori Kuponu (MS/İY/MS marketleri — Gol ile fixture paylaşabilir)
  const favoriCoupon = buildFavoriCoupon(matches, new Set<number>());
  if (favoriCoupon) {
    const enriched = await enrichWithRealOdds(favoriCoupon);
    // Post-enrichment: Gerçek oranlar çok yüksekse (favori kuponu mantığına aykırı) maçları çıkar
    enriched.matches = enriched.matches.filter(m => {
      if (m.odds > 2.80) {
        console.log(`[SurpriseEngine] ⚠️ Favori kuponu: ${m.homeTeam} vs ${m.awayTeam} çıkarıldı (oran ${m.odds.toFixed(2)} > 2.80)`);
        return false;
      }
      return true;
    });
    // Toplam oranı yeniden hesapla
    enriched.totalOdds = Math.round(
      enriched.matches.reduce((acc, m) => acc * m.odds, 1) * 100
    ) / 100;
    enriched.avgConfidence = Math.round(
      enriched.matches.reduce((sum, m) => sum + m.confidence, 0) / enriched.matches.length
    );
    if (enriched.matches.length >= 2) {
      coupons.push(enriched);
      console.log(`[SurpriseEngine] 🏆 Favori Kuponu: ${enriched.matches.length} maç, toplam oran ${enriched.totalOdds}`);
    } else {
      console.log(`[SurpriseEngine] ⚠️ Favori Kuponu: yeterli kaliteli maç kalmadı (${enriched.matches.length} maç)`);
    }
  } else {
    console.log('[SurpriseEngine] 🏆 Favori Kuponu: kriterlere uygun maç bulunamadı');
  }

  // 3. Sürpriz Kuponu — farklı marketler kullandığı için fixture paylaşımına izin ver
  const surprizCoupon = buildSurprizCoupon(matches, new Set<number>());
  if (surprizCoupon) {
    const enriched = await enrichWithRealOdds(surprizCoupon);
    // Post-enrichment: Gerçek oranlar çok düşükse (value yok) maçları çıkar
    enriched.matches = enriched.matches.filter(m => {
      if (m.odds < 1.30) {
        console.log(`[SurpriseEngine] ⚠️ Sürpriz kuponu: ${m.homeTeam} vs ${m.awayTeam} çıkarıldı (oran ${m.odds.toFixed(2)} < 1.30 - value yok)`);
        return false;
      }
      return true;
    });
    if (enriched.matches.length >= 1) {
      enriched.totalOdds = Math.round(
        enriched.matches.reduce((acc, m) => acc * m.odds, 1) * 100
      ) / 100;
      enriched.avgConfidence = Math.round(
        enriched.matches.reduce((sum, m) => sum + m.confidence, 0) / enriched.matches.length
      );
      coupons.push(enriched);
      console.log(`[SurpriseEngine] 🎲 Sürpriz Kuponu: ${enriched.matches.length} maç, toplam oran ${enriched.totalOdds}`);
    } else {
      console.log('[SurpriseEngine] ⚠️ Sürpriz Kuponu: enrichment sonrası yeterli maç kalmadı');
    }
  } else {
    console.log('[SurpriseEngine] 🎲 Sürpriz Kuponu: kriterlere uygun maç bulunamadı');
  }

  console.log(`[SurpriseEngine] Toplam ${coupons.length} kupon üretildi`);
  return coupons;
}

// ============ TWEET FORMATTING ============

/** Twitter karakter limiti */
const TWEET_MAX = 280;

/**
 * Takım adını kısalt (tweet'e sığdırmak için)
 */
function shortName(name: string, maxLen: number = 14): string {
  if (name.length <= maxLen) return name;
  // Yaygın kısaltmalar
  const abbreviations: Record<string, string> = {
    'Internacional': 'Inter',
    'Independiente': 'Indep.',
    'Universidad': 'U.',
    'Club Atletico': 'CA',
    'Deportivo': 'Dep.',
    'Sporting': 'Sport.',
  };
  for (const [full, short] of Object.entries(abbreviations)) {
    if (name.includes(full)) {
      const shortened = name.replace(full, short);
      if (shortened.length <= maxLen) return shortened;
    }
  }
  return name.substring(0, maxLen - 1) + '.';
}

/**
 * Lig adını kısalt
 */
function shortLeague(league: string): string {
  const map: Record<string, string> = {
    'Liga Profesional Argentina': 'Liga Pro Argentina',
    'Premier League': 'PL',
    'Bundesliga': 'Bundesliga',
    'La Liga': 'La Liga',
    'Ligue 1': 'Ligue 1',
    'Serie A': 'Serie A',
    'Süper Lig': 'Süper Lig',
    'Eredivisie': 'Eredivisie',
    'Primeira Liga': 'Liga Portugal',
    'Major League Soccer': 'MLS',
    'Championship': 'Champ.',
    'Copa Libertadores': 'Libertadores',
    'Copa Sudamericana': 'Sudamericana',
    'UEFA Champions League': 'UCL',
    'UEFA Europa League': 'UEL',
    'UEFA Europa Conference League': 'UECL',
  };
  if (map[league]) return map[league];
  // Genel kısaltma: 20 karakterden uzunsa kes
  if (league.length > 20) return league.substring(0, 18) + '.';
  return league;
}

/**
 * Kupon tweet metni oluştur — 280 karakter limitine uyumlu
 *
 * Strateji:
 *  1. Önce tam format dene (statLine ile)
 *  2. Sığmazsa kısa format (statLine'sız, kısa takım isimleri)
 *  3. Hâlâ sığmazsa son maçları çıkar (OG image'da zaten tamamı var)
 */
export function formatSurpriseCouponTweet(coupon: SurpriseCoupon, index: number): string {
  // --- TRY 1: Tam format ---
  const full = buildTweetText(coupon, index, { compact: false });
  if (full.length <= TWEET_MAX) return full;

  // --- TRY 2: Compact format (no statLine, shorter names) ---
  const compact = buildTweetText(coupon, index, { compact: true });
  if (compact.length <= TWEET_MAX) return compact;

  // --- TRY 3: Maç sayısını limit dolana kadar düşür ---
  for (let maxMatches = coupon.matches.length - 1; maxMatches >= 2; maxMatches--) {
    const trimmedCoupon = {
      ...coupon,
      matches: coupon.matches.slice(0, maxMatches),
    };
    const txt = buildTweetText(trimmedCoupon, index, {
      compact: true,
      note: `+${coupon.matches.length - maxMatches} maç detayda 👇`,
    });
    if (txt.length <= TWEET_MAX) return txt;
  }

  // --- TRY 4: Ultra minimal ---
  const ultra = buildUltraMinimalTweet(coupon, index);
  if (ultra.length <= TWEET_MAX) return ultra;

  // Son çare: kırp
  return ultra.substring(0, TWEET_MAX - 3) + '...';
}

interface BuildOptions {
  compact?: boolean;
  note?: string;
}

function buildTweetText(
  coupon: SurpriseCoupon,
  index: number,
  opts: BuildOptions = {}
): string {
  const { compact = false, note } = opts;
  const lines: string[] = [];

  lines.push(`${coupon.emoji} ${coupon.title} (${index}/3)`);
  lines.push(`📊 ${coupon.description}`);
  lines.push('');

  for (const match of coupon.matches) {
    const time = formatTimeTR(match.kickoff);
    const league = compact ? shortLeague(match.league) : match.league;
    const home = compact ? shortName(match.homeTeam, 16) : match.homeTeam;
    const away = compact ? shortName(match.awayTeam, 16) : match.awayTeam;

    lines.push(`⏰ ${time} | ${league}`);
    lines.push(`${home} vs ${away}`);
    lines.push(`📌 ${match.prediction} @${match.odds.toFixed(2)}`);
    if (!compact) {
      lines.push(`📈 ${match.statLine}`);
    }
    lines.push('');
  }

  if (note) {
    lines.push(note);
    lines.push('');
  }

  lines.push(`💻 Oran: ${coupon.totalOdds.toFixed(2)} | 🎯 Güven: %${coupon.avgConfidence}`);

  return lines.join('\n');
}

/**
 * Ultra minimal format — sadece takım + tahmin, tek satır
 */
function buildUltraMinimalTweet(coupon: SurpriseCoupon, index: number): string {
  const lines: string[] = [];

  lines.push(`${coupon.emoji} ${coupon.title} (${index}/3)`);
  lines.push('');

  for (const match of coupon.matches) {
    const time = formatTimeTR(match.kickoff);
    const home = shortName(match.homeTeam, 12);
    const away = shortName(match.awayTeam, 12);
    lines.push(`${time} ${home}-${away} ${match.prediction} @${match.odds.toFixed(2)}`);
  }

  lines.push('');
  lines.push(`Oran: ${coupon.totalOdds.toFixed(2)} | Güven: %${coupon.avgConfidence}`);

  return lines.join('\n');
}

function formatTimeTR(date: Date): string {
  return date.toLocaleTimeString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  });
}
