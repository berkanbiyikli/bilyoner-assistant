/**
 * Surprise Radar API Route
 * Sürpriz maçları tespit eden ana endpoint
 * 
 * Scanner analizi + Surprise Detector = Sürpriz Radar Özeti
 */

import { NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { scanMatches, type ScanInput, LEAGUE_DNA } from '@/lib/prediction/scanner';
import { 
  analyzeAllSurprises, 
  buildSurpriseRadarSummary,
} from '@/lib/surprise';
import { cacheGet, cacheSet } from '@/lib/cache/redis-cache';

export const dynamic = 'force-dynamic';

// Cache key
function getCacheKey(): string {
  const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());
  return `surprise-radar:${dateStr}`;
}

export async function GET() {
  try {
    // 1. Cache kontrol (5 dakika)
    const cacheKey = getCacheKey();
    const cached = await cacheGet<ReturnType<typeof buildSurpriseRadarSummary>>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    // 2. Günün maçlarını al
    const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const matches = await getDailyMatches(new Date(dateStr));
    
    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: true,
        data: buildSurpriseRadarSummary([], 0),
      });
    }

    // 3. Maçları ScanInput'a dönüştür
    const scanInputs: ScanInput[] = matches
      .filter(m => m.status.isUpcoming || m.status.isLive)
      .map(m => {
        // League DNA'dan default odds hesapla
        const dna = LEAGUE_DNA[m.league.id];
        const margin = 1.08;
        
        let odds: ScanInput['odds'] = {};
        if (m.betSuggestions && m.betSuggestions.length > 0) {
          odds = {
            home: m.betSuggestions.find(b => b.pick === 'Ev Sahibi')?.odds,
            draw: m.betSuggestions.find(b => b.pick === 'Beraberlik')?.odds,
            away: m.betSuggestions.find(b => b.pick === 'Deplasman')?.odds,
            over25: m.betSuggestions.find(b => b.pick === 'Üst 2.5')?.odds,
            under25: m.betSuggestions.find(b => b.pick === 'Alt 2.5')?.odds,
            bttsYes: m.betSuggestions.find(b => b.pick === 'KG Var')?.odds,
            bttsNo: m.betSuggestions.find(b => b.pick === 'KG Yok')?.odds,
          };
        } else if (dna) {
          odds = {
            home: Math.round((1 / dna.homeWinRate) * margin * 100) / 100,
            draw: Math.round((1 / dna.drawRate) * margin * 100) / 100,
            away: Math.round((1 / (1 - dna.homeWinRate - dna.drawRate)) * margin * 100) / 100,
            over25: Math.round((1 / dna.over25Rate) * margin * 100) / 100,
            under25: Math.round((1 / (1 - dna.over25Rate)) * margin * 100) / 100,
            bttsYes: Math.round((1 / dna.bttsRate) * margin * 100) / 100,
            bttsNo: Math.round((1 / (1 - dna.bttsRate)) * margin * 100) / 100,
          };
        }

        return {
          fixtureId: m.id,
          homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
          awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
          league: { id: m.league.id, name: m.league.name },
          kickoff: m.date,
          homeStats: m.teamStats ? {
            goalsScored: m.teamStats.homeGoalsScored || 0,
            goalsConceded: m.teamStats.homeGoalsConceded || 0,
            matchesPlayed: 10, // DailyMatchFixture'da matchesPlayed yok, varsayılan
          } : undefined,
          awayStats: m.teamStats ? {
            goalsScored: m.teamStats.awayGoalsScored || 0,
            goalsConceded: m.teamStats.awayGoalsConceded || 0,
            matchesPlayed: 10,
          } : undefined,
          odds,
          h2h: m.h2hSummary ? {
            homeWins: m.h2hSummary.homeWins,
            draws: m.h2hSummary.draws,
            awayWins: m.h2hSummary.awayWins,
            totalMatches: m.h2hSummary.totalMatches,
          } : undefined,
        };
      });

    // 4. Scanner analizi
    const scanResult = await scanMatches(scanInputs);

    // 5. API predictions (betSuggestions oranlarından türet)
    const apiPredictions = new Map<number, { homeWinPercent: number; drawPercent: number; awayWinPercent: number }>();
    for (const m of matches) {
      // Önce betSuggestions'dan implied probability hesapla
      const homeBet = m.betSuggestions?.find(b => b.pick === 'Ev Sahibi');
      const drawBet = m.betSuggestions?.find(b => b.pick === 'Beraberlik');
      const awayBet = m.betSuggestions?.find(b => b.pick === 'Deplasman');
      
      if (homeBet?.odds && drawBet?.odds && awayBet?.odds) {
        const rawHome = 1 / homeBet.odds;
        const rawDraw = 1 / drawBet.odds;
        const rawAway = 1 / awayBet.odds;
        const total = rawHome + rawDraw + rawAway;
        
        apiPredictions.set(m.id, {
          homeWinPercent: Math.round((rawHome / total) * 100),
          drawPercent: Math.round((rawDraw / total) * 100),
          awayWinPercent: Math.round((rawAway / total) * 100),
        });
      } else if (m.prediction?.confidence) {
        // Fallback: prediction confidence'dan tahmin
        const conf = m.prediction.confidence;
        const winner = m.prediction.winner;
        if (winner === m.homeTeam.name) {
          apiPredictions.set(m.id, { homeWinPercent: conf, drawPercent: Math.round((100 - conf) * 0.4), awayWinPercent: Math.round((100 - conf) * 0.6) });
        } else if (winner === m.awayTeam.name) {
          apiPredictions.set(m.id, { homeWinPercent: Math.round((100 - conf) * 0.6), drawPercent: Math.round((100 - conf) * 0.4), awayWinPercent: conf });
        } else {
          apiPredictions.set(m.id, { homeWinPercent: 33, drawPercent: 34, awayWinPercent: 33 });
        }
      }
    }

    // 6. Surprise analysis
    const surprises = analyzeAllSurprises(scanResult.all, scanInputs, apiPredictions);

    // 7. Build summary
    const summary = buildSurpriseRadarSummary(surprises, matches.length);

    // 8. Cache (5 dakika)
    await cacheSet(cacheKey, summary, 300);

    return NextResponse.json({
      success: true,
      data: summary,
      cached: false,
    });
  } catch (error) {
    console.error('[SurpriseRadar] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Surprise radar failed', details: String(error) },
      { status: 500 }
    );
  }
}
