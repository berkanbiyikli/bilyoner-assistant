'use client';

/**
 * Coupon Sidebar - Desktop kupon paneli
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
import { CATEGORY_INFO, type SystemType } from '@/lib/coupon/types';
import { cn } from '@/lib/utils';
import { 
  ShoppingCart, X, Trash2, ChevronUp, ChevronDown,
  Ticket, Copy, Check, Sparkles
} from 'lucide-react';

const SYSTEM_TYPES: { value: SystemType; label: string; minSelections: number }[] = [
  { value: 'single', label: 'Tekli', minSelections: 1 },
  { value: 'full', label: 'Kombine', minSelections: 2 },
  { value: '2/3', label: '2/3', minSelections: 3 },
  { value: '3/4', label: '3/4', minSelections: 4 },
  { value: '2/4', label: '2/4', minSelections: 4 },
];

const CATEGORY_BORDER: Record<string, string> = {
  banko: 'border-l-green-500',
  value: 'border-l-blue-500',
  surprise: 'border-l-purple-500',
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
      <Card className="h-full border-dashed">
        <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="font-medium text-sm text-muted-foreground mb-1">Kuponunuz Bos</p>
          <p className="text-xs text-muted-foreground/70">
            Oneri kartlarindan <span className="font-medium">+</span> butonuna tiklayarak bahis ekleyin
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-sm">Kupon</span>
            <span className="text-xs text-muted-foreground">{count}</span>
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
                'p-2 rounded-lg border border-l-2 border-border/50 text-xs',
                CATEGORY_BORDER[selection.category]
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                    <span>{selection.time}</span>
                    <span></span>
                    <span className="truncate">{selection.league}</span>
                  </div>
                  <p className="font-medium truncate">{selection.homeTeam} - {selection.awayTeam}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-semibold">{selection.pick}</span>
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
        <div className="flex flex-wrap gap-1">
          {availableSystemTypes.map((sys) => (
            <button
              key={sys.value}
              onClick={() => setSystemType(sys.value)}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                systemType === sys.value 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
        <div className="p-2 rounded-lg bg-muted/30 space-y-1 text-xs">
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
            <span className="font-bold text-primary">{result.potentialWin.toFixed(2)} TL</span>
          </div>
        </div>

        {/* CTA */}
        <button className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Sparkles className="h-3.5 w-3.5" />
          Kuponu Onayla
        </button>
      </div>
    </Card>
  );
}

export default CouponSidebar;
