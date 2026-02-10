/**
 * Coupon FAB + Panel - Mobil kupon (Bankroll entegreli)
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  useCouponStore, 
  useCouponSelections, 
  useCouponIsOpen,
  useCouponCount 
} from '@/lib/coupon/store';
import { useBankrollStore, calculateKelly } from '@/lib/bankroll';
import { CATEGORY_INFO, type SystemType } from '@/lib/coupon/types';
import { cn } from '@/lib/utils';
import { 
  ShoppingCart, X, Trash2, Calculator,
  ChevronUp, ChevronDown, Ticket, AlertCircle,
  Wallet, TrendingUp, Shield, Check, Sparkles
} from 'lucide-react';

const SYSTEM_TYPES: { value: SystemType; label: string; minSelections: number }[] = [
  { value: 'single', label: 'Tekli', minSelections: 1 },
  { value: 'full', label: 'Kombine', minSelections: 2 },
  { value: '2/3', label: '2/3', minSelections: 3 },
  { value: '3/4', label: '3/4', minSelections: 4 },
  { value: '2/4', label: '2/4', minSelections: 4 },
  { value: '3/5', label: '3/5', minSelections: 5 },
  { value: '4/5', label: '4/5', minSelections: 5 },
  { value: '3/6', label: '3/6', minSelections: 6 },
  { value: '5/6', label: '5/6', minSelections: 6 },
];

const CATEGORY_BORDER: Record<string, string> = {
  banko: 'border-l-emerald-500',
  value: 'border-l-blue-500',
  surprise: 'border-l-violet-500',
};

export function CouponFAB() {
  const count = useCouponCount();
  const isOpen = useCouponIsOpen();
  const { toggleOpen } = useCouponStore();

  return (
    <>
      <button
        onClick={toggleOpen}
        className={cn(
          'fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50',
          'flex items-center gap-2 px-5 py-3 rounded-2xl',
          'gradient-primary text-white shadow-xl shadow-primary/25',
          'hover:shadow-2xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all duration-200'
        )}
      >
        <Ticket className="h-4.5 w-4.5" />
        <span className="text-sm font-semibold">Kupon</span>
        {count > 0 && (
          <span className="flex items-center justify-center h-5.5 min-w-5.5 px-1.5 rounded-full bg-white text-primary text-xs font-bold shadow-sm">
            {count}
          </span>
        )}
      </button>

      {isOpen && <CouponPanel />}
    </>
  );
}

function CouponPanel() {
  const selections = useCouponSelections();
  const { 
    removeSelection, clearCoupon, setOpen, systemType,
    setSystemType, stakePerCombination, setStake, calculateCombinations 
  } = useCouponStore();

  const result = calculateCombinations();
  const availableSystemTypes = SYSTEM_TYPES.filter(s => s.minSelections <= selections.length);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background shadow-2xl flex flex-col border-l border-primary/10 animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-primary/10 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
              <Ticket className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">Kupon</span>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-lg">{selections.length} secim</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selections */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {selections.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 flex items-center justify-center mx-auto mb-3">
                  <ShoppingCart className="h-6 w-6 text-primary/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Kuponunuz bos</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Oneri kartlarindan bahis ekleyin</p>
              </div>
            ) : (
              selections.map((selection) => {
                const catInfo = CATEGORY_INFO[selection.category];

                return (
                  <div 
                    key={selection.id} 
                    className={cn(
                      'p-3 rounded-xl border border-l-2 border-border/30 card-premium',
                      CATEGORY_BORDER[selection.category]
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                          <span className="font-medium">{selection.league}</span>
                          <span>·</span>
                          <span>{selection.time}</span>
                        </div>
                        <p className="text-xs font-semibold truncate">{selection.homeTeam} - {selection.awayTeam}</p>
                        <div className="flex items-center gap-2.5 mt-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-primary/10 font-semibold text-primary">{selection.market}: {selection.pick}</span>
                          <span className="text-xs font-bold text-primary tabular-nums">{selection.odds.toFixed(2)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeSelection(selection.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        {selections.length > 0 && (
          <div className="border-t border-primary/10 p-3.5 space-y-3">
            {/* System types */}
            <div className="flex flex-wrap gap-1.5">
              {availableSystemTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSystemType(type.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                    systemType === type.value 
                      ? 'gradient-primary text-white shadow-sm shadow-primary/20' 
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Stake */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Misli:</span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => setStake(Math.max(1, stakePerCombination - 1))} className="h-7 w-7 flex items-center justify-center rounded border hover:bg-muted">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  value={stakePerCombination}
                  onChange={(e) => setStake(Number(e.target.value) || 1)}
                  className="h-7 w-14 text-center text-sm border rounded bg-transparent"
                  min={1}
                />
                <button onClick={() => setStake(stakePerCombination + 1)} className="h-7 w-7 flex items-center justify-center rounded border hover:bg-muted">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <span className="text-xs text-muted-foreground ml-0.5">TL</span>
              </div>
            </div>

            <Separator />

            {/* Summary */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kombinasyon</span>
                <span className="font-medium">{result.totalCombinations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yatirim</span>
                <span className="font-medium">{result.totalStake.toFixed(2)} TL</span>
              </div>
              {systemType !== 'full' && systemType !== 'single' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min/Max</span>
                  <span>{result.minWin.toFixed(2)} - {result.maxWin.toFixed(2)} TL</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-baseline pt-1">
              <span className="text-xs text-muted-foreground">Potansiyel Kazanc</span>
              <span className="text-lg font-bold text-primary">{result.potentialWin.toFixed(2)} TL</span>
            </div>

            {selections.length < 2 && systemType !== 'single' && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-500/10 px-2.5 py-1.5 rounded-lg">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Kombine icin en az 2 secim gerekli</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button 
                onClick={clearCoupon}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-border/50 text-xs font-semibold hover:bg-muted transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Temizle
              </button>
              <MobileCouponConfirmButton 
                selections={selections} 
                result={result} 
                systemType={systemType}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Kupona Ekle butonu
 */
export function AddToCouponButton({
  fixtureId, homeTeam, awayTeam, league, date, time,
  market, pick, odds, confidence, category,
}: {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  time: string;
  market: string;
  pick: string;
  odds: number;
  confidence: number;
  category: 'banko' | 'value' | 'surprise';
}) {
  const { addSelection, isInCoupon, removeSelection, selections } = useCouponStore();
  const inCoupon = isInCoupon(fixtureId, market);

  const handleClick = () => {
    if (inCoupon) {
      const existing = selections.find(s => s.fixtureId === fixtureId && s.market === market);
      if (existing) removeSelection(existing.id);
    } else {
      addSelection({ fixtureId, homeTeam, awayTeam, league, date, time, market, pick, odds, confidence, category });
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'h-7 px-3 rounded-lg text-xs font-semibold transition-all',
        inCoupon 
          ? 'gradient-primary text-white shadow-sm shadow-primary/20 hover:opacity-90' 
          : 'border border-border/50 hover:bg-primary/10 text-muted-foreground hover:text-primary'
      )}
    >
      {inCoupon ? (
        <span className="flex items-center gap-1"><X className="h-3 w-3" />Cikar</span>
      ) : (
        <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />Ekle</span>
      )}
    </button>
  );
}

/** Mobil kupon onaylama + bankroll */
function MobileCouponConfirmButton({ selections, result, systemType }: {
  selections: ReturnType<typeof useCouponSelections>;
  result: { totalStake: number; potentialWin: number };
  systemType: SystemType;
}) {
  const { currentBalance, placeBet, isWithinLimits, riskLimits } = useBankrollStore();
  const { clearCoupon, setOpen } = useCouponStore();
  const [confirmed, setConfirmed] = useState(false);
  
  const totalStake = result.totalStake;
  const limitCheck = isWithinLimits(totalStake);
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const avgConfidence = selections.length > 0 
    ? selections.reduce((sum, s) => sum + s.confidence, 0) / selections.length 
    : 50;

  const handleConfirm = () => {
    if (!limitCheck.allowed && currentBalance > 0) return;
    
    if (currentBalance > 0) {
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
    }
    
    setConfirmed(true);
    setTimeout(() => {
      clearCoupon();
      setOpen(false);
      setConfirmed(false);
    }, 1500);
  };

  if (confirmed) {
    return (
      <div className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-green-500/10 border border-green-500/30 text-green-500 text-xs font-semibold">
        <Check className="h-3.5 w-3.5" />
        Kaydedildi!
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-1.5">
      {/* Kasa bilgisi */}
      {currentBalance > 0 && (
        <div className="flex items-center justify-between text-[9px] text-muted-foreground px-1">
          <span className="flex items-center gap-1">
            <Wallet className="h-2.5 w-2.5" />
            ₺{currentBalance.toLocaleString('tr-TR')}
          </span>
          {!limitCheck.allowed && (
            <span className="text-red-500 flex items-center gap-0.5">
              <Shield className="h-2.5 w-2.5" />
              Limit aşımı
            </span>
          )}
        </div>
      )}
      <button 
        onClick={handleConfirm}
        disabled={!limitCheck.allowed && currentBalance > 0}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-semibold shadow-sm transition-opacity",
          !limitCheck.allowed && currentBalance > 0
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'gradient-primary text-white shadow-primary/20 hover:opacity-90'
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {currentBalance > 0 ? 'Onayla & Kaydet' : 'Onayla'}
      </button>
    </div>
  );
}
