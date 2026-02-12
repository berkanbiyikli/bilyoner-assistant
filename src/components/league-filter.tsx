"use client";

import { cn } from "@/lib/utils";
import { LEAGUES } from "@/lib/api-football/leagues";
import { useAppStore } from "@/lib/store";
import type { MatchPrediction } from "@/types";
import Image from "next/image";

interface LeagueFilterProps {
  predictions?: MatchPrediction[];
}

export function LeagueFilter({ predictions }: LeagueFilterProps) {
  const { selectedLeagues, setSelectedLeagues } = useAppStore();

  const toggleLeague = (id: number) => {
    if (selectedLeagues.includes(id)) {
      setSelectedLeagues(selectedLeagues.filter((l) => l !== id));
    } else {
      setSelectedLeagues([...selectedLeagues, id]);
    }
  };

  // Gelen maçlardan benzersiz ligleri çıkar
  const availableLeagues = predictions
    ? Array.from(
        new Map(
          predictions.map((p) => [
            p.league.id,
            {
              id: p.league.id,
              name: p.league.name,
              country: p.league.country,
              flag: p.league.flag,
              logo: p.league.logo,
              count: 0,
            },
          ])
        ).values()
      )
        .map((league) => ({
          ...league,
          count: predictions.filter((p) => p.league.id === league.id).length,
        }))
        .sort((a, b) => b.count - a.count)
    : LEAGUES.map((l) => ({ ...l, count: 0, logo: "" }));

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setSelectedLeagues([])}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors border flex items-center gap-1.5",
          selectedLeagues.length === 0
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/50"
        )}
      >
        ⚽ Tümü ({predictions?.length || 0})
      </button>
      {availableLeagues.map((league) => (
        <button
          key={league.id}
          onClick={() => toggleLeague(league.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors border flex items-center gap-1.5",
            selectedLeagues.includes(league.id)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          )}
        >
          {league.flag && (
            <Image
              src={league.flag}
              alt={league.country || league.name}
              width={14}
              height={10}
              className="h-2.5 w-3.5 object-cover rounded-[1px]"
            />
          )}
          {league.name} ({league.count})
        </button>
      ))}
    </div>
  );
}
