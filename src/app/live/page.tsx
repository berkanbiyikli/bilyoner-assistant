/**
 * Canlı Maçlar Sayfası
 * Top 20 liglerden canlı maçları ve istatistiklerini gösterir
 * + Avcı Modu ile canlı fırsat tespiti
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
import { useLiveFixtures, useLiveStatistics } from '@/hooks/useFixtures';
import { isTop20League } from '@/config/league-priorities';
import type { ProcessedFixture, ProcessedStatistics } from '@/types/api-football';
import { HunterDashboard } from '@/components/hunter-dashboard';
import { createHunterMatchSummary } from '@/lib/bot/live-engine';
import type { LiveMatch, LiveMatchHunter } from '@/lib/bot/live-types';
import { 
  Radio, 
  RefreshCw, 
  Clock, 
  Target, 
  Flag,
  Users,
  AlertTriangle,
  ArrowLeft,
  Zap,
  Activity,
  Trophy
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============ CANLI MAÇ KARTI ============

interface LiveMatchCardProps {
  fixture: ProcessedFixture;
  isSelected: boolean;
  onSelect: () => void;
}

function LiveMatchCard({ fixture, isSelected, onSelect }: LiveMatchCardProps) {
  const isHT = fixture.status.code === 'HT';
  
  return (
    <Card 
      className={cn(
        'cursor-pointer transition-all duration-300 hover:shadow-lg rounded-2xl border-border/50',
        isSelected && 'ring-2 ring-primary shadow-lg shadow-primary/10',
        !isHT && 'animate-pulse-subtle'
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        {/* Lig bilgisi */}
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          {fixture.league.logo && (
            <Image 
              src={fixture.league.logo} 
              alt={fixture.league.name}
              width={16}
              height={16}
              className="object-contain"
            />
          )}
          <span className="truncate">{fixture.league.name}</span>
          <Badge variant="destructive" className="ml-auto text-[10px] animate-pulse rounded-lg shadow-sm shadow-red-500/20">
            <Radio className="h-2 w-2 mr-1" />
            {isHT ? 'Devre Arası' : `${fixture.status.elapsed}'`}
          </Badge>
        </div>

        {/* Takımlar ve Skor */}
        <div className="flex items-center justify-between">
          {/* Ev sahibi */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {fixture.homeTeam.logo && (
              <Image 
                src={fixture.homeTeam.logo} 
                alt={fixture.homeTeam.name}
                width={32}
                height={32}
                className="object-contain"
              />
            )}
            <span className="font-medium truncate text-sm">{fixture.homeTeam.name}</span>
          </div>

          {/* Skor */}
          <div className="flex items-center gap-2 px-4">
            <span className="text-2xl font-bold">{fixture.score.home ?? 0}</span>
            <span className="text-muted-foreground">-</span>
            <span className="text-2xl font-bold">{fixture.score.away ?? 0}</span>
          </div>

          {/* Deplasman */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span className="font-medium truncate text-sm text-right">{fixture.awayTeam.name}</span>
            {fixture.awayTeam.logo && (
              <Image 
                src={fixture.awayTeam.logo} 
                alt={fixture.awayTeam.name}
                width={32}
                height={32}
                className="object-contain"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ İSTATİSTİK PANELİ ============

interface StatsPanelProps {
  fixture: ProcessedFixture;
}

function StatsPanel({ fixture }: StatsPanelProps) {
  const { data, isLoading } = useLiveStatistics(fixture.id, true);
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            İstatistikler Yükleniyor...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1,2,3,4,5].map(i => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const stats = data?.statistics;
  
  if (!stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>İstatistik verisi bulunamadı</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Target className="h-4 w-4 text-primary" />
          </div>
          Canlı İstatistikler
          <Badge variant="outline" className="ml-auto rounded-lg border-border/50">
            {fixture.status.elapsed}&apos; dakika
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Takım başlıkları */}
        <div className="flex justify-between text-sm font-medium mb-2">
          <span className="flex items-center gap-2">
            {fixture.homeTeam.logo && (
              <Image src={fixture.homeTeam.logo} alt="" width={20} height={20} />
            )}
            {fixture.homeTeam.name}
          </span>
          <span className="flex items-center gap-2">
            {fixture.awayTeam.name}
            {fixture.awayTeam.logo && (
              <Image src={fixture.awayTeam.logo} alt="" width={20} height={20} />
            )}
          </span>
        </div>

        {/* Top Kontrolü */}
        <StatRow 
          label="Top Kontrolü" 
          homeValue={stats.home.possession} 
          awayValue={stats.away.possession}
          suffix="%"
          isPercentage
        />

        {/* Şutlar */}
        <StatRow 
          label="Toplam Şut" 
          homeValue={stats.home.totalShots} 
          awayValue={stats.away.totalShots}
        />

        {/* İsabetli Şut */}
        <StatRow 
          label="İsabetli Şut" 
          homeValue={stats.home.shotsOnGoal} 
          awayValue={stats.away.shotsOnGoal}
          highlight
        />

        {/* Kornerler */}
        <StatRow 
          label="Korner" 
          homeValue={stats.home.corners} 
          awayValue={stats.away.corners}
        />

        {/* Fauller */}
        <StatRow 
          label="Faul" 
          homeValue={stats.home.fouls} 
          awayValue={stats.away.fouls}
        />

        {/* Sarı Kartlar */}
        <StatRow 
          label="Sarı Kart" 
          homeValue={stats.home.yellowCards} 
          awayValue={stats.away.yellowCards}
          cardColor="yellow"
        />

        {/* Kırmızı Kartlar */}
        {(stats.home.redCards > 0 || stats.away.redCards > 0) && (
          <StatRow 
            label="Kırmızı Kart" 
            homeValue={stats.home.redCards} 
            awayValue={stats.away.redCards}
            cardColor="red"
          />
        )}

        {/* Ofsaytlar */}
        <StatRow 
          label="Ofsayt" 
          homeValue={stats.home.offsides} 
          awayValue={stats.away.offsides}
        />
      </CardContent>
    </Card>
  );
}

// İstatistik satırı bileşeni
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
      <div className="flex justify-between text-sm">
        <span className={cn(
          "font-medium",
          highlight && homeValue > awayValue && "text-green-600",
          cardColor === 'yellow' && "text-yellow-600",
          cardColor === 'red' && "text-red-600"
        )}>
          {homeValue}{suffix}
        </span>
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className={cn(
          "font-medium",
          highlight && awayValue > homeValue && "text-green-600",
          cardColor === 'yellow' && "text-yellow-600",
          cardColor === 'red' && "text-red-600"
        )}>
          {awayValue}{suffix}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted/50">
        <div 
          className={cn(
            "transition-all duration-500 rounded-full",
            highlight ? "bg-green-500" : "bg-primary"
          )}
          style={{ width: `${isPercentage ? homeValue : homePercent}%` }}
        />
        <div 
          className={cn(
            "transition-all",
            highlight ? "bg-green-500/60" : "bg-primary/60"
          )}
          style={{ width: `${isPercentage ? awayValue : 100 - homePercent}%` }}
        />
      </div>
    </div>
  );
}

// ============ LOADING SKELETON ============

function LiveMatchSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-12 ml-auto" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============ ANA SAYFA ============

/**
 * ProcessedFixture'dan LiveMatch'e dönüşüm
 */
function fixtureToLiveMatch(fixture: ProcessedFixture): LiveMatch {
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
      homeShotsOnTarget: 0,
      awayShotsOnTarget: 0,
      homeShotsTotal: 0,
      awayShotsTotal: 0,
      homePossession: 50,
      awayPossession: 50,
      homeCorners: 0,
      awayCorners: 0,
      homeFouls: 0,
      awayFouls: 0,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0,
      homeDangerousAttacks: 0,
      awayDangerousAttacks: 0
    },
    lastUpdated: new Date()
  };
}

