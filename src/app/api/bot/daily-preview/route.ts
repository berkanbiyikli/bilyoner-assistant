/**
 * Günlük Maç Önizleme API
 * Her sabah 10:00'da bugünün öne çıkan maçlarını tweetler
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { sendTweet } from '@/lib/bot/twitter';
import { isTop20League } from '@/config/league-priorities';
import { fetchRealOdds } from '@/lib/api-football/odds';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lig öncelik sıralaması
const LEAGUE_PRIORITY: Record<number, number> = {
  203: 1,   // Süper Lig
  39: 2,    // Premier League
  140: 3,   // La Liga
  135: 4,   // Serie A
  78: 5,    // Bundesliga
  61: 6,    // Ligue 1
  2: 7,     // Champions League
  3: 8,     // Europa League
  848: 9,   // Conference League
  206: 10,  // Türkiye Kupası
};

interface MatchPreview {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  time: string;
  insight: string;
  pick: string;
  odds: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const useMock = process.env.TWITTER_MOCK === 'true';
  
  try {
    // Bugünün maçlarını al
    const matches = await getDailyMatches();
    
    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Bugün maç yok',
      });
    }
    
    // Top ligleri filtrele ve sırala
    const topMatches = matches
      .filter(m => isTop20League(m.league.id))
      .filter(m => m.status.isUpcoming)
      .sort((a, b) => {
        const priorityA = LEAGUE_PRIORITY[a.league.id] || 99;
        const priorityB = LEAGUE_PRIORITY[b.league.id] || 99;
        return priorityA - priorityB;
      })
      .slice(0, 5); // En önemli 5 maç
    
    if (topMatches.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Top liglerden maç yok',
      });
    }
    
    // Her maç için önizleme oluştur
    const previews: MatchPreview[] = [];
    
    for (const match of topMatches.slice(0, 3)) { // Tweet'e 3 maç sığar
      // Gerçek oranları çek
      const odds = await fetchRealOdds(match.id);
      
      // En iyi bahis tipini belirle (basit analiz)
      let pick = 'Üst 2.5';
      let oddValue = 1.85;
      let insight = '';
      
      // BTTS oranlarına bak
      const bttsOdds = odds.find(o => o.betType === 'btts');
      const over25Odds = odds.find(o => o.betType === 'over25');
      
      if (bttsOdds && bttsOdds.odds < 1.90) {
        pick = 'KG Var';
        oddValue = bttsOdds.odds;
        insight = 'İki takım da gol atıyor';
      } else if (over25Odds) {
        pick = 'Üst 2.5';
        oddValue = over25Odds.odds;
        insight = 'Gollü maç bekleniyor';
      }
      
      previews.push({
        fixtureId: match.id,
        homeTeam: match.homeTeam.name,
        awayTeam: match.awayTeam.name,
        league: match.league.name,
        time: match.time,
        insight,
        pick,
        odds: oddValue,
      });
    }
    
    // Tweet formatla
    const tweetText = formatDailyPreviewTweet(previews, matches.length);
    
    // Tweet at
    if (!isTestMode) {
      if (useMock) {
        console.log('[DailyPreview] MOCK Tweet:\n', tweetText);
      } else {
        await sendTweet(tweetText);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : 'Günlük önizleme tweeti atıldı',
      tweet: tweetText,
      matchCount: matches.length,
      previews,
    });
    
  } catch (error) {
    console.error('[DailyPreview] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}

function formatDailyPreviewTweet(previews: MatchPreview[], totalMatches: number): string {
  const lines: string[] = [];
  
  // Başlık
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  lines.push(`📅 ${today} - GÜNÜN MAÇLARI`);
  lines.push('');
  
  // Her maç için
  previews.forEach((p, i) => {
    const home = p.homeTeam.length > 12 ? p.homeTeam.substring(0, 11) + '.' : p.homeTeam;
    const away = p.awayTeam.length > 12 ? p.awayTeam.substring(0, 11) + '.' : p.awayTeam;
    
    lines.push(`${i + 1}. ${home} vs ${away}`);
    lines.push(`⏰ ${p.time} | ${p.league}`);
    lines.push(`🎯 ${p.pick} @${p.odds.toFixed(2)}`);
    if (i < previews.length - 1) lines.push('');
  });
  
  lines.push('');
  lines.push(`📊 Toplam ${totalMatches} maç var bugün!`);
  lines.push('');
  lines.push('#bahis #iddaa #futbol #tahmin');
  
  return lines.join('\n');
}
