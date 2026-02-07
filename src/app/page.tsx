'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExpandedMatchCard, ExpandedMatchCardSkeleton } from '@/components/expanded-match-card';
import { CouponFAB } from '@/components/coupon-fab';
import { CouponCategoryTabs } from '@/components/coupon-category-tabs';
import { ValueDashboard } from '@/components/value-dashboard';
import { CouponSidebar } from '@/components/coupon-sidebar';
import { PerformanceCard } from '@/components/performance-card';
import { HighConfidencePicks } from '@/components/high-confidence-picks';
import { TrendTracker } from '@/components/trend-tracker';
import { HighOddsPicks } from '@/components/high-odds-picks';
import { QuickBuild } from '@/components/quick-build';
import { PremiumLock } from '@/components/premium-lock';
import { SurpriseRadar } from '@/components/surprise-radar';
import { useDailyMatches, useBatchMatchDetails } from '@/hooks/useDailyMatches';
import { useLeagueStore, usePinnedLeagues } from '@/lib/favorites/league-store';
import { TOP_20_LEAGUES, getLeaguePriority } from '@/config/league-priorities';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { 
  Calendar, Star, Filter, ChevronLeft, ChevronRight, RefreshCw,
  Zap, Target, Ticket, TrendingUp, X, SlidersHorizontal,
  Trophy, Activity, Flame, Shield, ArrowUp, ArrowDown, Sparkles,
  AlertTriangle, Users
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey = 'opportunities' | 'matches' | 'coupons';
type PredictionFilter = 'all' | 'ms1' | 'ms2' | 'over25' | 'btts' | 'banko';

const TABS: { key: TabKey; label: string; icon: typeof Zap; desc: string }[] = [
  { key: 'opportunities', label: 'Oneriler', icon: Flame, desc: 'AI tahminleri' },
  { key: 'matches', label: 'Maclar', icon: Trophy, desc: 'Tum maclar' },
  { key: 'coupons', label: 'Kuponlar', icon: Ticket, desc: 'Hazir kuponlar' },
];

const PREDICTION_FILTERS: { key: PredictionFilter; label: string; icon?: typeof Zap }[] = [
  { key: 'all', label: 'Tumu' },
  { key: 'banko', label: 'Banko', icon: Shield },
  { key: 'ms1', label: 'MS 1', icon: ArrowUp },
  { key: 'ms2', label: 'MS 2', icon: ArrowDown },
  { key: 'over25', label: '2.5 Ust', icon: TrendingUp },
  { key: 'btts', label: 'KG Var', icon: Target },
];

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('matches');
  const [predictionFilter, setPredictionFilter] = useState<PredictionFilter>('all');

  const pinnedLeagues = usePinnedLeagues();
  const { togglePin } = useLeagueStore();

  const { data, isLoading, error, refetch, isFetching } = useDailyMatches(
    selectedDate,
    selectedLeagues.length > 0 ? selectedLeagues : undefined
  );

  const { data: batchDetails, isLoading: isBatchLoading } = useBatchMatchDetails(
    data?.data || [],
    !!data?.data && data.data.length > 0,
    20
  );

  const sortedLeagues = useMemo(() => {
    return [...TOP_20_LEAGUES].sort((a, b) => {
      const aPinned = pinnedLeagues.includes(a.id);
      const bPinned = pinnedLeagues.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return getLeaguePriority(b.id) - getLeaguePriority(a.id);
    });
  }, [pinnedLeagues]);

  const matchesByLeague = useMemo(() => {
    if (!data?.data) return new Map<number, DailyMatchFixture[]>();
    const grouped = new Map<number, DailyMatchFixture[]>();
    for (const match of data.data) {
      const leagueId = match.league.id;
      if (!grouped.has(leagueId)) grouped.set(leagueId, []);
      grouped.get(leagueId)!.push(match);
    }
    for (const [, matches] of grouped) {
      matches.sort((a, b) => {
        if (a.status.isLive && !b.status.isLive) return -1;
        if (!a.status.isLive && b.status.isLive) return 1;
        return a.timestamp - b.timestamp;
      });
    }
    return grouped;
  }, [data?.data]);

  const enrichedFixtures = useMemo(() => {
    if (!data?.data) return [];
    if (!batchDetails) return data.data;
    return data.data.map(fixture => {
      const detail = batchDetails.get(fixture.id);
      if (!detail) return fixture;
      return {
        ...fixture,
        h2hSummary: detail.h2hSummary || fixture.h2hSummary,
        prediction: detail.prediction || fixture.prediction,
        formComparison: detail.formComparison || fixture.formComparison,
        teamStats: detail.teamStats || fixture.teamStats,
        betSuggestions: detail.betSuggestions || fixture.betSuggestions,
      };
    });
  }, [data?.data, batchDetails]);

  const sortedMatches = useMemo(() => {
    if (!enrichedFixtures.length) return [];
    return [...enrichedFixtures].sort((a, b) => {
      if (a.status.isLive && !b.status.isLive) return -1;
      if (!a.status.isLive && b.status.isLive) return 1;
      return a.timestamp - b.timestamp;
    });
  }, [enrichedFixtures]);

  const handleLeagueToggle = (leagueId: number) => {
    setSelectedLeagues(prev => 
      prev.includes(leagueId) ? prev.filter(id => id !== leagueId) : [...prev, leagueId]
    );
  };

  const handleSelectAll = () => {
    setSelectedLeagues(prev => 
      prev.length === TOP_20_LEAGUES.length ? [] : TOP_20_LEAGUES.map(l => l.id)
    );
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Günün Bankosu - yüksek güvenli tahminler
  const topPicks = useMemo(() => {
    if (!enrichedFixtures.length) return [];
    return enrichedFixtures
      .filter(f => f.prediction?.confidence && f.prediction.confidence >= 65 && !f.status.isFinished)
      .sort((a, b) => (b.prediction?.confidence || 0) - (a.prediction?.confidence || 0))
      .slice(0, 5);
  }, [enrichedFixtures]);

  // Quick prediction filter
  const filteredMatches = useMemo(() => {
    if (predictionFilter === 'all') return sortedMatches;
    return sortedMatches.filter(m => {
      const pred = m.prediction;
      const stats = m.teamStats;
      const suggestions = m.betSuggestions;
      switch (predictionFilter) {
        case 'banko': return (pred?.confidence && pred.confidence >= 70) || suggestions?.some(s => s.confidence >= 70);
        case 'ms1': return pred?.winner === m.homeTeam.name;
        case 'ms2': return pred?.winner === m.awayTeam.name;
        case 'over25': {
          if (pred?.goalsAdvice?.toLowerCase().includes('over') || pred?.goalsAdvice?.toLowerCase().includes('üst')) return true;
          if (suggestions?.some(s => s.market.includes('2.5') && s.pick.toLowerCase().includes('üst'))) return true;
          if (suggestions?.some(s => s.market.includes('2.5') && s.pick.toLowerCase().includes('ust'))) return true;
          if (stats) {
            const totalGoals = (typeof stats.homeGoalsScored === 'number' ? stats.homeGoalsScored : 0) + 
                               (typeof stats.awayGoalsScored === 'number' ? stats.awayGoalsScored : 0);
            if (totalGoals >= 2.8) return true;
          }
          return false;
        }
        case 'btts': {
          if (pred?.goalsAdvice?.toLowerCase().includes('btts') || pred?.goalsAdvice?.toLowerCase().includes('kg')) return true;
          if (suggestions?.some(s => s.type === 'btts' && s.pick === 'Var')) return true;
          return false;
        }
        default: return true;
      }
    });
  }, [sortedMatches, predictionFilter]);

  // AI reasoning oluşturucu
  const getAIReasoning = (fixture: DailyMatchFixture): string | null => {
    const parts: string[] = [];
    const pred = fixture.prediction;
    if (!pred) return null;

    if (pred.winner && pred.confidence >= 60) {
      parts.push(`${pred.winner} %${pred.confidence} guvenle one cikiyor`);
    }
    if (fixture.formComparison) {
      const homeWins = fixture.formComparison.homeLast5.filter(r => r === 'W').length;
      const awayWins = fixture.formComparison.awayLast5.filter(r => r === 'W').length;
      if (homeWins >= 4) parts.push(`${fixture.homeTeam.name.split(' ')[0]} son 5'te ${homeWins}G`);
      if (awayWins >= 4) parts.push(`${fixture.awayTeam.name.split(' ')[0]} son 5'te ${awayWins}G`);
    }
    if (pred.goalsAdvice) parts.push(pred.goalsAdvice);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  const getSuggestions = (fixture: DailyMatchFixture): BetSuggestion[] | undefined => {
    // Önce API'den gelen zengin betSuggestions'ı kullan
    if (fixture.betSuggestions && fixture.betSuggestions.length > 0) {
      return fixture.betSuggestions;
    }
    
    const suggestions: BetSuggestion[] = [];
    const pred = fixture.prediction;
    const stats = fixture.teamStats;
    
    // 1. Maç Sonucu
    if (pred?.confidence && pred.confidence >= 55) {
      const conf = pred.confidence;
      const winner = pred.winner;
      let pick = 'MS X';
      let odds = 3.20;
      if (winner === fixture.homeTeam.name) {
        pick = 'MS 1';
        odds = 1.30 + (100 - conf) / 40;
      } else if (winner === fixture.awayTeam.name) {
        pick = 'MS 2';
        odds = 1.50 + (100 - conf) / 35;
      }
      suggestions.push({
        type: 'result',
        market: 'Mac Sonucu',
        pick,
        confidence: conf,
        odds: Number(odds.toFixed(2)),
        value: conf >= 75 ? 'high' : conf >= 65 ? 'medium' : 'low',
        reasoning: pred.advice || winner + ' one cikiyor',
      });
    }
    
    // 2. Gol bahisleri (Üst/Alt) - teamStats varsa
    if (stats) {
      const homeGoals = typeof stats.homeGoalsScored === 'number' ? stats.homeGoalsScored : 0;
      const awayGoals = typeof stats.awayGoalsScored === 'number' ? stats.awayGoalsScored : 0;
      const totalAvg = homeGoals + awayGoals;
      
      if (totalAvg >= 2.8) {
        const conf = Math.min(82, 58 + Math.round((totalAvg - 2.5) * 25));
        suggestions.push({
          type: 'goals',
          market: 'U2.5 Gol',
          pick: 'Ust 2.5',
          confidence: conf,
          odds: Number((1 / (conf / 100) * 0.88).toFixed(2)),
          value: totalAvg >= 3.5 ? 'high' : 'medium',
          reasoning: `Ev ${homeGoals.toFixed(1)} gol, deplasman ${awayGoals.toFixed(1)} gol atiyor`,
        });
      } else if (totalAvg <= 2.0) {
        const conf = Math.min(78, 55 + Math.round((2.5 - totalAvg) * 30));
        suggestions.push({
          type: 'goals',
          market: 'A2.5 Gol',
          pick: 'Alt 2.5',
          confidence: conf,
          odds: Number((1 / (conf / 100) * 0.88).toFixed(2)),
          value: totalAvg <= 1.5 ? 'high' : 'medium',
          reasoning: `Dusuk skorlu maclar (ort. ${totalAvg.toFixed(1)} gol)`,
        });
      }
    }
    
    // 3. KG (Her İki Takım da Gol Atar) - goalsAdvice içeriyorsa veya teamStats varsa
    if (pred?.goalsAdvice) {
      const advice = pred.goalsAdvice.toLowerCase();
      if (advice.includes('btts') || advice.includes('kg') || advice.includes('both')) {
        suggestions.push({
          type: 'btts',
          market: 'KG',
          pick: 'Var',
          confidence: Math.min(75, (pred.confidence || 60)),
          odds: 1.80,
          value: 'medium',
          reasoning: pred.goalsAdvice,
        });
      }
      if (advice.includes('over') || advice.includes('ust') || advice.includes('üst')) {
        const existsGoal = suggestions.find(s => s.type === 'goals');
        if (!existsGoal) {
          suggestions.push({
            type: 'goals',
            market: 'U2.5 Gol',
            pick: 'Ust 2.5',
            confidence: Math.min(72, (pred.confidence || 58)),
            odds: 1.75,
            value: 'medium',
            reasoning: pred.goalsAdvice,
          });
        }
      }
    }
    
    // 4. H2H bazlı ek tahminler
    if (fixture.h2hSummary && fixture.h2hSummary.totalMatches >= 3) {
      const h2h = fixture.h2hSummary;
      const drawRate = h2h.draws / h2h.totalMatches;
      if (drawRate >= 0.4 && !suggestions.find(s => s.pick === 'MS X')) {
        suggestions.push({
          type: 'result',
          market: 'Cift Sans',
          pick: 'X dahil',
          confidence: Math.min(70, Math.round(drawRate * 100 + 20)),
          odds: 1.45,
          value: 'medium',
          reasoning: `Son ${h2h.totalMatches} macin ${h2h.draws} tanesi berabere`,
        });
      }
    }
    
    // 5. Form bazlı Çift Şans
    if (pred?.confidence && pred.confidence >= 60 && pred.winner) {
      const conf = pred.confidence;
      if (pred.winner === fixture.homeTeam.name) {
        suggestions.push({
          type: 'result',
          market: 'Cift Sans',
          pick: '1X',
          confidence: Math.min(85, conf + 12),
          odds: Number(Math.max(1.20, 1 / ((conf + 12) / 100) * 0.90).toFixed(2)),
          value: conf >= 70 ? 'high' : 'medium',
          reasoning: `${fixture.homeTeam.name} favori veya beraberlik`,
        });
      } else if (pred.winner === fixture.awayTeam.name) {
        suggestions.push({
          type: 'result',
          market: 'Cift Sans',
          pick: 'X2',
          confidence: Math.min(82, conf + 10),
          odds: Number(Math.max(1.25, 1 / ((conf + 10) / 100) * 0.90).toFixed(2)),
          value: conf >= 70 ? 'high' : 'medium',
          reasoning: `${fixture.awayTeam.name} favori veya beraberlik`,
        });
      }
    }
    
    return suggestions.length > 0 ? suggestions : undefined;
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* ===== HERO STATS BAR ===== */}
      <div className="hero-gradient text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between">
            {/* Date Nav */}
            <div className="flex items-center gap-2">
              <button onClick={() => navigateDate('prev')} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
                  isToday ? 'bg-white text-indigo-600 shadow-lg' : 'bg-white/15 hover:bg-white/25'
                )}
              >
                <Calendar className="h-4 w-4" />
                {selectedDate.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </button>
              <button onClick={() => navigateDate('next')} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Stats */}
            {data?.stats && (
              <div className="hidden sm:flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-black">{data.stats.total}</div>
                  <div className="text-[10px] uppercase tracking-wider opacity-80">Mac</div>
                </div>
                {data.stats.live > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-black text-red-300 animate-pulse">{data.stats.live}</div>
                    <div className="text-[10px] uppercase tracking-wider opacity-80">Canli</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-black">{data.stats.leagues}</div>
                  <div className="text-[10px] uppercase tracking-wider opacity-80">Lig</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(true)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                  selectedLeagues.length > 0
                    ? 'bg-white text-indigo-600 shadow-lg'
                    : 'bg-white/15 hover:bg-white/25'
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtre</span>
                {selectedLeagues.length > 0 && (
                  <span className="h-5 min-w-5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold px-1">
                    {selectedLeagues.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TAB BAR ===== */}
      <div className="sticky top-16 z-30 glass border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-2 py-3 overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                  activeTab === tab.key
                    ? 'gradient-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                <span className={cn(
                  'text-[10px] font-normal',
                  activeTab === tab.key ? 'text-white/70' : 'text-muted-foreground/60'
                )}>
                  {tab.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Loading */}
            {isLoading && (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <ExpandedMatchCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4 shadow-lg">
                  <X className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">Bir seyler ters gitti</h3>
                <p className="text-sm text-muted-foreground mb-6">Maclar yuklenirken bir hata olustu</p>
                <Button onClick={() => refetch()} className="rounded-xl px-6 gradient-primary text-white border-0 shadow-lg shadow-primary/25">
                  Tekrar Dene
                </Button>
              </div>
            )}

            {/* Opportunities */}
            {!isLoading && !error && activeTab === 'opportunities' && (
              <div className="space-y-4">
                {/* Performance Card - Dünün Performansı */}
                <PerformanceCard period="yesterday" />
                
                {/* High Confidence Picks - Radarına Takılanlar */}
                <HighConfidencePicks 
                  matches={enrichedFixtures}
                  onAddToCoupon={(fixtureId, pick) => {
                    console.log('Kupona eklendi:', fixtureId, pick);
                  }}
                />
                
                {/* Quick Build - Kombine Sihirbazı */}
                <QuickBuild 
                  matches={enrichedFixtures}
                  onBuildCoupon={(coupon) => {
                    console.log('Kupon oluşturuldu:', coupon);
                  }}
                />
                
                {/* Trend Tracker - Seri Yakalayanlar */}
                <TrendTracker 
                  matches={enrichedFixtures}
                  onAddToCoupon={(fixtureId, pick) => {
                    console.log('Kupona eklendi:', fixtureId, pick);
                  }}
                />
                
                {/* 📡 Surprise Radar - Sürpriz Radarı */}
                <SurpriseRadar />
                
                {/* High Odds Picks - Oran Avcısı (PRO) */}
                <PremiumLock requiredTier="pro" message="Yuksek oranli tahminler Pro uyelerine ozeldir">
                  <HighOddsPicks 
                    matches={enrichedFixtures}
                    onAddToCoupon={(fixtureId, pick) => {
                      console.log('Kupona eklendi:', fixtureId, pick);
                    }}
                  />
                </PremiumLock>
                
                {/* Value Dashboard - Değerli Fırsatlar (PRO) */}
                <PremiumLock requiredTier="pro" message="Value bahis analizi Pro uyelerine ozeldir">
                  <ValueDashboard />
                </PremiumLock>
              </div>
            )}

            {/* Matches */}
            {!isLoading && !error && activeTab === 'matches' && data?.data && (
              <div className="space-y-4">
                {/* ===== GÜNÜN BANKOSU ===== */}
                {topPicks.length > 0 && predictionFilter === 'all' && (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/15">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">Gunun Bankosu</h3>
                        <p className="text-[10px] text-muted-foreground">AI&apos;nin en guvendi&breve;i tahminler</p>
                      </div>
                      <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-lg">{topPicks.length} tahmin</span>
                    </div>
                    <div className="space-y-2">
                      {topPicks.map((pick) => {
                        const reasoning = getAIReasoning(pick);
                        return (
                          <div key={pick.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-background/60 border border-border/30 hover:border-amber-500/20 transition-colors">
                            <div className="shrink-0 text-center">
                              <span className={cn(
                                'inline-block text-lg font-black',
                                (pick.prediction?.confidence || 0) >= 75 ? 'text-emerald-500' : 'text-amber-500'
                              )}>
                                %{pick.prediction?.confidence}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs font-semibold">
                                <span className="truncate">{pick.homeTeam.name}</span>
                                <span className="text-muted-foreground">vs</span>
                                <span className="truncate">{pick.awayTeam.name}</span>
                              </div>
                              {reasoning && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{reasoning}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              {pick.prediction?.winner && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">{pick.prediction.winner === pick.homeTeam.name ? 'MS 1' : pick.prediction.winner === pick.awayTeam.name ? 'MS 2' : 'X'}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ===== QUICK PREDICTION FILTERS ===== */}
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {PREDICTION_FILTERS.map(filter => (
                    <button
                      key={filter.key}
                      onClick={() => setPredictionFilter(filter.key)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border',
                        predictionFilter === filter.key
                          ? 'gradient-primary text-white border-transparent shadow-sm shadow-primary/20'
                          : 'bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      {filter.icon && <filter.icon className="h-3 w-3" />}
                      {filter.label}
                      {filter.key !== 'all' && (
                        <span className={cn(
                          'text-[9px] font-bold px-1 rounded',
                          predictionFilter === filter.key ? 'bg-white/20' : 'bg-muted'
                        )}>
                          {sortedMatches.filter(m => {
                            const pred = m.prediction;
                            const stats = m.teamStats;
                            const suggestions = m.betSuggestions;
                            switch (filter.key) {
                              case 'banko': return (pred?.confidence && pred.confidence >= 70) || suggestions?.some(s => s.confidence >= 70);
                              case 'ms1': return pred?.winner === m.homeTeam.name;
                              case 'ms2': return pred?.winner === m.awayTeam.name;
                              case 'over25': {
                                if (pred?.goalsAdvice?.toLowerCase().includes('over') || pred?.goalsAdvice?.toLowerCase().includes('üst')) return true;
                                if (suggestions?.some(s => s.market.includes('2.5') && (s.pick.toLowerCase().includes('üst') || s.pick.toLowerCase().includes('ust')))) return true;
                                if (stats) {
                                  const tg = (typeof stats.homeGoalsScored === 'number' ? stats.homeGoalsScored : 0) + (typeof stats.awayGoalsScored === 'number' ? stats.awayGoalsScored : 0);
                                  if (tg >= 2.8) return true;
                                }
                                return false;
                              }
                              case 'btts': {
                                if (pred?.goalsAdvice?.toLowerCase().includes('btts') || pred?.goalsAdvice?.toLowerCase().includes('kg')) return true;
                                if (suggestions?.some(s => s.type === 'btts' && s.pick === 'Var')) return true;
                                return false;
                              }
                              default: return true;
                            }
                          }).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {filteredMatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      <Calendar className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">{predictionFilter !== 'all' ? 'Filtre Sonucu Bos' : 'Mac Bulunamadi'}</h3>
                    <p className="text-sm text-muted-foreground">{predictionFilter !== 'all' ? 'Bu kritere uyan mac yok. Filtre degistirin.' : 'Bu tarihte mac yok. Baska bir gun deneyin.'}</p>
                    {predictionFilter !== 'all' && (
                      <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={() => setPredictionFilter('all')}>
                        Filtreyi Kaldir
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMatches.map((match, i) => (
                      <div key={match.id} className="animate-fade-in" style={{ animationDelay: i < 10 ? i * 50 + 'ms' : '0ms' }}>
                        <ExpandedMatchCard 
                          fixture={match}
                          defaultExpanded={match.status.isLive}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Coupons */}
            {!isLoading && !error && activeTab === 'coupons' && data?.data && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="gradient-primary p-2 rounded-xl">
                    <Target className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold">Kupon Kategorileri</h2>
                    <p className="text-xs text-muted-foreground">{data.stats?.total || 0} mac analiz edildi</p>
                  </div>
                  {isBatchLoading && (
                    <RefreshCw className="h-4 w-4 animate-spin text-primary ml-auto" />
                  )}
                </div>
                <CouponCategoryTabs 
                  fixtures={enrichedFixtures}
                  getSuggestions={getSuggestions}
                  isLoading={isBatchLoading}
                />
              </div>
            )}
          </div>

          {/* Desktop Sidebar */}
          <aside className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-36 h-[calc(100vh-160px)]">
              <CouponSidebar />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile Coupon FAB */}
      <div className="xl:hidden">
        <CouponFAB />
      </div>

      {/* ===== FILTER DRAWER ===== */}
      {showFilters && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-background shadow-2xl flex flex-col animate-slide-in-right border-l border-border/50">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="gradient-primary p-2 rounded-xl">
                  <Filter className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="font-bold">Lig Filtresi</h2>
                  <p className="text-[11px] text-muted-foreground">{selectedLeagues.length || 'Tum'} lig secili</p>
                </div>
              </div>
              <button onClick={() => setShowFilters(false)} className="p-2 rounded-xl hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-2 p-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSelectAll}
                className="flex-1 rounded-xl"
              >
                {selectedLeagues.length === TOP_20_LEAGUES.length ? 'Temizle' : 'Tumunu Sec'}
              </Button>
              {pinnedLeagues.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSelectedLeagues(pinnedLeagues)}
                  className="flex-1 gap-1.5 rounded-xl"
                >
                  <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                  Favoriler
                </Button>
              )}
            </div>
            
            {/* League List */}
            <ScrollArea className="flex-1">
              <div className="px-3 pb-3 space-y-1">
                {sortedLeagues.map((league) => {
                  const isPinned = pinnedLeagues.includes(league.id);
                  const matchCount = matchesByLeague.get(league.id)?.length || 0;
                  const isSelected = selectedLeagues.length === 0 || selectedLeagues.includes(league.id);
                  
                  return (
                    <div
                      key={league.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer',
                        isSelected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted border border-transparent'
                      )}
                      onClick={() => handleLeagueToggle(league.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleLeagueToggle(league.id)}
                        className="pointer-events-none"
                      />
                      <span className="text-lg">{league.flag}</span>
                      <span className="text-sm font-semibold flex-1 truncate">{league.name}</span>
                      {matchCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] rounded-lg">{matchCount}</Badge>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePin(league.id); }}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Star className={cn(
                          'h-3.5 w-3.5 transition-colors',
                          isPinned ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'
                        )} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            {/* Footer */}
            <div className="p-4 border-t">
              <Button 
                className="w-full rounded-xl h-11 text-sm font-bold gradient-primary text-white border-0 shadow-lg shadow-primary/25"
                onClick={() => setShowFilters(false)}
              >
                Uygula
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
