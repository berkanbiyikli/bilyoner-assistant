/**
 * Trend Tracker Component
 * "Seri Yakalayanlar" - Takım trendlerini göster
 */

'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, TrendingUp, Shield, AlertTriangle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyMatchFixture } from '@/types/api-football';

interface TrendTrackerProps {
  matches: DailyMatchFixture[];
  onAddToCoupon?: (fixtureId: number, pick: string) => void;
}

interface TrendMatch {
  fixture: DailyMatchFixture;
  trends: Array<{
    type: 'hot' | 'cold' | 'defensive' | 'offensive';
    text: string;
    confidence: number;
  }>;
  recommendation: {
    market: string;
    pick: string;
    odds: number;
    reasoning: string;
  };
}

export function TrendTracker({ matches, onAddToCoupon }: TrendTrackerProps) {
  const trendMatches = useMemo(() => {
    const results: TrendMatch[] = [];
    
    matches.forEach((fixture) => {
      if (fixture.status.isFinished) return;
      if (!fixture.formComparison && !fixture.teamStats) return;
      
      const trends: TrendMatch['trends'] = [];
      const { formComparison, teamStats, homeTeam, awayTeam } = fixture;
      
      // Home team trends
      if (formComparison?.homeLast5) {
        const homeWins = formComparison.homeLast5.filter(r => r === 'W').length;
        const homeLosses = formComparison.homeLast5.filter(r => r === 'L').length;
        
        if (homeWins >= 4) {
          trends.push({
            type: 'hot',
            text: `${homeTeam.name.split(' ')[0]} son 5 maçta ${homeWins} galibiyet`,
            confidence: homeWins * 20,
          });
        }
        
        if (homeLosses >= 3) {
          trends.push({
            type: 'cold',
            text: `${homeTeam.name.split(' ')[0]} son 5'te ${homeLosses} mağlubiyet`,
            confidence: homeLosses * 20,
          });
        }
      }
      
      // Away team trends
      if (formComparison?.awayLast5) {
        const awayWins = formComparison.awayLast5.filter(r => r === 'W').length;
        const awayLosses = formComparison.awayLast5.filter(r => r === 'L').length;
        
        if (awayWins >= 4) {
          trends.push({
            type: 'hot',
            text: `${awayTeam.name.split(' ')[0]} deplasmanda ${awayWins}/5 kazanıyor`,
            confidence: awayWins * 20,
          });
        }
        
        if (awayLosses >= 3) {
          trends.push({
            type: 'cold',
            text: `${awayTeam.name.split(' ')[0]} dışarıda zor durumda`,
            confidence: awayLosses * 20,
          });
        }
      }
      
      // Goal trends
      if (teamStats) {
        // İlk yarı gol yeme trendi
        const homeFirstHalfConceded = teamStats.homeGoalsConceded || 0;
        if (homeFirstHalfConceded >= 3) {
          trends.push({
            type: 'defensive',
            text: `${homeTeam.name.split(' ')[0]} ilk 15 dakikada sık gol yiyor`,
            confidence: 70,
          });
        }
        
        // Over 2.5 trendi
        const homeAvgGoalsFor = teamStats.homeGoalsScored || 0;
        const awayAvgGoalsFor = teamStats.awayGoalsScored || 0;
        const totalAvg = parseFloat(homeAvgGoalsFor.toString()) + parseFloat(awayAvgGoalsFor.toString());
        
        if (totalAvg >= 3.2) {
          trends.push({
            type: 'offensive',
            text: `Maç ortalaması ${totalAvg.toFixed(1)} gol`,
            confidence: Math.min(totalAvg * 25, 95),
          });
        }
        
        // BTTS trendi
        const homeBTTS = (teamStats.homeGoalsScored || 0) > 1 && 
                         (teamStats.homeGoalsConceded || 0) > 1;
        const awayBTTS = (teamStats.awayGoalsScored || 0) > 1 && 
                         (teamStats.awayGoalsConceded || 0) > 1;
        
        if (homeBTTS && awayBTTS) {
          trends.push({
            type: 'offensive',
            text: 'Her iki takım da hem atıyor hem yiyor',
            confidence: 75,
          });
        }
      }
      
      // En az 1 trend varsa ekle
      if (trends.length >= 1) {
        // En güçlü trende göre öneri oluştur
        const strongestTrend = trends.sort((a, b) => b.confidence - a.confidence)[0];
        
        let recommendation: TrendMatch['recommendation'];
        
        if (strongestTrend.type === 'offensive') {
          recommendation = {
            market: '2.5 Üst',
            pick: 'Üst',
            odds: 1.75,
            reasoning: strongestTrend.text,
          };
        } else if (strongestTrend.type === 'hot') {
          const isHomeHot = strongestTrend.text.includes(homeTeam.name.split(' ')[0]);
          recommendation = {
            market: 'Maç Sonucu',
            pick: isHomeHot ? 'MS 1' : 'MS 2',
            odds: isHomeHot ? 1.65 : 2.10,
            reasoning: strongestTrend.text,
          };
        } else {
          recommendation = {
            market: 'KG Var',
            pick: 'Var',
            odds: 1.85,
            reasoning: 'Her iki takım da gol atıyor',
          };
        }
        
        results.push({
          fixture,
          trends,
          recommendation,
        });
      }
    });
    
    // En güçlü trendlere göre sırala
    return results
      .sort((a, b) => {
        const aMax = Math.max(...a.trends.map(t => t.confidence));
        const bMax = Math.max(...b.trends.map(t => t.confidence));
        return bMax - aMax;
      })
      .slice(0, 5); // En iyi 5 tanesini göster
  }, [matches]);
  
  if (trendMatches.length === 0) {
    return null;
  }
  
  return (
    <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-purple-500/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <Flame className="h-4 w-4 text-purple-500" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Seri Yakalayanlar</h3>
          <p className="text-[10px] text-muted-foreground">Güçlü trendler ve serilere göre öneriler</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {trendMatches.length} fırsat
        </Badge>
      </div>
      
      <div className="space-y-3">
        {trendMatches.map((item) => {
          const { fixture, trends, recommendation } = item;
          const maxConfidence = Math.max(...trends.map(t => t.confidence));
          
          return (
            <div
              key={fixture.id}
              className="p-3 rounded-xl bg-background/70 border border-border/40 hover:border-purple-500/30 transition-all group"
            >
              {/* Match Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1">
                    <span className="truncate">{fixture.homeTeam.name}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="truncate">{fixture.awayTeam.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(fixture.timestamp * 1000).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <Badge 
                  variant={maxConfidence >= 80 ? "default" : "secondary"} 
                  className="ml-2 text-[10px] shrink-0"
                >
                  %{maxConfidence.toFixed(0)}
                </Badge>
              </div>
              
              {/* Trends */}
              <div className="space-y-1.5 mb-2.5">
                {trends.slice(0, 3).map((trend, idx) => {
                  const Icon = 
                    trend.type === 'hot' ? Flame :
                    trend.type === 'cold' ? AlertTriangle :
                    trend.type === 'defensive' ? Shield :
                    Target;
                  
                  const color = 
                    trend.type === 'hot' ? 'text-orange-500' :
                    trend.type === 'cold' ? 'text-blue-400' :
                    trend.type === 'defensive' ? 'text-indigo-500' :
                    'text-emerald-500';
                  
                  return (
                    <div key={idx} className="flex items-start gap-2">
                      <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", color)} />
                      <p className="text-[11px] text-foreground/90 leading-snug">
                        {trend.text}
                      </p>
                    </div>
                  );
                })}
              </div>
              
              {/* Recommendation */}
              <div className="flex items-center gap-2 pt-2.5 border-t border-border/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {recommendation.market}
                    </Badge>
                    <span className="text-xs font-bold text-purple-500">
                      {recommendation.pick}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      @{recommendation.odds.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {recommendation.reasoning}
                  </p>
                </div>
                {onAddToCoupon && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 px-3 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onAddToCoupon(fixture.id, recommendation.pick)}
                  >
                    Ekle
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
