"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  Target, 
  Activity, 
  AlertTriangle, 
  Trophy,
  TrendingUp,
  Clock,
  Volume2,
  VolumeX,
  RefreshCw,
  Radio
} from 'lucide-react';
import type { LiveMatchHunter, HunterOpportunity, MomentumData, LiveXGData } from '@/lib/bot/live-types';

interface HunterDashboardProps {
  hunterMatches: LiveMatchHunter[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

/**
 * Momentum Meter Component
 */
function MomentumMeter({ momentum, teamName, isHome }: { momentum: number; teamName: string; isHome: boolean }) {
  const getColor = () => {
    if (momentum >= 80) return 'bg-red-500';
    if (momentum >= 60) return 'bg-orange-500';
    if (momentum >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getGlowClass = () => {
    if (momentum >= 80) return 'shadow-red-500/50 shadow-lg animate-pulse';
    if (momentum >= 60) return 'shadow-orange-500/30 shadow-md';
    return '';
  };

  return (
    <div className={`p-3 rounded-xl bg-card border border-border/50 ${getGlowClass()}`}>
      <div className="flex items-center gap-2 mb-2">
        <Zap className={`w-4 h-4 ${momentum >= 80 ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{isHome ? '🏠' : '✈️'} {teamName}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Progress value={momentum} className="h-3" />
        </div>
        <span className={`text-lg font-bold ${momentum >= 80 ? 'text-red-500' : ''}`}>
          {momentum}%
        </span>
      </div>
      {momentum >= 80 && (
        <p className="text-xs text-red-500 mt-1 font-medium animate-pulse">
          🔥 GOL KAPIDA!
        </p>
      )}
    </div>
  );
}

/**
 * xG Value Card
 */
function XGValueCard({ liveXG, actualGoals }: { liveXG: LiveXGData; actualGoals: number }) {
  const xgDiff = liveXG.xgDifferential;
  const hasValue = liveXG.hasValueOpportunity;

  return (
    <div className={`p-3 rounded-xl border border-border/50 ${hasValue ? 'bg-amber-500/10 border-amber-500' : 'bg-card'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Target className={`w-4 h-4 ${hasValue ? 'text-amber-500' : 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">Canlı xG Analizi</span>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Ev xG</p>
          <p className="text-lg font-bold">{liveXG.homeXG.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Dep xG</p>
          <p className="text-lg font-bold">{liveXG.awayXG.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Fark</p>
          <p className={`text-lg font-bold ${xgDiff >= 1.2 ? 'text-amber-500' : ''}`}>
            {xgDiff >= 0 ? '+' : ''}{xgDiff.toFixed(2)}
          </p>
        </div>
      </div>

      {hasValue && liveXG.opportunityMessage && (
        <div className="mt-2 p-2 bg-amber-500/20 rounded-lg text-xs text-center font-medium">
          {liveXG.opportunityMessage}
        </div>
      )}
    </div>
  );
}

/**
 * Opportunity Alert Card
 */
function OpportunityAlert({ opportunity, onDismiss }: { opportunity: HunterOpportunity; onDismiss?: () => void }) {
  const urgencyColors = {
    critical: 'bg-red-500/20 border-red-500 text-red-500',
    high: 'bg-orange-500/20 border-orange-500 text-orange-500',
    medium: 'bg-yellow-500/20 border-yellow-500 text-yellow-500',
    low: 'bg-blue-500/20 border-blue-500 text-blue-500'
  };

  const urgencyIcons = {
    critical: <Trophy className="w-5 h-5 animate-bounce" />,
    high: <AlertTriangle className="w-5 h-5 animate-pulse" />,
    medium: <TrendingUp className="w-5 h-5" />,
    low: <Activity className="w-5 h-5" />
  };

  const expiresIn = Math.max(0, opportunity.expiresIn);
  const expiresMinutes = Math.floor(expiresIn / 60);
  const expiresSeconds = expiresIn % 60;

  return (
    <div className={`p-4 rounded-xl border-2 ${urgencyColors[opportunity.urgency]} ${opportunity.urgency === 'critical' ? 'animate-pulse' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {urgencyIcons[opportunity.urgency]}
          <span className="font-bold">{opportunity.title}</span>
        </div>
        <Badge variant="outline" className="shrink-0">
          <Clock className="w-3 h-3 mr-1" />
          {expiresMinutes}:{expiresSeconds.toString().padStart(2, '0')}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <p className="text-xs opacity-70">Pazar</p>
          <p className="font-semibold">{opportunity.market}</p>
        </div>
        <div>
          <p className="text-xs opacity-70">Öneri</p>
          <p className="font-semibold">{opportunity.pick}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1">
          <span className="text-xs opacity-70">Güven:</span>
          <span className="font-bold">%{opportunity.confidence}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs opacity-70">Value:</span>
          <span className="font-bold text-green-500">+{opportunity.value}%</span>
        </div>
      </div>

      <p className="text-xs mt-3 opacity-80">{opportunity.reasoning}</p>
    </div>
  );
}

/**
 * Hunter Match Card
 */
function HunterMatchCard({ match }: { match: LiveMatchHunter }) {
  const statusColors = {
    watching: 'bg-slate-500',
    alert: 'bg-orange-500',
    golden_chance: 'bg-amber-500 animate-pulse',
    cooling_down: 'bg-blue-500'
  };

  const statusLabels = {
    watching: 'İzleniyor',
    alert: 'Dikkat!',
    golden_chance: 'ALTIN FIRSAT!',
    cooling_down: 'Bekleme'
  };

  return (
    <Card className={`rounded-2xl border-border/50 ${match.hunterStatus === 'golden_chance' ? 'ring-2 ring-amber-500 shadow-amber-500/20 shadow-lg' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${match.hunterStatus === 'golden_chance' ? 'text-amber-500 animate-pulse' : 'text-red-500'}`} />
            <span className="text-sm text-muted-foreground">{match.minute}'</span>
          </div>
          <Badge className={`rounded-lg ${statusColors[match.hunterStatus]}`}>
            {statusLabels[match.hunterStatus]}
          </Badge>
        </div>
        <CardTitle className="text-lg">
          {match.homeTeam} <span className="text-2xl font-bold mx-2">{match.score.home} - {match.score.away}</span> {match.awayTeam}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Momentum Meters */}
        <div className="grid grid-cols-2 gap-2">
          <MomentumMeter 
            momentum={match.momentum.homeMomentum} 
            teamName={match.homeTeam} 
            isHome={true}
          />
          <MomentumMeter 
            momentum={match.momentum.awayMomentum} 
            teamName={match.awayTeam} 
            isHome={false}
          />
        </div>

        {/* xG Analysis */}
        <XGValueCard 
          liveXG={match.liveXG} 
          actualGoals={match.score.home + match.score.away}
        />

        {/* Active Opportunities */}
        {match.activeOpportunities.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4" />
              Aktif Fırsatlar ({match.activeOpportunities.length})
            </h4>
            {match.activeOpportunities.map((opp, idx) => (
              <OpportunityAlert key={opp.id || idx} opportunity={opp} />
            ))}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 bg-muted/30 rounded-xl border border-border/20">
            <p className="text-muted-foreground">İsabetli Şut</p>
            <p className="font-bold">{match.liveStats.shotsOnTarget.home} - {match.liveStats.shotsOnTarget.away}</p>
          </div>
          <div className="p-2 bg-muted/30 rounded-xl border border-border/20">
            <p className="text-muted-foreground">Korner</p>
            <p className="font-bold">{match.liveStats.corners.home} - {match.liveStats.corners.away}</p>
          </div>
          <div className="p-2 bg-muted/30 rounded-xl border border-border/20">
            <p className="text-muted-foreground">Top Kontrolü</p>
            <p className="font-bold">{match.liveStats.possession.home}% - {match.liveStats.possession.away}%</p>
          </div>
          <div className="p-2 bg-muted/30 rounded-xl border border-border/20">
            <p className="text-muted-foreground">Kart</p>
            <p className="font-bold">
              🟨{match.liveStats.yellowCards.home + match.liveStats.yellowCards.away}
              🟥{match.liveStats.redCards.home + match.liveStats.redCards.away}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Main Hunter Dashboard
 */
export function HunterDashboard({ hunterMatches, onRefresh, isLoading }: HunterDashboardProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAlertRef = useRef<string>('');

  // Altın fırsat ses efekti
  useEffect(() => {
    if (!soundEnabled) return;

    const goldenChances = hunterMatches.filter(m => m.hunterStatus === 'golden_chance');
    const alertId = goldenChances.map(m => m.matchId).join('-');
    
    if (goldenChances.length > 0 && alertId !== lastAlertRef.current) {
      lastAlertRef.current = alertId;
      playAlertSound();
    }
  }, [hunterMatches, soundEnabled]);

  const playAlertSound = () => {
    try {
      // Web Audio API kullanarak basit bir beep sesi
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880; // A5 note
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // İkinci beep
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.5);
      }, 200);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  };

  // Fırsat özetleri
  const totalOpportunities = hunterMatches.reduce((sum, m) => sum + m.activeOpportunities.length, 0);
  const goldenChances = hunterMatches.filter(m => m.hunterStatus === 'golden_chance').length;
  const alertMatches = hunterMatches.filter(m => m.hunterStatus === 'alert').length;

  // Önce golden_chance, sonra alert, sonra diğerleri
  const sortedMatches = [...hunterMatches].sort((a, b) => {
    const priority = { golden_chance: 0, alert: 1, watching: 2, cooling_down: 3 };
    return priority[a.hunterStatus] - priority[b.hunterStatus];
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xl font-bold">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <Target className="w-5 h-5 text-amber-500" />
            </div>
            Canlı Avcı Modu
          </div>
          {goldenChances > 0 && (
            <Badge className="bg-amber-500 animate-pulse">
              <Trophy className="w-3 h-3 mr-1" />
              {goldenChances} Altın Fırsat!
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
            title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
          >
            {soundEnabled ? (
              <Volume2 className="w-5 h-5" />
            ) : (
              <VolumeX className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
            title="Yenile"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 text-center rounded-2xl border-border/50">
          <p className="text-2xl font-bold">{hunterMatches.length}</p>
          <p className="text-xs text-muted-foreground">Canlı Maç</p>
        </Card>
        <Card className="p-3 text-center rounded-2xl border-border/50">
          <p className={`text-2xl font-bold ${goldenChances > 0 ? 'text-amber-500' : ''}`}>
            {goldenChances}
          </p>
          <p className="text-xs text-muted-foreground">Altın Fırsat</p>
        </Card>
        <Card className="p-3 text-center rounded-2xl border-border/50">
          <p className={`text-2xl font-bold ${alertMatches > 0 ? 'text-orange-500' : ''}`}>
            {alertMatches}
          </p>
          <p className="text-xs text-muted-foreground">Uyarı</p>
        </Card>
        <Card className="p-3 text-center rounded-2xl border-border/50">
          <p className="text-2xl font-bold text-green-500">{totalOpportunities}</p>
          <p className="text-xs text-muted-foreground">Toplam Fırsat</p>
        </Card>
      </div>

      {/* Match Cards */}
      {sortedMatches.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl border-border/50 border-dashed">
          <Radio className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Canlı Maç Bekleniyor</h3>
          <p className="text-sm text-muted-foreground">
            Şu anda takip edilecek canlı maç bulunmuyor. Maçlar başladığında burada görünecek.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sortedMatches.map((match) => (
            <HunterMatchCard key={match.matchId} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HunterDashboard;
