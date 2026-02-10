/**
 * Kelly Calculator Component
 * Her maç için optimal bahis miktarını hesaplar
 */

'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  calculateKelly, 
  calculateFlatBet, 
  impliedProbability,
  useBankrollStore 
} from '@/lib/bankroll';
import { 
  Calculator, TrendingUp, AlertTriangle, Shield, 
  Target, Percent, DollarSign, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KellyCalculatorProps {
  defaultOdds?: number;
  defaultConfidence?: number;
  matchLabel?: string;
  onBetPlace?: (amount: number) => void;
}

export function KellyCalculator({ 
  defaultOdds = 1.80, 
  defaultConfidence = 65,
  matchLabel,
  onBetPlace 
}: KellyCalculatorProps) {
  const { currentBalance, riskLimits, isWithinLimits } = useBankrollStore();
  
  const [odds, setOdds] = useState(defaultOdds);
  const [confidence, setConfidence] = useState(defaultConfidence);
  const [customProbability, setCustomProbability] = useState<number | null>(null);
  const [mode, setMode] = useState<'kelly' | 'flat'>('kelly');
  const [flatPercentage, setFlatPercentage] = useState(2);
  
  const probability = customProbability ?? confidence / 100;
  const implied = impliedProbability(odds);
  
  const kellyResult = useMemo(() => {
    return calculateKelly({
      odds,
      probability,
      bankroll: currentBalance,
      kellyFraction: riskLimits.kellyFraction,
      maxBetPercentage: riskLimits.maxBetPercentage,
      maxSingleBet: riskLimits.maxSingleBet,
    });
  }, [odds, probability, currentBalance, riskLimits]);
  
  const flatAmount = useMemo(() => {
    return calculateFlatBet(currentBalance, flatPercentage);
  }, [currentBalance, flatPercentage]);
  
  const suggestedAmount = mode === 'kelly' ? kellyResult.suggestedAmount : flatAmount;
  const limitCheck = isWithinLimits(suggestedAmount);
  
  const riskColors = {
    low: 'text-green-500 bg-green-500/10',
    medium: 'text-yellow-500 bg-yellow-500/10',
    high: 'text-orange-500 bg-orange-500/10',
    extreme: 'text-red-500 bg-red-500/10',
  };
  
  const riskLabels = {
    low: 'Düşük Risk',
    medium: 'Orta Risk',
    high: 'Yüksek Risk',
    extreme: 'Çok Yüksek Risk',
  };

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-lg">Bahis Hesaplayıcı</h3>
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setMode('kelly')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
              mode === 'kelly' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Kelly
          </button>
          <button
            onClick={() => setMode('flat')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
              mode === 'flat' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Flat
          </button>
        </div>
      </div>
      
      {matchLabel && (
        <p className="text-sm text-muted-foreground">{matchLabel}</p>
      )}
      
      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Oran</label>
          <Input
            type="number"
            step={0.01}
            min={1.01}
            value={odds}
            onChange={(e) => setOdds(parseFloat(e.target.value) || 1.01)}
            className="h-10"
          />
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            İma edilen: %{(implied * 100).toFixed(1)}
          </span>
        </div>
        
        {mode === 'kelly' ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Güven ({confidence}%)
            </label>
            <Input
              type="range"
              min={30}
              max={95}
              value={confidence}
              onChange={(e) => {
                setConfidence(parseInt(e.target.value));
                setCustomProbability(null);
              }}
              className="h-10 cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground mt-0.5 block">
              Olasılık: %{(probability * 100).toFixed(1)}
            </span>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Kasa % ({flatPercentage}%)
            </label>
            <Input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={flatPercentage}
              onChange={(e) => setFlatPercentage(parseFloat(e.target.value))}
              className="h-10 cursor-pointer"
            />
          </div>
        )}
      </div>
      
      {/* Result */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Önerilen Bahis</span>
          <Badge className={cn('text-xs', riskColors[kellyResult.riskLevel])}>
            {riskLabels[kellyResult.riskLevel]}
          </Badge>
        </div>
        
        <div className="text-3xl font-bold tracking-tight">
          ₺{suggestedAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </div>
        
        {mode === 'kelly' && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-background/50 rounded-lg p-2">
              <div className="text-xs text-muted-foreground">Full Kelly</div>
              <div className="text-sm font-bold text-blue-500">%{kellyResult.fullKelly.toFixed(2)}</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2">
              <div className="text-xs text-muted-foreground">Edge</div>
              <div className={cn('text-sm font-bold', kellyResult.edge > 0 ? 'text-green-500' : 'text-red-500')}>
                {kellyResult.edge > 0 ? '+' : ''}{kellyResult.edge.toFixed(2)}%
              </div>
            </div>
            <div className="bg-background/50 rounded-lg p-2">
              <div className="text-xs text-muted-foreground">EV</div>
              <div className={cn('text-sm font-bold', kellyResult.expectedValue > 0 ? 'text-green-500' : 'text-red-500')}>
                {kellyResult.expectedValue > 0 ? '+' : ''}{(kellyResult.expectedValue * suggestedAmount).toFixed(2)}₺
              </div>
            </div>
          </div>
        )}
        
        {/* Warnings */}
        {kellyResult.warnings.length > 0 && mode === 'kelly' && (
          <div className="space-y-1">
            {kellyResult.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-amber-500">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
        
        {!limitCheck.allowed && (
          <div className="flex items-start gap-1.5 text-xs text-red-500 bg-red-500/10 rounded-lg p-2">
            <Shield className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{limitCheck.reason}</span>
          </div>
        )}
      </div>
      
      {/* Quick amounts */}
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 5].map((pct) => {
          const amt = Math.round(currentBalance * (pct / 100));
          return (
            <button
              key={pct}
              className="px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-xs font-medium transition-colors"
              onClick={() => {
                if (mode === 'flat') setFlatPercentage(pct);
              }}
            >
              %{pct} = ₺{amt.toLocaleString('tr-TR')}
            </button>
          );
        })}
      </div>
      
      {onBetPlace && suggestedAmount > 0 && limitCheck.allowed && (
        <Button 
          className="w-full" 
          onClick={() => onBetPlace(suggestedAmount)}
        >
          <DollarSign className="h-4 w-4 mr-2" />
          ₺{suggestedAmount.toLocaleString('tr-TR')} Bahis Yat
        </Button>
      )}
    </Card>
  );
}
