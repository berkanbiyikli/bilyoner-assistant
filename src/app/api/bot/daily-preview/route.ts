/**
 * Günlük Maç Önizleme API
 * GERÇEK ANALİZ SİSTEMİ ile tüm günün maçlarını tweetler (thread olarak)
 * - betSuggestions (mor kutu) kullanılır
 * - Form, H2H, istatistikler dahil edilir
 * - Value < 1.50 oranlar atlanır
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { sendTweet, sendReplyTweet } from '@/lib/bot/twitter';
import { isTop20League } from '@/config/league-priorities';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // Tüm maçlar için uzun süre (her maç için match-detail çekiyoruz)

// BASE_URL'i request'ten dinamik olarak alacağız

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

// Minimum oran eşiği - bunun altında value yok
const MIN_VALUE_ODDS = 1.50;
// Minimum güven eşiği (60% makul bir değer)
const MIN_CONFIDENCE = 60;

interface MatchPreview {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueId: number;
  time: string;
  insight: string;       // Kısa analiz
  pick: string;          // Tahmin: MS 1, Üst 2.5, KG Var vs
  odds: number;
  confidence: number;    // Güven %
  value: 'high' | 'medium' | 'low';
  reasoning: string;     // Neden bu tahmin?
  formInfo?: string;     // Son form bilgisi
  h2hInfo?: string;      // H2H bilgisi
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const useMock = process.env.TWITTER_MOCK === 'true';
  
  // Base URL - production'da env var kullan, local'de hardcode
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000';
  
  try {
    // Bugünün maçlarını al
    const matches = await getDailyMatches();
    
    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Bugün maç yok',
      });
    }
    
    // Tüm ligleri sırala (filtre kaldırıldı)
    const topMatches = matches
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
    
    console.log(`[DailyPreview] ${topMatches.length} maç için gerçek analiz başlıyor... (baseUrl: ${baseUrl})`);
    
    // TÜM maçlar için GERÇEK ANALİZ (match-detail API'si ile betSuggestions çek)
    const previews: MatchPreview[] = [];
    const BATCH_SIZE = 3; // Paralel istek sayısı
    
    for (let i = 0; i < topMatches.length; i += BATCH_SIZE) {
      const batch = topMatches.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(batch.map(match => fetchMatchAnalysis(match, baseUrl)));
      
      for (const result of batchResults) {
        if (result) {
          previews.push(result);
        }
      }
      
      // Rate limit için kısa bekle
      if (i + BATCH_SIZE < topMatches.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    if (previews.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Hiçbir maç için analiz bulunamadı',
      });
    }
    
    console.log(`[DailyPreview] ${previews.length}/${topMatches.length} maç analiz edildi (min odds: ${MIN_VALUE_ODDS})`);
    
    // Tweet'leri oluştur - her tweet'e 2-3 maç sığar (istatistiklerle)
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
          await new Promise(r => setTimeout(r, 1500));
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
      skippedMatches: topMatches.length - previews.length,
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

/**
 * Tek bir maç için GERÇEK ANALİZ çeker (match-detail API)
 * betSuggestions, form, h2h dahil
 */
