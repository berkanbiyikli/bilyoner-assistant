/**
 * Bet Entry Component
 * Manuel bahis girişi formu
 */

'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useBankrollStore, calculateKelly, impliedProbability } from '@/lib/bankroll';
import { Plus, DollarSign, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BetEntry() {
  const { placeBet, currentBalance, riskLimits, isWithinLimits } = useBankrollStore();
  
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [pick, setPick] = useState('');
  const [odds, setOdds] = useState('');
  const [amount, setAmount] = useState('');
  const [confidence, setConfidence] = useState(60);
  const [success, setSuccess] = useState(false);
  
  const numOdds = parseFloat(odds) || 0;
  const numAmount = parseFloat(amount) || 0;
  
  const kellyResult = numOdds > 1 ? calculateKelly({
    odds: numOdds,
    probability: confidence / 100,
    bankroll: currentBalance,
    kellyFraction: riskLimits.kellyFraction,
    maxBetPercentage: riskLimits.maxBetPercentage,
    maxSingleBet: riskLimits.maxSingleBet,
  }) : null;
  
  const limitCheck = numAmount > 0 ? isWithinLimits(numAmount) : { allowed: true };
  
  const canSubmit = homeTeam && awayTeam && pick && numOdds > 1 && numAmount > 0 && limitCheck.allowed;

  const handleSubmit = () => {
    if (!canSubmit) return;
    
    placeBet({
      homeTeam,
      awayTeam,
      pick,
      odds: numOdds,
      amount: numAmount,
      confidence,
    });
    
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setHomeTeam('');
      setAwayTeam('');
      setPick('');
      setOdds('');
      setAmount('');
      setConfidence(60);
    }, 2000);
  };

  const quickPicks = ['MS 1', 'MS X', 'MS 2', '2.5 Üst', '2.5 Alt', 'KG Var', 'KG Yok', '1X', 'X2', '12'];

  if (success) {
    return (
      <Card className="p-6 text-center bg-green-500/5 border-green-500/20">
        <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <h3 className="font-bold text-green-500">Bahis Kaydedildi!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {homeTeam} vs {awayTeam} · {pick} @{numOdds.toFixed(2)}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-lg">Bahis Gir</h3>
      </div>
      
      {/* Teams */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Ev Sahibi</label>
          <Input
            placeholder="Fenerbahçe"
            value={homeTeam}
            onChange={(e) => setHomeTeam(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Deplasman</label>
          <Input
            placeholder="Galatasaray"
            value={awayTeam}
            onChange={(e) => setAwayTeam(e.target.value)}
          />
        </div>
      </div>
      
      {/* Pick */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tahmin</label>
        <div className="flex flex-wrap gap-1.5">
          {quickPicks.map((qp) => (
            <button
              key={qp}
              onClick={() => setPick(qp)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                pick === qp 
                  ? 'bg-primary text-white' 
                  : 'bg-muted/50 hover:bg-muted text-muted-foreground'
              )}
            >
              {qp}
            </button>
          ))}
        </div>
        <Input
          placeholder="veya özel tahmin yazın..."
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="mt-2"
        />
      </div>
      
      {/* Odds & Amount */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Oran</label>
          <Input
            type="number"
            step={0.01}
            min={1.01}
            placeholder="1.85"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
          />
          {numOdds > 1 && (
            <span className="text-[10px] text-muted-foreground mt-0.5 block">
              İma edilen: %{(impliedProbability(numOdds) * 100).toFixed(1)}
            </span>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Bahis Miktarı (₺)</label>
          <Input
            type="number"
            min={1}
            placeholder="50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      
      {/* Confidence slider */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Güven Seviyesi: %{confidence}
        </label>
        <Input
          type="range"
          min={30}
          max={95}
          value={confidence}
          onChange={(e) => setConfidence(parseInt(e.target.value))}
          className="cursor-pointer"
        />
      </div>
      
      {/* Kelly suggestion */}
      {kellyResult && kellyResult.isValueBet && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground">Kelly önerisi:</span>
            <span className="text-sm font-bold text-primary ml-2">
              ₺{kellyResult.suggestedAmount.toLocaleString('tr-TR')}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => setAmount(kellyResult.suggestedAmount.toString())}
          >
            Uygula
          </Button>
        </div>
      )}
      
      {/* Limit Warning */}
      {!limitCheck.allowed && numAmount > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-red-500 bg-red-500/10 rounded-lg p-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{limitCheck.reason}</span>
        </div>
      )}
      
      {/* Potential return */}
      {numOdds > 1 && numAmount > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Potansiyel kazanç:</span>
          <span className="text-sm font-bold text-green-500">
            ₺{(numAmount * numOdds).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}
      
      <Button 
        className="w-full" 
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        <DollarSign className="h-4 w-4 mr-2" />
        Bahis Kaydet
      </Button>
    </Card>
  );
}
