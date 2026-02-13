"use client";

import { cn } from "@/lib/utils";
import { LEAGUES, type LeagueConfig } from "@/lib/api-football/leagues";
import { useAppStore } from "@/lib/store";
import type { MatchPrediction } from "@/types";
import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, Globe, Loader2, Calendar, TrendingUp, X } from "lucide-react";
import { MatchCard } from "@/components/match-card";
import { MatchCardSkeleton } from "@/components/skeletons";

interface LeagueFilterProps {
  predictions?: MatchPrediction[];
}

interface LeagueFixture {
  fixtureId: number;
  date: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  score: { home: number; away: number } | null;
}

interface LeagueData {
  league: LeagueConfig;
  fixtures: LeagueFixture[];
  predictions: MatchPrediction[];
  loading: boolean;
  error: string | null;
}

// Ülkelere göre grupla
const LEAGUE_GROUPS = (() => {
  const groups = new Map<string, LeagueConfig[]>();
  for (const league of LEAGUES) {
    const country = league.country;
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country)!.push(league);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    // Türkiye en üstte, World en altta
    if (a === "Turkey") return -1;
    if (b === "Turkey") return 1;
    if (a === "World") return 1;
    if (b === "World") return -1;
    return a.localeCompare(b);
  });
})();

export function LeagueFilter({ predictions }: LeagueFilterProps) {
  const { selectedLeagues, setSelectedLeagues } = useAppStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Aktif olarak seçili tek lig (dropdown'dan seçilen)
  const [focusedLeague, setFocusedLeague] = useState<number | null>(null);

  // Dropdown dışına tıklayınca kapat
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleLeague = (id: number) => {
    if (selectedLeagues.includes(id)) {
      setSelectedLeagues(selectedLeagues.filter((l) => l !== id));
    } else {
      setSelectedLeagues([...selectedLeagues, id]);
    }
  };

  // Lig seçilince gelecek maçları getir
  const fetchLeagueData = useCallback(async (leagueId: number) => {
    const league = LEAGUES.find((l) => l.id === leagueId);
    if (!league) return;

    setFocusedLeague(leagueId);
    setLeagueData({
      league,
      fixtures: [],
      predictions: [],
      loading: true,
      error: null,
    });

    try {
      const res = await fetch(`/api/predictions/league?league=${leagueId}&days=5`);
      const data = await res.json();

      if (data.error) {
        setLeagueData((prev) => prev ? { ...prev, loading: false, error: data.error } : null);
      } else {
        setLeagueData({
          league,
          fixtures: data.fixtures || [],
          predictions: data.predictions || [],
          loading: false,
          error: null,
        });
      }
    } catch {
      setLeagueData((prev) => prev ? { ...prev, loading: false, error: "Veriler yüklenemedi" } : null);
    }
  }, []);

  const clearFocusedLeague = () => {
    setFocusedLeague(null);
    setLeagueData(null);
  };

  // Gelen maçlardan benzersiz ligleri çıkar (pill filter için)
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
    : [];

  // Dropdown arama filtresi
  const filteredGroups = search
    ? LEAGUE_GROUPS.map(([country, leagues]) => [
        country,
        leagues.filter(
          (l) =>
            l.name.toLowerCase().includes(search.toLowerCase()) ||
            l.country.toLowerCase().includes(search.toLowerCase())
        ),
      ] as [string, LeagueConfig[]])
        .filter(([, leagues]) => leagues.length > 0)
    : LEAGUE_GROUPS;

  return (
    <div className="space-y-4">
      {/* Top bar: Dropdown + Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* League Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all",
              dropdownOpen
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50"
            )}
          >
            <Globe className="h-4 w-4" />
            <span>Lig Seç</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", dropdownOpen && "rotate-180")} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Lig ara..."
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>

              {/* League list */}
              <div className="max-h-80 overflow-y-auto p-2">
                {filteredGroups.map(([country, leagues]) => (
                  <div key={country} className="mb-2">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {country}
                    </p>
                    {leagues.map((league) => {
                      const matchCount = availableLeagues.find((l) => l.id === league.id)?.count || 0;
                      const isActive = focusedLeague === league.id;
                      return (
                        <button
                          key={league.id}
                          onClick={() => {
                            fetchLeagueData(league.id);
                            setDropdownOpen(false);
                            setSearch("");
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted/50 text-foreground"
                          )}
                        >
                          <span className="text-base">{league.flag}</span>
                          <span className="flex-1">{league.name}</span>
                          {matchCount > 0 && (
                            <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {matchCount} maç
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active league badge */}
        {focusedLeague && leagueData && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-base">{leagueData.league.flag}</span>
            <span className="text-sm font-medium text-primary">{leagueData.league.name}</span>
            <button
              onClick={clearFocusedLeague}
              className="ml-1 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-primary" />
            </button>
          </div>
        )}

        {/* Separator */}
        {availableLeagues.length > 0 && <div className="h-6 w-px bg-border mx-1" />}

        {/* Quick filter pills (existing predictions) */}
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

      {/* League Detail Panel */}
      {focusedLeague && leagueData && (
        <LeagueDetailPanel data={leagueData} />
      )}
    </div>
  );
}

// ---- League Detail Panel ----
function LeagueDetailPanel({ data }: { data: LeagueData }) {
  if (data.loading) {
    return (
      <div className="rounded-xl border border-primary/20 bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {data.league.flag} {data.league.name} maçları yükleniyor...
          </p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-500">{data.error}</p>
      </div>
    );
  }

  // Maçları güne göre grupla
  const fixturesByDay = new Map<string, LeagueFixture[]>();
  for (const fixture of data.fixtures) {
    const day = fixture.date.split("T")[0];
    if (!fixturesByDay.has(day)) fixturesByDay.set(day, []);
    fixturesByDay.get(day)!.push(fixture);
  }

  const sortedDays = Array.from(fixturesByDay.entries()).sort(([a], [b]) => a.localeCompare(b));

  const formatDayLabel = (dateStr: string): string => {
    const d = new Date(dateStr + "T12:00:00");
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (dateStr === today.toISOString().split("T")[0]) return "Bugün";
    if (dateStr === tomorrow.toISOString().split("T")[0]) return "Yarın";
    return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-primary/5 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{data.league.flag}</span>
          <div>
            <h3 className="font-bold text-lg">{data.league.name}</h3>
            <p className="text-xs text-muted-foreground">
              {data.fixtures.length} maç · {data.predictions.length} analiz edildi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium bg-primary/10 text-primary px-3 py-1 rounded-full flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Gelecek 5 gün
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {data.fixtures.length === 0 && data.predictions.length === 0 ? (
          <div className="text-center py-8">
            <Globe className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Bu lig için gelecek 5 gün içinde maç bulunamadı.
            </p>
          </div>
        ) : (
          <>
            {/* Analyzed Predictions */}
            {data.predictions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Analiz & Tahminler</h4>
                  <span className="text-xs text-muted-foreground">({data.predictions.length} maç)</span>
                </div>
                {data.predictions.map((prediction) => (
                  <MatchCard key={prediction.fixtureId} prediction={prediction} />
                ))}
              </div>
            )}

            {/* Upcoming fixtures by day (not analyzed ones) */}
            {sortedDays.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Program</h4>
                </div>
                {sortedDays.map(([day, fixtures]) => (
                  <div key={day}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                      {formatDayLabel(day)}
                    </p>
                    <div className="space-y-1.5">
                      {fixtures.map((f) => {
                        const time = new Date(f.date).toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const hasPrediction = data.predictions.some((p) => p.fixtureId === f.fixtureId);
                        const prediction = data.predictions.find((p) => p.fixtureId === f.fixtureId);
                        const topPick = prediction?.picks?.[0];

                        return (
                          <div
                            key={f.fixtureId}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                              hasPrediction
                                ? "border-primary/20 bg-primary/5"
                                : "border-border hover:bg-muted/30"
                            )}
                          >
                            <span className="text-xs text-muted-foreground w-12 text-center font-mono">
                              {f.status === "NS" ? time : f.status}
                            </span>
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              {f.homeLogo && (
                                <Image src={f.homeLogo} alt="" width={18} height={18} className="h-4.5 w-4.5 object-contain" />
                              )}
                              <span className="text-sm font-medium truncate">{f.homeTeam}</span>
                              <span className="text-xs text-muted-foreground">vs</span>
                              <span className="text-sm font-medium truncate">{f.awayTeam}</span>
                              {f.awayLogo && (
                                <Image src={f.awayLogo} alt="" width={18} height={18} className="h-4.5 w-4.5 object-contain" />
                              )}
                            </div>
                            {f.score && (
                              <span className="text-sm font-bold">
                                {f.score.home} - {f.score.away}
                              </span>
                            )}
                            {topPick && (
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  topPick.confidence >= 70 ? "bg-emerald-500/10 text-emerald-500" :
                                  topPick.confidence >= 55 ? "bg-yellow-500/10 text-yellow-500" :
                                  "bg-red-500/10 text-red-500"
                                )}>
                                  {topPick.type} %{topPick.confidence}
                                </span>
                                {topPick.odds > 1.0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    @{topPick.odds.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