async function fetchMatchAnalysis(match: DailyMatchFixture, baseUrl: string): Promise<MatchPreview | null> {
  const url = `${baseUrl}/api/match-detail?fixtureId=${match.id}&homeTeamId=${match.homeTeam.id}&awayTeamId=${match.awayTeam.id}&leagueId=${match.league.id}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 saniye timeout
    
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.log(`[DailyPreview] ❌ ${match.homeTeam.name}: HTTP ${res.status}`);
      return null;
    }
    
    const json = await res.json();
    const data = json.data || json;
    
    // BetSuggestions (mor kutu) kontrol
    const suggestions = data.betSuggestions as BetSuggestion[] | undefined;
    
    if (!suggestions || suggestions.length === 0) {
      console.log(`[DailyPreview] ⚠️ ${match.homeTeam.name}: BetSuggestions yok`);
      return null;
    }
    
    // En iyi VALUE tahmini seç
    // 1. Confidence >= 60%
    // 2. Odds >= 1.50 (value olması için)
    // 3. Value = high veya medium
    const validSuggestions = suggestions
      .filter(s => s.confidence >= MIN_CONFIDENCE)
      .filter(s => s.odds >= MIN_VALUE_ODDS)
      .filter(s => s.value === 'high' || s.value === 'medium')
      .filter(s => ['goals', 'btts', 'result', 'htft'].includes(s.type))
      .sort((a, b) => {
        // Önce value, sonra confidence
        if (a.value !== b.value) {
          return a.value === 'high' ? -1 : 1;
        }
        return b.confidence - a.confidence;
      });
    
    if (validSuggestions.length === 0) {
      const best = suggestions[0];
      console.log(`[DailyPreview] ❌ ${match.homeTeam.name}: Value yok (odds=${best?.odds}, conf=${best?.confidence}%, value=${best?.value})`);
      return null;
    }
    
    const bestSuggestion = validSuggestions[0];
    
    // Form bilgisi oluştur
    let formInfo = '';
    if (data.homeForm || data.awayForm) {
      const homeForm = data.homeForm?.slice(0, 5) || '';
      const awayForm = data.awayForm?.slice(0, 5) || '';
      if (homeForm || awayForm) {
        formInfo = `${homeForm || '?'} vs ${awayForm || '?'}`;
      }
    }
    
    // H2H bilgisi
    let h2hInfo = '';
    if (data.h2hSummary && data.h2hSummary.totalMatches > 0) {
      const h2h = data.h2hSummary;
      h2hInfo = `${h2h.homeWins}W-${h2h.draws}D-${h2h.awayWins}L`;
    }
    
    // Kısa insight oluştur
    let insight = bestSuggestion.reasoning?.substring(0, 50) || '';
    if (bestSuggestion.value === 'high') insight = '🔥 ' + insight;
    
    console.log(`[DailyPreview] ✓ ${match.homeTeam.name}: ${bestSuggestion.pick} @${bestSuggestion.odds} (%${bestSuggestion.confidence}) [${bestSuggestion.value}]`);
    
    return {
      fixtureId: match.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      league: match.league.name,
      leagueId: match.league.id,
      time: match.time,
      insight,
      pick: bestSuggestion.pick,
      odds: bestSuggestion.odds,
      confidence: bestSuggestion.confidence,
      value: bestSuggestion.value as 'high' | 'medium' | 'low',
      reasoning: bestSuggestion.reasoning || '',
      formInfo,
      h2hInfo,
    };
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('abort') || errMsg.includes('timeout')) {
      console.log(`[DailyPreview] ⏱️ ${match.homeTeam.name}: Timeout`);
    } else {
      console.log(`[DailyPreview] ❌ ${match.homeTeam.name}: ${errMsg}`);
    }
    return null;
  }
}

function formatDailyPreviewThreads(previews: MatchPreview[]): string[] {
  const tweets: string[] = [];
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  
  // Ana tweet - özet
  const highValueCount = previews.filter(p => p.value === 'high').length;
  const avgConfidence = Math.round(previews.reduce((acc, p) => acc + p.confidence, 0) / previews.length);
  
  const mainTweet = `📅 ${today} - GÜNÜN ANALİZLERİ

📊 ${previews.length} maç için VALUE tahminleri
🔥 ${highValueCount} yüksek değerli fırsat
📈 Ortalama güven: %${avgConfidence}

⚠️ Min oran: ${MIN_VALUE_ODDS} (value odaklı)

👇 Detaylar aşağıda

#bahis #iddaa #futbol #tahmin`;
  tweets.push(mainTweet);
  
  // Liglere göre grupla
  const byLeague: Record<string, MatchPreview[]> = {};
  for (const p of previews) {
    if (!byLeague[p.league]) byLeague[p.league] = [];
    byLeague[p.league].push(p);
  }
  
  // Her lig için ayrı tweet (daha detaylı format)
  for (const [league, matches] of Object.entries(byLeague)) {
    let tweetText = `🏆 ${league}\n\n`;
    
    for (const m of matches) {
      const home = m.homeTeam.length > 11 ? m.homeTeam.substring(0, 10) + '.' : m.homeTeam;
      const away = m.awayTeam.length > 11 ? m.awayTeam.substring(0, 10) + '.' : m.awayTeam;
      
      // Value badge
      const valueBadge = m.value === 'high' ? '🔥' : '✅';
      
      tweetText += `${valueBadge} ${home} vs ${away}\n`;
      tweetText += `⏰ ${m.time} | 🎯 ${m.pick} @${m.odds.toFixed(2)}\n`;
      tweetText += `📊 Güven: %${m.confidence}`;
      
      // Form veya H2H varsa ekle
      if (m.formInfo) {
        tweetText += ` | Form: ${m.formInfo}`;
      }
      
      tweetText += '\n\n';
      
      // Karakter limiti kontrolü (280)
      if (tweetText.length > 250 && matches.indexOf(m) < matches.length - 1) {
        tweets.push(tweetText.trim());
        tweetText = `🏆 ${league} (devam)\n\n`;
      }
    }
    
    if (tweetText.trim().length > 20) {
      tweets.push(tweetText.trim());
    }
  }
  
  return tweets;
}
