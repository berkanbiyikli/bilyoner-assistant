/**
 * Anasayfa - Profesyonel Tek Sayfa Tasarımı
 * Mobil ve Desktop uyumlu responsive layout
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

export default function HomePage() {
  // State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'opportunities' | 'matches' | 'coupons'>('opportunities');

  // Store hooks
  const pinnedLeagues = usePinnedLeagues();
  const { togglePin } = useLeagueStore();

  // Data fetching
  const { data, isLoading, error, refetch, isFetching } = useDailyMatches(
    selectedDate,
    selectedLeagues.length > 0 ? selectedLeagues : undefined
  );

  // Batch match details
  const { data: batchDetails, isLoading: isBatchLoading } = useBatchMatchDetails(
    data?.data || [],
    !!data?.data && data.data.length > 0,
    20
  );

  // Ligleri sırala
  const sortedLeagues = useMemo(() => {
    return [...TOP_20_LEAGUES].sort((a, b) => {
      const aPinned = pinnedLeagues.includes(a.id);
      const bPinned = pinnedLeagues.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return getLeaguePriority(b.id) - getLeaguePriority(a.id);
    });
  }, [pinnedLeagues]);

  // Maçları lige göre grupla ve her lig içinde saate göre sırala
  const matchesByLeague = useMemo(() => {
    if (!data?.data) return new Map<number, DailyMatchFixture[]>();
    const grouped = new Map<number, DailyMatchFixture[]>();
    for (const match of data.data) {
      const leagueId = match.league.id;
      if (!grouped.has(leagueId)) grouped.set(leagueId, []);
      grouped.get(leagueId)!.push(match);
    }
    // Her lig içinde maçları saate göre sırala (canlı olanlar üstte)
    for (const [, matches] of grouped) {
      matches.sort((a, b) => {
        // Canlı maçlar en üstte
        if (a.status.isLive && !b.status.isLive) return -1;
        if (!a.status.isLive && b.status.isLive) return 1;
        // Sonra saate göre
        return a.timestamp - b.timestamp;
      });
    }
    return grouped;
  }, [data?.data]);

  // Tüm maçları saate göre sıralı düz liste
  const sortedMatches = useMemo(() => {
    if (!data?.data) return [];
    return [...data.data].sort((a, b) => {
      // Canlı maçlar en üstte
      if (a.status.isLive && !b.status.isLive) return -1;
      if (!a.status.isLive && b.status.isLive) return 1;
      // Sonra saate göre
      return a.timestamp - b.timestamp;
    });
  }, [data?.data]);

  // Enrich fixtures with batch details
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

  // Handlers
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

  // Basit tahmin üretici
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
        market: 'Maç Sonucu',
        pick,
        confidence: conf,
        odds: Number(odds.toFixed(2)),
        value: conf >= 75 ? 'high' : conf >= 65 ? 'medium' : 'low',
        reasoning: fixture.prediction.advice || `${winner || 'Beraberlik'} öne çıkıyor`,
      });
    }
    
    return suggestions.length > 0 ? suggestions : undefined;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Sub-Header */}
      <div className="sticky top-16 z-30 glass border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-12 md:h-14 gap-2">
            {/* Date Navigation */}
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigateDate('prev')}
                className="h-8 w-8 rounded-xl"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant={isToday ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDate(new Date())}
                className="h-8 px-3 gap-1.5 min-w-[120px] rounded-xl"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {selectedDate.toLocaleDateString('tr-TR', { 
                    weekday: 'short', 
                    day: 'numeric',
                    month: 'short'
                  })}
                </span>
                <span className="sm:hidden">
                  {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric' })}
                </span>
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigateDate('next')}
                className="h-8 w-8 rounded-xl"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Stats Badges */}
            <div className="hidden sm:flex items-center gap-2">
              {data?.stats && (
                <>
                  <Badge variant="outline" className="gap-1 rounded-lg border-border/50">
                    <span className="font-bold text-primary">{data.stats.total}</span>
                    <span className="text-muted-foreground text-xs">maç</span>
                  </Badge>
                  {isFetching && (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                  )}
                </>
              )}
            </div>

            {/* Tabs + Filter Button */}
            <div className="flex items-center gap-2">
              {/* Desktop Tabs */}
              <div className="hidden md:flex items-center bg-muted/50 rounded-xl p-1 border border-border/30">
                <Button
                  variant={activeTab === 'opportunities' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('opportunities')}
                  className="h-7 px-3 text-xs gap-1.5 rounded-lg"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Öneriler
                </Button>
                <Button
                  variant={activeTab === 'matches' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('matches')}
                  className="h-7 px-3 text-xs gap-1.5 rounded-lg"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Maçlar
                </Button>
                <Button
                  variant={activeTab === 'coupons' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('coupons')}
                  className="h-7 px-3 text-xs gap-1.5 rounded-lg"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  Kuponlar
                </Button>
              </div>

              {/* Filter Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(true)}
                className="h-8 gap-1.5 rounded-xl border-border/50"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtre</span>
                {selectedLeagues.length > 0 && (
                  <Badge className="h-5 min-w-5 p-0 flex items-center justify-center rounded-md">
                    {selectedLeagues.length}
                  </Badge>
                )}
              </Button>

              {/* Refresh */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8 rounded-xl"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Mobile Tab Bar */}
          <div className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
            <Button
              variant={activeTab === 'opportunities' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('opportunities')}
              className="h-8 px-3 text-xs gap-1.5 flex-shrink-0 rounded-xl"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Öneriler
            </Button>
            <Button
              variant={activeTab === 'matches' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('matches')}
              className="h-8 px-3 text-xs gap-1.5 flex-shrink-0 rounded-xl"
            >
              <Zap className="h-3.5 w-3.5" />
              Maçlar
            </Button>
            <Button
              variant={activeTab === 'coupons' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('coupons')}
              className="h-8 px-3 text-xs gap-1.5 flex-shrink-0 rounded-xl"
            >
              <Ticket className="h-3.5 w-3.5" />
              Kuponlar
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Loading State */}
            {isLoading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <ExpandedMatchCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <Card className="p-8 text-center glass-subtle rounded-2xl border-border/50">
                <p className="text-destructive mb-4">Maçlar yüklenirken bir hata oluştu</p>
                <Button onClick={() => refetch()} className="rounded-xl">Tekrar Dene</Button>
              </Card>
            )}

            {/* Opportunities View */}
            {!isLoading && !error && activeTab === 'opportunities' && (
              <ValueDashboard />
            )}

            {/* Matches View - Saate göre sıralı */}
            {!isLoading && !error && activeTab === 'matches' && data?.data && (
              <div className="space-y-3">
                {sortedMatches.length === 0 ? (
                  <Card className="p-8 text-center glass-subtle rounded-2xl border-border/50">
                    <p className="text-muted-foreground">Bu tarihte maç bulunamadı</p>
                  </Card>
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

            {/* Coupons View */}
            {!isLoading && !error && activeTab === 'coupons' && data?.data && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold">Kupon Kategorileri</h2>
                  <Badge variant="outline" className="rounded-lg border-border/50">{data.stats?.total || 0} maç</Badge>
                  {isBatchLoading && (
                    <Badge variant="secondary" className="animate-pulse">
                      Yükleniyor...
                    </Badge>
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

          {/* Desktop Sidebar - Coupon */}
          <aside className="hidden xl:block w-80 flex-shrink-0">
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

      {/* Filter Drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          />
          
          {/* Drawer */}
          <div className="absolute inset-y-0 right-0 w-full max-w-sm glass shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-border/50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Filter className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold">Lig Filtreleri</h2>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowFilters(false)}
                className="rounded-xl"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-2 p-4 border-b border-border/50">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSelectAll}
                className="flex-1 rounded-xl border-border/50"
              >
                {selectedLeagues.length === TOP_20_LEAGUES.length ? 'Temizle' : 'Tümünü Seç'}
              </Button>
              {pinnedLeagues.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSelectedLeagues(pinnedLeagues)}
                  className="flex-1 gap-1 rounded-xl border-border/50"
                >
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Favoriler
                </Button>
              )}
            </div>
            
            {/* League List */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-1">
                {sortedLeagues.map((league) => {
                  const isPinned = pinnedLeagues.includes(league.id);
                  const matchCount = matchesByLeague.get(league.id)?.length || 0;
                  const isSelected = selectedLeagues.length === 0 || selectedLeagues.includes(league.id);
                  
                  return (
                    <div
                      key={league.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
                        isSelected ? "bg-primary/5 border border-primary/10" : "hover:bg-muted/50 border border-transparent"
                      )}
                    >
                      <Checkbox
                        id={`filter-league-${league.id}`}
                        checked={isSelected}
                        onCheckedChange={() => handleLeagueToggle(league.id)}
                      />
                      <label 
                        htmlFor={`filter-league-${league.id}`}
                        className="flex items-center gap-2 flex-1 cursor-pointer"
                      >
                        <span className="text-xl">{league.flag}</span>
                        <span className="font-medium">{league.name}</span>
                      </label>
                      {matchCount > 0 && (
                        <Badge variant="secondary" className="rounded-lg">{matchCount}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl"
                        onClick={() => togglePin(league.id)}
                      >
                        <Star className={cn(
                          "h-4 w-4",
                          isPinned && "fill-yellow-500 text-yellow-500"
                        )} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            {/* Footer */}
            <div className="p-4 border-t border-border/50">
              <Button 
                className="w-full rounded-xl"
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
