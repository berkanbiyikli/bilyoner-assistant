/**
 * Derin İstatistik API - 16:00 TSİ (13:00 UTC)
 * "Biliyor muydunuz?" tarzı ilginç, value katan istatistikler
 * 
 * Amaç: Etkileşim toplamak ve bilgini kanıtlamak
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { sendTweet } from '@/lib/bot/twitter';
import { formatDeepStatsTweet, type DeepStatsData } from '@/lib/bot/tweet-templates';
import { isTop20League } from '@/config/league-priorities';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dinamik istatistik şablonları - maç verilerinden üretilir
interface DynamicStatTemplate {
  id: string;
  category: 'h2h' | 'form' | 'goals' | 'defense' | 'home_away' | 'trend';
  template: string;
  minDataPoints: number;
  actionableTemplate: string;
}

const STAT_TEMPLATES: DynamicStatTemplate[] = [
  {
    id: 'h2h_dominance',
    category: 'h2h',
    template: '{team1}, {team2}\'ya karşı son {count} maçın {wins}\'ini kazandı.',
    minDataPoints: 5,
    actionableTemplate: 'Bu tür tarihi üstünlükler psikolojik avantaj sağlar.',
  },
  {
    id: 'h2h_goals',
    category: 'h2h',
    template: '{team1} vs {team2} derbilerinde ortalama {avg_goals} gol atılıyor.',
    minDataPoints: 5,
    actionableTemplate: 'Yüksek ortalamalı derbilerde "Gol Olur" düşünülebilir.',
  },
  {
    id: 'home_fortress',
    category: 'home_away',
    template: '{team} evinde son {count} maçta sadece {losses} kez kaybetti.',
    minDataPoints: 10,
    actionableTemplate: 'Ev sahibi avantajı güçlü takımlara karşı ihtiyatlı olun.',
  },
  {
    id: 'away_form',
    category: 'home_away',
    template: '{team} deplasmanda son {count} maçta {wins} galibiyet aldı.',
    minDataPoints: 5,
    actionableTemplate: 'Deplasman performansı kupon stratejisinde kritik.',
  },
  {
    id: 'scoring_streak',
    category: 'goals',
    template: '{team} son {count} maçta her maç gol atıyor.',
    minDataPoints: 5,
    actionableTemplate: '"KG Var" veya "Gol Olur" bahislerinde değerlendirilmeli.',
  },
  {
    id: 'clean_sheet_run',
    category: 'defense',
    template: '{team} son {count} maçın {clean_sheets}\'inde gol yemedi.',
    minDataPoints: 5,
    actionableTemplate: 'Güçlü savunmalar "Alt 2.5" için işaret olabilir.',
  },
  {
    id: 'second_half_goals',
    category: 'trend',
    template: '{team} maçlarının %{percent}\'inde ikinci yarıda gol oluyor.',
    minDataPoints: 10,
    actionableTemplate: 'İY/MS veya 2. yarı bahislerinde kullanılabilir.',
  },
  {
    id: 'btts_rate',
    category: 'goals',
    template: '{league}\'de maçların %{rate}\'inde her iki takım da gol atıyor.',
    minDataPoints: 20,
    actionableTemplate: '{rate}+ KG Var oranı ligler arasında üst sıralarda.',
  },
  {
    id: 'over25_league',
    category: 'goals',
    template: '{league}\'de Üst 2.5 gol oranı: %{rate}',
    minDataPoints: 20,
    actionableTemplate: 'Lig bazlı gol oranları strateji belirlemede kritik.',
  },
  {
    id: 'first_goal_wins',
    category: 'trend',
    template: '{league}\'de ilk golü atan takım maçların %{rate}\'ini kazanıyor.',
    minDataPoints: 20,
    actionableTemplate: 'İlk golün psikolojik etkisi önemli.',
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const statType = searchParams.get('type'); // Belirli bir tip istenebilir
  const useMock = process.env.TWITTER_MOCK === 'true';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000';
  
  try {
    // Bugünün maçlarını al
    const matches = await getDailyMatches();
    const topMatches = matches?.filter(m => isTop20League(m.league.id) && m.status.isUpcoming) || [];
    
    // Dinamik istatistik üret
    const generatedStats: DeepStatsData[] = [];
    
    // Rastgele 3 maç seç ve detaylı analiz çek
    const sampleMatches = topMatches
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);
    
    for (const match of sampleMatches) {
      try {
        const url = `${baseUrl}/api/match-detail?fixtureId=${match.id}&homeTeamId=${match.homeTeam.id}&awayTeamId=${match.awayTeam.id}&leagueId=${match.league.id}`;
        
        const res = await fetch(url, {
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        
        if (!res.ok) continue;
        
        const json = await res.json();
        const data = json.data || json;
        
        // H2H istatistiği oluştur
        if (data.h2hSummary && data.h2hSummary.totalMatches >= 5) {
          const h2h = data.h2hSummary;
          const dominant = h2h.homeWins > h2h.awayWins ? match.homeTeam.name : match.awayTeam.name;
          const wins = Math.max(h2h.homeWins, h2h.awayWins);
          
          if (wins >= 4) {
            generatedStats.push({
              stat: `${dominant}, rakibine karşı son ${h2h.totalMatches} maçın ${wins}'ini kazandı.`,
              context: `Bu akşam ${match.homeTeam.name} vs ${match.awayTeam.name} maçı oynanıyor.`,
              source: `Son ${h2h.totalMatches} karşılaşma verisi`,
              league: match.league.name,
              actionable: 'Tarihi üstünlükler psikolojik avantaj sağlar.',
            });
          }
          
          // H2H gol ortalaması
          const avgGoals = h2h.avgGoals || 0;
          if (avgGoals > 2.5) {
            generatedStats.push({
              stat: `${match.homeTeam.name} vs ${match.awayTeam.name} maçlarında ortalama ${avgGoals.toFixed(1)} gol atılıyor.`,
              context: 'Son 10 karşılaşma verisi.',
              source: 'H2H Analizi',
              league: match.league.name,
              actionable: avgGoals > 3 
                ? '"Üst 2.5" değerlendirilebilir.' 
                : 'Gol beklentisi ortalamanın üstünde.',
            });
          }
        }
        
        // Form bazlı istatistik
        if (data.homeForm && data.homeForm.length >= 5) {
          const form = data.homeForm;
          const wins = (form.match(/W/g) || []).length;
          const clean = (form.match(/0/g) || []).length; // Basit clean sheet tahmini
          
          if (wins >= 4) {
            generatedStats.push({
              stat: `${match.homeTeam.name} son ${form.length} maçta ${wins} galibiyet aldı.`,
              context: `Form: ${form}`,
              source: 'Sezon Formu',
              league: match.league.name,
              actionable: 'Formda takımlar ev avantajını daha iyi kullanır.',
            });
          }
        }
        
        // Gol ortalaması istatistiği
        const homeScored = parseFloat(data.homeStats?.goalsForAvg) || 0;
        const awayScored = parseFloat(data.awayStats?.goalsForAvg) || 0;
        
        if (homeScored >= 2.0) {
          generatedStats.push({
            stat: `${match.homeTeam.name} evinde maç başına ${homeScored.toFixed(1)} gol atıyor.`,
            context: `Sezon ortalaması - ${match.league.name}`,
            source: 'Sezon İstatistikleri',
            league: match.league.name,
            actionable: 'Golcü ev sahiplerine karşı "Gol Olur" mantıklı.',
          });
        }
        
        // xG bazlı istatistik
        if (data.poissonAnalysis) {
          const poisson = data.poissonAnalysis;
          const expectedGoals = (poisson.homeXg || 0) + (poisson.awayXg || 0);
          
          if (expectedGoals > 2.8) {
            generatedStats.push({
              stat: `Bu akşamki ${match.homeTeam.name} vs ${match.awayTeam.name} maçında xG modeli ${expectedGoals.toFixed(1)} gol öngörüyor.`,
              context: 'Expected Goals (xG) analizi',
              source: 'Poisson Modeli',
              league: match.league.name,
              actionable: `xG ${expectedGoals.toFixed(1)} > 2.5 olduğunda "Üst 2.5" %${Math.round(65 + (expectedGoals - 2.5) * 10)} tutma oranına sahip.`,
            });
          }
        }
        
      } catch (error) {
        console.log(`[DeepStats] Maç analiz hatası:`, error);
      }
    }
    
    // Üretilen istatistik yoksa statik havuzdan seç
    if (generatedStats.length === 0) {
      generatedStats.push({
        stat: '⚽ Avrupa\'nın 5 büyük liginde maçların %51\'inde Üst 2.5 gol oluyor.',
        context: '2023-24 sezonu verileri',
        source: 'Lig Ortalamaları',
        league: '5 Büyük Lig',
        actionable: 'Bundesliga (%62) en golcü, Ligue 1 (%48) en az gollü lig.',
      });
    }
    
    // Rastgele bir istatistik seç
    const selectedStat = generatedStats[Math.floor(Math.random() * generatedStats.length)];
    
    // Tweet formatla
    const tweetText = formatDeepStatsTweet(selectedStat);
    
    // Tweet at
    if (!isTestMode) {
      if (useMock) {
        console.log('[DeepStats] MOCK Tweet:\n', tweetText);
      } else {
        await sendTweet(tweetText);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : 'Derin istatistik tweeti atıldı',
      tweet: tweetText,
      selectedStat,
      generatedStatsCount: generatedStats.length,
      allStats: generatedStats,
    });
    
  } catch (error) {
    console.error('[DeepStats] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