export default function LiveMatchesPage() {
  const { data, isLoading, refetch, isFetching } = useLiveFixtures();
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'matches' | 'hunter'>('hunter');

  // Top 20 lig maçlarını filtrele
  const liveMatches = (data?.fixtures || []).filter(f => isTop20League(f.league.id));
  const selectedFixture = liveMatches.find(f => f.id === selectedFixtureId);

  // İlk maçı otomatik seç
  if (!selectedFixtureId && liveMatches.length > 0) {
    setSelectedFixtureId(liveMatches[0].id);
  }

  // Hunter matches hesaplama (mock stats ile)
  const hunterMatches: LiveMatchHunter[] = useMemo(() => {
    return liveMatches.map(fixture => {
      const liveMatch = fixtureToLiveMatch(fixture);
      return createHunterMatchSummary(liveMatch);
    });
  }, [liveMatches]);

  // Altın fırsat sayısı
  const goldenChanceCount = hunterMatches.filter(m => m.hunterStatus === 'golden_chance').length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-16 z-30 glass border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="absolute -inset-1 bg-red-500 rounded-full blur opacity-30 animate-pulse" />
                  <Radio className="relative h-5 w-5 text-red-500" />
                </div>
                <h1 className="text-xl font-bold">Canlı Maçlar</h1>
                <Badge variant="secondary" className="ml-2 rounded-lg">
                  {liveMatches.length} maç
                </Badge>
                {goldenChanceCount > 0 && (
                  <Badge className="bg-amber-500 animate-pulse rounded-lg shadow-lg shadow-amber-500/30">
                    <Trophy className="w-3 h-3 mr-1" />
                    {goldenChanceCount}
                  </Badge>
                )}
              </div>
            </div>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-xl border-border/50"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Yenile
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {[1,2,3].map(i => <LiveMatchSkeleton key={i} />)}
            </div>
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-8 w-48 mb-4" />
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full mb-2" />)}
              </CardContent>
            </Card>
          </div>
        ) : liveMatches.length === 0 ? (
          <Card className="py-16 text-center glass-subtle rounded-2xl border-border/50">
            <CardContent>
              <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold mb-2">Şu an canlı maç yok</h2>
              <p className="text-muted-foreground mb-4">
                Top 20 liglerden canlı maç başladığında burada görünecek
              </p>
              <Link href="/">
                <Button className="rounded-xl">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Günlük Maçlara Dön
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'matches' | 'hunter')}>
            <TabsList className="mb-6 rounded-xl">
              <TabsTrigger value="hunter" className="gap-2">
                <Target className="w-4 h-4" />
                Avcı Modu
                {goldenChanceCount > 0 && (
                  <Badge className="bg-amber-500 text-white ml-1">{goldenChanceCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="matches" className="gap-2">
                <Activity className="w-4 h-4" />
                Maçlar
              </TabsTrigger>
            </TabsList>

            {/* Avcı Modu */}
            <TabsContent value="hunter">
              <HunterDashboard 
                hunterMatches={hunterMatches}
                onRefresh={() => refetch()}
                isLoading={isFetching}
              />
            </TabsContent>

            {/* Maç Listesi */}
            <TabsContent value="matches">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Sol: Maç Listesi */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">Canlı Maçlar</span>
                    <span className="text-xs text-muted-foreground">(Her 60 sn güncellenir)</span>
                  </div>
                  
                  {liveMatches.map(fixture => (
                    <LiveMatchCard
                      key={fixture.id}
                      fixture={fixture}
                      isSelected={selectedFixtureId === fixture.id}
                      onSelect={() => setSelectedFixtureId(fixture.id)}
                    />
                  ))}
                </div>

                {/* Sağ: İstatistik Paneli */}
                <div className="sticky top-20">
                  {selectedFixture ? (
                    <StatsPanel fixture={selectedFixture} />
                  ) : (
                    <Card className="py-8 text-center glass-subtle rounded-2xl border-border/50">
                      <CardContent>
                        <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-muted-foreground">
                          İstatistiklerini görmek için bir maç seçin
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
