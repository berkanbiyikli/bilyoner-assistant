'use client';

/**
 * Lig Filtresi Bileşeni
 * Maçları lige göre filtreleme
 */

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ProcessedFixture } from '@/types/api-football';
import { getLeaguePriority } from '@/config/league-priorities';
import { X, Star } from 'lucide-react';

interface LeagueFilterProps {
  fixtures: ProcessedFixture[];
  selectedLeagues: number[];
  onFilterChange: (leagueIds: number[]) => void;
}

interface LeagueInfo {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string | null;
  matchCount: number;
  liveCount: number;
  priority: number;
}

export function LeagueFilter({ fixtures, selectedLeagues, onFilterChange }: LeagueFilterProps) {
  const [showAll, setShowAll] = useState(false);

  // Ligleri çıkar ve say
  const leagues = useMemo(() => {
    const leagueMap = new Map<number, LeagueInfo>();

    fixtures.forEach(fixture => {
      const existing = leagueMap.get(fixture.league.id);
      if (existing) {
        existing.matchCount++;
        if (fixture.status.isLive) existing.liveCount++;
      } else {
        leagueMap.set(fixture.league.id, {
          id: fixture.league.id,
          name: fixture.league.name,
          country: fixture.league.country,
          logo: fixture.league.logo,
          flag: fixture.league.flag,
          matchCount: 1,
          liveCount: fixture.status.isLive ? 1 : 0,
          priority: getLeaguePriority(fixture.league.id),
        });
      }
    });

    // Önce canlı, sonra önceliğe göre sırala
    return Array.from(leagueMap.values()).sort((a, b) => {
      if (b.liveCount !== a.liveCount) return b.liveCount - a.liveCount;
      return b.priority - a.priority;
    });
  }, [fixtures]);

  const displayedLeagues = showAll ? leagues : leagues.slice(0, 12);

  const toggleLeague = (leagueId: number) => {
    if (selectedLeagues.includes(leagueId)) {
      onFilterChange(selectedLeagues.filter(id => id !== leagueId));
    } else {
      onFilterChange([...selectedLeagues, leagueId]);
    }
  };

  const clearFilters = () => {
    onFilterChange([]);
  };

  if (leagues.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Star className="h-4 w-4" />
          Hızlı Filtre ({leagues.length} lig)
        </h3>
        {selectedLeagues.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-500 hover:text-red-600">
            <X className="h-4 w-4 mr-1" />
            Temizle ({selectedLeagues.length})
          </Button>
        )}
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          {displayedLeagues.map(league => (
            <Badge
              key={league.id}
              variant={selectedLeagues.includes(league.id) ? 'default' : 'outline'}
              className={`cursor-pointer transition-all flex-shrink-0 py-1.5 px-3 ${
                selectedLeagues.includes(league.id) 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              } ${league.priority >= 95 ? 'border-amber-400' : ''}`}
              onClick={() => toggleLeague(league.id)}
            >
              <div className="flex items-center gap-1.5">
                {league.priority >= 95 && <span className="text-xs">⭐</span>}
                {league.logo && (
                  <Image 
                    src={league.logo} 
                    alt={league.name}
                    width={16}
                    height={16}
                    className="object-contain"
                  />
                )}
                <span className="max-w-32 truncate font-medium">{league.name}</span>
                <span className="text-xs opacity-70">({league.matchCount})</span>
                {league.liveCount > 0 && (
                  <span className="text-xs text-red-400 font-bold">🔴{league.liveCount}</span>
                )}
              </div>
            </Badge>
          ))}

          {leagues.length > 12 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAll(!showAll)}
              className="flex-shrink-0"
            >
              {showAll ? 'Daha az' : `+${leagues.length - 12} lig`}
            </Button>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

// Seçili filtrelerin özeti
export function SelectedFiltersDisplay({ 
  fixtures, 
  selectedLeagues 
}: { 
  fixtures: ProcessedFixture[];
  selectedLeagues: number[];
}) {
  const filteredCount = useMemo(() => {
    if (selectedLeagues.length === 0) return fixtures.length;
    return fixtures.filter(f => selectedLeagues.includes(f.league.id)).length;
  }, [fixtures, selectedLeagues]);

  const liveCount = useMemo(() => {
    const filtered = selectedLeagues.length === 0 
      ? fixtures 
      : fixtures.filter(f => selectedLeagues.includes(f.league.id));
    return filtered.filter(f => f.status.isLive).length;
  }, [fixtures, selectedLeagues]);

  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <span>{filteredCount} maç</span>
      {liveCount > 0 && (
        <span className="text-green-600 font-medium">
          🔴 {liveCount} canlı
        </span>
      )}
    </div>
  );
}
