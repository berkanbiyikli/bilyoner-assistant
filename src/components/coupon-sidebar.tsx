'use client';

/**
 * Coupon Sidebar - Desktop kupon paneli (Bankroll entegreli)
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  useCouponStore, useCouponSelections, useCouponCount 
} from '@/lib/coupon/store';
import { useBankrollStore, calculateKelly } from '@/lib/bankroll';
import { CATEGORY_INFO, type SystemType, type CombinationResult } from '@/lib/coupon/types';
import { cn } from '@/lib/utils';
import { 
  ShoppingCart, X, Trash2, ChevronUp, ChevronDown,
  Ticket, Copy, Check, Sparkles, Wallet, TrendingUp, Shield
} from 'lucide-react';

const SYSTEM_TYPES: { value: SystemType; label: string; minSelections: number }[] = [
  { value: 'single', label: 'Tekli', minSelections: 1 },
  { value: 'full', label: 'Kombine', minSelections: 2 },
  { value: '2/3', label: '2/3', minSelections: 3 },
  { value: '3/4', label: '3/4', minSelections: 4 },
  { value: '2/4', label: '2/4', minSelections: 4 },
];

const CATEGORY_BORDER: Record<string, string> = {
  banko: 'border-l-emerald-500',
  value: 'border-l-blue-500',
  surprise: 'border-l-violet-500',
};

export function CouponSidebar() {
  const count = useCouponCount();
  const selections = useCouponSelections();
  const { 
    removeSelection, clearCoupon, systemType, setSystemType,
    stakePerCombination, setStake, calculateCombinations 
  } = useCouponStore();

  const [copied, setCopied] = useState(false);
  const result = calculateCombinations();
  const availableSystemTypes = SYSTEM_TYPES.filter(s => s.minSelections <= selections.length);

  const handleCopy = () => {
    const couponText = selections.map(s => 
      `${s.homeTeam} - ${s.awayTeam}: ${s.pick} @ ${s.odds.toFixed(2)}`
    ).join('\n');
    const summary = `\n---\nToplam Oran: ${result.totalCombinations === 1 ? selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2) : 'Sistem'}\nMisli: ${stakePerCombination} TL`;
    navigator.clipboard.writeText(couponText + summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (count === 0) {
    return (
      <Card className="h-full border-dashed border-primary/20">
        <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-primary/30" />
          </div>
          <div>
            <p className="font-semibold text-sm text-muted-foreground mb-1">Kuponunuz Bos</p>
            <p className="text-xs text-muted-foreground/60">
              Oneri kartlarindan <span className="font-bold text-primary">+</span> butonuna tiklayarak bahis ekleyin
            </p>
          </div>
          {/* Gunun Populer Kombinesi */}
          <div className="w-full p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/15 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-bold text-amber-600">Gunun Onerisi</span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              AI modelimizin en guvendigi 3 tahmini kombinleyin.
            </p>
            <div className="space-y-1">
              {[
                { label: 'MS 1 + 2.5 Ust', desc: 'Ev sahibi favoriler' },
                { label: 'KG Var kombine', desc: 'Gol beklentisi yuksek maclar' },
                { label: 'Cift Sans', desc: 'Dusuk riskli secimler' },
              ].map((tip, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50 border border-border/20">
                  <span className="w-4 h-4 rounded flex items-center justify-center bg-amber-500/15 text-amber-600 text-[9px] font-bold">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold truncate">{tip.label}</p>
                    <p className="text-[9px] text-muted-foreground">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col card-premium">
      {/* Header */}
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
              <Ticket className="h-3 w-3 text-white" />
            </div>
            <span className="font-bold text-sm">Kupon</span>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">{count}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
            <button onClick={clearCoupon} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Selections */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1.5 py-2">
          {selections.map((selection) => (
            <div
              key={selection.id}
              className={cn(
                'p-2.5 rounded-xl border border-l-2 border-border/30 text-xs hover:bg-primary/5 transition-colors',
                CATEGORY_BORDER[selection.category]
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                    <span className="font-medium">{selection.time}</span>
                    <span>·</span>
                    <span className="truncate">{selection.league}</span>
                  </div>
                  <p className="font-semibold truncate">{selection.homeTeam} - {selection.awayTeam}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-semibold text-primary/80">{selection.pick}</span>
                    <span className="font-mono font-bold text-primary tabular-nums">{selection.odds.toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={() => removeSelection(selection.id)} className="p-0.5 rounded hover:bg-muted/80 opacity-50 hover:opacity-100 transition-opacity">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="p-3 space-y-2.5">
        {/* System types */}
        <div className="flex flex-wrap gap-1.5">
          {availableSystemTypes.map((sys) => (
            <button
              key={sys.value}
              onClick={() => setSystemType(sys.value)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
                systemType === sys.value 
                  ? 'gradient-primary text-white shadow-sm shadow-primary/20' 
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              {sys.label}
            </button>
          ))}
        </div>

        {/* Stake */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Misli:</span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setStake(Math.max(1, stakePerCombination - 1))} className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
            </button>
            <Input
              type="number"
              value={stakePerCombination}
              onChange={(e) => setStake(Number(e.target.value) || 1)}
              className="h-6 w-12 text-center text-xs"
              min={1}
            />
            <button onClick={() => setStake(stakePerCombination + 1)} className="h-6 w-6 flex items-center justify-center rounded border hover:bg-muted text-muted-foreground">
              <ChevronUp className="h-3 w-3" />
            </button>
            <span className="text-[11px] text-muted-foreground">TL</span>
          </div>
        </div>

        {/* Summary */}
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/8 to-violet-500/5 border border-primary/10 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kombinasyon</span>
            <span className="font-medium">{result.totalCombinations}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Yatirim</span>
            <span className="font-medium">{result.totalStake.toFixed(2)} TL</span>
          </div>
          <Separator className="my-1" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Toplam Oran</span>
            <span className="font-bold text-primary tabular-nums">
              {systemType === 'full' ? selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2) : 'Sistem'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Kazanc</span>
            <span className="font-bold gradient-text text-base">{result.potentialWin.toFixed(2)} TL</span>
          </div>
        </div>

        {/* CTA - Bankroll Entegreli */}
        <CouponBankrollAction selections={selections} result={result} systemType={systemType} stakePerCombination={stakePerCombination} />
      </div>
    </Card>
  );
}

/** Kupon onaylama + bankroll'a kaydetme */
function CouponBankrollAction({ selections, result, systemType, stakePerCombination }: {
  selections: ReturnType<typeof useCouponSelections>;
  result: CombinationResult;
  systemType: SystemType;
  stakePerCombination: number;
}) {
  const { currentBalance, placeBet, isWithinLimits, riskLimits } = useBankrollStore();
  const { clearCoupon } = useCouponStore();
  const [confirmed, setConfirmed] = useState(false);
  
  const totalStake = result.totalStake;
  const limitCheck = isWithinLimits(totalStake);
  
  // Kelly önerisi (kombine için toplam oran üzerinden)
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const avgConfidence = selections.length > 0 
    ? selections.reduce((sum, s) => sum + s.confidence, 0) / selections.length 
    : 50;
  
  const kellyResult = calculateKelly({
    odds: totalOdds,
    probability: avgConfidence / 100,
    bankroll: currentBalance,
    kellyFraction: riskLimits.kellyFraction,
    maxBetPercentage: riskLimits.maxBetPercentage,
    maxSingleBet: riskLimits.maxSingleBet,
  });

  const handleConfirm = () => {
    if (!limitCheck.allowed || currentBalance <= 0) return;
    
    // Kuponu bankroll'a kaydet
    const matchNames = selections.map(s => `${s.homeTeam} vs ${s.awayTeam}`).join(', ');
    const picks = selections.map(s => s.pick).join(' + ');
    
    placeBet({
      fixtureId: selections.length === 1 ? selections[0].fixtureId : undefined,
      homeTeam: selections.length === 1 ? selections[0].homeTeam : 'Kombine Kupon',
      awayTeam: selections.length === 1 ? selections[0].awayTeam : `${selections.length} maç`,
      pick: selections.length === 1 ? selections[0].pick : picks,
      odds: systemType === 'full' ? totalOdds : totalOdds,
      amount: totalStake,
      confidence: Math.round(avgConfidence),
    });
    
    setConfirmed(true);
    setTimeout(() => {
      clearCoupon();
      setConfirmed(false);
    }, 2000);
  };

  if (confirmed) {
    return (
      <div className="flex items-center justify-center gap-2 h-9 rounded-xl bg-green-500/10 border border-green-500/30 text-green-500 text-xs font-semibold">
        <Check className="h-3.5 w-3.5" />
        Kasaya kaydedildi!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Bankroll info */}
      {currentBalance > 0 && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5">
          <span className="flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            Kasa: ₺{currentBalance.toLocaleString('tr-TR')}
          </span>
          {kellyResult.isValueBet && kellyResult.suggestedAmount > 0 && (
            <span className="flex items-center gap-1 text-primary font-semibold">
              <TrendingUp className="h-3 w-3" />
              Kelly: ₺{kellyResult.suggestedAmount.toFixed(0)}
            </span>
          )}
        </div>
      )}
      
      {/* Limit uyarısı */}
      {!limitCheck.allowed && totalStake > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-red-500 bg-red-500/10 rounded-lg px-2.5 py-1.5">
          <Shield className="h-3 w-3 shrink-0" />
          {limitCheck.reason}
        </div>
      )}
      
      <button 
        onClick={handleConfirm}
        disabled={!limitCheck.allowed && currentBalance > 0}
        className={cn(
          "w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold shadow-sm transition-opacity",
          !limitCheck.allowed && currentBalance > 0
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'gradient-primary text-white shadow-primary/20 hover:opacity-90'
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {currentBalance > 0 ? 'Kuponu Onayla & Kasaya Kaydet' : 'Kuponu Onayla'}
      </button>
    </div>
  );
}

export default CouponSidebar;
