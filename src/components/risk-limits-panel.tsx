/**
 * Risk Limits Panel
 * Günlük/haftalık kayıp limiti ve bet sizing kontrolleri
 */

'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useBankrollStore } from '@/lib/bankroll';
import { 
  Shield, AlertTriangle, Lock, Unlock, Settings,
  TrendingDown, Calendar, CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function RiskLimitsPanel() {
  const { 
    riskLimits, 
    currentBalance, 
    updateRiskLimits, 
    getDailyLossUsed, 
    getWeeklyLossUsed 
  } = useBankrollStore();
  
  const [editing, setEditing] = useState(false);
  const [localLimits, setLocalLimits] = useState(riskLimits);
  
  const dailyLossUsed = getDailyLossUsed();
  const weeklyLossUsed = getWeeklyLossUsed();
  
  const dailyPct = riskLimits.dailyLossLimit > 0 
    ? (dailyLossUsed / riskLimits.dailyLossLimit) * 100 
    : 0;
  const weeklyPct = riskLimits.weeklyLossLimit > 0 
    ? (weeklyLossUsed / riskLimits.weeklyLossLimit) * 100 
    : 0;

  const handleSave = () => {
    updateRiskLimits(localLimits);
    setEditing(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-lg">Risk Limitleri</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (editing) handleSave();
            else {
              setLocalLimits(riskLimits);
              setEditing(true);
            }
          }}
        >
          {editing ? (
            <>
              <Lock className="h-3.5 w-3.5 mr-1" />
              Kaydet
            </>
          ) : (
            <>
              <Settings className="h-3.5 w-3.5 mr-1" />
              Düzenle
            </>
          )}
        </Button>
      </div>

      {/* Loss Limits Progress */}
      <div className="space-y-3">
        {/* Daily */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Günlük Kayıp
            </span>
            <span className={cn('font-semibold', dailyPct > 80 ? 'text-red-500' : dailyPct > 50 ? 'text-amber-500' : 'text-green-500')}>
              ₺{dailyLossUsed.toFixed(0)} / ₺{riskLimits.dailyLossLimit}
            </span>
          </div>
          <Progress 
            value={Math.min(dailyPct, 100)} 
            className={cn(
              'h-2',
              dailyPct > 80 ? '[&>div]:bg-red-500' : dailyPct > 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'
            )} 
          />
          {dailyPct > 80 && (
            <div className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3 w-3" />
              Günlük limite yaklaşıyorsunuz!
            </div>
          )}
        </div>

        {/* Weekly */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Haftalık Kayıp
            </span>
            <span className={cn('font-semibold', weeklyPct > 80 ? 'text-red-500' : weeklyPct > 50 ? 'text-amber-500' : 'text-green-500')}>
              ₺{weeklyLossUsed.toFixed(0)} / ₺{riskLimits.weeklyLossLimit}
            </span>
          </div>
          <Progress 
            value={Math.min(weeklyPct, 100)} 
            className={cn(
              'h-2',
              weeklyPct > 80 ? '[&>div]:bg-red-500' : weeklyPct > 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'
            )} 
          />
        </div>
      </div>

      {/* Settings Grid */}
      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Günlük Kayıp Limiti (₺)</label>
            <Input
              type="number"
              value={localLimits.dailyLossLimit}
              onChange={(e) => setLocalLimits({ ...localLimits, dailyLossLimit: parseFloat(e.target.value) || 0 })}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Haftalık Kayıp Limiti (₺)</label>
            <Input
              type="number"
              value={localLimits.weeklyLossLimit}
              onChange={(e) => setLocalLimits({ ...localLimits, weeklyLossLimit: parseFloat(e.target.value) || 0 })}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Bahis (%kasa)</label>
            <Input
              type="number"
              step={0.5}
              value={localLimits.maxBetPercentage}
              onChange={(e) => setLocalLimits({ ...localLimits, maxBetPercentage: parseFloat(e.target.value) || 5 })}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Tek Bahis (₺)</label>
            <Input
              type="number"
              value={localLimits.maxSingleBet}
              onChange={(e) => setLocalLimits({ ...localLimits, maxSingleBet: parseFloat(e.target.value) || 500 })}
              className="h-9"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Kelly Fraksiyonu ({localLimits.kellyFraction === 0.25 ? 'Quarter' : localLimits.kellyFraction === 0.5 ? 'Half' : 'Custom'} Kelly)
            </label>
            <Input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={localLimits.kellyFraction}
              onChange={(e) => setLocalLimits({ ...localLimits, kellyFraction: parseFloat(e.target.value) })}
              className="h-9 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>%10 (Çok Güvenli)</span>
              <span className="font-bold">%{(localLimits.kellyFraction * 100).toFixed(0)}</span>
              <span>%100 (Full Kelly)</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Max Bahis</div>
            <div className="text-sm font-bold">%{riskLimits.maxBetPercentage} kasa</div>
            <div className="text-[10px] text-muted-foreground">
              = ₺{(currentBalance * riskLimits.maxBetPercentage / 100).toFixed(0)}
            </div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Tek Bahis Limiti</div>
            <div className="text-sm font-bold">₺{riskLimits.maxSingleBet.toLocaleString('tr-TR')}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 col-span-2">
            <div className="text-xs text-muted-foreground">Kelly Ayarı</div>
            <div className="text-sm font-bold">
              {riskLimits.kellyFraction === 0.25 ? 'Quarter Kelly (%25)' 
                : riskLimits.kellyFraction === 0.5 ? 'Half Kelly (%50)' 
                : `%${(riskLimits.kellyFraction * 100).toFixed(0)} Kelly`}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
