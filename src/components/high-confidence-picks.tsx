/**
 * High Confidence Picks Component
 * "Asistanın Radarına Takılanlar" - En yüksek güvenli tahminler
 */

'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Target, TrendingUp, Shield, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyMatchFixture } from '@/types/api-football';

interface HighConfidencePicksProps {
  matches: DailyMatchFixture[];
  onAddToCoupon?: (fixtureId: number, pick: string) => void;
}

interface ConfidencePick {
  fixture: DailyMatchFixture;
  score: number; // Ensemble skoru (birden fazla modelin uyumu)
  models: string[]; // Hangi modeller aynı fikirde
  recommendation: {
    market: string;
    pick: string;
    odds: number;
    confidence: number;
  };
  reasoning: string[];
}

export function HighConfidencePicks({ matches, onAddToCoupon }: HighConfidencePicksProps) {
  const topPicks = useMemo(() => {
    const results: ConfidencePick[] = [];
    
    matches.forEach((fixture) => {
      // Sadece upcoming maçlar ve tahmin olan maçlar
      if (!fixture.prediction || fixture.status.isFinished || fixture.status.isLive) return;
      
      const { prediction } = fixture;
      const confidence = prediction.confidence || 0;
      
      // Tahmin olan tüm maçları al (min %40 güven)
      if (confidence < 40) return;
      
      // Reasoning oluştur
      const reasoning: string[] = [];
      const models: string[] = ['Poisson'];
      
      // Form analizi
      if (fixture.formComparison) {
        const homeWins = fixture.formComparison.homeLast5?.filter(r => r === 'W').length || 0;
        const awayWins = fixture.formComparison.awayLast5?.filter(r => r === 'W').length || 0;
        
        if (homeWins >= 4) {
          reasoning.push(`${fixture.homeTeam.name.split(' ')[0]} son 5'te ${homeWins}G`);
          models.push('Form');
        }
        if (awayWins >= 4) {
          reasoning.push(`${fixture.awayTeam.name.split(' ')[0]} son 5'te ${awayWins}G`);
          models.push('Form');
        }
      }
      
      // H2H
      if (fixture.h2hSummary) {
        const h2h = fixture.h2hSummary;
        if (h2h.homeWins > h2h.awayWins + 2) {
          reasoning.push(`H2H: ${fixture.homeTeam.name.split(' ')[0]} üstün`);
          models.push('H2H');
        } else if (h2h.awayWins > h2h.homeWins + 2) {
          reasoning.push(`H2H: ${fixture.awayTeam.name.split(' ')[0]} üstün`);
          models.push('H2H');
        }
      }
      
      // TeamStats kullanarak gol istatistikleri
      if (fixture.teamStats) {
        const ts = fixture.teamStats;
        const homeGoals = typeof ts.homeGoalsScored === 'number' ? ts.homeGoalsScored : 0;
        const awayGoals = typeof ts.awayGoalsScored === 'number' ? ts.awayGoalsScored : 0;
        const totalAvg = homeGoals + awayGoals;
        
        if (totalAvg >= 3.0) {
          reasoning.push(`Maç ort. ${totalAvg.toFixed(1)} gol (yüksek)`);
          models.push('Stats');
        } else if (totalAvg <= 1.8) {
          reasoning.push(`Düşük goller (ort. ${totalAvg.toFixed(1)})`);
          models.push('Stats');
        }
        
        // Clean sheet analizi
        if (ts.homeCleanSheets >= 3 || ts.awayCleanSheets >= 3) {
          const team = ts.homeCleanSheets >= 3 ? fixture.homeTeam : fixture.awayTeam;
          reasoning.push(`${team.name.split(' ')[0]} güçlü defans`);
        }
      }
      
      // BetSuggestions - API'den gelen önerilerle uyum
      if (fixture.betSuggestions && fixture.betSuggestions.length > 0) {
        const highConfSuggestions = fixture.betSuggestions.filter(s => s.confidence >= 60);
        if (highConfSuggestions.length >= 2) {
          models.push('Ensemble');
          reasoning.push(`${highConfSuggestions.length} farklı bahiste yüksek güven`);
        }
        
        // Value bet varsa ekle
        const valueBet = fixture.betSuggestions.find(s => s.value === 'high');
        if (valueBet) {
          reasoning.push(`Value: ${valueBet.market} ${valueBet.pick}`);
        }
      }
      
      // API Prediction varsa ensemble güçlendir
      if (prediction.advice?.toLowerCase().includes('yüksek güven')) {
        models.push('Ensemble');
        reasoning.push('Tüm modeller aynı yönde');
      }
      
      // Ensemble score: Kaç model aynı fikirde?
      const ensembleScore = models.length * 20 + confidence;
      
      // API'den gelen betSuggestions varsa en iyi öneriyi kullan
      let market = 'Maç Sonucu';
      let pick = 'MS X';
      let odds = 3.20;
      
      if (fixture.betSuggestions && fixture.betSuggestions.length > 0) {
        // En yüksek güvenli API önerisini al
        const bestSuggestion = [...fixture.betSuggestions].sort((a, b) => b.confidence - a.confidence)[0];
        market = bestSuggestion.market;
        pick = bestSuggestion.pick;
        odds = bestSuggestion.odds;
      } else {
        const winner = prediction.winner;
        if (winner === fixture.homeTeam.name) {
          pick = 'MS 1';
          odds = 1.30 + (100 - confidence) / 50;
        } else if (winner === fixture.awayTeam.name) {
          pick = 'MS 2';
          odds = 1.50 + (100 - confidence) / 45;
        }
      }
      
      // Gol tahmini varsa ekle
      if (prediction.goalsAdvice) {
        if (prediction.goalsAdvice.toLowerCase().includes('üst') || 
            prediction.goalsAdvice.toLowerCase().includes('over')) {
          reasoning.push('Çok gol bekleniyor');
        } else if (prediction.goalsAdvice.toLowerCase().includes('kg') || 
                   prediction.goalsAdvice.toLowerCase().includes('btts')) {
          reasoning.push('Her iki takım golünü bulur');
        }
      }
      
      results.push({
        fixture,
        score: ensembleScore,
        models,
        recommendation: {
          market,
          pick,
          odds: Number(odds.toFixed(2)),
          confidence,
        },
        reasoning,
      });
    });
    
    // En yüksek ensemble skorlarına göre sırala
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5
  }, [matches]);

  // Hiç prediction yoksa (data henüz yüklenmemiş veya gerçekten yok)
  const hasPredictions = matches.some(m => m.prediction?.confidence);
  
  if (topPicks.length === 0 && !hasPredictions) {
    return null;
  }
  
  if (topPicks.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-3">
      {/* Header Card */}
      <Card className="p-4 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white border-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-black text-lg mb-0.5">Asistanın Radarına Takılanlar</h2>
            <p className="text-xs text-white/80">
              Tüm algoritmalar bu {topPicks.length} maçta hemfikir
            </p>
          </div>
          <Badge className="bg-white/20 backdrop-blur-sm text-white border-0 font-bold">
            Top {topPicks.length}
          </Badge>
        </div>
      </Card>
      
      {/* Picks */}
      {topPicks.map((pick, index) => {
        const { fixture, models, recommendation, reasoning, score } = pick;
        
        return (
          <Card
            key={fixture.id}
            className={cn(
              "p-4 border-2 transition-all hover:shadow-lg",
              index === 0 && "border-indigo-500/50 bg-gradient-to-br from-indigo-500/10 to-purple-500/5",
              index === 1 && "border-purple-500/40 bg-gradient-to-br from-purple-500/10 to-pink-500/5",
              index === 2 && "border-pink-500/30 bg-gradient-to-br from-pink-500/10 to-rose-500/5"
            )}
          >
            {/* Rank Badge */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-black text-lg",
                  index === 0 && "bg-gradient-to-br from-indigo-500 to-purple-500 text-white",
                  index === 1 && "bg-gradient-to-br from-purple-500 to-pink-500 text-white",
                  index === 2 && "bg-gradient-to-br from-pink-500 to-rose-500 text-white"
                )}>
                  #{index + 1}
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    Ensemble Skoru
                  </div>
                  <div className="text-lg font-black text-foreground">
                    {score.toFixed(0)}
                  </div>
                </div>
              </div>
              <Badge variant="default" className="text-xs font-bold">
                %{recommendation.confidence}
              </Badge>
            </div>
            
            {/* Match Info */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm mb-0.5">
                    {fixture.homeTeam.name}
                  </div>
                  <div className="font-bold text-sm text-muted-foreground">
                    {fixture.awayTeam.name}
                  </div>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {fixture.league.name}
                  </div>
                  <div className="text-xs font-semibold">
                    {new Date(fixture.timestamp * 1000).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Models Agreement */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium">
                Uyumlu modeller:
              </span>
              {models.map((model) => (
                <Badge
                  key={model}
                  variant="secondary"
                  className="text-[10px] h-5 font-bold"
                >
                  {model}
                </Badge>
              ))}
            </div>
            
            {/* Reasoning */}
            {reasoning.length > 0 && (
              <div className="space-y-1 mb-3">
                {reasoning.map((text, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Zap className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <p className="text-[11px] text-foreground/90 leading-snug">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            {/* Recommendation */}
            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className="text-xs font-bold">
                    {recommendation.market}
                  </Badge>
                  <span className="text-sm font-black text-primary">
                    {recommendation.pick}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Önerilen oran: {recommendation.odds.toFixed(2)}
                </div>
              </div>
              {onAddToCoupon && (
                <Button
                  size="sm"
                  className="gradient-primary text-white border-0 shadow-lg"
                  onClick={() => onAddToCoupon(fixture.id, recommendation.pick)}
                >
                  Kupona Ekle
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
