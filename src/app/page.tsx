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
import { useDailyMatches, useBatchMatchDetails } from '@/hooks/useDailyMatches';
import { useLeagueStore, usePinnedLeagues } from '@/lib/favorites/league-store';
import { TOP_20_LEAGUES, getLeaguePriority } from '@/config/league-priorities';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { 
  Calendar, Star, Filter, ChevronLeft, ChevronRight, RefreshCw,
  Zap, Target, Ticket, TrendingUp, X, SlidersHorizontal,
  Trophy, Activity, Flame
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey = 'opportunities' | 'matches' | 'coupons';

const TABS: { key: TabKey; label: string; icon: typeof Zap; desc: string }[] = [
  { key: 'opportunities', label: 'Oneriler', icon: Flame, desc: 'AI tahminleri' },
  { key: 'matches', label: 'Maclar', icon: Trophy, desc: 'Tum maclar' },
  { key: 'coupons', label: 'Kuponlar', icon: Ticket, desc: 'Hazir kuponlar' },
];

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('matches');

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

  const sortedMatches = useMemo(() => {
    if (!data?.data) return [];
    return [...data.data].sort((a, b) => {
      if (a.status.isLive && !b.status.isLive) return -1;
      if (!a.status.isLive && b.status.isLive) return 1;
      return a.timestamp - b.timestamp;
    });
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

  const getSuggestions = (fixture: DailyMatchFixture): BetSuggestion[] | undefined => {
    const suggestions: BetSuggestion[] = [];
    if (fixture.prediction?.confidence && fixture.prediction.confidence >= 55) {
      const conf = fixture.prediction.confidence;
      const winner = fixture.prediction.winner;
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
        reasoning: fixture.prediction.advice || winner + ' one cikiyor',
      });
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
              <ValueDashboard />
            )}

            {/* Matches */}
            {!isLoading && !error && activeTab === 'matches' && data?.data && (
              <div className="space-y-3">
                {sortedMatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      <Calendar className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">Mac Bulunamadi</h3>
                    <p className="text-sm text-muted-foreground">Bu tarihte mac yok. Baska bir gun deneyin.</p>
                  </div>
                ) : (
                  sortedMatches.map((match, i) => (
                    <div key={match.id} className="animate-fade-in" style={{ animationDelay: i < 10 ? i * 50 + 'ms' : '0ms' }}>
                      <ExpandedMatchCard 
                        fixture={match}
                        defaultExpanded={match.status.isLive}
                      />
                    </div>
                  ))
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
