/**
 * High Odds Picks Component
 * "Sürpriz / Oran Avcısı" - Risk sevenler için yüksek oranlı tahminler
 */

'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Rocket, AlertTriangle, TrendingUp, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyMatchFixture } from '@/types/api-football';

interface HighOddsPicksProps {
  matches: DailyMatchFixture[];
  onAddToCoupon?: (fixtureId: number, pick: string) => void;
}

interface HighOddsPick {
  fixture: DailyMatchFixture;
  recommendation: {
    market: string;
    pick: string;
    odds: number;
    confidence: number;
    potentialReturn: number; // 100 birime göre kazanç
  };
  reasoning: string;
  riskLevel: 'medium' | 'high' | 'very-high';
}

export function HighOddsPicks({ matches, onAddToCoupon }: HighOddsPicksProps) {
  const highOddsPicks = useMemo(() => {
    const results: HighOddsPick[] = [];
    
    matches.forEach((fixture) => {
      if (!fixture.prediction || fixture.status.isFinished) return;
      
      const { prediction, homeTeam, awayTeam, formComparison } = fixture;
      const confidence = prediction.confidence || 0;
      
      // Orta-yüksek güvenilirlik ama daha düşük olasılık bahisleri ara
      // (50-70 arası güven, yüksek oran potansiyeli)
      if (confidence < 45 || confidence > 70) return;
      
      const reasoning: string[] = [];
      let market = '';
      let pick = '';
      let odds = 0;
      let riskLevel: HighOddsPick['riskLevel'] = 'medium';
      
      // Farklı senaryolar
      
      // 1. Deplasman galibiyeti (yüksek oran)
      if (prediction.winner === awayTeam.name && confidence >= 50) {
        const awayWins = formComparison?.awayLast5?.filter(r => r === 'W').length || 0;
        if (awayWins >= 3) {
          market = 'Maç Sonucu';
          pick = 'MS 2';
          odds = 2.50 + (70 - confidence) / 20; // ~2.5-3.5 arası
          reasoning.push(`${awayTeam.name.split(' ')[0]} deplasmanda formda`);
          reasoning.push(`Son 5'te ${awayWins} galibiyet`);
          riskLevel = confidence >= 60 ? 'medium' : 'high';
        }
      }
      
      // 2. İlk yarı sonucu (orta-yüksek oran)
      if (formComparison) {
        const homeFirstHalfStrong = formComparison.homeLast5?.filter(r => r === 'W').length >= 3;
        if (homeFirstHalfStrong && confidence >= 55) {
          market = 'İlk Yarı Sonucu';
          pick = '1. Yarı 1';
          odds = 2.20;
          reasoning.push(`${homeTeam.name.split(' ')[0]} ilk yarıda güçlü`);
          riskLevel = 'medium';
        }
      }
      
      // 3. Hem kazanır hem üst 2.5 (yüksek oran)
      if (prediction.winner === homeTeam.name) {
        const totalAvgGoals = 
          (fixture.teamStats?.homeGoalsScored || 0) +
          (fixture.teamStats?.awayGoalsScored || 0);
        
        if (totalAvgGoals >= 2.8 && confidence >= 50) {
          market = 'Çifte Şans';
          pick = '1 & Üst 2.5';
          odds = 2.80 + (65 - confidence) / 25;
          reasoning.push(`${homeTeam.name.split(' ')[0]} kazanır, çok gol beklenir`);
          reasoning.push(`Maç ortalaması ${totalAvgGoals.toFixed(1)} gol`);
          riskLevel = 'high';
        }
      }
      
      // 4. Over 3.5 (yüksek oran)
      const isHighScoring = 
        (fixture.teamStats?.homeGoalsScored || 0) >= 2 &&
        (fixture.teamStats?.awayGoalsScored || 0) >= 1.8 &&
        (fixture.teamStats?.homeGoalsConceded || 0) >= 1.5;
      
      if (isHighScoring && confidence >= 45) {
        market = 'Toplam Gol';
        pick = '3.5 Üst';
        odds = 3.20;
        reasoning.push('Her iki takım da gol üretiyor');
        reasoning.push('Defanslar zayıf');
        riskLevel = 'very-high';
      }
      
      // 5. Beraberlik (yüksek oran, düşük güven)
      if (prediction.winner === 'Draw' && confidence >= 40 && confidence <= 55) {
        market = 'Maç Sonucu';
        pick = 'MS X';
        odds = 3.40;
        reasoning.push('Dengeli güçler');
        reasoning.push('Beraberlik ihtimali yüksek');
        riskLevel = 'very-high';
      }
      
      // Eğer bir öneri oluşturulduysa ekle
      if (market && odds >= 2.0) {
        results.push({
          fixture,
          recommendation: {
            market,
            pick,
            odds: Number(odds.toFixed(2)),
            confidence,
            potentialReturn: (odds - 1) * 100,
          },
          reasoning: reasoning.join(' • '),
          riskLevel,
        });
      }
    });
    
    // Oran ve güven dengesine göre sırala
    return results
      .sort((a, b) => {
        const aScore = a.recommendation.odds * (a.recommendation.confidence / 100);
        const bScore = b.recommendation.odds * (b.recommendation.confidence / 100);
        return bScore - aScore;
      })
      .slice(0, 4); // Top 4
  }, [matches]);
  
  if (highOddsPicks.length === 0) {
    return null;
  }
  
  return (
    <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-red-500/5 border-orange-500/30">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
          <Rocket className="h-4 w-4 text-orange-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sm">Sürpriz / Oran Avcısı</h3>
          <p className="text-[10px] text-muted-foreground">
            Risk sevenler için yüksek oranlı tahminler
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-600">
          Riskli
        </Badge>
      </div>
      
      <div className="space-y-2.5">
        {highOddsPicks.map((pick) => {
          const { fixture, recommendation, reasoning, riskLevel } = pick;
          
          const riskColors = {
            'medium': 'text-amber-500 bg-amber-500/10',
            'high': 'text-orange-500 bg-orange-500/10',
            'very-high': 'text-red-500 bg-red-500/10',
          };
          
          const riskLabels = {
            'medium': 'Orta Risk',
            'high': 'Yüksek Risk',
            'very-high': 'Çok Yüksek Risk',
          };
          
          return (
            <div
              key={fixture.id}
              className="p-3 rounded-xl bg-background/70 border border-border/40 hover:border-orange-500/40 transition-all group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-0.5">
                    <span className="truncate">{fixture.homeTeam.name}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="truncate">{fixture.awayTeam.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(fixture.timestamp * 1000).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })} • {fixture.league.name}
                  </div>
                </div>
              </div>
              
              {/* Recommendation */}
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-[10px] font-bold shrink-0">
                  {recommendation.market}
                </Badge>
                <span className="text-sm font-black text-orange-500">
                  {recommendation.pick}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <Percent className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-bold">{recommendation.confidence}</span>
                </div>
              </div>
              
              {/* Odds & Return */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <div className="text-2xl font-black text-orange-500">
                    {recommendation.odds.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    +{recommendation.potentialReturn.toFixed(0)} birim kazanç
                  </div>
                </div>
                <Badge className={cn("text-[10px] font-bold", riskColors[riskLevel])}>
                  {riskLabels[riskLevel]}
                </Badge>
              </div>
              
              {/* Reasoning */}
              {reasoning && (
                <div className="flex items-start gap-2 mb-2.5">
                  <AlertTriangle className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-foreground/80 leading-snug">
                    {reasoning}
                  </p>
                </div>
              )}
              
              {/* Action */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                <div className="flex-1 text-[10px] text-muted-foreground">
                  ⚠️ Yüksek risk, daha yüksek kazanç potansiyeli
                </div>
                {onAddToCoupon && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-[11px] border-orange-500/30 hover:bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
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
      
      {/* Disclaimer */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <strong>Uyarı:</strong> Yüksek oranlı bahisler daha fazla risk içerir. 
            Sadece kaybetmeyi göze alabileceğiniz miktarları oynayın.
          </p>
        </div>
      </div>
    </Card>
  );
}
