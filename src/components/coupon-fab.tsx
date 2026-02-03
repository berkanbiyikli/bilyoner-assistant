/**
 * Coupon FAB (Floating Action Button)
 * Kupon sepeti butonu ve slide-over panel
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ShoppingCart, 
  X, 
  Trash2, 
  Calculator,
  ChevronUp,
  ChevronDown,
  Ticket,
  AlertCircle
} from 'lucide-react';

// Sistem tipleri
const SYSTEM_TYPES: { value: SystemType; label: string; minSelections: number }[] = [
  { value: 'single', label: 'Tekli', minSelections: 1 },
  { value: 'full', label: 'Kombine', minSelections: 2 },
  { value: '2/3', label: 'Sistem 2/3', minSelections: 3 },
  { value: '3/4', label: 'Sistem 3/4', minSelections: 4 },
  { value: '2/4', label: 'Sistem 2/4', minSelections: 4 },
  { value: '3/5', label: 'Sistem 3/5', minSelections: 5 },
  { value: '4/5', label: 'Sistem 4/5', minSelections: 5 },
  { value: '3/6', label: 'Sistem 3/6', minSelections: 6 },
  { value: '5/6', label: 'Sistem 5/6', minSelections: 6 },
];

export function CouponFAB() {
  const count = useCouponCount();
  const isOpen = useCouponIsOpen();
  const { toggleOpen } = useCouponStore();

  if (count === 0) return null;

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={toggleOpen}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex items-center gap-2 px-4 py-3 rounded-full",
          "bg-gradient-to-r from-green-500 to-emerald-600",
          "text-white font-medium shadow-lg",
          "hover:shadow-xl hover:scale-105 transition-all",
          "animate-bounce-subtle"
        )}
      >
        <ShoppingCart className="h-5 w-5" />
        <span>Kupon</span>
        <Badge className="bg-white text-green-600 hover:bg-white">
          {count}
        </Badge>
      </button>

      {/* Slide-over Panel */}
      {isOpen && <CouponPanel />}
    </>
  );
}

function CouponPanel() {
  const selections = useCouponSelections();
  const { 
    removeSelection, 
    clearCoupon, 
    setOpen, 
    systemType,
    setSystemType,
    stakePerCombination,
    setStake,
    calculateCombinations 
  } = useCouponStore();

  const result = calculateCombinations();
  const availableSystemTypes = SYSTEM_TYPES.filter(s => s.minSelections <= selections.length);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-background shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-green-500 to-emerald-600 text-white">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            <h2 className="font-bold text-lg">Kupon Sepetim</h2>
            <Badge className="bg-white/20 text-white hover:bg-white/30">
              {selections.length} seçim
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setOpen(false)}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Selections */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2">
            {selections.map((selection) => {
              const categoryInfo = CATEGORY_INFO[selection.category];
              
              return (
                <Card key={selection.id} className="relative overflow-hidden">
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1",
                    selection.category === 'banko' && "bg-green-500",
                    selection.category === 'value' && "bg-blue-500",
                    selection.category === 'surprise' && "bg-purple-500",
                  )} />
                  <CardContent className="p-3 pl-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <span>{selection.league}</span>
                          <span>•</span>
                          <span>{selection.time}</span>
                          <Badge variant="outline" className={cn("text-[10px] h-4", categoryInfo.bgColor)}>
                            {categoryInfo.emoji} {categoryInfo.label}
                          </Badge>
                        </div>
                        <div className="font-medium text-sm truncate">
                          {selection.homeTeam} - {selection.awayTeam}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {selection.market}: {selection.pick}
                          </Badge>
                          <span className="text-sm font-bold text-green-600">
                            {selection.odds.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSelection(selection.id)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer - Calculations */}
        <div className="border-t bg-muted/30 p-4 space-y-3">
          {/* System Type Selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Kupon Tipi
            </label>
            <div className="flex flex-wrap gap-1.5">
              {availableSystemTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={systemType === type.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSystemType(type.value)}
                  className="text-xs h-7"
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Stake Input */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground">
              Misli (₺):
            </label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStake(stakePerCombination - 1)}
                disabled={stakePerCombination <= 1}
                className="h-7 w-7 p-0"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <input
                type="number"
                value={stakePerCombination}
                onChange={(e) => setStake(Number(e.target.value))}
                className="w-16 h-7 text-center text-sm border rounded"
                min={1}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStake(stakePerCombination + 1)}
                className="h-7 w-7 p-0"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Results */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kombinasyon Sayısı:</span>
              <span className="font-medium">{result.totalCombinations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Toplam Yatırım:</span>
              <span className="font-medium">₺{result.totalStake.toFixed(2)}</span>
            </div>
            {systemType !== 'full' && systemType !== 'single' && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Min/Max Kazanç:</span>
                <span>₺{result.minWin.toFixed(2)} - ₺{result.maxWin.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-green-600">
              <span>Potansiyel Kazanç:</span>
              <span>₺{result.potentialWin.toFixed(2)}</span>
            </div>
          </div>

          {/* Warning if incomplete */}
          {selections.length < 2 && systemType !== 'single' && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 p-2 rounded">
              <AlertCircle className="h-4 w-4" />
              <span>Kombine için en az 2 seçim gerekli</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={clearCoupon}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Temizle
            </Button>
            <Button className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600">
              <Calculator className="h-4 w-4 mr-2" />
              Kuponu Onayla
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Maç kartı için "Kupona Ekle" butonu
 */
export function AddToCouponButton({
  fixtureId,
  homeTeam,
  awayTeam,
  league,
  date,
  time,
  market,
  pick,
  odds,
  confidence,
  category,
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
      // Remove if already in coupon
      const existing = selections.find(s => s.fixtureId === fixtureId && s.market === market);
      if (existing) {
        removeSelection(existing.id);
      }
    } else {
      addSelection({
        fixtureId,
        homeTeam,
        awayTeam,
        league,
        date,
        time,
        market,
        pick,
        odds,
        confidence,
        category,
      });
    }
  };

  return (
    <Button
      variant={inCoupon ? "default" : "outline"}
      size="sm"
      onClick={handleClick}
      className={cn(
        "h-7 text-xs",
        inCoupon && "bg-green-500 hover:bg-green-600"
      )}
    >
      {inCoupon ? (
        <>
          <X className="h-3 w-3 mr-1" />
          Çıkar
        </>
      ) : (
        <>
          <ShoppingCart className="h-3 w-3 mr-1" />
          Ekle
        </>
      )}
    </Button>
  );
}
