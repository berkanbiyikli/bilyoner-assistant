/**
 * Anasayfa - Temiz, modern tasarim
 * Tarih secimi + Tab navigasyon + Mac listesi
 */

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
  Calendar, 
  Star, 
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Zap,
  Target,
  Ticket,
  TrendingUp,
  X,
  SlidersHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey = 'opportunities' | 'matches' | 'coupons';

const TABS: { key: TabKey; label: string; icon: typeof Zap }[] = [
  { key: 'opportunities', label: 'Oneriler', icon: TrendingUp },
  { key: 'matches', label: 'Maclar', icon: Zap },
  { key: 'coupons', label: 'Kuponlar', icon: Ticket },
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
      {/* ===== Sticky Date Bar & Tabs ===== */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Date Row */}
          <div className="flex items-center justify-between h-12 gap-3">
            {/* Date Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateDate('prev')}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              
              <button
                onClick={() => setSelectedDate(new Date())}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isToday 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80'
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                {selectedDate.toLocaleDateString('tr-TR', { 
                  weekday: 'short', 
                  day: 'numeric',
                  month: 'short'
                })}
              </button>
              
              <button
                onClick={() => navigateDate('next')}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Stats + Actions */}
            <div className="flex items-center gap-2">
              {data?.stats && (
                <span className="text-xs text-muted-foreground hidden sm:block">
                  <span className="font-semibold text-foreground">{data.stats.total}</span> mac
                </span>
              )}

              <button
                onClick={() => setShowFilters(true)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  selectedLeagues.length > 0 
                    ? 'border-primary/30 bg-primary/5 text-primary' 
                    : 'border-border hover:bg-muted'
                )}
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span className="hidden sm:inline">Filtre</span>
                {selectedLeagues.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
                    {selectedLeagues.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', isFetching && 'animate-spin text-primary')} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 pb-2 -mx-1 overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex gap-6">
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Loading */}
            {isLoading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <ExpandedMatchCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <X className="h-5 w-5 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">Maclar yuklenirken bir hata olustu</p>
                <Button onClick={() => refetch()} variant="outline" size="sm" className="rounded-lg">
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
              <div className="space-y-2">
                {sortedMatches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Bu tarihte mac bulunamadi</p>
                  </div>
                ) : (
                  sortedMatches.map((match) => (
                    <ExpandedMatchCard 
                      key={match.id} 
                      fixture={match}
                      defaultExpanded={match.status.isLive}
                    />
                  ))
                )}
              </div>
            )}

            {/* Coupons */}
            {!isLoading && !error && activeTab === 'coupons' && data?.data && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Kupon Kategorileri</h2>
                  <Badge variant="secondary" className="text-[10px] rounded-md">
                    {data.stats?.total || 0} mac
                  </Badge>
                  {isBatchLoading && (
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
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
            <div className="sticky top-32 h-[calc(100vh-150px)]">
              <CouponSidebar />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile Coupon FAB */}
      <div className="xl:hidden">
        <CouponFAB />
      </div>

      {/* ===== Filter Drawer ===== */}
      {showFilters && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-background shadow-2xl flex flex-col animate-slide-in-right border-l border-border">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">Lig Filtresi</h2>
              </div>
              <button 
                onClick={() => setShowFilters(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-2 p-4 border-b border-border">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSelectAll}
                className="flex-1 rounded-lg text-xs"
              >
                {selectedLeagues.length === TOP_20_LEAGUES.length ? 'Temizle' : 'Tumunu Sec'}
              </Button>
              {pinnedLeagues.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSelectedLeagues(pinnedLeagues)}
                  className="flex-1 gap-1 rounded-lg text-xs"
                >
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Favoriler
                </Button>
              )}
            </div>
            
            {/* League List */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-0.5">
                {sortedLeagues.map((league) => {
                  const isPinned = pinnedLeagues.includes(league.id);
                  const matchCount = matchesByLeague.get(league.id)?.length || 0;
                  const isSelected = selectedLeagues.length === 0 || selectedLeagues.includes(league.id);
                  
                  return (
                    <div
                      key={league.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted'
                      )}
                      onClick={() => handleLeagueToggle(league.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleLeagueToggle(league.id)}
                        className="pointer-events-none"
                      />
                      <span className="text-base">{league.flag}</span>
                      <span className="text-sm font-medium flex-1 truncate">{league.name}</span>
                      {matchCount > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {matchCount}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePin(league.id); }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                      >
                        <Star className={cn(
                          'h-3.5 w-3.5',
                          isPinned ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'
                        )} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            {/* Footer */}
            <div className="p-4 border-t border-border">
              <Button 
                className="w-full rounded-lg"
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
