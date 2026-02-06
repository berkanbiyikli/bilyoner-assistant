/**
 * Surprise Radar Component
 * Sürpriz maçları gösteren ana bileşen
 * 
 * Gold/Silver/Red listeleri, sürpriz skorları,
 * Poisson top 3 skor, anti-public sinyalleri
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  Radar, Zap, TrendingUp, TrendingDown, AlertTriangle, Target,
  Shield, Flame, Eye, EyeOff, ChevronRight, Crown, Sparkles,
  Activity, BarChart3, CircleAlert, Skull, Trophy, Timer,
} from 'lucide-react';
import type { SurpriseMatch, SurpriseRadarSummary, SurpriseCategory, ListCategory } from '@/lib/surprise/types';

// ============ HELPERS ============

const CATEGORY_CONFIG: Record<SurpriseCategory, { label: string; emoji: string; color: string }> = {
  odds_anomaly: { label: 'Oran Anomalisi', emoji: '📡', color: 'text-amber-500' },
  anti_public: { label: 'Ters Köşe', emoji: '⚡', color: 'text-blue-500' },
  chaos_match: { label: 'Kaos Maçı', emoji: '🌪️', color: 'text-orange-500' },
  value_bomb: { label: 'Value Bomb', emoji: '💣', color: 'text-emerald-500' },
  score_hunter: { label: 'Skor Avcısı', emoji: '🎯', color: 'text-purple-500' },
  trap_match: { label: 'Tuzak', emoji: '🪤', color: 'text-red-500' },
};

const LIST_CONFIG: Record<ListCategory, { label: string; icon: typeof Crown; color: string; bg: string; border: string; desc: string }> = {
  gold: {
    label: 'Altın Liste',
    icon: Crown,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    desc: 'Güçlü sürpriz sinyali — Oyna',
  },
  silver: {
    label: 'Gümüş Liste',
    icon: Eye,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/30',
    desc: 'İlginç sinyal — İzle',
  },
  red: {
    label: 'Kırmızı Liste',
    icon: Skull,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    desc: 'Tuzak maç — Uzak Dur',
  },
};

function SurpriseScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'from-red-500 to-orange-500'
    : score >= 60 ? 'from-amber-500 to-yellow-500'
    : score >= 40 ? 'from-blue-500 to-cyan-500'
    : 'from-slate-500 to-slate-400';
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black text-white bg-gradient-to-r',
      color
    )}>
      <Activity className="h-3 w-3" />
      {score}
    </div>
  );
}

function ListBadge({ category }: { category: ListCategory }) {
  const config = LIST_CONFIG[category];
  const Icon = config.icon;
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border',
      config.bg, config.border, config.color
    )}>
      <Icon className="h-3 w-3" />
      {config.label}
    </div>
  );
}

// ============ MATCH CARD ============

function SurpriseMatchCard({ match, compact = false }: { match: SurpriseMatch; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const kickoffTime = new Date(match.kickoff).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
  
  return (
    <div className={cn(
      'group relative rounded-2xl border transition-all duration-300',
      match.listCategory === 'gold' && 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/8',
      match.listCategory === 'silver' && 'border-border/40 bg-muted/30 hover:border-border/60 hover:bg-muted/50',
      match.listCategory === 'red' && 'border-red-500/30 bg-red-500/5 hover:border-red-500/50 hover:bg-red-500/8',
    )}>
      {/* Gold glow effect */}
      {match.listCategory === 'gold' && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5 pointer-events-none" />
      )}
      
      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* League + Time */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-medium text-muted-foreground truncate">
                {match.leagueName}
              </span>
              <span className="text-[10px] text-muted-foreground/60">•</span>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Timer className="h-3 w-3" />
                {kickoffTime}
              </div>
            </div>
            
            {/* Teams */}
            <div className="flex items-center gap-2 mb-2">
              <Link href={`/match/${match.fixtureId}`} className="font-bold text-sm hover:text-primary transition-colors line-clamp-1">
                {match.homeTeam}
                <span className="text-muted-foreground/50 mx-1.5 font-normal">vs</span>
                {match.awayTeam}
              </Link>
            </div>
            
            {/* Category badges */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <ListBadge category={match.listCategory} />
              {match.categories.slice(0, 3).map(cat => (
                <span key={cat} className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted/50',
                  CATEGORY_CONFIG[cat].color
                )}>
                  {CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}
                </span>
              ))}
            </div>
          </div>
          
          {/* Score + Pick */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <SurpriseScoreBadge score={match.surpriseScore} />
            <div className="text-right">
              <div className="text-[11px] font-bold text-primary">
                {match.surprisePick.pick}
              </div>
              <div className="text-[10px] font-semibold text-foreground/70">
                {match.surprisePick.odds.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
        
        {/* Tweet Hook */}
        <div className="text-xs text-muted-foreground leading-relaxed mt-1 mb-2 italic">
          &quot;{match.tweetHook}&quot;
        </div>
        
        {/* Quick stats bar */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-orange-500" />
            Kaos: %{(match.chaosIndex * 100).toFixed(0)}
          </div>
          {match.valueEdge > 0 && (
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              Value: +%{match.valueEdge.toFixed(0)}
            </div>
          )}
          {match.apiDeviation > 0 && (
            <div className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3 text-blue-500" />
              Sapma: %{match.apiDeviation.toFixed(0)}
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto flex items-center gap-0.5 text-primary hover:text-primary/80 font-medium"
          >
            {expanded ? 'Gizle' : 'Detay'}
            <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
          </button>
        </div>
        
        {/* Expanded Content */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-3 animate-in slide-in-from-top-2 duration-200">
            {/* Detail reason */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {match.detailReason}
            </p>
            
            {/* Data points */}
            <div className="flex flex-wrap gap-1.5">
              {match.dataPoints.map((dp, i) => (
                <span key={i} className="text-[10px] px-2 py-1 rounded-lg bg-muted/60 text-foreground/80 font-medium">
                  {dp}
                </span>
              ))}
            </div>
            
            {/* Poisson Top 3 Scores */}
            {match.scorePredictions.poissonScores.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Poisson Top 3 Skor
                </div>
                <div className="flex gap-2">
                  {match.scorePredictions.poissonScores.map((s, i) => (
                    <div key={i} className={cn(
                      'relative flex-1 text-center p-2 rounded-xl border',
                      i === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-muted/30',
                      s.isUpset && 'ring-1 ring-amber-500/30'
                    )}>
                      {s.isUpset && (
                        <span className="absolute -top-1.5 -right-1.5 text-[8px]">⚡</span>
                      )}
                      <div className="text-sm font-black">{s.score}</div>
                      <div className="text-[10px] text-muted-foreground">{s.percentDisplay}</div>
                      <div className="text-[9px] text-muted-foreground/60">({s.odds.toFixed(1)}x)</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Surprise Score */}
            {match.scorePredictions.surpriseScore && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-amber-500">Sürpriz Skor:</span>{' '}
                  <span className="font-black">{match.scorePredictions.surpriseScore.score}</span>
                  <span className="text-muted-foreground ml-1">
                    ({match.scorePredictions.surpriseScore.percentDisplay} — {match.scorePredictions.surpriseScore.odds.toFixed(1)}x)
                  </span>
                </div>
              </div>
            )}
            
            {/* Anti-public signal */}
            {match.antiPublicSignal?.isContrarian && (
              <div className="flex items-start gap-2 p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Zap className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-blue-500">Ters Köşe:</span>{' '}
                  <span className="text-muted-foreground">{match.antiPublicSignal.reason}</span>
                </div>
              </div>
            )}
            
            {/* Odds movements */}
            {match.oddsMovements.length > 0 && (
              <div className="space-y-1">
                {match.oddsMovements.map((om, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    {om.direction === 'up' ? (
                      <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                    <span className="text-muted-foreground">{om.signal}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Pick reasoning */}
            {match.surprisePick.reasoning.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Tahmin Gerekçesi
                </div>
                {match.surprisePick.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <span className="text-primary mt-0.5">›</span>
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SUMMARY STATS ============

function RadarStats({ summary }: { summary: SurpriseRadarSummary }) {
  const stats = [
    { label: 'Altın', value: summary.goldList.length, icon: Crown, color: 'text-amber-500' },
    { label: 'Tuzak', value: summary.redList.length, icon: AlertTriangle, color: 'text-red-500' },
    { label: 'Anomali', value: summary.stats.anomalyCount, icon: Radar, color: 'text-blue-500' },
    { label: 'Ters Köşe', value: summary.stats.antiPublicCount, icon: Zap, color: 'text-purple-500' },
  ];
  
  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map(s => (
        <div key={s.label} className="text-center p-2 rounded-xl bg-muted/30 border border-border/20">
          <s.icon className={cn('h-4 w-4 mx-auto mb-1', s.color)} />
          <div className="text-lg font-black">{s.value}</div>
          <div className="text-[9px] text-muted-foreground font-medium">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ============ SERIES CARDS ============

function SeriesCard({ content }: { content: SurpriseRadarSummary['seriesContent'][0] }) {
  const [showTweet, setShowTweet] = useState(false);
  
  return (
    <div className="p-3 rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{content.emoji}</span>
          <span className="text-xs font-bold">{content.title}</span>
        </div>
        <button
          onClick={() => setShowTweet(!showTweet)}
          className="text-[10px] text-primary font-medium hover:underline"
        >
          {showTweet ? 'Gizle' : 'Tweet Gör'}
        </button>
      </div>
      
      <div className="text-[11px] text-muted-foreground">
        {content.match.homeTeam} vs {content.match.awayTeam}
        <span className="mx-1.5 opacity-50">•</span>
        {content.match.surprisePick.pick} ({content.match.surprisePick.odds.toFixed(2)})
      </div>
      
      {showTweet && content.tweetThread[0] && (
        <div className="mt-2 p-2 rounded-lg bg-background/60 border border-border/20 text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed">
          {content.tweetThread[0]}
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============

type TabFilter = 'all' | 'gold' | 'silver' | 'red';

export function SurpriseRadar() {
  const [summary, setSummary] = useState<SurpriseRadarSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [showSeries, setShowSeries] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/surprise');
      if (!res.ok) throw new Error('API error');
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      } else {
        throw new Error(json.error || 'Unknown error');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Loading state
  if (isLoading) {
    return (
      <Card className="card-premium">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="card-premium border-red-500/20">
        <CardContent className="p-6 text-center">
          <CircleAlert className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sürpriz radarı yüklenemedi</p>
          <Button variant="ghost" size="sm" onClick={fetchData} className="mt-2">
            Tekrar Dene
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.surpriseMatches.length === 0) {
    return (
      <Card className="card-premium">
        <CardContent className="p-6 text-center">
          <Radar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">Sürpriz Radarı Aktif</p>
          <p className="text-xs text-muted-foreground mt-1">
            Henüz sinyal tespit edilmedi. Maçlar yaklaştıkça güncellenir.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Filter matches
  const filteredMatches = activeTab === 'all' 
    ? summary.surpriseMatches
    : summary.surpriseMatches.filter(m => m.listCategory === activeTab);

  return (
    <Card className="card-premium overflow-hidden">
      {/* Header */}
      <div className="relative px-5 pt-5 pb-3">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-red-500/5 to-purple-500/5 pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-500 shadow-lg shadow-amber-500/20">
              <Radar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
                Sürpriz Radarı
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {summary.surpriseMatches.length} sinyal / {summary.totalMatches} maç
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData} className="text-xs">
            <Activity className="h-3.5 w-3.5 mr-1" />
            Güncelle
          </Button>
        </div>
      </div>
      
      <CardContent className="p-5 pt-2 space-y-4">
        {/* Stats */}
        <RadarStats summary={summary} />
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="all" className="text-[11px] data-[state=active]:font-bold">
              Tümü ({summary.surpriseMatches.length})
            </TabsTrigger>
            <TabsTrigger value="gold" className="text-[11px] data-[state=active]:font-bold data-[state=active]:text-amber-500">
              🏆 Altın ({summary.goldList.length})
            </TabsTrigger>
            <TabsTrigger value="silver" className="text-[11px] data-[state=active]:font-bold">
              🔍 Gümüş ({summary.silverList.length})
            </TabsTrigger>
            <TabsTrigger value="red" className="text-[11px] data-[state=active]:font-bold data-[state=active]:text-red-500">
              ⛔ Tuzak ({summary.redList.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* Match list */}
        <div className="space-y-3">
          {filteredMatches.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              Bu kategoride sinyal yok
            </div>
          ) : (
            filteredMatches.slice(0, 10).map(match => (
              <SurpriseMatchCard key={match.fixtureId} match={match} />
            ))
          )}
        </div>
        
        {/* Series section */}
        {summary.seriesContent.length > 0 && (
          <div>
            <button
              onClick={() => setShowSeries(!showSeries)}
              className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-2 hover:text-foreground transition-colors"
            >
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              Twitter Seri İçerikleri ({summary.seriesContent.length})
              <ChevronRight className={cn('h-3 w-3 transition-transform', showSeries && 'rotate-90')} />
            </button>
            
            {showSeries && (
              <div className="space-y-2">
                {summary.seriesContent.map((content, i) => (
                  <SeriesCard key={i} content={content} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
