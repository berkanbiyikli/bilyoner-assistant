/**
 * Kupon Kategori Sekmeleri
 * Banko / Değer / Sürpriz tabs
 */

'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORY_INFO, type RiskCategory, type CategorizedBet } from '@/lib/coupon/types';
import { categorizeAllBets, getCategoryStats } from '@/lib/coupon/categorize';
import { AddToCouponButton } from '@/components/coupon-fab';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { cn } from '@/lib/utils';
import { TrendingUp, Shield, Target, Zap, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface CouponCategoryTabsProps {
  fixtures: DailyMatchFixture[];
  getSuggestions: (fixture: DailyMatchFixture) => BetSuggestion[] | undefined;
  isLoading?: boolean;
  className?: string;
}

export function CouponCategoryTabs({
  fixtures,
  getSuggestions,
  isLoading = false,
  className,
}: CouponCategoryTabsProps) {
  const [activeCategory, setActiveCategory] = useState<RiskCategory>('banko');

  // Tüm bahisleri kategorize et
  const categorizedBets = useMemo(() => {
    return categorizeAllBets(fixtures, getSuggestions);
  }, [fixtures, getSuggestions]);

  // Kategori istatistikleri
  const stats = useMemo(() => {
    return getCategoryStats(categorizedBets);
  }, [categorizedBets]);

  const categories: RiskCategory[] = ['banko', 'value', 'surprise'];

  return (
    <div className={cn("w-full", className)}>
      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as RiskCategory)}>
        {/* Tab Headers */}
        <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-muted/30 rounded-xl border border-border/30">
          {categories.map((category) => {
            const info = CATEGORY_INFO[category];
            const stat = stats[category];
            
            return (
              <TabsTrigger
                key={category}
                value={category}
                className={cn(
                  "flex flex-col gap-0.5 py-2 px-3 data-[state=active]:shadow-md transition-all rounded-lg",
                  activeCategory === category && info.bgColor
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">{info.emoji}</span>
                  <span className="font-medium">{info.label}</span>
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "h-5 text-xs",
                      activeCategory === category && "bg-background"
                    )}
                  >
                    {stat.count}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {info.description}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Contents */}
        {categories.map((category) => (
          <TabsContent key={category} value={category} className="mt-4">
            <CategoryBetList 
              bets={categorizedBets.get(category) || []}
              category={category}
              isLoading={isLoading}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Kategori bazlı bahis listesi
 */
function CategoryBetList({
  bets,
  category,
  isLoading = false,
}: {
  bets: CategorizedBet[];
  category: RiskCategory;
  isLoading?: boolean;
}) {
  const info = CATEGORY_INFO[category];

  // Loading durumu
  if (isLoading) {
    return (
      <Card className="p-6 rounded-2xl border-border/50">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Maç tahminleri analiz ediliyor...
          </p>
        </div>
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 p-3 border rounded-xl border-border/30">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (bets.length === 0) {
    return (
      <Card className="p-6 text-center rounded-2xl border-border/50 border-dashed">
        <div className="text-4xl mb-2">{info.emoji}</div>
        <p className="text-muted-foreground">
          Bu kategoride bahis önerisi bulunamadı
        </p>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-4">
        {bets.map((bet, idx) => (
          <CategoryBetCard key={`${bet.fixture.id}-${idx}`} bet={bet} />
        ))}
      </div>
    </ScrollArea>
  );
}

/**
 * Kategorize edilmiş bahis kartı
 */
function CategoryBetCard({ bet }: { bet: CategorizedBet }) {
  const { fixture, suggestion, category, categoryReason } = bet;
  const info = CATEGORY_INFO[category];

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300 hover:shadow-md rounded-2xl border-border/50",
      "border-l-4",
      category === 'banko' && "border-l-green-500",
      category === 'value' && "border-l-blue-500",
      category === 'surprise' && "border-l-purple-500",
    )}>
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {fixture.league.logo && (
              <Image
                src={fixture.league.logo}
                alt={fixture.league.name}
                width={16}
                height={16}
                className="object-contain"
              />
            )}
            <span className="truncate max-w-[150px]">{fixture.league.name}</span>
            <span>•</span>
            <span>{fixture.time}</span>
          </div>
          <Badge variant="outline" className={cn("text-[10px]", info.bgColor)}>
            {info.emoji} {info.label}
          </Badge>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {fixture.homeTeam.logo && (
                <Image
                  src={fixture.homeTeam.logo}
                  alt={fixture.homeTeam.name}
                  width={20}
                  height={20}
                  className="object-contain"
                />
              )}
              <span className="font-medium text-sm truncate">{fixture.homeTeam.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {fixture.awayTeam.logo && (
                <Image
                  src={fixture.awayTeam.logo}
                  alt={fixture.awayTeam.name}
                  width={20}
                  height={20}
                  className="object-contain"
                />
              )}
              <span className="font-medium text-sm truncate">{fixture.awayTeam.name}</span>
            </div>
          </div>
        </div>

        {/* Suggestion */}
        <div className={cn(
          "flex items-center justify-between p-2.5 rounded-xl",
          info.bgColor
        )}>
          <div className="flex items-center gap-2">
            <Zap className={cn("h-4 w-4", info.color)} />
            <div>
              <span className="font-medium text-sm">{suggestion.market}: </span>
              <span className="font-bold">{suggestion.pick}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-green-600">{suggestion.odds.toFixed(2)}</span>
            <Badge variant="secondary" className="text-xs">
              %{suggestion.confidence}
            </Badge>
          </div>
        </div>

        {/* Category Reason */}
        <p className="text-xs text-muted-foreground mt-2">
          💡 {categoryReason}
        </p>

        {/* Add to Coupon */}
        <div className="mt-2 flex justify-end">
          <AddToCouponButton
            fixtureId={fixture.id}
            homeTeam={fixture.homeTeam.name}
            awayTeam={fixture.awayTeam.name}
            league={fixture.league.name}
            date={fixture.date}
            time={fixture.time}
            market={suggestion.market}
            pick={suggestion.pick}
            odds={suggestion.odds}
            confidence={suggestion.confidence}
            category={category}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Günün Önerisi Banner
 */
export function DailyPickBanner({
  bet,
}: {
  bet: CategorizedBet;
}) {
  const { fixture, suggestion, category } = bet;
  const info = CATEGORY_INFO[category];

  return (
    <Card className="bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-teal-500/10 border-green-500/30 rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-full bg-green-500/20">
            <Target className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-lg">🎯 Günün Önerisi</h3>
            <p className="text-xs text-muted-foreground">AI tarafından seçildi</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {fixture.homeTeam.name} - {fixture.awayTeam.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {fixture.league.name} • {fixture.time}
            </p>
          </div>
          <div className="text-right">
            <Badge className={cn("mb-1", info.bgColor, info.color)}>
              {suggestion.market}: {suggestion.pick}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-green-600">
                {suggestion.odds.toFixed(2)}
              </span>
              <Badge variant="outline">%{suggestion.confidence}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <AddToCouponButton
            fixtureId={fixture.id}
            homeTeam={fixture.homeTeam.name}
            awayTeam={fixture.awayTeam.name}
            league={fixture.league.name}
            date={fixture.date}
            time={fixture.time}
            market={suggestion.market}
            pick={suggestion.pick}
            odds={suggestion.odds}
            confidence={suggestion.confidence}
            category={category}
          />
        </div>
      </CardContent>
    </Card>
  );
}
