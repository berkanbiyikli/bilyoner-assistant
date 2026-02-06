/**
 * Performance Card Component
 * Geçmiş performans göstergesi
 */

'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBacktestStore } from '@/lib/backtesting';
import { TrendingUp, TrendingDown, Target, Percent, Trophy, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PerformanceCardProps {
  period?: 'today' | 'yesterday' | 'last7days' | 'last30days';
}

export function PerformanceCard({ period = 'yesterday' }: PerformanceCardProps) {
  const getMetrics = useBacktestStore((state) => state.getMetrics);
  
  const metrics = useMemo(() => getMetrics(period), [getMetrics, period]);
  
  const periodLabels = {
    today: "Bugün",
    yesterday: "Dün",
    last7days: "Son 7 Gün",
    last30days: "Son 30 Gün",
  };
  
  // Hiç tahmin yoksa gösterme
  if (metrics.totalPredictions === 0) {
    return null;
  }
  
  // Henüz sonuçlanmamış tahminler varsa gösterme
  if (metrics.settledPredictions === 0) {
    return (
      <Card className="p-4 bg-gradient-to-br from-blue-500/5 to-purple-500/5 border-blue-500/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>{periodLabels[period]} için tahminler henüz sonuçlanmadı</span>
        </div>
      </Card>
    );
  }
  
  const isProfitable = metrics.roi > 0;
  const isHighWinRate = metrics.winRate >= 70;
  
  return (
    <Card className={cn(
      "p-4 border transition-all",
      isProfitable 
        ? "bg-gradient-to-br from-emerald-500/10 to-green-500/5 border-emerald-500/30" 
        : "bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/30"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm">{periodLabels[period]} Performans</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">Tahmin başarı istatistikleri</p>
        </div>
        <Badge variant={isProfitable ? "default" : "destructive"} className="text-xs">
          {isProfitable ? "Karlı" : "Zararlı"}
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {/* Win Rate */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">İsabet</span>
          </div>
          <div className={cn(
            "text-xl font-black",
            isHighWinRate ? "text-emerald-500" : "text-amber-500"
          )}>
            %{metrics.winRate.toFixed(0)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {metrics.settledPredictions.toLocaleString('tr-TR')} / {metrics.totalPredictions} tahmin
          </div>
        </div>
        
        {/* ROI */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Percent className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">ROI</span>
          </div>
          <div className={cn(
            "text-xl font-black",
            metrics.roi > 0 ? "text-emerald-500" : "text-red-500"
          )}>
            {metrics.roi > 0 ? '+' : ''}{metrics.roi.toFixed(1)}%
          </div>
          <div className="text-[9px] text-muted-foreground">
            {metrics.netProfit > 0 ? '+' : ''}{metrics.netProfit.toFixed(0)} birim
          </div>
        </div>
        
        {/* Trend */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            {isProfitable ? (
              <TrendingUp className="h-3 w-3 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500" />
            )}
            <span className="text-[10px] text-muted-foreground">Form</span>
          </div>
          <div className="text-xl font-black text-primary">
            {metrics.last7Days.slice(-3).filter(d => d.roi > 0).length}/3
          </div>
          <div className="text-[9px] text-muted-foreground">
            Son 3 gün
          </div>
        </div>
      </div>
      
      {/* En iyi pazar */}
      {metrics.byMarket && Object.keys(metrics.byMarket).length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-[10px] text-muted-foreground mb-1.5">En Başarılı Pazar</div>
          <div className="flex items-center justify-between">
            {Object.entries(metrics.byMarket)
              .sort((a, b) => b[1].winRate - a[1].winRate)
              .slice(0, 1)
              .map(([market, stats]) => (
                <div key={market} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-bold">
                    {market}
                  </Badge>
                  <span className="text-sm font-bold text-emerald-500">
                    %{stats.winRate.toFixed(0)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({stats.won}/{stats.total})
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}
