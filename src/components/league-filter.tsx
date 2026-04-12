"use client";

import { cn } from "@/lib/utils";
import { LEAGUES, type LeagueConfig } from "@/lib/api-football/leagues";
import { useAppStore } from "@/lib/store";
import type { MatchPrediction } from "@/types";
import Image from "next/image";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, Search, Globe, Loader2, Calendar, TrendingUp, X, Check, Filter } from "lucide-react";
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

// Dinamik lig bilgisi (predictions'dan gelen)
interface DynamicLeague {
  id: number;
  name: string;
  country: string;
  flag: string | null; // logo URL veya null
  logo: string | null;
  count: number;
}

export function LeagueFilter({ predictions }: LeagueFilterProps) {
  const { selectedLeagues, setSelectedLeagues } = useAppStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
    const staticLeague = LEAGUES.find((l) => l.id === leagueId);
    const dynLeague = availableLeagues.find((l) => l.id === leagueId);
    const league: LeagueConfig = staticLeague || {
      id: leagueId,
      name: dynLeague?.name || "Bilinmeyen Lig",
      country: dynLeague?.country || "",
      flag: "⚽",
      priority: 5,
      volatility: "high" as const,
    };

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFocusedLeague = () => {
    setFocusedLeague(null);
    setLeagueData(null);
  };

  // Gelen maçlardan benzersiz ligleri çıkar (tüm ligler - dinamik)
  const availableLeagues: DynamicLeague[] = useMemo(() => {
    if (!predictions) return [];
    const map = new Map<number, DynamicLeague>();
    for (const p of predictions) {
      const existing = map.get(p.league.id);
      if (existing) {
        existing.count++;
      } else {
        map.set(p.league.id, {
          id: p.league.id,
          name: p.league.name,
          country: p.league.country,
          flag: p.league.flag,
          logo: (p.league as unknown as Record<string, unknown>).logo as string | null,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [predictions]);

  // Ülkelere göre grupla (dinamik - predictions'dan gelen TÜM ligler)
  const leagueGroups = useMemo(() => {
    const groups = new Map<string, DynamicLeague[]>();
    for (const league of availableLeagues) {
      const country = league.country || "Diğer";
      if (!groups.has(country)) groups.set(country, []);
      groups.get(country)!.push(league);
    }
    // Ülke içi sıralama: maç sayısına göre azalan
    for (const leagues of groups.values()) {
      leagues.sort((a, b) => b.count - a.count);
    }
    return Array.from(groups.entries()).sort(([a, aLeagues], [b, bLeagues]) => {
      if (a === "Turkey") return -1;
      if (b === "Turkey") return 1;
      if (a === "World") return 1;
      if (b === "World") return -1;
      // Ülkeyi toplam maç sayısına göre sırala
      const aTotal = aLeagues.reduce((s, l) => s + l.count, 0);
      const bTotal = bLeagues.reduce((s, l) => s + l.count, 0);
      return bTotal - aTotal;
    });
  }, [availableLeagues]);

  // Arama filtresi
  const filteredGroups = useMemo(() => {
    if (!search) return leagueGroups;
    const q = search.toLowerCase();
    return leagueGroups
      .map(([country, leagues]) => [
        country,
        leagues.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            l.country.toLowerCase().includes(q)
        ),
      ] as [string, DynamicLeague[]])
      .filter(([, leagues]) => leagues.length > 0);
  }, [leagueGroups, search]);

  // Ülke bazlı toplu seçme/kaldırma
  const toggleCountry = (countryLeagues: DynamicLeague[]) => {
    const ids = countryLeagues.map((l) => l.id);
    const allSelected = ids.every((id) => selectedLeagues.includes(id));
    if (allSelected) {
      setSelectedLeagues(selectedLeagues.filter((id) => !ids.includes(id)));
    } else {
      const newSet = new Set([...selectedLeagues, ...ids]);
      setSelectedLeagues(Array.from(newSet));
    }
  };

  // Seçili liglerin özeti
  const selectedLeagueDetails = availableLeagues.filter((l) => selectedLeagues.includes(l.id));
  const MAX_VISIBLE_TAGS = 3;

  // Büyük & popüler lig id'leri
  const majorLeagueIds = LEAGUES.filter((l) => l.priority === 1).map((l) => l.id);
  const popularLeagueIds = LEAGUES.filter((l) => l.priority <= 2).map((l) => l.id);
  const availableMajorIds = availableLeagues.filter((l) => majorLeagueIds.includes(l.id)).map((l) => l.id);
  const availablePopularIds = availableLeagues.filter((l) => popularLeagueIds.includes(l.id)).map((l) => l.id);

  const majorCount = predictions?.filter((p) => majorLeagueIds.includes(p.league.id)).length || 0;
  const popularCount = predictions?.filter((p) => popularLeagueIds.includes(p.league.id)).length || 0;

  const isMajorActive = availableMajorIds.length > 0 &&
    availableMajorIds.every((id) => selectedLeagues.includes(id)) &&
    selectedLeagues.length === availableMajorIds.length;
  const isPopularActive = availablePopularIds.length > 0 &&
    availablePopularIds.every((id) => selectedLeagues.includes(id)) &&
    selectedLeagues.length === availablePopularIds.length;

  return (
    <div className="space-y-4">
      {/* Compact filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
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

        {availableMajorIds.length > 0 && (
          <button
            onClick={() => setSelectedLeagues(isMajorActive ? [] : availableMajorIds)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border flex items-center gap-1.5",
              isMajorActive
                ? "border-yellow-500 bg-yellow-500/10 text-yellow-500"
                : "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:border-yellow-500/60 hover:bg-yellow-500/5"
            )}
          >
            🏆 Büyük Ligler ({majorCount})
          </button>
        )}

        {availablePopularIds.length > 0 && availablePopularIds.length !== availableMajorIds.length && (
          <button
            onClick={() => setSelectedLeagues(isPopularActive ? [] : availablePopularIds)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border flex items-center gap-1.5",
              isPopularActive
                ? "border-blue-500 bg-blue-500/10 text-blue-500"
                : "border-blue-500/30 text-blue-600 dark:text-blue-400 hover:border-blue-500/60 hover:bg-blue-500/5"
            )}
          >
            ⭐ Popüler ({popularCount})
          </button>
        )}

        <div className="h-6 w-px bg-border mx-1" />

        {/* Multi-select dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); setSearch(""); }}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all",
              dropdownOpen || selectedLeagues.length > 0
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Lig Filtrele</span>
            {selectedLeagues.length > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {selectedLeagues.length}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", dropdownOpen && "rotate-180")} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-[340px] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Lig veya ülke ara..."
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>

              {/* Select all / Clear */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {availableLeagues.length} lig · {predictions?.length || 0} maç
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedLeagues(availableLeagues.map((l) => l.id))}
                    className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    Tümünü seç
                  </button>
                  {selectedLeagues.length > 0 && (
                    <>
                      <span className="text-border">·</span>
                      <button
                        onClick={() => setSelectedLeagues([])}
                        className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
                      >
                        Temizle
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* League list grouped by country */}
              <div className="max-h-[360px] overflow-y-auto">
                {filteredGroups.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Sonuç bulunamadı
                  </div>
                ) : (
                  filteredGroups.map(([country, leagues]) => {
                    const countryIds = leagues.map((l) => l.id);
                    const allCountrySelected = countryIds.every((id) => selectedLeagues.includes(id));
                    const someCountrySelected = countryIds.some((id) => selectedLeagues.includes(id));
                    const countryTotal = leagues.reduce((s, l) => s + l.count, 0);

                    return (
                      <div key={country} className="border-b border-border/50 last:border-b-0">
                        {/* Country header - clickable to select all */}
                        <button
                          onClick={() => toggleCountry(leagues)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
                        >
                          <div className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            allCountrySelected
                              ? "bg-primary border-primary"
                              : someCountrySelected
                              ? "border-primary bg-primary/30"
                              : "border-zinc-600"
                          )}>
                            {(allCountrySelected || someCountrySelected) && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex-1 text-left">
                            {country}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{countryTotal} maç</span>
                        </button>

                        {/* Leagues in country */}
                        {leagues.map((league) => {
                          const isChecked = selectedLeagues.includes(league.id);
                          return (
                            <div key={league.id} className="flex items-center">
                              <button
                                onClick={() => toggleLeague(league.id)}
                                className={cn(
                                  "flex-1 flex items-center gap-3 pl-7 pr-3 py-1.5 text-sm transition-colors text-left hover:bg-muted/30",
                                  isChecked && "bg-primary/5"
                                )}
                              >
                                <div className={cn(
                                  "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                  isChecked ? "bg-primary border-primary" : "border-zinc-600"
                                )}>
                                  {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                                {league.logo ? (
                                  <Image
                                    src={league.logo}
                                    alt={league.name}
                                    width={16}
                                    height={12}
                                    className="h-3 w-4 object-cover rounded-[1px]"
                                  />
                                ) : league.flag ? (
                                  <Image
                                    src={league.flag}
                                    alt={league.country}
                                    width={16}
                                    height={12}
                                    className="h-3 w-4 object-cover rounded-[1px]"
                                  />
                                ) : (
                                  <span className="text-xs">⚽</span>
                                )}
                                <span className="flex-1 text-xs">{league.name}</span>
                                <span className="text-[10px] text-muted-foreground">{league.count}</span>
                              </button>
                              {/* Small info button for league detail */}
                              <button
                                onClick={() => {
                                  fetchLeagueData(league.id);
                                  setDropdownOpen(false);
                                }}
                                className="px-2 py-1.5 text-muted-foreground hover:text-primary transition-colors"
                                title="Lig detayı"
                              >
                                <TrendingUp className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected league tags */}
        {selectedLeagueDetails.length > 0 && (
          <>
            {selectedLeagueDetails.slice(0, MAX_VISIBLE_TAGS).map((league) => (
              <div
                key={league.id}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 pl-2.5 pr-1.5 py-1"
              >
                {league.logo ? (
                  <Image src={league.logo} alt={league.name} width={14} height={10} className="h-2.5 w-3.5 object-cover rounded-[1px]" />
                ) : league.flag ? (
                  league.flag.startsWith('http') ? (
                    <Image src={league.flag} alt={league.country} width={14} height={10} className="h-2.5 w-3.5 object-cover rounded-[1px]" />
                  ) : (
                    <span className="text-sm">{league.flag}</span>
                  )
                ) : null}
                <span className="text-[11px] font-medium text-primary">{league.name}</span>
                <button
                  onClick={() => toggleLeague(league.id)}
                  className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                >
                  <X className="h-3 w-3 text-primary" />
                </button>
              </div>
            ))}
            {selectedLeagueDetails.length > MAX_VISIBLE_TAGS && (
              <button
                onClick={() => setDropdownOpen(true)}
                className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                +{selectedLeagueDetails.length - MAX_VISIBLE_TAGS} lig daha
              </button>
            )}
            <button
              onClick={() => setSelectedLeagues([])}
              className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors ml-1"
            >
              Temizle ×
            </button>
          </>
        )}

        {/* Active league detail badge */}
        {focusedLeague && leagueData && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5">
            <span className="text-base">{leagueData.league.flag}</span>
            <span className="text-xs font-medium text-primary">{leagueData.league.name}</span>
            <button
              onClick={clearFocusedLeague}
              className="ml-1 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
            >
              <X className="h-3 w-3 text-primary" />
            </button>
          </div>
        )}
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

