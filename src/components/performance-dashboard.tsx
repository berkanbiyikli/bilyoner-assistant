/**
 * Performance Stats Dashboard
 * ROI, hit rate, streak tracking, P&L chart
 */

'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBankrollStore } from '@/lib/bankroll';
import { 
  BarChart3, Target, Percent, TrendingUp, TrendingDown,
  Trophy, Award, DollarSign, Activity, Zap, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ReferenceLine
} from 'recharts';

export function PerformanceDashboard() {
  const { getStats, dailySnapshots, bets, initialBalance, currentBalance } = useBankrollStore();
  const stats = getStats();
  
  // Chart data - balance over time
  const balanceHistory = useMemo(() => {
    const sorted = [...bets]
      .filter(b => b.result !== 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    if (sorted.length === 0) return [];
    
    let running = initialBalance;
    const history: { name: string; balance: number; bet: number }[] = [
      { name: 'Başlangıç', balance: initialBalance, bet: 0 }
    ];
    
    sorted.forEach((bet, i) => {
      running = running - bet.amount + bet.returns;
      history.push({
        name: `#${i + 1}`,
        balance: Math.round(running * 100) / 100,
        bet: i + 1,
      });
    });
    
    return history;
  }, [bets, initialBalance]);
  
  // Daily P&L chart data
  const dailyPnLData = useMemo(() => {
    return [...dailySnapshots]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map(d => ({
        date: d.date.slice(5), // MM-DD
        pnl: Math.round(d.profitLoss * 100) / 100,
        staked: d.totalStaked,
        roi: d.roi,
      }));
  }, [dailySnapshots]);
  
  // Odds distribution
  const oddsDistribution = useMemo(() => {
    const settled = bets.filter(b => b.result !== 'pending');
    const ranges = [
      { range: '1.0-1.5', min: 1, max: 1.5, won: 0, lost: 0 },
      { range: '1.5-2.0', min: 1.5, max: 2, won: 0, lost: 0 },
      { range: '2.0-2.5', min: 2, max: 2.5, won: 0, lost: 0 },
      { range: '2.5-3.0', min: 2.5, max: 3, won: 0, lost: 0 },
      { range: '3.0+', min: 3, max: 100, won: 0, lost: 0 },
    ];
    
    settled.forEach(bet => {
      const r = ranges.find(r => bet.odds >= r.min && bet.odds < r.max);
      if (r) {
        if (bet.result === 'won') r.won++;
        else if (bet.result === 'lost') r.lost++;
      }
    });
    
    return ranges.map(r => ({
      range: r.range,
      won: r.won,
      lost: r.lost,
      winRate: (r.won + r.lost) > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0,
    }));
  }, [bets]);

  // Recent bets
  const recentBets = bets.slice(0, 10);

  if (stats.totalBets === 0) {
    return (
      <Card className="p-6 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-bold">Henüz performans verisi yok</h3>
        <p className="text-sm text-muted-foreground mt-1">
          İlk bahsinizi girdikten sonra performans istatistikleriniz burada görünecek.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase">Win Rate</span>
          </div>
          <div className={cn(
            'text-2xl font-extrabold',
            stats.winRate >= 55 ? 'text-green-500' : stats.winRate >= 45 ? 'text-amber-500' : 'text-red-500'
          )}>
            %{stats.winRate.toFixed(1)}
          </div>
          <div className="text-[10px] text-muted-foreground">{stats.totalWon}W / {stats.totalLost}L</div>
        </Card>
        
        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Percent className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase">ROI</span>
          </div>
          <div className={cn(
            'text-2xl font-extrabold',
            stats.roi >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground">
            ₺{stats.totalStaked.toLocaleString('tr-TR')} yatırıldı
          </div>
        </Card>
        
        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase">Net Kar</span>
          </div>
          <div className={cn(
            'text-2xl font-extrabold',
            stats.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {stats.profitLoss >= 0 ? '+' : ''}₺{stats.profitLoss.toLocaleString('tr-TR')}
          </div>
          <div className="text-[10px] text-muted-foreground">
            ₺{stats.totalReturns.toLocaleString('tr-TR')} dönüş
          </div>
        </Card>
        
        <Card className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase">Ort. Oran</span>
          </div>
          <div className="text-2xl font-extrabold">{stats.avgOdds.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">
            Ort. bahis: ₺{stats.avgStake.toFixed(0)}
          </div>
        </Card>
      </div>
      
      {/* Balance Chart */}
      {balanceHistory.length > 1 && (
        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Bakiye Grafiği
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={balanceHistory}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number | undefined) => [`₺${(value ?? 0).toLocaleString('tr-TR')}`, 'Bakiye']}
              />
              <ReferenceLine y={initialBalance} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="hsl(var(--primary))" 
                fillOpacity={1} 
                fill="url(#balanceGrad)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
      
      {/* Daily P&L Chart */}
      {dailyPnLData.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Günlük P&L
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyPnLData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number | undefined) => [`₺${(value ?? 0).toLocaleString('tr-TR')}`, 'P&L']}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              <Bar 
                dataKey="pnl" 
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      
      {/* Odds Performance */}
      <Card className="p-4">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Oran Bazlı Performans
        </h4>
        <div className="space-y-2">
          {oddsDistribution.map((d) => (
            <div key={d.range} className="flex items-center gap-3">
              <span className="text-xs font-mono w-16 text-muted-foreground">{d.range}</span>
              <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden flex">
                {(d.won + d.lost) > 0 && (
                  <>
                    <div 
                      className="h-full bg-green-500/80 flex items-center justify-center"
                      style={{ width: `${(d.won / (d.won + d.lost)) * 100}%` }}
                    >
                      {d.won > 0 && <span className="text-[9px] font-bold text-white">{d.won}</span>}
                    </div>
                    <div 
                      className="h-full bg-red-500/80 flex items-center justify-center"
                      style={{ width: `${(d.lost / (d.won + d.lost)) * 100}%` }}
                    >
                      {d.lost > 0 && <span className="text-[9px] font-bold text-white">{d.lost}</span>}
                    </div>
                  </>
                )}
              </div>
              <span className={cn(
                'text-xs font-bold w-10 text-right',
                d.winRate >= 55 ? 'text-green-500' : d.winRate >= 45 ? 'text-amber-500' : 'text-red-500'
              )}>
                {(d.won + d.lost) > 0 ? `%${d.winRate}` : '-'}
              </span>
            </div>
          ))}
        </div>
      </Card>
      
      {/* Recent Bets */}
      <Card className="p-4">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Son Bahisler
        </h4>
        <div className="space-y-2">
          {recentBets.map((bet) => (
            <div 
              key={bet.id} 
              className={cn(
                'flex items-center justify-between p-2.5 rounded-lg',
                bet.result === 'won' ? 'bg-green-500/5 border border-green-500/20' :
                bet.result === 'lost' ? 'bg-red-500/5 border border-red-500/20' :
                'bg-muted/30 border border-border/50'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">
                  {bet.homeTeam} vs {bet.awayTeam}
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span>{bet.pick}</span>
                  <span>•</span>
                  <span>@{bet.odds.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-right ml-2">
                <div className={cn(
                  'text-xs font-bold',
                  bet.result === 'won' ? 'text-green-500' : 
                  bet.result === 'lost' ? 'text-red-500' : 
                  'text-amber-500'
                )}>
                  {bet.result === 'won' ? `+₺${(bet.returns - bet.amount).toFixed(0)}` :
                   bet.result === 'lost' ? `-₺${bet.amount.toFixed(0)}` :
                   `₺${bet.amount.toFixed(0)}`}
                </div>
                <Badge variant="outline" className={cn(
                  'text-[9px] px-1.5',
                  bet.result === 'won' ? 'text-green-500 border-green-500/30' :
                  bet.result === 'lost' ? 'text-red-500 border-red-500/30' :
                  bet.result === 'void' ? 'text-muted-foreground' :
                  'text-amber-500 border-amber-500/30'
                )}>
                  {bet.result === 'pending' ? 'Bekliyor' : 
                   bet.result === 'won' ? 'Kazandı' : 
                   bet.result === 'lost' ? 'Kaybetti' : 'İptal'}
                </Badge>
              </div>
            </div>
          ))}
          
          {recentBets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Henüz bahis kaydı yok
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
