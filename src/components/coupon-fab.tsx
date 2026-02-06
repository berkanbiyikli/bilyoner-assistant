/**
 * Coupon FAB + Panel - Mobil kupon
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
import { CATEGORY_INFO, type SystemType } from '@/lib/coupon/types';
import { cn } from '@/lib/utils';
import { 
  ShoppingCart, X, Trash2, Calculator,
  ChevronUp, ChevronDown, Ticket, AlertCircle
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
  banko: 'border-l-green-500',
  value: 'border-l-blue-500',
  surprise: 'border-l-purple-500',
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
          'flex items-center gap-1.5 px-4 py-2.5 rounded-full',
          'bg-primary text-primary-foreground shadow-lg',
          'hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200'
        )}
      >
        <Ticket className="h-4 w-4" />
        <span className="text-sm font-medium">Kupon</span>
        {count > 0 && (
          <span className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-white text-primary text-xs font-bold">
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
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background shadow-2xl flex flex-col border-l border-border/50 animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Kupon</span>
            <span className="text-xs text-muted-foreground">{selections.length} secim</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selections */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {selections.length === 0 ? (
              <div className="py-12 text-center">
                <ShoppingCart className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Kuponunuz bos</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Oneri kartlarindan bahis ekleyin</p>
              </div>
            ) : (
              selections.map((selection) => {
                const catInfo = CATEGORY_INFO[selection.category];

                return (
                  <div 
                    key={selection.id} 
                    className={cn(
                      'p-2.5 rounded-lg border border-l-2 border-border/50',
                      CATEGORY_BORDER[selection.category]
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                          <span>{selection.league}</span>
                          <span></span>
                          <span>{selection.time}</span>
                        </div>
                        <p className="text-xs font-medium truncate">{selection.homeTeam} - {selection.awayTeam}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">{selection.market}: {selection.pick}</span>
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
          <div className="border-t p-3 space-y-3">
            {/* System types */}
            <div className="flex flex-wrap gap-1">
              {availableSystemTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSystemType(type.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    systemType === type.value 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Temizle
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                <Calculator className="h-3.5 w-3.5" />
                Onayla
              </button>
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
        'h-7 px-2.5 rounded-md text-xs font-medium transition-all',
        inCoupon 
          ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
          : 'border border-border hover:bg-muted text-muted-foreground hover:text-foreground'
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
