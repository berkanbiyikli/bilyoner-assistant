/**
 * Canli Maclar Sayfasi - Clean modern design
 */

'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLiveFixtures, useLiveStatistics, useLiveFixturesEnriched } from '@/hooks/useFixtures';
import { isTop20League } from '@/config/league-priorities';
import type { ProcessedFixture, ProcessedStatistics } from '@/types/api-football';
import { HunterDashboard } from '@/components/hunter-dashboard';
import { createHunterMatchSummary } from '@/lib/bot/live-engine';
import type { LiveMatch, LiveMatchHunter } from '@/lib/bot/live-types';
import { 
  Radio, RefreshCw, Clock, Target, Flag, Users, AlertTriangle,
  ArrowLeft, Zap, Activity, Trophy
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============ CANLI MAC KARTI ============

interface LiveMatchCardProps {
  fixture: ProcessedFixture;
  isSelected: boolean;
  onSelect: () => void;
}

function LiveMatchCard({ fixture, isSelected, onSelect }: LiveMatchCardProps) {
  const isHT = fixture.status.code === 'HT';
  
  return (
    <div 
      className={cn(
        'p-3.5 rounded-xl cursor-pointer transition-all border card-premium',
        isSelected 
          ? 'border-primary/30 bg-primary/5 shadow-md shadow-primary/10' 
          : 'border-border/30 hover:border-primary/20 hover:bg-primary/5',
        !isHT && isSelected && 'match-live'
      )}
      onClick={onSelect}
    >
      {/* League + Time */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {fixture.league.logo && (
            <Image src={fixture.league.logo} alt={fixture.league.name} width={16} height={16} className="object-contain" />
          )}
          <span className="truncate font-medium">{fixture.league.name}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-red-500 text-[10px] font-bold bg-red-500/10 px-2 py-0.5 rounded-lg">
          <span className="live-dot" />
          {isHT ? 'DA' : fixture.status.elapsed + "'"}
        </span>
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {fixture.homeTeam.logo && (
            <Image src={fixture.homeTeam.logo} alt={fixture.homeTeam.name} width={28} height={28} className="object-contain shrink-0" />
          )}
          <span className="font-semibold text-sm truncate">{fixture.homeTeam.name}</span>
        </div>
        <div className="flex items-center gap-2 px-4 shrink-0">
          <span className="text-2xl font-bold tabular-nums score-glow">{fixture.score.home ?? 0}</span>
          <span className="text-muted-foreground text-lg font-light">:</span>
          <span className="text-2xl font-bold tabular-nums score-glow">{fixture.score.away ?? 0}</span>
        </div>
        <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
          <span className="font-semibold text-sm truncate text-right">{fixture.awayTeam.name}</span>
          {fixture.awayTeam.logo && (
            <Image src={fixture.awayTeam.logo} alt={fixture.awayTeam.name} width={28} height={28} className="object-contain shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// ============ ISTATISTIK PANELI ============

function StatsPanel({ fixture }: { fixture: ProcessedFixture }) {
  const { data, isLoading } = useLiveStatistics(fixture.id, true);
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-6 w-full rounded" />)}
        </CardContent>
      </Card>
    );
  }

  const stats = data?.statistics;
  if (!stats) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Istatistik verisi bulunamadi</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-premium overflow-hidden">
      <CardContent className="p-4 space-y-3.5">
        {/* Team headers */}
        <div className="flex justify-between text-xs font-semibold pb-2.5 border-b border-primary/10">
          <span className="flex items-center gap-2">
            {fixture.homeTeam.logo && <Image src={fixture.homeTeam.logo} alt="" width={18} height={18} />}
            {fixture.homeTeam.name}
          </span>
          <span className="flex items-center gap-2">
            {fixture.awayTeam.name}
            {fixture.awayTeam.logo && <Image src={fixture.awayTeam.logo} alt="" width={18} height={18} />}
          </span>
        </div>

        <StatRow label="Top Kontrolu" homeValue={stats.home.possession} awayValue={stats.away.possession} suffix="%" isPercentage />
        <StatRow label="Toplam Sut" homeValue={stats.home.totalShots} awayValue={stats.away.totalShots} />
        <StatRow label="Isabetli Sut" homeValue={stats.home.shotsOnGoal} awayValue={stats.away.shotsOnGoal} highlight />
        <StatRow label="Korner" homeValue={stats.home.corners} awayValue={stats.away.corners} />
        <StatRow label="Faul" homeValue={stats.home.fouls} awayValue={stats.away.fouls} />
        <StatRow label="Sari Kart" homeValue={stats.home.yellowCards} awayValue={stats.away.yellowCards} cardColor="yellow" />
        {(stats.home.redCards > 0 || stats.away.redCards > 0) && (
          <StatRow label="Kirmizi Kart" homeValue={stats.home.redCards} awayValue={stats.away.redCards} cardColor="red" />
        )}
        <StatRow label="Ofsayt" homeValue={stats.home.offsides} awayValue={stats.away.offsides} />
      </CardContent>
    </Card>
  );
}

interface StatRowProps {
  label: string;
  homeValue: number;
  awayValue: number;
  suffix?: string;
  isPercentage?: boolean;
  highlight?: boolean;
  cardColor?: 'yellow' | 'red';
}

function StatRow({ label, homeValue, awayValue, suffix = '', isPercentage, highlight, cardColor }: StatRowProps) {
  const total = homeValue + awayValue || 1;
  const homePercent = (homeValue / total) * 100;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={cn(
          'font-medium tabular-nums',
          highlight && homeValue > awayValue && 'text-green-600',
          cardColor === 'yellow' && 'text-yellow-600',
          cardColor === 'red' && 'text-red-600'
        )}>
          {homeValue}{suffix}
        </span>
        <span className="text-muted-foreground text-[11px]">{label}</span>
        <span className={cn(
          'font-medium tabular-nums',
          highlight && awayValue > homeValue && 'text-green-600',
          cardColor === 'yellow' && 'text-yellow-600',
          cardColor === 'red' && 'text-red-600'
        )}>
          {awayValue}{suffix}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
        <div 
          className={cn('transition-all duration-500 rounded-full', highlight ? 'bg-emerald-500' : 'bg-primary')}
          style={{ width: (isPercentage ? homeValue : homePercent) + '%' }}
        />
        <div 
          className={cn('transition-all rounded-full', highlight ? 'bg-emerald-500/30' : 'bg-primary/30')}
          style={{ width: (isPercentage ? awayValue : 100 - homePercent) + '%' }}
        />
      </div>
    </div>
  );
}

function LiveMatchSkeleton() {
  return (
    <div className="p-3 rounded-lg border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-14" />
        <Skeleton className="h-6 w-28" />
      </div>
    </div>
  );
}

function fixtureToLiveMatch(fixture: ProcessedFixture, stats?: ProcessedStatistics | null): LiveMatch {
  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    homeTeamId: fixture.homeTeam.id,
    awayTeamId: fixture.awayTeam.id,
    homeScore: fixture.score.home ?? 0,
    awayScore: fixture.score.away ?? 0,
    minute: fixture.status.elapsed ?? 0,
    status: fixture.status.code === 'live' ? 'LIVE' : fixture.status.code as 'HT' | '1H' | '2H' | 'ET' | 'P' | 'LIVE',
    league: fixture.league.name,
    leagueId: fixture.league.id,
    leagueLogo: fixture.league.logo,
    stats: {
      homeShotsOnTarget: stats?.home.shotsOnGoal ?? 0,
      awayShotsOnTarget: stats?.away.shotsOnGoal ?? 0,
      homeShotsTotal: stats?.home.totalShots ?? 0,
      awayShotsTotal: stats?.away.totalShots ?? 0,
      homePossession: stats?.home.possession ?? 50,
      awayPossession: stats?.away.possession ?? 50,
      homeCorners: stats?.home.corners ?? 0,
      awayCorners: stats?.away.corners ?? 0,
      homeFouls: stats?.home.fouls ?? 0,
      awayFouls: stats?.away.fouls ?? 0,
      homeYellowCards: stats?.home.yellowCards ?? 0,
      awayYellowCards: stats?.away.yellowCards ?? 0,
      homeRedCards: stats?.home.redCards ?? 0,
      awayRedCards: stats?.away.redCards ?? 0,
      homeDangerousAttacks: 0,
      awayDangerousAttacks: 0,
    },
    lastUpdated: new Date()
  };
}

// ============ ANA SAYFA ============

export default function LiveMatchesPage() {
  const { data: enrichedData, isLoading, refetch, isFetching } = useLiveFixturesEnriched();
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'matches' | 'hunter'>('hunter');

  // Enriched data'dan fixture'ları ve stats map'i çıkar
  const enrichedFixtures = enrichedData?.enrichedFixtures || [];
  const liveMatches = enrichedFixtures.map(ef => ef.fixture);
  const statsMap = useMemo(() => {
    const map = new Map<number, ProcessedStatistics | null>();
    for (const ef of enrichedFixtures) {
      map.set(ef.fixture.id, ef.statistics);
    }
    return map;
  }, [enrichedFixtures]);

  const selectedFixture = liveMatches.find(f => f.id === selectedFixtureId);

  if (!selectedFixtureId && liveMatches.length > 0) {
    setSelectedFixtureId(liveMatches[0].id);
  }

  const hunterMatches: LiveMatchHunter[] = useMemo(() => {
    return liveMatches.map(fixture => {
      const stats = statsMap.get(fixture.id) || null;
      const liveMatch = fixtureToLiveMatch(fixture, stats);
      return createHunterMatchSummary(liveMatch);
    });
  }, [liveMatches, statsMap]);

  const goldenChanceCount = hunterMatches.filter(m => m.hunterStatus === 'golden_chance').length;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* Header */}
      <div className="hero-gradient text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="live-dot" />
                <span className="font-bold text-lg">Canli Maclar</span>
              </div>
              <span className="text-white/70 text-sm font-medium bg-white/10 px-2.5 py-0.5 rounded-lg">{liveMatches.length} mac</span>
              {goldenChanceCount > 0 && (
                <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-lg animate-pulse">
                  {goldenChanceCount} firsat
                </span>
              )}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4 text-white/80', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <LiveMatchSkeleton key={i} />)}
          </div>
        ) : liveMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center mb-4">
              <Clock className="h-7 w-7 text-primary" />
            </div>
            <h2 className="font-bold text-lg mb-1">Su an canli mac yok</h2>
            <p className="text-sm text-muted-foreground mb-5">Top 20 liglerden canli mac basladiginda burada gorunecek</p>
            <Link href="/">
              <Button variant="outline" size="sm" className="rounded-lg gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Maclara Don
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1.5 p-1 rounded-xl bg-muted/30 border border-border/30">
              <button
                onClick={() => setActiveTab('hunter')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                  activeTab === 'hunter'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                <Target className="h-3.5 w-3.5" />
                Avci Modu
                {goldenChanceCount > 0 && (
                  <span className="h-4.5 min-w-4.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold px-1">
                    {goldenChanceCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                  activeTab === 'matches'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                <Activity className="h-3.5 w-3.5" />
                Maclar
              </button>
            </div>

            {/* Hunter Mode */}
            {activeTab === 'hunter' && (
              <HunterDashboard 
                hunterMatches={hunterMatches}
                onRefresh={() => refetch()}
                isLoading={isFetching}
              />
            )}

            {/* Matches */}
            {activeTab === 'matches' && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {liveMatches.map(fixture => (
                    <LiveMatchCard
                      key={fixture.id}
                      fixture={fixture}
                      isSelected={selectedFixtureId === fixture.id}
                      onSelect={() => setSelectedFixtureId(fixture.id)}
                    />
                  ))}
                </div>

                <div className="md:sticky md:top-28">
                  {selectedFixture ? (
                    <StatsPanel fixture={selectedFixture} />
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Istatistikler icin bir mac secin</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
