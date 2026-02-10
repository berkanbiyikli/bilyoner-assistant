/**
 * Bankroll Dashboard Component
 * Kasa takibi, P&L, ve genel bakış
 */

'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useBankrollStore } from '@/lib/bankroll';
import { 
  Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Plus, Minus, RotateCcw, DollarSign, Activity, Flame, Snowflake,
  BarChart3, PiggyBank
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function BankrollDashboard() {
  const { 
    initialBalance, 
    currentBalance, 
    setInitialBalance,
    deposit, 
    withdraw,
    getStats,
    getTodayPnL,
    resetBankroll,
    bets,
  } = useBankrollStore();
  
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [setupAmount, setSetupAmount] = useState(initialBalance.toString());
  
  const stats = getStats();
  const todayPnL = getTodayPnL();
  
  const profitLoss = currentBalance - initialBalance;
  const profitPct = initialBalance > 0 ? (profitLoss / initialBalance) * 100 : 0;
  const isProfitable = profitLoss >= 0;
  
  const pendingBets = bets.filter(b => b.result === 'pending');
  const pendingAmount = pendingBets.reduce((sum, b) => sum + b.amount, 0);

  const handleDeposit = () => {
    const val = parseFloat(amount);
    if (val > 0) {
      deposit(val);
      setAmount('');
      setShowDeposit(false);
    }
  };

  const handleWithdraw = () => {
    const val = parseFloat(amount);
    if (val > 0 && val <= currentBalance) {
      withdraw(val);
      setAmount('');
      setShowWithdraw(false);
    }
  };

  const handleSetup = () => {
    const val = parseFloat(setupAmount);
    if (val > 0) {
      setInitialBalance(val);
      setShowSetup(false);
    }
  };

  // İlk kurulum
  if (bets.length === 0 && currentBalance === 1000 && !showSetup) {
    return (
      <Card className="p-6 text-center space-y-4">
        <div className="gradient-primary p-4 rounded-2xl w-fit mx-auto">
          <PiggyBank className="h-8 w-8 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-xl">Kasa Yönetimini Başlat</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Başlangıç bakiyenizi girin ve akıllı bahis yönetimine başlayın.
          </p>
        </div>
        <div className="max-w-xs mx-auto space-y-3">
          <Input
            type="number"
            placeholder="Başlangıç bakiyesi (₺)"
            value={setupAmount}
            onChange={(e) => setSetupAmount(e.target.value)}
            className="text-center text-lg h-12"
          />
          <div className="flex gap-2 justify-center flex-wrap">
            {[500, 1000, 2500, 5000, 10000].map(amt => (
              <button
                key={amt}
                onClick={() => setSetupAmount(amt.toString())}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  setupAmount === amt.toString() 
                    ? 'bg-primary text-white' 
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                )}
              >
                ₺{amt.toLocaleString('tr-TR')}
              </button>
            ))}
          </div>
          <Button className="w-full" onClick={handleSetup}>
            <Wallet className="h-4 w-4 mr-2" />
            Kasayı Başlat
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Balance Card */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 via-background to-purple-500/5 border-primary/20">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Mevcut Kasa</span>
            <div className="text-3xl font-extrabold tracking-tight mt-1">
              ₺{currentBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold',
            isProfitable ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          )}>
            {isProfitable ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {isProfitable ? '+' : ''}{profitPct.toFixed(1)}%
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-background/50 rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Başlangıç</div>
            <div className="text-sm font-bold">₺{initialBalance.toLocaleString('tr-TR')}</div>
          </div>
          <div className={cn('rounded-lg p-2.5 text-center', isProfitable ? 'bg-green-500/10' : 'bg-red-500/10')}>
            <div className="text-[10px] text-muted-foreground uppercase">Kar/Zarar</div>
            <div className={cn('text-sm font-bold', isProfitable ? 'text-green-500' : 'text-red-500')}>
              {isProfitable ? '+' : ''}₺{profitLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Bekleyen</div>
            <div className="text-sm font-bold text-amber-500">
              {pendingBets.length > 0 ? `₺${pendingAmount.toLocaleString('tr-TR')}` : '-'}
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1"
            onClick={() => { setShowDeposit(!showDeposit); setShowWithdraw(false); }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Para Yatır
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1"
            onClick={() => { setShowWithdraw(!showWithdraw); setShowDeposit(false); }}
          >
            <Minus className="h-3.5 w-3.5 mr-1" />
            Para Çek
          </Button>
        </div>
        
        {/* Deposit/Withdraw Input */}
        {(showDeposit || showWithdraw) && (
          <div className="mt-3 flex gap-2">
            <Input
              type="number"
              placeholder="Miktar (₺)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1"
            />
            <Button 
              size="sm"
              onClick={showDeposit ? handleDeposit : handleWithdraw}
              className={showDeposit ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {showDeposit ? 'Yatır' : 'Çek'}
            </Button>
          </div>
        )}
      </Card>
      
      {/* Today's P&L */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Bugünün Özeti</h4>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-lg font-bold">{todayPnL.betsPlaced}</div>
            <div className="text-[10px] text-muted-foreground">Bahis</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-500">{todayPnL.betsWon}</div>
            <div className="text-[10px] text-muted-foreground">Kazandı</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-500">{todayPnL.betsLost}</div>
            <div className="text-[10px] text-muted-foreground">Kaybetti</div>
          </div>
          <div className="text-center">
            <div className={cn(
              'text-lg font-bold',
              todayPnL.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'
            )}>
              {todayPnL.profitLoss >= 0 ? '+' : ''}₺{todayPnL.profitLoss.toFixed(0)}
            </div>
            <div className="text-[10px] text-muted-foreground">P&L</div>
          </div>
        </div>
      </Card>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            {stats.currentStreak >= 0 ? (
              <Flame className="h-4 w-4 text-orange-500" />
            ) : (
              <Snowflake className="h-4 w-4 text-blue-500" />
            )}
            <span className="text-xs text-muted-foreground">Seri</span>
          </div>
          <div className={cn(
            'text-xl font-bold',
            stats.currentStreak > 0 ? 'text-green-500' : stats.currentStreak < 0 ? 'text-red-500' : 'text-muted-foreground'
          )}>
            {stats.currentStreak > 0 ? `${stats.currentStreak}W` : stats.currentStreak < 0 ? `${Math.abs(stats.currentStreak)}L` : '-'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            En iyi: {stats.bestStreak}W · En kötü: {Math.abs(stats.worstStreak)}L
          </div>
        </Card>
        
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Max Drawdown</span>
          </div>
          <div className="text-xl font-bold text-red-500">
            {stats.maxDrawdownPct > 0 ? `-${stats.maxDrawdownPct.toFixed(1)}%` : '-'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {stats.maxDrawdown > 0 ? `₺${stats.maxDrawdown.toLocaleString('tr-TR')}` : 'Henüz kayıp yok'}
          </div>
        </Card>
      </div>
    </div>
  );
}
