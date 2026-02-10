/**
 * Günlük Bülten API - 10:00 TSİ (07:00 UTC)
 * "Zayıf Karın" Analizi - Defansı aksayan takımlar, hava durumu etkileri
 * 
 * Amaç: Otorite kurmak, botlardan sıyrılmak
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { sendTweet, sendReplyTweet } from '@/lib/bot/twitter';
import { isTop20League } from '@/config/league-priorities';
import { formatMorningBulletinThread, type MorningBulletinData } from '@/lib/bot/tweet-templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Lig emoji mapping
const LEAGUE_FLAGS: Record<number, string> = {
  203: '🇹🇷', // Süper Lig
  39: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',  // Premier League
  140: '🇪🇸', // La Liga
  135: '🇮🇹', // Serie A
  78: '🇩🇪',  // Bundesliga
  61: '🇫🇷',  // Ligue 1
  2: '🏆',   // Champions League
  3: '🏆',   // Europa League
};

interface TeamDefenseStats {
  team: string;
  teamId: number;
  league: string;
  leagueId: number;
  concededLast5: number;
  avgConceded: number;
  cleanSheets: number;
}

interface HighScoringMatch {
  match: string;
  fixtureId: number;
  avgGoals: number;
  reason: string;
  homeAvgScored: number;
  awayAvgScored: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const useMock = process.env.TWITTER_MOCK === 'true';
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
    
    // Tüm liglerdeki maçlar (filtre kaldırıldı)
    const topMatches = matches
      .filter(m => m.status.isUpcoming);
    
    console.log(`[MorningBulletin] ${topMatches.length} top lig maçı için analiz başlıyor...`);
    
    // Her maç için detaylı analiz çek
    const defenseStats: TeamDefenseStats[] = [];
    const highScoringMatches: HighScoringMatch[] = [];
    const keyAbsences: { match: string; player: string; importance: string }[] = [];
    
    // Batch halinde maç detaylarını çek
    const BATCH_SIZE = 5;
    for (let i = 0; i < topMatches.length; i += BATCH_SIZE) {
      const batch = topMatches.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (match) => {
        try {
          const url = `${baseUrl}/api/match-detail?fixtureId=${match.id}&homeTeamId=${match.homeTeam.id}&awayTeamId=${match.awayTeam.id}&leagueId=${match.league.id}`;
          
          const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
          });
          
          if (!res.ok) return;
          
          const json = await res.json();
          const data = json.data || json;
          
          // Defans analizi - Son 5 maçta çok gol yiyen takımlar
          if (data.homeStats?.goalsAgainstAvg) {
            const homeGAAvg = parseFloat(data.homeStats.goalsAgainstAvg) || 0;
            if (homeGAAvg >= 1.5) {
              defenseStats.push({
                team: match.homeTeam.name,
                teamId: match.homeTeam.id,
                league: match.league.name,
                leagueId: match.league.id,
                concededLast5: Math.round(homeGAAvg * 5),
                avgConceded: homeGAAvg,
                cleanSheets: data.homeStats.cleanSheets || 0,
              });
            }
          }
          
          if (data.awayStats?.goalsAgainstAvg) {
            const awayGAAvg = parseFloat(data.awayStats.goalsAgainstAvg) || 0;
            if (awayGAAvg >= 1.5) {
              defenseStats.push({
                team: match.awayTeam.name,
                teamId: match.awayTeam.id,
                league: match.league.name,
                leagueId: match.league.id,
                concededLast5: Math.round(awayGAAvg * 5),
                avgConceded: awayGAAvg,
                cleanSheets: data.awayStats?.cleanSheets || 0,
              });
            }
          }
          
          // Yüksek gol beklentisi analizi
          const homeScored = parseFloat(data.homeStats?.goalsForAvg) || 0;
          const awayScored = parseFloat(data.awayStats?.goalsForAvg) || 0;
          const totalExpected = homeScored + awayScored;
          
          if (totalExpected >= 2.8) {
            let reason = '';
            if (homeScored >= 1.5 && awayScored >= 1.5) {
              reason = 'İki takım da golcü, açık futbol bekleniyor';
            } else if (homeScored >= 2.0) {
              reason = `${match.homeTeam.name} evinde çok golcü (${homeScored.toFixed(1)} gol/maç)`;
            } else if (awayScored >= 1.8) {
              reason = `${match.awayTeam.name} deplasmanda etkili (${awayScored.toFixed(1)} gol/maç)`;
            } else {
              reason = 'Her iki takımın gol ortalaması yüksek';
            }
            
            highScoringMatches.push({
              match: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
              fixtureId: match.id,
              avgGoals: totalExpected,
              reason,
              homeAvgScored: homeScored,
              awayAvgScored: awayScored,
            });
          }
          
          // Önemli eksikler
          if (data.injuries && Array.isArray(data.injuries)) {
            const keyPlayers = data.injuries.filter((inj: { type: string; reason: string }) => 
              inj.type === 'Missing Fixture' && 
              inj.reason !== 'Suspended'
            ).slice(0, 2);
            
            for (const inj of keyPlayers) {
              keyAbsences.push({
                match: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
                player: inj.player?.name || 'Bilinmeyen',
                importance: inj.reason || 'Sakatlık',
              });
            }
          }
          
        } catch (error) {
          console.log(`[MorningBulletin] ${match.homeTeam.name} analiz hatası:`, error);
        }
      }));
      
      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    }
    
    // En kötü defansları sırala
    const sortedDefense = defenseStats
      .sort((a, b) => b.avgConceded - a.avgConceded)
      .slice(0, 5);
    
    // Yüksek gol maçlarını sırala  
    const sortedHighScoring = highScoringMatches
      .sort((a, b) => b.avgGoals - a.avgGoals)
      .slice(0, 4);
    
    const today = new Date().toLocaleDateString('tr-TR', { 
      day: 'numeric', 
      month: 'long',
      weekday: 'long' 
    });
    
    // Tweet formatını oluştur
    const bulletinData: MorningBulletinData = {
      date: today,
      totalMatches: matches.length,
      topLeagueMatches: topMatches.length,
      weakDefenseTeams: sortedDefense.map(d => ({
        team: d.team,
        concededLast5: d.concededLast5,
        league: d.league,
      })),
      weatherImpactMatches: [], // TODO: Weather API entegrasyonu
      keyAbsences: keyAbsences.slice(0, 4),
      expectedHighScoring: sortedHighScoring.map(h => ({
        match: h.match,
        avgGoals: h.avgGoals,
        reason: h.reason,
      })),
    };
    
    // Thread oluştur
    const tweets = formatMorningBulletinThread(bulletinData);
    
    // Tweet at
    const tweetIds: string[] = [];
    
    if (!isTestMode) {
      if (useMock) {
        console.log('[MorningBulletin] MOCK Thread:');
        tweets.forEach((t, i) => console.log(`Tweet ${i + 1}:\n${t}\n---`));
      } else {
        // Ana tweet
        const mainResult = await sendTweet(tweets[0]);
        if (mainResult.tweetId) tweetIds.push(mainResult.tweetId);
        
        // Reply'ler
        let lastTweetId = mainResult.tweetId;
        for (let i = 1; i < tweets.length; i++) {
          if (lastTweetId) {
            await new Promise(r => setTimeout(r, 1500)); // Rate limit
            const replyResult = await sendReplyTweet(tweets[i], lastTweetId);
            if (replyResult.tweetId) {
              tweetIds.push(replyResult.tweetId);
              lastTweetId = replyResult.tweetId;
            }
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : `${tweets.length} tweet atıldı`,
      data: bulletinData,
      tweets,
      tweetIds,
      analysis: {
        weakDefenseCount: sortedDefense.length,
        highScoringCount: sortedHighScoring.length,
        absencesCount: keyAbsences.length,
      },
    });
    
  } catch (error) {
    console.error('[MorningBulletin] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
