/**
 * Günlük Maç Önizleme API
 * Tüm günün maçlarını istatistiklerle tweetler (thread olarak)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { sendTweet, sendReplyTweet } from '@/lib/bot/twitter';
import { isTop20League } from '@/config/league-priorities';
import { fetchRealOdds } from '@/lib/api-football/odds';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Tüm maçlar için daha uzun süre

// Lig öncelik sıralaması
const LEAGUE_PRIORITY: Record<number, number> = {
  203: 1,   // Süper Lig
  206: 2,   // Türkiye Kupası
  39: 3,    // Premier League
  140: 4,   // La Liga
  135: 5,   // Serie A
  78: 6,    // Bundesliga
  61: 7,    // Ligue 1
  2: 8,     // Champions League
  3: 9,     // Europa League
  848: 10,  // Conference League
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
        if (priorityA !== priorityB) return priorityA - priorityB;
        // Aynı lig içinde saate göre sırala
        return a.time.localeCompare(b.time);
      });
    
    if (topMatches.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Top liglerden maç yok',
      });
    }
    
    // TÜM maçlar için önizleme oluştur
    const previews: MatchPreview[] = [];
    
    for (const match of topMatches) {
      // Gerçek oranları çek
      const odds = await fetchRealOdds(match.id);
      
      // En iyi bahis tipini belirle (basit analiz)
      let pick = 'Üst 2.5';
      let oddValue = 1.85;
      let insight = '';
      
      // BTTS oranlarına bak
      const bttsOdds = odds.find(o => o.betType === 'btts');
      const over25Odds = odds.find(o => o.betType === 'over25');
      const homeOdds = odds.find(o => o.betType === 'home');
      const awayOdds = odds.find(o => o.betType === 'away');
      
      // En iyi value'yu seç
      if (homeOdds && homeOdds.odds <= 1.40) {
        pick = 'MS 1';
        oddValue = homeOdds.odds;
        insight = 'Ev sahibi favori';
      } else if (awayOdds && awayOdds.odds <= 1.40) {
        pick = 'MS 2';
        oddValue = awayOdds.odds;
        insight = 'Deplasman favori';
      } else if (bttsOdds && bttsOdds.odds < 1.90) {
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
    
    // Tweet'leri oluştur - her tweet'e 4 maç sığar
    const tweets = formatDailyPreviewThreads(previews);
    
    // Tweet at (thread olarak)
    let mainTweetId: string | undefined;
    const tweetIds: string[] = [];
    
    if (!isTestMode) {
      if (useMock) {
        console.log('[DailyPreview] MOCK Thread:');
        tweets.forEach((t, i) => console.log(`Tweet ${i + 1}:\n${t}\n`));
      } else {
        // Ana tweet'i at
        const mainResult = await sendTweet(tweets[0]);
        mainTweetId = mainResult.tweetId;
        if (mainTweetId) tweetIds.push(mainTweetId);
        
        // Diğer tweet'leri reply olarak at
        let lastTweetId = mainTweetId;
        for (let i = 1; i < tweets.length; i++) {
          if (lastTweetId) {
            const replyResult = await sendReplyTweet(tweets[i], lastTweetId);
            if (replyResult.tweetId) {
              tweetIds.push(replyResult.tweetId);
              lastTweetId = replyResult.tweetId;
            }
          }
          // Rate limit için kısa bekle
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : `${tweets.length} tweet atıldı (thread)`,
      tweets,
      tweetCount: tweets.length,
      matchCount: previews.length,
      totalMatches: matches.length,
      previews,
      tweetIds,
    });
    
  } catch (error) {
    console.error('[DailyPreview] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}

function formatDailyPreviewThreads(previews: MatchPreview[]): string[] {
  const tweets: string[] = [];
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  
  // Ana tweet - özet
  const mainTweet = `📅 ${today} - GÜNÜN MAÇLARI

📊 Toplam ${previews.length} maç analiz edildi!

🎯 Her maç için tahminler aşağıda 👇

#bahis #iddaa #futbol #tahmin`;
  tweets.push(mainTweet);
  
  // Liglere göre grupla
  const byLeague: Record<string, MatchPreview[]> = {};
  for (const p of previews) {
    if (!byLeague[p.league]) byLeague[p.league] = [];
    byLeague[p.league].push(p);
  }
  
  // Her lig için ayrı tweet
  for (const [league, matches] of Object.entries(byLeague)) {
    let tweetText = `🏆 ${league}\n\n`;
    
    for (const m of matches) {
      const home = m.homeTeam.length > 12 ? m.homeTeam.substring(0, 11) + '.' : m.homeTeam;
      const away = m.awayTeam.length > 12 ? m.awayTeam.substring(0, 11) + '.' : m.awayTeam;
      
      tweetText += `⚽ ${home} vs ${away}\n`;
      tweetText += `⏰ ${m.time} | 🎯 ${m.pick} @${m.odds.toFixed(2)}\n`;
      
      // Karakter limiti kontrolü (280)
      if (tweetText.length > 250 && matches.indexOf(m) < matches.length - 1) {
        tweets.push(tweetText.trim());
        tweetText = `🏆 ${league} (devam)\n\n`;
      } else {
        tweetText += '\n';
      }
    }
    
    if (tweetText.trim().length > 20) {
      tweets.push(tweetText.trim());
    }
  }
  
  return tweets;
}
