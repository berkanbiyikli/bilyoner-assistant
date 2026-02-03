/**
 * Günlük Maçlar Sayfası
 * Top 20 ligden günün maçlarını kullanıcı dostu panelde gösterir
 * - Sol panel: Lig filtreleri (pinli ligler üstte)
 * - Sağ panel: Genişletilebilir maç kartları
 * - Canlı maçlar pulse animasyonu ile
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExpandedMatchCard, ExpandedMatchCardSkeleton } from '@/components/expanded-match-card';
import { CouponFAB } from '@/components/coupon-fab';
import { CouponCategoryTabs } from '@/components/coupon-category-tabs';
import { ValueDashboard } from '@/components/value-dashboard';
import { CouponSidebar } from '@/components/coupon-sidebar';
import { useDailyMatches, useBatchMatchDetails } from '@/hooks/useDailyMatches';
import { useLeagueStore, usePinnedLeagues } from '@/lib/favorites/league-store';
import { useScannerStore } from '@/lib/stores/scanner-store';
import { scanMatches, type ScanInput } from '@/lib/prediction/scanner';
import { TOP_20_LEAGUES, getLeaguePriority } from '@/config/league-priorities';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { 
  Calendar, 
  Star, 
  Filter, 
  Radio, 
  Clock, 
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Zap,
  Target,
  Ticket
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export default function DailyMatchesPage() {
  // Tarih state'i (bugün, yarın, +2)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(true);

  // Store hooks
  const pinnedLeagues = usePinnedLeagues();
  const { togglePin } = useLeagueStore();

  // Data fetching
  const { data, isLoading, error, refetch, isFetching } = useDailyMatches(
    selectedDate,
    selectedLeagues.length > 0 ? selectedLeagues : undefined
  );

  // Ligleri önceliğe göre sırala, pinli olanlar üstte
  const sortedLeagues = useMemo(() => {
    return [...TOP_20_LEAGUES].sort((a, b) => {
      const aPinned = pinnedLeagues.includes(a.id);
      const bPinned = pinnedLeagues.includes(b.id);
      
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      
      return getLeaguePriority(b.id) - getLeaguePriority(a.id);
    });
  }, [pinnedLeagues]);

  // Maçları lige göre grupla
  const matchesByLeague = useMemo(() => {
    if (!data?.data) return new Map<number, DailyMatchFixture[]>();
    
    const grouped = new Map<number, DailyMatchFixture[]>();
    
    for (const match of data.data) {
      const leagueId = match.league.id;
      if (!grouped.has(leagueId)) {
        grouped.set(leagueId, []);
      }
      grouped.get(leagueId)!.push(match);
    }
    
    // Her lig içinde canlı maçları üste taşı
    for (const [, matches] of grouped) {
      matches.sort((a, b) => {
        if (a.status.isLive && !b.status.isLive) return -1;
        if (!a.status.isLive && b.status.isLive) return 1;
        return a.timestamp - b.timestamp;
      });
    }
    
    return grouped;
  }, [data?.data]);

  // Lig seçim handler'ı
  const handleLeagueToggle = (leagueId: number) => {
    setSelectedLeagues(prev => 
      prev.includes(leagueId)
        ? prev.filter(id => id !== leagueId)
        : [...prev, leagueId]
    );
  };

  // Tümünü seç/kaldır
  const handleSelectAll = () => {
    if (selectedLeagues.length === TOP_20_LEAGUES.length) {
      setSelectedLeagues([]);
    } else {
      setSelectedLeagues(TOP_20_LEAGUES.map(l => l.id));
    }
  };

  // Sadece pinli ligleri seç
  const handleSelectPinned = () => {
    setSelectedLeagues(pinnedLeagues);
  };

  // Tarih navigasyonu
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  // Bugün mü kontrolü
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Görünüm modu: 'matches', 'coupons' veya 'opportunities'
  const [viewMode, setViewMode] = useState<'matches' | 'coupons' | 'opportunities'>('opportunities');

  // Scanner store
  const setScanResult = useScannerStore(state => state.setScanResult);
  const setIsScanning = useScannerStore(state => state.setIsScanning);

  // Basit tahmin üretici - mevcut maç verisinden öneriler oluşturur
  const getSuggestions = (fixture: DailyMatchFixture): BetSuggestion[] | undefined => {
    const suggestions: BetSuggestion[] = [];
    
    // 1. Prediction varsa kullan
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
      } else {
        // Beraberlik
        odds = 2.80 + (100 - conf) / 50;
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
    
    // 2. Form verisinden tahmin üret
    if (fixture.formComparison) {
      const homeWins = (fixture.formComparison.homeLast5?.filter(r => r === 'W').length || 0);
      const awayWins = (fixture.formComparison.awayLast5?.filter(r => r === 'W').length || 0);
      const homeLosses = (fixture.formComparison.homeLast5?.filter(r => r === 'L').length || 0);
      const awayLosses = (fixture.formComparison.awayLast5?.filter(r => r === 'L').length || 0);
      
      // Form farkı büyükse öneri ekle
      const homeFormScore = homeWins * 3 - homeLosses * 2;
      const awayFormScore = awayWins * 3 - awayLosses * 2;
      const formDiff = homeFormScore - awayFormScore;
      
      if (Math.abs(formDiff) >= 5) {
        const isFavorHome = formDiff > 0;
        const confidence = Math.min(80, 55 + Math.abs(formDiff) * 3);
        suggestions.push({
          type: 'result',
          market: 'Maç Sonucu',
          pick: isFavorHome ? 'MS 1' : 'MS 2',
          confidence,
          odds: Number((1.40 + (100 - confidence) / 40).toFixed(2)),
          value: confidence >= 70 ? 'high' : 'medium',
          reasoning: `${isFavorHome ? 'Ev sahibi' : 'Deplasman'} formda çok üstün (son 5: ${isFavorHome ? homeWins : awayWins}G)`,
        });
      }
    }
    
    // 3. H2H verisinden tahmin
    if (fixture.h2hSummary && fixture.h2hSummary.totalMatches >= 3) {
      const { homeWins, awayWins, draws, totalMatches } = fixture.h2hSummary;
      const avgGoals = (fixture.teamStats?.homeGoalsScored || 1.5) + (fixture.teamStats?.awayGoalsScored || 1.5);
      
      // Karşılıklı gol oranı
      if (fixture.teamStats?.homeBothTeamsScored !== undefined) {
        const bttsRate = ((fixture.teamStats.homeBothTeamsScored + fixture.teamStats.awayBothTeamsScored) / 2) * 100;
        if (bttsRate >= 60) {
          suggestions.push({
            type: 'btts',
            market: 'KG',
            pick: 'Var',
            confidence: Math.min(80, Math.round(bttsRate)),
            odds: Number((1.60 + (100 - bttsRate) / 50).toFixed(2)),
            value: bttsRate >= 70 ? 'high' : 'medium',
            reasoning: `Her iki takım da son maçlarda düzenli gol buluyor`,
          });
        }
      }
      
      // H2H'de dominant olan varsa
      const dominantRate = Math.max(homeWins, awayWins) / totalMatches;
      if (dominantRate >= 0.6 && totalMatches >= 4) {
        const isHomeDominant = homeWins > awayWins;
        const confidence = Math.min(75, Math.round(50 + dominantRate * 30));
        suggestions.push({
          type: 'result',
          market: 'Maç Sonucu',
          pick: isHomeDominant ? 'MS 1' : 'MS 2',
          confidence,
          odds: Number((1.50 + (100 - confidence) / 35).toFixed(2)),
          value: dominantRate >= 0.7 ? 'high' : 'medium',
          reasoning: `H2H'de ${isHomeDominant ? 'ev sahibi' : 'deplasman'} baskın (${Math.max(homeWins, awayWins)}/${totalMatches})`,
        });
      }
      
      // Beraberlik trendi
      const drawRate = draws / totalMatches;
      if (drawRate >= 0.4 && totalMatches >= 4) {
        const confidence = Math.min(70, Math.round(45 + drawRate * 50));
        suggestions.push({
          type: 'result',
          market: 'Maç Sonucu',
          pick: 'MS X',
          confidence,
          odds: Number((3.00 + (100 - confidence) / 40).toFixed(2)),
          value: 'high', // Beraberlik genelde yüksek değerli
          reasoning: `H2H'de yüksek beraberlik oranı (${draws}/${totalMatches})`,
        });
      }
    }
    
    // 4. Takım istatistiklerinden gol tahminleri
    if (fixture.teamStats) {
      const avgHomeGoals = fixture.teamStats.homeGoalsScored + fixture.teamStats.homeGoalsConceded;
      const avgAwayGoals = fixture.teamStats.awayGoalsScored + fixture.teamStats.awayGoalsConceded;
      const avgTotal = (avgHomeGoals + avgAwayGoals) / 2;
      
      if (avgTotal >= 3.0) {
        const confidence = Math.min(80, 55 + Math.round((avgTotal - 2.5) * 15));
        suggestions.push({
          type: 'goals',
          market: 'Ü2.5',
          pick: 'Üst',
          confidence,
          odds: Number((1.70 + (100 - confidence) / 50).toFixed(2)),
          value: avgTotal >= 3.5 ? 'high' : 'medium',
          reasoning: `Takımlar maç başı ortalama ${avgTotal.toFixed(1)} gol`,
        });
      } else if (avgTotal <= 2.0) {
        const confidence = Math.min(75, 50 + Math.round((2.5 - avgTotal) * 20));
        suggestions.push({
          type: 'goals',
          market: 'A2.5',
          pick: 'Alt',
          confidence,
          odds: Number((1.80 + (100 - confidence) / 50).toFixed(2)),
          value: avgTotal <= 1.5 ? 'high' : 'medium',
          reasoning: `Düşük skorlu maçlar bekleniyor (ort. ${avgTotal.toFixed(1)} gol)`,
        });
      }
    }
    
    // Benzersiz önerileri döndür (aynı market'tan birden fazla varsa en yüksek güvenliyi al)
    const uniqueSuggestions = new Map<string, BetSuggestion>();
    for (const s of suggestions) {
      const key = `${s.market}-${s.pick}`;
      if (!uniqueSuggestions.has(key) || uniqueSuggestions.get(key)!.confidence < s.confidence) {
        uniqueSuggestions.set(key, s);
      }
    }
    
    const result = Array.from(uniqueSuggestions.values());
    return result.length > 0 ? result : undefined;
  };

  // Kupon modunda maç detaylarını batch olarak çek
  const { 
    data: batchDetails, 
    isLoading: isBatchLoading 
  } = useBatchMatchDetails(
    data?.data || [],
    viewMode === 'coupons', // Sadece kupon modunda aktif
    15 // Maksimum 15 maç
  );

  // Batch detaylarıyla zenginleştirilmiş fixture listesi
  const enrichedFixtures = useMemo(() => {
    if (!data?.data) return [];
    if (!batchDetails || batchDetails.size === 0) return data.data;
    
    return data.data.map(fixture => {
      const details = batchDetails.get(fixture.id);
      if (!details) return fixture;
      
      return {
        ...fixture,
        h2hSummary: details.h2hSummary,
        prediction: details.prediction,
        formComparison: details.formComparison,
        teamStats: details.teamStats ? {
          homeGoalsScored: details.teamStats.homeGoalsScored,
          homeGoalsConceded: details.teamStats.homeGoalsConceded,
          awayGoalsScored: details.teamStats.awayGoalsScored,
          awayGoalsConceded: details.teamStats.awayGoalsConceded,
          homeCleanSheets: details.teamStats.homeCleanSheets,
          awayCleanSheets: details.teamStats.awayCleanSheets,
          homeBothTeamsScored: details.teamStats.homeBothTeamsScored,
          awayBothTeamsScored: details.teamStats.awayBothTeamsScored,
        } : undefined,
      } as DailyMatchFixture;
    });
  }, [data?.data, batchDetails]);

  // Run scanner when enriched fixtures are ready
  useEffect(() => {
    if (!enrichedFixtures || enrichedFixtures.length === 0) return;
    
    const runScanner = async () => {
      setIsScanning(true);
      
      const scanInputs: ScanInput[] = enrichedFixtures.map(fixture => ({
        fixtureId: fixture.id,
        homeTeam: { id: fixture.homeTeam.id, name: fixture.homeTeam.name },
        awayTeam: { id: fixture.awayTeam.id, name: fixture.awayTeam.name },
        league: { id: fixture.league.id, name: fixture.league.name },
        kickoff: new Date(fixture.timestamp * 1000).toISOString(),
        homeStats: fixture.teamStats ? {
          goalsScored: fixture.teamStats.homeGoalsScored * 10,
          goalsConceded: fixture.teamStats.homeGoalsConceded * 10,
          matchesPlayed: 10
        } : undefined,
        awayStats: fixture.teamStats ? {
          goalsScored: fixture.teamStats.awayGoalsScored * 10,
          goalsConceded: fixture.teamStats.awayGoalsConceded * 10,
          matchesPlayed: 10
        } : undefined,
        h2h: fixture.h2hSummary ? {
          homeWins: fixture.h2hSummary.homeWins,
          draws: fixture.h2hSummary.draws,
          awayWins: fixture.h2hSummary.awayWins,
          totalMatches: fixture.h2hSummary.totalMatches
        } : undefined
      }));

      try {
        const result = await scanMatches(scanInputs);
        setScanResult(result);
      } catch (error) {
        console.error('Scanner error:', error);
      }
    };

    runScanner();
  }, [enrichedFixtures, setScanResult, setIsScanning]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Title & Stats */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-bold">Günün Maçları</h1>
              </div>
              
              {/* Quick Stats */}
              {data?.stats && (
                <div className="hidden sm:flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <span>{data.stats.total}</span>
                    <span className="text-muted-foreground">maç</span>
                  </Badge>
                  {data.stats.live > 0 && (
                    <Link href="/live">
                      <Badge className="bg-red-600 gap-1 animate-pulse cursor-pointer hover:bg-red-700">
                        <Radio className="h-3 w-3" />
                        <span>{data.stats.live} canlı</span>
                      </Badge>
                    </Link>
                  )}
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{data.stats.upcoming}</span>
                  </Badge>
                </div>
              )}
            </div>

            {/* Date Selector */}
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigateDate('prev')}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant={isToday ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDate(new Date())}
                className="h-8 px-3 gap-1"
              >
                <Calendar className="h-3 w-3" />
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
                size="sm" 
                onClick={() => navigateDate('next')}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8 p-0 ml-2"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
            </div>

            {/* Filter Toggle (Mobile) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden h-8 gap-1"
            >
              <Filter className="h-3 w-3" />
              {selectedLeagues.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-xs">
                  {selectedLeagues.length}
                </Badge>
              )}
            </Button>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'opportunities' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('opportunities')}
              className="h-8 gap-1.5"
            >
              <Target className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fırsatlar</span>
            </Button>
            <Button
              variant={viewMode === 'matches' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('matches')}
              className="h-8 gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Maçlar</span>
            </Button>
            <Button
              variant={viewMode === 'coupons' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('coupons')}
              className="h-8 gap-1.5"
            >
              <Ticket className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kupon Önerileri</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4">
        {/* Opportunities View - Value Dashboard with Coupon Sidebar */}
        {viewMode === 'opportunities' && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <ValueDashboard />
            </div>
            {/* Right Sidebar - Coupon */}
            <aside className="hidden xl:block w-80 flex-shrink-0">
              <div className="sticky top-20 h-[calc(100vh-100px)]">
                <CouponSidebar />
              </div>
            </aside>
          </div>
        )}

        {/* Coupon Category View with Sidebar */}
        {viewMode === 'coupons' && data?.data && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Kupon Kategorileri</h2>
                <Badge variant="outline">{data.stats?.total || 0} maç analiz edildi</Badge>
                {isBatchLoading && (
                  <Badge variant="secondary" className="animate-pulse">
                    Tahminler yükleniyor...
                  </Badge>
                )}
              </div>
              <CouponCategoryTabs 
                fixtures={enrichedFixtures}
                getSuggestions={getSuggestions}
                isLoading={isBatchLoading}
              />
            </div>
            {/* Right Sidebar - Coupon */}
            <aside className="hidden xl:block w-80 flex-shrink-0">
              <div className="sticky top-20 h-[calc(100vh-100px)]">
                <CouponSidebar />
              </div>
            </aside>
          </div>
        )}

        {/* Match List View */}
        {viewMode === 'matches' && (
        <div className="flex gap-4">
          {/* Left Sidebar - League Filters */}
          <aside className={cn(
            "w-64 flex-shrink-0 transition-all",
            "hidden lg:block",
            !showFilters && "lg:hidden"
          )}>
            <Card className="sticky top-20">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Ligler</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleSelectAll}
                      className="h-6 px-2 text-xs"
                    >
                      {selectedLeagues.length === TOP_20_LEAGUES.length ? 'Hiçbiri' : 'Tümü'}
                    </Button>
                    {pinnedLeagues.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleSelectPinned}
                        className="h-6 px-2 text-xs"
                      >
                        <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                        Favoriler
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-0 px-2">
                <ScrollArea className="h-[calc(100vh-200px)]">
                  <div className="space-y-0.5 pb-4">
                    {sortedLeagues.map((league) => {
                      const isPinned = pinnedLeagues.includes(league.id);
                      const matchCount = matchesByLeague.get(league.id)?.length || 0;
                      const hasLive = matchesByLeague.get(league.id)?.some(m => m.status.isLive);
                      
                      return (
                        <div
                          key={league.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors",
                            selectedLeagues.includes(league.id) && "bg-muted"
                          )}
                        >
                          <Checkbox
                            id={`league-${league.id}`}
                            checked={selectedLeagues.length === 0 || selectedLeagues.includes(league.id)}
                            onCheckedChange={() => handleLeagueToggle(league.id)}
                          />
                          <label 
                            htmlFor={`league-${league.id}`}
                            className="flex items-center gap-2 flex-1 cursor-pointer text-sm"
                          >
                            <span>{league.flag}</span>
                            <span className="truncate flex-1">{league.name}</span>
                            {matchCount > 0 && (
                              <Badge 
                                variant={hasLive ? "default" : "secondary"} 
                                className={cn(
                                  "h-5 px-1.5 text-xs",
                                  hasLive && "bg-red-600"
                                )}
                              >
                                {matchCount}
                              </Badge>
                            )}
                          </label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(league.id);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <Star className={cn(
                              "h-3 w-3",
                              isPinned && "fill-yellow-500 text-yellow-500"
                            )} />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content - Match List */}
          <main className="flex-1 min-w-0">
            {/* Loading State */}
            {isLoading && (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <ExpandedMatchCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <Card className="p-8 text-center">
                <p className="text-destructive mb-4">Maçlar yüklenirken hata oluştu</p>
                <Button onClick={() => refetch()}>Tekrar Dene</Button>
              </Card>
            )}

            {/* No Matches */}
            {!isLoading && !error && data?.data?.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  {selectedDate.toLocaleDateString('tr-TR')} tarihinde maç bulunamadı
                </p>
              </Card>
            )}

            {/* Matches by League */}
            {!isLoading && !error && data?.data && data.data.length > 0 && (
              <div className="space-y-6">
                {/* Ligleri sırala ve göster */}
                {Array.from(matchesByLeague.entries())
                  .sort(([aId], [bId]) => {
                    // Önce canlı maçı olan ligler
                    const aHasLive = matchesByLeague.get(aId)?.some(m => m.status.isLive);
                    const bHasLive = matchesByLeague.get(bId)?.some(m => m.status.isLive);
                    if (aHasLive && !bHasLive) return -1;
                    if (!aHasLive && bHasLive) return 1;
                    
                    // Pinli ligler
                    const aPinned = pinnedLeagues.includes(aId);
                    const bPinned = pinnedLeagues.includes(bId);
                    if (aPinned && !bPinned) return -1;
                    if (!aPinned && bPinned) return 1;
                    
                    // Önceliğe göre
                    return getLeaguePriority(bId) - getLeaguePriority(aId);
                  })
                  .map(([leagueId, matches]) => {
                    const leagueInfo = matches[0]?.league;
                    const hasLive = matches.some(m => m.status.isLive);
                    const isPinned = pinnedLeagues.includes(leagueId);
                    
                    return (
                      <div key={leagueId}>
                        {/* League Header */}
                        <div className={cn(
                          "flex items-center gap-2 mb-2 p-2 rounded-lg",
                          hasLive && "bg-red-50 dark:bg-red-950/20"
                        )}>
                          {leagueInfo?.logo && (
                            <Image
                              src={leagueInfo.logo}
                              alt={leagueInfo.name}
                              width={24}
                              height={24}
                              className="object-contain"
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{leagueInfo?.name}</span>
                              {isPinned && (
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {leagueInfo?.country}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasLive && (
                              <Badge className="bg-red-600 animate-pulse">CANLI</Badge>
                            )}
                            <Badge variant="secondary">{matches.length} maç</Badge>
                          </div>
                        </div>

                        {/* Matches */}
                        <div className="space-y-2">
                          {matches.map((match) => (
                            <ExpandedMatchCard 
                              key={match.id} 
                              fixture={match}
                              defaultExpanded={match.status.isLive}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </main>

          {/* Right Sidebar - Coupon */}
          <aside className="hidden xl:block w-72 flex-shrink-0">
            <div className="sticky top-20 h-[calc(100vh-100px)]">
              <CouponSidebar />
            </div>
          </aside>
        </div>
        )}
      </div>

      {/* Coupon FAB - Only on mobile/tablet when sidebar is hidden */}
      <div className="xl:hidden">
        <CouponFAB />
      </div>

      {/* Mobile Filter Drawer */}
      {showFilters && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed inset-y-0 left-0 w-80 bg-background border-r shadow-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Lig Filtreleri</h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowFilters(false)}
              >
                ✕
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-60px)]">
              <div className="p-4 space-y-2">
                <div className="flex gap-2 mb-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSelectAll}
                    className="flex-1"
                  >
                    {selectedLeagues.length === TOP_20_LEAGUES.length ? 'Hiçbiri' : 'Tümü'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSelectPinned}
                    className="flex-1"
                  >
                    <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                    Favoriler
                  </Button>
                </div>
                {sortedLeagues.map((league) => {
                  const isPinned = pinnedLeagues.includes(league.id);
                  const matchCount = matchesByLeague.get(league.id)?.length || 0;
                  
                  return (
                    <div
                      key={league.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`mobile-league-${league.id}`}
                        checked={selectedLeagues.length === 0 || selectedLeagues.includes(league.id)}
                        onCheckedChange={() => handleLeagueToggle(league.id)}
                      />
                      <label 
                        htmlFor={`mobile-league-${league.id}`}
                        className="flex items-center gap-2 flex-1 cursor-pointer"
                      >
                        <span className="text-lg">{league.flag}</span>
                        <span className="truncate">{league.name}</span>
                      </label>
                      {matchCount > 0 && (
                        <Badge variant="secondary">{matchCount}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePin(league.id)}
                        className="h-8 w-8 p-0"
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
          </div>
        </div>
      )}
    </div>
  );
}
