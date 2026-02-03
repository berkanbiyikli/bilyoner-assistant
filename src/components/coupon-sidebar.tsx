'use client';

/**
 * Coupon Sidebar - Sabit Kupon Paneli
 * Sağ tarafta her zaman görünür, seçilen bahisleri gösterir
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  useCouponStore, 
  useCouponSelections, 
  useCouponCount 
} from '@/lib/coupon/store';
import { CATEGORY_INFO, type SystemType } from '@/lib/coupon/types';
import { cn } from '@/lib/utils';
import { 
  ShoppingCart, 
  X, 
  Trash2, 
  ChevronUp,
  ChevronDown,
  Ticket,
  Calculator,
  Sparkles,
  Copy,
  Check
} from 'lucide-react';

// Sistem tipleri
const SYSTEM_TYPES: { value: SystemType; label: string; minSelections: number }[] = [
  { value: 'single', label: 'Tekli', minSelections: 1 },
  { value: 'full', label: 'Kombine', minSelections: 2 },
  { value: '2/3', label: '2/3', minSelections: 3 },
  { value: '3/4', label: '3/4', minSelections: 4 },
  { value: '2/4', label: '2/4', minSelections: 4 },
];

// Kategori renkleri
const CATEGORY_COLORS = {
  banko: 'bg-green-500/20 border-green-500/50 text-green-700 dark:text-green-400',
  value: 'bg-blue-500/20 border-blue-500/50 text-blue-700 dark:text-blue-400',
  surprise: 'bg-orange-500/20 border-orange-500/50 text-orange-700 dark:text-orange-400',
};

const CATEGORY_LABELS = {
  banko: '🔒 Banko',
  value: '💎 Value',
  surprise: '🎲 Sürpriz',
};

export function CouponSidebar() {
  const count = useCouponCount();
  const selections = useCouponSelections();
  const { 
    removeSelection, 
    clearCoupon, 
    systemType,
    setSystemType,
    stakePerCombination,
    setStake,
    calculateCombinations 
  } = useCouponStore();

  const [copied, setCopied] = useState(false);
  const result = calculateCombinations();
  const availableSystemTypes = SYSTEM_TYPES.filter(s => s.minSelections <= selections.length);

  // Kuponu kopyala
  const handleCopy = () => {
    const couponText = selections.map(s => 
      `${s.homeTeam} - ${s.awayTeam}: ${s.pick} @ ${s.odds.toFixed(2)}`
    ).join('\n');
    
    const summary = `\n---\nToplam Oran: ${result.totalCombinations === 1 
      ? selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
      : 'Sistem'
    }\nMisli: ${stakePerCombination} TL`;
    
    navigator.clipboard.writeText(couponText + summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (count === 0) {
    return (
      <Card className="h-full border-dashed">
        <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
          <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-muted-foreground mb-2">Kuponunuz Boş</h3>
          <p className="text-sm text-muted-foreground">
            Maç önerilerindeki <span className="font-medium">+</span> butonuna tıklayarak bahis ekleyin
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="pb-2 space-y-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            Kupon
            <Badge variant="secondary">{count}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={clearCoupon}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Selections List */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-2 py-3">
          {selections.map((selection) => (
            <div
              key={selection.id}
              className={cn(
                'p-2 rounded-lg border text-sm',
                CATEGORY_COLORS[selection.category]
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs opacity-75">{selection.time}</span>
                    <span className="text-xs opacity-50">•</span>
                    <span className="text-xs opacity-75 truncate">{selection.league}</span>
                  </div>
                  <div className="font-medium truncate text-xs">
                    {selection.homeTeam} - {selection.awayTeam}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-semibold">{selection.pick}</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {selection.odds.toFixed(2)}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                  onClick={() => removeSelection(selection.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* System Type & Stake */}
      <div className="p-3 space-y-3">
        {/* System Type Selector */}
        <div className="flex flex-wrap gap-1">
          {availableSystemTypes.map((sys) => (
            <Button
              key={sys.value}
              variant={systemType === sys.value ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSystemType(sys.value)}
            >
              {sys.label}
            </Button>
          ))}
        </div>

        {/* Stake Input */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Misli:</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setStake(Math.max(1, stakePerCombination - 1))}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              value={stakePerCombination}
              onChange={(e) => setStake(Number(e.target.value) || 1)}
              className="h-7 w-16 text-center text-sm"
              min={1}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setStake(stakePerCombination + 1)}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <span className="text-xs text-muted-foreground">TL</span>
          </div>
        </div>

        {/* Summary */}
        <div className="p-2 rounded-lg bg-muted/50 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Kombinasyon</span>
            <span className="font-medium">{result.totalCombinations}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Toplam Yatırım</span>
            <span className="font-medium">{result.totalStake.toFixed(2)} TL</span>
          </div>
          <Separator className="my-1" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Toplam Oran</span>
            <span className="font-bold text-primary">
              {systemType === 'full' 
                ? selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
                : 'Sistem'
              }
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Potansiyel Kazanç</span>
            <span className="font-bold text-green-600">
              {result.potentialWin.toFixed(2)} TL
            </span>
          </div>
        </div>

        {/* CTA Button */}
        <Button className="w-full gap-2" size="sm">
          <Sparkles className="h-4 w-4" />
          Kuponu Onayla
        </Button>
      </div>
    </Card>
  );
}

export default CouponSidebar;
