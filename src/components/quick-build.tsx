/**
 * Quick Build Component
 * "Kombine Sihirbazı" - Tek tıkla kupon oluşturma
 */

'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wand2, Zap, Moon, Shield, TrendingUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyMatchFixture } from '@/types/api-football';

interface QuickBuildProps {
  matches: DailyMatchFixture[];
  onBuildCoupon?: (matches: Array<{ fixtureId: number; pick: string; odds: number }>) => void;
}

interface QuickBuildTemplate {
  id: string;
  name: string;
  description: string;
  icon: typeof Wand2;
  color: string;
  bgGradient: string;
  strategy: (matches: DailyMatchFixture[]) => Array<{ fixtureId: number; pick: string; odds: number }>;
  minOdds: number;
  maxOdds: number;
  confidence: number;
}

export function QuickBuild({ matches, onBuildCoupon }: QuickBuildProps) {
  const [isBuilding, setIsBuilding] = useState<string | null>(null);
  
  const templates: QuickBuildTemplate[] = [
    {
      id: 'safe-combo',
      name: '1.5 Üst Kombinesi',
      description: 'En güvenilir 3 tahmin, düşük oranlı ama yüksek kazanma şansı',
      icon: Shield,
      color: 'text-emerald-500',
      bgGradient: 'from-emerald-500/10 to-green-500/5',
      minOdds: 1.30,
      maxOdds: 1.80,
      confidence: 75,
      strategy: (matches) => {
        // En yüksek güvenli maçlardan 3 tanesini seç
        const eligible = matches
          .filter(m => !m.status.isFinished && m.prediction?.confidence && m.prediction.confidence >= 40)
          .sort((a, b) => (b.prediction?.confidence || 0) - (a.prediction?.confidence || 0))
          .slice(0, 3);
        
        return eligible.map(m => {
          const conf = m.prediction?.confidence || 0;
          const winner = m.prediction?.winner;
          let pick = 'MS 1';
          let odds = 1.40;
          
          if (winner === m.homeTeam.name) {
            pick = 'MS 1';
            odds = 1.30 + (100 - conf) / 60;
          } else if (winner === m.awayTeam.name) {
            pick = 'MS 2';
            odds = 1.45 + (100 - conf) / 55;
          }
          
          return {
            fixtureId: m.id,
            pick,
            odds: Number(odds.toFixed(2)),
          };
        });
      },
    },
    {
      id: 'evening-banko',
      name: 'Akşamın Bankoları',
      description: '20:00 sonrası en güvenilir 2-3 maç',
      icon: Moon,
      color: 'text-indigo-500',
      bgGradient: 'from-indigo-500/10 to-purple-500/5',
      minOdds: 1.40,
      maxOdds: 2.00,
      confidence: 70,
      strategy: (matches) => {
        const eveningStart = new Date();
        eveningStart.setHours(20, 0, 0, 0);
        const eveningTimestamp = eveningStart.getTime() / 1000;
        
        const eveningMatches = matches
          .filter(m => 
            !m.status.isFinished && 
            m.timestamp >= eveningTimestamp &&
            m.prediction?.confidence && 
            m.prediction.confidence >= 40
          )
          .sort((a, b) => (b.prediction?.confidence || 0) - (a.prediction?.confidence || 0))
          .slice(0, 3);
        
        return eveningMatches.map(m => {
          const conf = m.prediction?.confidence || 0;
          const winner = m.prediction?.winner;
          let pick = 'MS 1';
          let odds = 1.50;
          
          if (winner === m.homeTeam.name) {
            pick = 'MS 1';
            odds = 1.35 + (100 - conf) / 55;
          } else if (winner === m.awayTeam.name) {
            pick = 'MS 2';
            odds = 1.50 + (100 - conf) / 50;
          }
          
          return {
            fixtureId: m.id,
            pick,
            odds: Number(odds.toFixed(2)),
          };
        });
      },
    },
    {
      id: 'over-combo',
      name: 'Gol Şöleni',
      description: 'Çok gol beklenen 3-4 maçtan 2.5 üst kombinesi',
      icon: TrendingUp,
      color: 'text-orange-500',
      bgGradient: 'from-orange-500/10 to-red-500/5',
      minOdds: 1.60,
      maxOdds: 2.20,
      confidence: 65,
      strategy: (matches) => {
        const highScoringMatches = matches
          .filter(m => {
            if (m.status.isFinished) return false;
            
            const totalAvgGoals = 
              (m.teamStats?.homeGoalsScored || 0) +
              (m.teamStats?.awayGoalsScored || 0);
            
            const hasGoalsAdvice = 
              m.prediction?.goalsAdvice?.toLowerCase().includes('üst') ||
              m.prediction?.goalsAdvice?.toLowerCase().includes('over');
            
            return totalAvgGoals >= 2.7 || hasGoalsAdvice;
          })
          .sort((a, b) => {
            const aAvg = 
              (a.teamStats?.homeGoalsScored || 0) +
              (a.teamStats?.awayGoalsScored || 0);
            const bAvg = 
              (b.teamStats?.homeGoalsScored || 0) +
              (b.teamStats?.awayGoalsScored || 0);
            return bAvg - aAvg;
          })
          .slice(0, 4);
        
        return highScoringMatches.map(m => ({
          fixtureId: m.id,
          pick: '2.5 Üst',
          odds: 1.75,
        }));
      },
    },
    {
      id: 'btts-combo',
      name: 'KG Var Kombinesi',
      description: 'Her iki takımın gol atması beklenen 3 maç',
      icon: Zap,
      color: 'text-purple-500',
      bgGradient: 'from-purple-500/10 to-pink-500/5',
      minOdds: 1.70,
      maxOdds: 2.00,
      confidence: 60,
      strategy: (matches) => {
        const bttsMatches = matches
          .filter(m => {
            if (m.status.isFinished) return false;
            
            const homeBTTS = 
              (m.teamStats?.homeGoalsScored || 0) > 1 && 
              (m.teamStats?.homeGoalsConceded || 0) > 1;
            
            const awayBTTS = 
              (m.teamStats?.awayGoalsScored || 0) > 1 && 
              (m.teamStats?.awayGoalsConceded || 0) > 1;
            
            const hasBTTSAdvice = 
              m.prediction?.goalsAdvice?.toLowerCase().includes('kg') ||
              m.prediction?.goalsAdvice?.toLowerCase().includes('btts');
            
            return (homeBTTS && awayBTTS) || hasBTTSAdvice;
          })
          .slice(0, 3);
        
        return bttsMatches.map(m => ({
          fixtureId: m.id,
          pick: 'KG Var',
          odds: 1.85,
        }));
      },
    },
  ];
  
  const handleBuildCoupon = async (template: QuickBuildTemplate) => {
    setIsBuilding(template.id);
    
    try {
      const coupon = template.strategy(matches);
      
      if (coupon.length === 0) {
        alert(`${template.name} için uygun maç bulunamadı.`);
        return;
      }
      
      // Simüle delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (onBuildCoupon) {
        onBuildCoupon(coupon);
      }
      
      // Kullanıcıya bilgi ver
      const totalOdds = coupon.reduce((acc, m) => acc * m.odds, 1);
      alert(
        `✅ ${template.name} oluşturuldu!\n\n` +
        `${coupon.length} maç eklendi\n` +
        `Toplam oran: ${totalOdds.toFixed(2)}\n` +
        `Potansiyel kazanç: ${((totalOdds - 1) * 100).toFixed(0)} birim (100 birim bahis)`
      );
    } catch (error) {
      console.error('Kupon oluşturma hatası:', error);
      alert('Kupon oluşturulurken bir hata oluştu.');
    } finally {
      setIsBuilding(null);
    }
  };
  
  return (
    <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Wand2 className="h-4 w-4 text-blue-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sm">Kombine Sihirbazı</h3>
          <p className="text-[10px] text-muted-foreground">
            Tek tıkla hazır kupon stratejileri
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {templates.map((template) => {
          const Icon = template.icon;
          const isBuildingThis = isBuilding === template.id;
          
          return (
            <button
              key={template.id}
              onClick={() => handleBuildCoupon(template)}
              disabled={isBuildingThis}
              className={cn(
                'p-3 rounded-xl text-left transition-all border',
                'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                `bg-gradient-to-br ${template.bgGradient} border-border/40`
              )}
            >
              <div className="flex items-start gap-2 mb-2">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  template.bgGradient.replace('from-', 'bg-').split(' ')[0] + '/30'
                )}>
                  <Icon className={cn('h-4 w-4', template.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs mb-0.5">{template.name}</div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {template.description}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] h-5">
                    Min %{template.confidence}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    @{template.minOdds}-{template.maxOdds}
                  </span>
                </div>
                {isBuildingThis ? (
                  <div className="text-[10px] text-primary font-medium">
                    Oluşturuluyor...
                  </div>
                ) : (
                  <ChevronRight className={cn('h-4 w-4', template.color)} />
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          💡 <strong>İpucu:</strong> Kombine kuponlar için tüm maçların tutması gerekir. 
          Risk yönetimini unutmayın!
        </p>
      </div>
    </Card>
  );
}
