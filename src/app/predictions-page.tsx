"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { LeagueFilter } from "@/components/league-filter";
import { PreferenceFilter } from "@/components/preference-filter";
import { CouponSidebar } from "@/components/coupon-sidebar";
import { useAppStore, MARKET_PICK_MAP } from "@/lib/store";
import type { MatchPrediction, Pick as PickT, CrazyPickResult } from "@/types";
import {
  Trophy, Calendar, RefreshCw, Dices, Flame, TrendingUp, Zap,
  AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Target, Shield, Swords, BarChart3, Plus, Check, Sparkles,
  Star, ArrowUpRight, Filter, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  ScenarioBadges,
  ScoreDistributionChart,
  XgMomentumBar,
  GoalTimeline,
  RefereeCard,
  InjuryReport,
  InsightsList,
} from "@/components/match-visualizations";

type TabType = "predictions" | "crazy-picks";

// ---- Pick label helper ----
const PICK_SHORT: Record<string, string> = {
  "1": "1", X: "X", "2": "2", "1X": "1X", X2: "X2", "12": "12",
  "Over 2.5": "Ü2.5", "Under 2.5": "A2.5", "Over 1.5": "Ü1.5", "Under 1.5": "A1.5",
  "Over 3.5": "Ü3.5", "Under 3.5": "A3.5", "BTTS Yes": "KG+", "BTTS No": "KG-",
  "HT Over 0.5": "İY Ü0.5", "HT Under 0.5": "İY A0.5",
  "HT BTTS Yes": "İY KG+", "HT BTTS No": "İY KG-",
  "1 & Over 1.5": "1&Ü1.5", "2 & Over 1.5": "2&Ü1.5",
};

function pickLabel(type: string): string {
  if (type.startsWith("CS ")) return type.replace("CS ", "");
  return PICK_SHORT[type] || type;
}

// ============================================
// Main Page
// ============================================

export function PredictionsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(
    searchParams.get("tab") === "crazy" ? "crazy-picks" : "predictions"
  );
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    setActiveTab(tab === "crazy" ? "crazy-picks" : "predictions");
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<string[]>(() => [new Date().toISOString().split("T")[0]]);
  const selectedLeagues = useAppStore((s) => s.selectedLeagues);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<Record<number, string>>({});
  const [quickFilters, setQuickFilters] = useState<Set<string>>(new Set());
  const toggleQuickFilter = (f: string) => setQuickFilters(prev => {
    const next = new Set(prev);
    if (next.has(f)) next.delete(f); else next.add(f);
    return next;
  });

  // Crazy Picks state
  const [crazyPicks, setCrazyPicks] = useState<CrazyPickResult[]>([]);
  const [crazyLoading, setCrazyLoading] = useState(false);
  const [crazyError, setCrazyError] = useState<string | null>(null);
  const [crazySummary, setCrazySummary] = useState<{
    totalMatches: number; totalPicks: number; avgEdge: number; bestEdge: number; totalStake: number;
  } | null>(null);

  // Coupon
  const { activeCoupon, addToCoupon } = useAppStore();
  const isInCoupon = (fid: number, pick: string) =>
    activeCoupon.some((i) => i.fixtureId === fid && i.pick === pick);

  const handleAddToCoupon = (p: MatchPrediction, pick: PickT) => {
    addToCoupon({
      fixtureId: p.fixtureId,
      homeTeam: p.homeTeam.name,
      awayTeam: p.awayTeam.name,
      league: p.league.name,
      kickoff: p.kickoff,
      pick: pick.type,
      odds: pick.odds,
      confidence: pick.confidence,
      result: "pending",
    });
  };

  // Date helpers
  const formatDateStr = (d: Date) => d.toISOString().split("T")[0];
  const today = formatDateStr(new Date());

  const getWeekendDates = () => {
    const now = new Date();
    const dates: string[] = [];
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      const dow = d.getDay();
      if (dow === 5 || dow === 6 || dow === 0) dates.push(formatDateStr(d));
      if (dates.length >= 3) break;
    }
    return dates;
  };

  const shiftDates = (direction: number) => {
    setSelectedDates((prev) => prev.map((d) => {
      const dt = new Date(d);
      dt.setDate(dt.getDate() + direction);
      return formatDateStr(dt);
    }));
  };

  const toggleDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== dateStr);
      }
      return [...prev, dateStr].sort();
    });
  };

  const setPreset = (preset: "today" | "tomorrow" | "weekend") => {
    const now = new Date();
    switch (preset) {
      case "today":
        setSelectedDates([formatDateStr(now)]);
        break;
      case "tomorrow": {
        const tmrw = new Date(now);
        tmrw.setDate(now.getDate() + 1);
        setSelectedDates([formatDateStr(tmrw)]);
        break;
      }
      case "weekend":
        setSelectedDates(getWeekendDates());
        break;
    }
  };

  const [apiMessage, setApiMessage] = useState<string | null>(null);

  const redirectRef = useRef(false);

  const fetchPredictions = async () => {
    setLoading(true);
    setApiMessage(null);
    try {
      const url = selectedDates.length === 1
        ? `/api/predictions?date=${selectedDates[0]}`
        : `/api/predictions?dates=${selectedDates.join(",")}`;
      const res = await fetch(url);
      const data = await res.json();
      setPredictions(data.predictions || []);
      if (data.source === "redirect" && data.redirectDates) {
        // Tarih seçiciyi güncelle ama tekrar fetch tetikleme
        redirectRef.current = true;
        setSelectedDates(data.redirectDates);
      }
      if (data.source === "fallback" && data.message) setApiMessage(data.message);
    } catch (error) {
      console.error("Tahminler yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCrazyPicks = async () => {
    setCrazyLoading(true);
    setCrazyError(null);
    try {
      const res = await fetch("/api/crazy-picks");
      const data = await res.json();
      if (data.error) setCrazyError(data.error);
      else { setCrazyPicks(data.results || []); setCrazySummary(data.summary || null); }
    } catch { setCrazyError("Sürpriz tahminler yüklenemedi"); }
    finally { setCrazyLoading(false); }
  };

  useEffect(() => {
    if (redirectRef.current) { redirectRef.current = false; return; }
    fetchPredictions();
  }, [selectedDates]);
  useEffect(() => {
    if (activeTab === "crazy-picks" && crazyPicks.length === 0 && !crazyLoading && !crazyError) fetchCrazyPicks();
  }, [activeTab]);

  const filters = useAppStore((s) => s.filters);

  // League filter
  const leagueFiltered = selectedLeagues.length > 0
    ? predictions.filter((p) => selectedLeagues.includes(p.league.id))
    : predictions;

  // Match status detection
  const FINISHED_STATUSES = ["FT", "AET", "PEN", "AWD", "WO", "CANC", "ABD"];
  const LIVE_STATUSES = ["1H", "2H", "HT", "ET", "P", "BT", "LIVE"];
  const isMatchFinished = (p: MatchPrediction) => {
    const fixtureStatus = p.fixture?.fixture?.status?.short;
    if (fixtureStatus && FINISHED_STATUSES.includes(fixtureStatus)) return true;
    if (!fixtureStatus && p.kickoff) {
      const kickoffTime = new Date(p.kickoff).getTime();
      if (Date.now() - kickoffTime > 3 * 60 * 60 * 1000) return true;
    }
    return false;
  };
  const isMatchLive = (p: MatchPrediction) => {
    const fixtureStatus = p.fixture?.fixture?.status?.short;
    if (fixtureStatus && LIVE_STATUSES.includes(fixtureStatus)) return true;
    // Fixture status yoksa ama maç başlamış olabilir (başlangıçtan 0-2 saat arası)
    if (!fixtureStatus && p.kickoff) {
      const kickoffTime = new Date(p.kickoff).getTime();
      const elapsed = Date.now() - kickoffTime;
      if (elapsed > 0 && elapsed < 3 * 60 * 60 * 1000) return true;
    }
    return false;
  };
  const isMatchUpcoming = (p: MatchPrediction) => !isMatchFinished(p) && !isMatchLive(p);

  const filteredPredictions = leagueFiltered
    .map((p) => {
      let filteredPicks = p.picks || [];
      if (filters.market !== "all") {
        const allowedPicks = MARKET_PICK_MAP[filters.market];
        if (filters.market === "score") filteredPicks = filteredPicks.filter((pick) => pick.type.startsWith("CS "));
        else if (filters.market === "htft") {
          // İY/MS: önce market filtresi
          filteredPicks = filteredPicks.filter((pick) => allowedPicks.includes(pick.type));
          // İY/MS alt filtresi: seçili kombinasyonlar
          if (filters.htftSelectedCombos.length > 0) {
            filteredPicks = filteredPicks.filter((pick) => filters.htftSelectedCombos.includes(pick.type));
          }
          // H2H destekli filtre
          if (filters.showOnlyH2HSupported) {
            filteredPicks = filteredPicks.filter((pick) => pick.reasoning?.includes("H2H"));
          }
        }
        else if (allowedPicks.length > 0) filteredPicks = filteredPicks.filter((pick) => allowedPicks.includes(pick.type));
      }
      if (filters.minConfidence > 0) filteredPicks = filteredPicks.filter((pick) => pick.confidence >= filters.minConfidence);
      if (filters.minOdds > 1.0 || filters.maxOdds < 50.0) filteredPicks = filteredPicks.filter((pick) => pick.odds >= filters.minOdds && pick.odds <= filters.maxOdds);
      if (filters.valueBetsOnly) filteredPicks = filteredPicks.filter((pick) => pick.isValueBet);
      // Gelişmiş filtreler
      if (filters.minEV > -1.0) filteredPicks = filteredPicks.filter((pick) => (pick.expectedValue ?? -1) >= filters.minEV);
      if (filters.minSimProb > 0) filteredPicks = filteredPicks.filter((pick) => (pick.simProbability ?? 0) >= filters.minSimProb);
      if (filteredPicks.length === 0) return null;
      return { ...p, picks: filteredPicks };
    })
    .filter(Boolean) as typeof predictions;

  // İY/MS pick sayısı — filtre UI'a göndermek için
  const htftPickCount = useMemo(() => {
    return leagueFiltered.reduce((sum, p) => {
      const htftPicks = (p.picks || []).filter(pk => MARKET_PICK_MAP.htft.includes(pk.type));
      return sum + htftPicks.length;
    }, 0);
  }, [leagueFiltered]);

  // Quick filter: KG Var, Ü2.5, İY KG Var, Geri Dönüş, 1/2, 2/1
  const quickFiltered = useMemo(() => {
    if (quickFilters.size === 0) return filteredPredictions;
    // İY/MS combo quick filters need pick-level filtering too
    const htftQuickCombos: string[] = [];
    if (quickFilters.has("comeback")) htftQuickCombos.push("1/2", "2/1");
    if (quickFilters.has("htft_12")) htftQuickCombos.push("1/2");
    if (quickFilters.has("htft_21")) htftQuickCombos.push("2/1");
    const uniqueCombos = [...new Set(htftQuickCombos)];

    return filteredPredictions
      .map(p => {
        const pickTypes = p.picks.map(pk => pk.type);
        if (quickFilters.has("btts") && !pickTypes.includes("BTTS Yes")) return null;
        if (quickFilters.has("over25") && !pickTypes.includes("Over 2.5")) return null;
        if (quickFilters.has("ht_btts") && !pickTypes.includes("HT BTTS Yes")) return null;
        if (quickFilters.has("htft") && !pickTypes.some(t => MARKET_PICK_MAP.htft.includes(t))) return null;
        // Geri dönüş / 1/2 / 2/1 quick filters: filter picks
        if (uniqueCombos.length > 0) {
          const filtered = p.picks.filter(pk => uniqueCombos.includes(pk.type));
          if (filtered.length === 0) return null;
          return { ...p, picks: filtered };
        }
        return p;
      })
      .filter(Boolean) as typeof filteredPredictions;
  }, [filteredPredictions, quickFilters]);

  // Filter: sadece başlamamış maçları göster
  const upcomingPredictions = useMemo(
    () => quickFiltered.filter(isMatchUpcoming),
    [quickFiltered]
  );

  // Sort: önce saate göre, sonra secondary sort
  const sortedPredictions = useMemo(() => [...upcomingPredictions].sort((a, b) => {
    const ka = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const kb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    if (ka !== kb) return ka - kb;
    const pA = a.picks[0], pB = b.picks[0];
    if (!pA || !pB) return 0;
    switch (filters.sortBy) {
      case "confidence": return pB.confidence - pA.confidence;
      case "odds": return pB.odds - pA.odds;
      case "ev": return (pB.expectedValue || 0) - (pA.expectedValue || 0);
      default: return 0;
    }
  }), [upcomingPredictions, filters.sortBy]);

  // Group by league (same league matches together, sorted by kickoff inside)
  const leagueGroups = useMemo(() => {
    const groups = new Map<string, { leagueId: number; matches: MatchPrediction[] }>();
    for (const p of sortedPredictions) {
      const leagueKey = `${p.league.id}|||${p.league.country} - ${p.league.name}`;
      if (!groups.has(leagueKey)) groups.set(leagueKey, { leagueId: p.league.id, matches: [] });
      groups.get(leagueKey)!.matches.push(p);
    }
    // Sort groups: by earliest kickoff in each group
    const sorted = Array.from(groups.entries()).sort(([, a], [, b]) => {
      const aTime = Math.min(...a.matches.map(m => new Date(m.kickoff).getTime()));
      const bTime = Math.min(...b.matches.map(m => new Date(m.kickoff).getTime()));
      return aTime - bTime;
    });
    return new Map(sorted);
  }, [sortedPredictions]);

  // Summary stats
  const valueBetCount = useMemo(() => sortedPredictions.reduce((s, p) => s + p.picks.filter(pk => pk.isValueBet).length, 0), [sortedPredictions]);
  const highConfCount = useMemo(() => sortedPredictions.filter(p => p.picks[0]?.confidence >= 70).length, [sortedPredictions]);

  const getDetailTab = (fid: number) => detailTab[fid] || "analysis";
  const setDTab = (fid: number, tab: string) => setDetailTab((prev) => ({ ...prev, [fid]: tab }));

  // Top Picks of the Day — top 5 by confidence score
  const topPicks = useMemo(() => {
    if (sortedPredictions.length === 0) return [];
    const candidates: { prediction: MatchPrediction; pick: PickT; score: number }[] = [];
    for (const p of sortedPredictions) {
      for (const pick of p.picks) {
        const evBonus = pick.expectedValue > 0 ? pick.expectedValue * 20 : 0;
        const score = pick.confidence + evBonus + (pick.isValueBet ? 5 : 0);
        candidates.push({ prediction: p, pick, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    // Unique by fixture (max 1 pick per match in hero)
    const seen = new Set<number>();
    const result: typeof candidates = [];
    for (const c of candidates) {
      if (seen.has(c.prediction.fixtureId)) continue;
      seen.add(c.prediction.fixtureId);
      result.push(c);
      if (result.length >= 5) break;
    }
    return result;
  }, [sortedPredictions]);

  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Tahminler</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Monte Carlo simülasyon destekli AI analiz</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={activeTab === "predictions" ? fetchPredictions : fetchCrazyPicks}
              disabled={loading || crazyLoading}
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4 text-zinc-400", (loading || crazyLoading) && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Tabs + Date Picker Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Tab Toggle */}
          <div className="flex gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 shrink-0">
            <button
              onClick={() => setActiveTab("predictions")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeTab === "predictions"
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Target className="h-3.5 w-3.5" />
              Tahminler
              {predictions.length > 0 && (
                <span className={cn(
                  "text-[10px] font-bold rounded-full px-1.5 py-0.5",
                  activeTab === "predictions" ? "bg-white/20" : "bg-zinc-800 text-zinc-500"
                )}>
                  {sortedPredictions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("crazy-picks")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeTab === "crazy-picks"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Dices className="h-3.5 w-3.5" />
              Sürpriz
              {crazyPicks.length > 0 && (
                <span className={cn(
                  "text-[10px] font-bold rounded-full px-1.5 py-0.5",
                  activeTab === "crazy-picks" ? "bg-white/20" : "bg-zinc-800 text-zinc-500"
                )}>
                  {crazyPicks.length}
                </span>
              )}
            </button>
          </div>

          {/* Date Picker (inline) */}
          {activeTab === "predictions" && (
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {(["today", "tomorrow", "weekend"] as const).map((preset) => {
                const labels = { today: "Bugün", tomorrow: "Yarın", weekend: "H.Sonu" };
                const isActive = preset === "today" ? selectedDates.length === 1 && selectedDates[0] === today
                  : preset === "tomorrow" ? selectedDates.length === 1 && selectedDates[0] === formatDateStr((() => { const t = new Date(); t.setDate(t.getDate() + 1); return t; })())
                  : selectedDates.length >= 2;
                return (
                  <button key={preset} onClick={() => setPreset(preset)} className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    isActive ? "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  )}>{labels[preset]}</button>
                );
              })}
              <div className="flex items-center gap-0.5">
                <button onClick={() => shiftDates(-1)} className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {selectedDates.map((d) => {
                  const dt = new Date(d + "T12:00:00");
                  return (
                    <button key={d} onClick={() => toggleDate(d)} className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 transition-colors">
                      <Calendar className="h-3 w-3 text-zinc-500" />
                      {dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" })}
                      {selectedDates.length > 1 && <X className="h-2.5 w-2.5 text-zinc-500" />}
                    </button>
                  );
                })}
                <button onClick={() => shiftDates(1)} className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-0.5 ml-auto">
                <Calendar className="h-3 w-3 text-zinc-600" />
                <input type="date" onChange={(e) => { if (e.target.value) toggleDate(e.target.value); }} className="bg-transparent text-[11px] text-zinc-400 outline-none w-[100px]" />
              </div>
            </div>
          )}
        </div>

        {/* TAB: Predictions */}
        {activeTab === "predictions" && (
          <>
            {apiMessage && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-500">{apiMessage}</p>
              </div>
            )}

            {/* Top Picks Hero */}
            {!loading && topPicks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-4 w-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-white">Günün En İyileri</h2>
                  <span className="text-[10px] text-zinc-600">En yüksek güven × değer</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                  {topPicks.map(({ prediction: tp, pick: tpick }, i) => (
                    <button
                      key={tp.fixtureId}
                      onClick={() => setExpandedMatch(expandedMatch === tp.fixtureId ? null : tp.fixtureId)}
                      className={cn(
                        "relative rounded-xl border p-3 text-left transition-all hover:scale-[1.02]",
                        i === 0
                          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-zinc-900"
                          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                      )}
                    >
                      {i === 0 && (
                        <div className="absolute -top-2 left-3 bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full">
                          TOP PICK
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-2 mt-1">
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded",
                          tpick.isValueBet ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"
                        )}>
                          {pickLabel(tpick.type)}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                          tpick.confidence >= 70 ? "bg-green-500/15 text-green-400" :
                          tpick.confidence >= 55 ? "bg-yellow-500/15 text-yellow-400" :
                          "bg-red-500/10 text-red-400"
                        )}>
                          %{tpick.confidence}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300 font-medium truncate">{tp.homeTeam.name}</p>
                      <p className="text-[11px] text-zinc-500 truncate">vs {tp.awayTeam.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-zinc-600">
                          {new Date(tp.kickoff).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-xs font-bold text-yellow-500">{tpick.odds.toFixed(2)}</span>
                      </div>
                      {tpick.isValueBet && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <TrendingUp className="h-3 w-3 text-emerald-400" />
                          <span className="text-[9px] text-emerald-400 font-medium">Value Bet · EV +{(tpick.expectedValue * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle filters panel */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
                  showFilters
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                )}
              >
                <Filter className="h-3 w-3" />
                Filtreler
                {(filters.market !== "all" || filters.minConfidence > 0 || filters.valueBetsOnly) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                )}
              </button>

              {/* Quick Filters */}
              {[
                { key: "btts", label: "KG Var" },
                { key: "over25", label: "Ü2.5" },
                { key: "ht_btts", label: "İY KG" },
                { key: "htft", label: "İY/MS" },
                { key: "comeback", label: "Geri Dönüş" },
              ].map(f => {
                const active = quickFilters.has(f.key);
                const count = filteredPredictions.filter(p => {
                  const types = p.picks.map(pk => pk.type);
                  if (f.key === "btts") return types.includes("BTTS Yes");
                  if (f.key === "over25") return types.includes("Over 2.5");
                  if (f.key === "ht_btts") return types.includes("HT BTTS Yes");
                  if (f.key === "htft") return types.some(t => MARKET_PICK_MAP.htft.includes(t));
                  if (f.key === "comeback") return types.includes("1/2") || types.includes("2/1");
                  return false;
                }).length;
                return (
                  <button
                    key={f.key}
                    onClick={() => toggleQuickFilter(f.key)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all border",
                      active
                        ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    {f.label}
                    <span className={cn(
                      "text-[10px] px-1 rounded",
                      active ? "text-indigo-400" : "text-zinc-600"
                    )}>{count}</span>
                  </button>
                );
              })}
              {quickFilters.size > 0 && (
                <button onClick={() => setQuickFilters(new Set())} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                  Temizle
                </button>
              )}

              {/* Stats pills */}
              <div className="ml-auto flex items-center gap-2">
                {valueBetCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <TrendingUp className="h-3 w-3" /> {valueBetCount} value
                  </span>
                )}
                {highConfCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400">
                    <Target className="h-3 w-3" /> {highConfCount} güvenli
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">{sortedPredictions.length} maç</span>
              </div>
            </div>

            {/* Collapsible Filter Panels */}
            {showFilters && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                <LeagueFilter predictions={predictions} />
                <PreferenceFilter htftPickCount={htftPickCount} />
              </div>
            )}

            {/* Main Match List */}
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-14 animate-pulse" />
                ))}
              </div>
            ) : sortedPredictions.length > 0 ? (
              <div className="space-y-3">
                {Array.from(leagueGroups.entries()).map(([groupKey, { matches }]) => {
                  const [, leagueName] = groupKey.split("|||");
                  const leagueFlag = matches[0]?.league?.flag;
                  const leagueLogo = (matches[0]?.league as unknown as Record<string, unknown>)?.logo as string | undefined;

                  return (
                    <div key={groupKey} className="rounded-xl border border-zinc-800 overflow-hidden">
                      {/* League Header */}
                      <div className="flex items-center gap-2.5 bg-zinc-900 px-4 py-2 border-b border-zinc-800/50">
                        {leagueLogo ? (
                          <Image src={leagueLogo} alt="" width={16} height={16} className="w-4 h-4 object-contain" />
                        ) : leagueFlag ? (
                          <Image src={leagueFlag} alt="" width={16} height={12} className="rounded-sm" />
                        ) : (
                          <Trophy className="h-3.5 w-3.5 text-zinc-600" />
                        )}
                        <span className="text-xs font-semibold text-zinc-300">{leagueName}</span>
                        <span className="text-[10px] text-zinc-600">{matches.length} maç</span>
                      </div>

                      {/* Matches */}
                      <div className="divide-y divide-zinc-800/40">
                        {matches.map((p) => (
                          <PredictionRow
                            key={p.fixtureId}
                            prediction={p}
                            isFinished={false}
                            isExpanded={expandedMatch === p.fixtureId}
                            onToggle={() => setExpandedMatch(expandedMatch === p.fixtureId ? null : p.fixtureId)}
                            isInCoupon={isInCoupon}
                            onAddToCoupon={(pick) => handleAddToCoupon(p, pick)}
                            activeDetailTab={getDetailTab(p.fixtureId)}
                            onSetDetailTab={(tab) => setDTab(p.fixtureId, tab)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-16 text-center">
                <Target className="mx-auto h-10 w-10 text-zinc-700 mb-3" />
                <h3 className="font-semibold text-white mb-1">
                  {predictions.length > 0 ? "Filtreye Uygun Tahmin Yok" : "Tahmin Bulunamadı"}
                </h3>
                <p className="text-xs text-zinc-500">
                  {predictions.length > 0
                    ? "Filtre ayarlarınızı değiştirip tekrar deneyin."
                    : "Bu tarih için henüz tahmin yok. Farklı bir tarih seçin."}
                </p>
              </div>
            )}
          </>
        )}

        {/* TAB: Crazy Picks */}
        {activeTab === "crazy-picks" && (
          <CrazyPicksSection
            results={crazyPicks}
            summary={crazySummary}
            loading={crazyLoading}
            error={crazyError}
            onRetry={fetchCrazyPicks}
          />
        )}
      </div>

      {/* Coupon Sidebar */}
      <div className="hidden md:block w-72 shrink-0">
        <div className="sticky top-20">
          <CouponSidebar />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Prediction Row — compact table row
// ============================================

function PredictionRow({
  prediction: p,
  isFinished,
  isExpanded,
  onToggle,
  isInCoupon,
  onAddToCoupon,
  activeDetailTab,
  onSetDetailTab,
}: {
  prediction: MatchPrediction;
  isFinished: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  isInCoupon: (fid: number, pick: string) => boolean;
  onAddToCoupon: (pick: PickT) => void;
  activeDetailTab: string;
  onSetDetailTab: (tab: string) => void;
}) {
  const bestPick = p.picks[0];
  const analysis = p.analysis;
  const sim = analysis?.simulation;
  const odds = p.odds;
  const hasValueBet = p.picks.some((pk) => pk.isValueBet);
  const kickoffTime = new Date(p.kickoff).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const fixtureStatus = p.fixture?.fixture?.status?.short;
  const homeGoals = p.fixture?.goals?.home;
  const awayGoals = p.fixture?.goals?.away;
  const isLive = fixtureStatus != null && ["1H", "2H", "HT", "ET", "P", "BT", "LIVE"].includes(fixtureStatus);
  const elapsed = p.fixture?.fixture?.status?.elapsed;

  const o1 = odds?.home || 0;
  const oX = odds?.draw || 0;
  const o2 = odds?.away || 0;

  return (
    <div className={cn(
      "transition-colors",
      isFinished ? "opacity-40" : hasValueBet ? "bg-emerald-500/[0.02]" : "hover:bg-zinc-800/20"
    )}>
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center px-4 py-2.5 text-left gap-3"
      >
        {/* Time */}
        <div className="w-11 shrink-0">
          {isLive ? (
            <div className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              <span className="text-[11px] font-bold text-red-400">{elapsed}&apos;</span>
            </div>
          ) : fixtureStatus === "FT" || fixtureStatus === "AET" || fixtureStatus === "PEN" ? (
            <span className="text-[10px] font-bold text-zinc-600">MS</span>
          ) : (
            <span className="text-[11px] text-zinc-500 tabular-nums">{kickoffTime}</span>
          )}
        </div>

        {/* Teams */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {p.homeTeam.logo && (
              <Image src={p.homeTeam.logo} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
            )}
            <span className={cn(
              "text-[13px] truncate",
              homeGoals != null && awayGoals != null && homeGoals > awayGoals ? "text-white font-semibold" : "text-zinc-300"
            )}>
              {p.homeTeam.name}
            </span>
            {homeGoals != null && awayGoals != null && (
              <span className={cn("text-xs font-bold ml-auto tabular-nums", homeGoals > awayGoals ? "text-white" : "text-zinc-500")}>
                {homeGoals}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {p.awayTeam.logo && (
              <Image src={p.awayTeam.logo} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
            )}
            <span className={cn(
              "text-[13px] truncate",
              homeGoals != null && awayGoals != null && awayGoals > homeGoals ? "text-white font-semibold" : "text-zinc-300"
            )}>
              {p.awayTeam.name}
            </span>
            {homeGoals != null && awayGoals != null && (
              <span className={cn("text-xs font-bold ml-auto tabular-nums", awayGoals > homeGoals ? "text-white" : "text-zinc-500")}>
                {awayGoals}
              </span>
            )}
          </div>
        </div>

        {/* 1X2 Odds */}
        {!isFinished && (
          <div className="hidden sm:flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {[
              { label: "1", odds: o1, type: "1" as const },
              { label: "X", odds: oX, type: "X" as const },
              { label: "2", odds: o2, type: "2" as const },
            ].map(({ label, odds: oddVal, type }) => {
              const inCoupon = isInCoupon(p.fixtureId, type);
              const pick1x2 = p.picks.find(pk => pk.type === type);
              return (
                <button
                  key={type}
                  onClick={(e) => { e.stopPropagation(); if (pick1x2) onAddToCoupon(pick1x2); }}
                  disabled={!pick1x2 && !oddVal}
                  className={cn(
                    "flex flex-col items-center px-2 py-1 rounded text-[10px] min-w-[36px] transition-all",
                    inCoupon
                      ? "bg-indigo-500/20 ring-1 ring-indigo-500/40 text-indigo-400"
                      : pick1x2?.isValueBet
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                        : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/60"
                  )}
                >
                  <span className="text-[8px] text-zinc-600 font-medium">{label}</span>
                  <span className="font-bold text-[11px] tabular-nums">{oddVal ? oddVal.toFixed(2) : "-"}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Best Pick */}
        <div className="flex items-center gap-2 shrink-0">
          {bestPick && (
            <>
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md",
                bestPick.isValueBet
                  ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
                  : "bg-indigo-500/10 ring-1 ring-indigo-500/20"
              )}>
                <span className={cn(
                  "text-[11px] font-bold",
                  bestPick.isValueBet ? "text-emerald-400" : "text-indigo-400"
                )}>
                  {pickLabel(bestPick.type)}
                </span>
                <span className="text-[11px] font-bold text-yellow-500 tabular-nums">{bestPick.odds.toFixed(2)}</span>
              </div>
              <span className={cn(
                "text-[11px] font-bold tabular-nums",
                bestPick.confidence >= 70 ? "text-green-400" :
                bestPick.confidence >= 55 ? "text-yellow-400" :
                "text-red-400"
              )}>
                %{bestPick.confidence}
              </span>
            </>
          )}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
        </div>
      </button>

      {/* Extra picks row */}
      {p.picks.length > 1 && !isExpanded && (
        <div className="px-4 pb-2 flex flex-wrap gap-1 pl-[60px]">
          {p.picks.slice(1, 5).map((pick, i) => (
            <button
              key={i}
              onClick={() => onAddToCoupon(pick)}
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors",
                isInCoupon(p.fixtureId, pick.type)
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
              )}
            >
              <span className="font-medium">{pickLabel(pick.type)}</span>
              <span className="text-zinc-600">{pick.odds.toFixed(2)}</span>
              {pick.isValueBet && <span className="text-[8px] text-emerald-400 font-bold">V</span>}
            </button>
          ))}
          {sim?.topScorelines?.[0] && (
            <span className="text-[10px] text-zinc-600 flex items-center gap-0.5">
              {sim.topScorelines[0].score} %{sim.topScorelines[0].probability.toFixed(0)}
            </span>
          )}
        </div>
      )}

      {/* Expanded Detail Panel */}
      {isExpanded && (
        <ExpandedDetail
          prediction={p}
          activeTab={activeDetailTab}
          onSetTab={onSetDetailTab}
          isInCoupon={isInCoupon}
          onAddToCoupon={onAddToCoupon}
        />
      )}
    </div>
  );
}

// ============================================
// Expanded Detail — Tabs with full analysis
// ============================================

function ExpandedDetail({
  prediction: p,
  activeTab,
  onSetTab,
  isInCoupon,
  onAddToCoupon,
}: {
  prediction: MatchPrediction;
  activeTab: string;
  onSetTab: (tab: string) => void;
  isInCoupon: (fid: number, pick: string) => boolean;
  onAddToCoupon: (pick: PickT) => void;
}) {
  const analysis = p.analysis;
  const insights = p.insights;

  return (
    <div className="border-t border-zinc-800">
      {/* Scenario Badges */}
      {analysis && (
        <div className="px-4 py-2 bg-zinc-800/20">
          <ScenarioBadges analysis={analysis} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {[
          { key: "analysis", icon: BarChart3, label: "Analiz" },
          { key: "picks", icon: Target, label: "Tahminler" },
          { key: "simulation", icon: Sparkles, label: "Simülasyon" },
          { key: "insights", icon: Zap, label: "Derinlemesine" },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); onSetTab(key); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
              activeTab === key ? "text-white border-b-2 border-indigo-500" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "analysis" && <AnalysisTab analysis={analysis} homeTeam={p.homeTeam.name} awayTeam={p.awayTeam.name} />}
        {activeTab === "picks" && <PicksTab prediction={p} isInCoupon={isInCoupon} onAddToCoupon={onAddToCoupon} />}
        {activeTab === "simulation" && <SimulationTab sim={analysis?.simulation} analysis={analysis} homeTeam={p.homeTeam.name} awayTeam={p.awayTeam.name} />}
        {activeTab === "insights" && <InsightsTab analysis={analysis} insights={insights} />}
      </div>
    </div>
  );
}

// ---- Analysis Tab ----
function AnalysisTab({ analysis, homeTeam, awayTeam }: { analysis: MatchPrediction["analysis"]; homeTeam: string; awayTeam: string }) {
  if (!analysis) return <p className="text-xs text-zinc-500">Veri yok</p>;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <p className="text-sm text-zinc-300 leading-relaxed">{analysis.summary}</p>

      {/* Form + Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Home */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
            <Swords className="w-3 h-3 text-blue-400" /> {homeTeam}
          </p>
          <StatBar label="Form" value={analysis.homeForm} color="blue" />
          <StatBar label="Atak" value={analysis.homeAttack} color="green" />
          <StatBar label="Defans" value={analysis.homeDefense} color="amber" />
          {analysis.homeXg != null && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-500">xG</span>
              <span className="text-blue-400 font-bold">{analysis.homeXg.toFixed(2)}</span>
            </div>
          )}
        </div>
        {/* Away */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-red-400" /> {awayTeam}
          </p>
          <StatBar label="Form" value={analysis.awayForm} color="red" />
          <StatBar label="Atak" value={analysis.awayAttack} color="green" />
          <StatBar label="Defans" value={analysis.awayDefense} color="amber" />
          {analysis.awayXg != null && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-500">xG</span>
              <span className="text-red-400 font-bold">{analysis.awayXg.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* xG Momentum */}
      {analysis.homeXg != null && analysis.awayXg != null && (
        <XgMomentumBar homeXg={analysis.homeXg} awayXg={analysis.awayXg} homeAttack={analysis.homeAttack} awayAttack={analysis.awayAttack} homeName={homeTeam} awayName={awayTeam} />
      )}

      {/* Goal Timeline */}
      {analysis.goalTiming && <GoalTimeline goalTiming={analysis.goalTiming} />}

      {/* H2H */}
      {analysis.h2hGoalAvg != null && (
        <div className="flex items-center gap-2 text-xs bg-zinc-800/40 rounded-lg px-3 py-2">
          <span className="text-zinc-500">H2H:</span>
          <span className="text-zinc-300">
            {analysis.h2hAdvantage === "home" ? `${homeTeam} üstün` :
             analysis.h2hAdvantage === "away" ? `${awayTeam} üstün` : "Dengeli"}
          </span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-400">Maç başı {analysis.h2hGoalAvg.toFixed(1)} gol</span>
        </div>
      )}
    </div>
  );
}

// ---- Picks Tab ----
function PicksTab({
  prediction: p,
  isInCoupon,
  onAddToCoupon,
}: {
  prediction: MatchPrediction;
  isInCoupon: (fid: number, pick: string) => boolean;
  onAddToCoupon: (pick: PickT) => void;
}) {
  return (
    <div className="grid gap-2">
      {p.picks.map((pick, i) => {
        const inCoupon = isInCoupon(p.fixtureId, pick.type);
        return (
          <div key={i} className={cn(
            "flex items-center gap-3 rounded-lg border p-3 transition-all",
            inCoupon ? "border-indigo-500/30 bg-indigo-500/5" :
            pick.isValueBet ? "border-emerald-500/20 bg-emerald-500/[0.03]" :
            "border-zinc-800 hover:border-zinc-700"
          )}>
            {/* Type badge */}
            <span className={cn(
              "text-xs font-bold px-2.5 py-1 rounded-md shrink-0 min-w-[50px] text-center",
              pick.isValueBet ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"
            )}>
              {pickLabel(pick.type)}
            </span>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-zinc-300 truncate">{pick.reasoning}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {pick.simProbability != null && (
                  <span className="text-[10px] text-zinc-500">Sim: %{pick.simProbability.toFixed(1)}</span>
                )}
                {pick.expectedValue > 0 && (
                  <span className="text-[10px] text-emerald-500">EV: +{(pick.expectedValue * 100).toFixed(1)}%</span>
                )}
              </div>
            </div>

            {/* Confidence */}
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
              pick.confidence >= 70 ? "bg-green-500/15 text-green-400" :
              pick.confidence >= 55 ? "bg-yellow-500/15 text-yellow-400" :
              "bg-red-500/10 text-red-400"
            )}>
              %{pick.confidence}
            </span>

            {/* Odds */}
            <span className="text-[11px] font-bold text-yellow-500/80 shrink-0 tabular-nums w-[40px] text-right">
              {pick.odds.toFixed(2)}
            </span>

            {/* Add to coupon */}
            <button
              onClick={(e) => { e.stopPropagation(); onAddToCoupon(pick); }}
              className={cn(
                "p-1.5 rounded-md transition-all shrink-0",
                inCoupon
                  ? "bg-indigo-500 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              )}
            >
              {inCoupon ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---- Simulation Tab ----
function SimulationTab({
  sim,
  analysis,
  homeTeam,
  awayTeam,
}: {
  sim: MatchPrediction["analysis"]["simulation"];
  analysis: MatchPrediction["analysis"];
  homeTeam: string;
  awayTeam: string;
}) {
  if (!sim) return <p className="text-xs text-zinc-500">Simülasyon verisi yok</p>;

  return (
    <div className="space-y-4">
      {/* 1X2 Probability Bar */}
      <div>
        <p className="text-[10px] text-zinc-500 font-medium mb-2">Maç Sonucu Olasılıkları ({sim.simRuns.toLocaleString()} sim)</p>
        <div className="flex h-7 rounded-lg overflow-hidden text-[10px] font-bold">
          <div className="bg-blue-500/80 flex items-center justify-center text-white" style={{ width: `${sim.simHomeWinProb}%` }}>
            {sim.simHomeWinProb >= 10 && `1: %${sim.simHomeWinProb.toFixed(0)}`}
          </div>
          <div className="bg-zinc-500/60 flex items-center justify-center text-white" style={{ width: `${sim.simDrawProb}%` }}>
            {sim.simDrawProb >= 8 && `X: %${sim.simDrawProb.toFixed(0)}`}
          </div>
          <div className="bg-red-500/80 flex items-center justify-center text-white" style={{ width: `${sim.simAwayWinProb}%` }}>
            {sim.simAwayWinProb >= 10 && `2: %${sim.simAwayWinProb.toFixed(0)}`}
          </div>
        </div>
      </div>

      {/* Probability Pills */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {[
          { label: "Ü1.5", val: sim.simOver15Prob },
          { label: "Ü2.5", val: sim.simOver25Prob },
          { label: "Ü3.5", val: sim.simOver35Prob },
          { label: "KG Var", val: sim.simBttsProb },
          { label: "İY Ü0.5", val: sim.simHtOver05Prob },
          { label: "İY KG", val: sim.simHtBttsProb },
        ].filter(p => p.val != null).map(({ label, val }) => (
          <div key={label} className="bg-zinc-800/50 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-zinc-500">{label}</p>
            <p className={cn(
              "text-sm font-bold mt-0.5",
              val >= 70 ? "text-green-400" : val >= 50 ? "text-yellow-400" : "text-zinc-400"
            )}>%{val.toFixed(0)}</p>
          </div>
        ))}
      </div>

      {/* Score Distribution */}
      {sim.topScorelines && sim.topScorelines.length > 0 && (
        <ScoreDistributionChart scorelines={sim.topScorelines} />
      )}
    </div>
  );
}

// ---- Insights Tab ----
function InsightsTab({ analysis, insights }: { analysis: MatchPrediction["analysis"]; insights?: MatchPrediction["insights"] }) {
  return (
    <div className="space-y-4">
      {/* Referee */}
      {analysis?.referee && <RefereeCard analysis={analysis} />}

      {/* Key Missing Players */}
      {analysis?.keyMissingPlayers && analysis.keyMissingPlayers.length > 0 && (
        <InjuryReport analysis={analysis} />
      )}

      {/* Insight Notes */}
      {insights?.notes && insights.notes.length > 0 && (
        <InsightsList notes={insights.notes} />
      )}

      {/* Sim Edge Note */}
      {insights?.simEdgeNote && (
        <div className="flex items-center gap-2 text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-emerald-400">{insights.simEdgeNote}</span>
        </div>
      )}

      {/* Corner & Card data */}
      {(analysis?.cornerData || analysis?.cardData) && (
        <div className="grid grid-cols-2 gap-3">
          {analysis?.cornerData && (
            <div className="bg-zinc-800/40 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 font-medium mb-1">Korner Ort.</p>
              <p className="text-sm font-bold text-zinc-300">{analysis.cornerData.totalAvg.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Ü8.5: %{analysis.cornerData.overProb.toFixed(0)}</p>
            </div>
          )}
          {analysis?.cardData && (
            <div className="bg-zinc-800/40 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 font-medium mb-1">Kart Ort.</p>
              <p className="text-sm font-bold text-zinc-300">{analysis.cardData.totalAvg.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Ü3.5: %{analysis.cardData.overProb.toFixed(0)}</p>
            </div>
          )}
        </div>
      )}

      {/* Match Similarity */}
      {analysis?.similarity && (
        <div className="bg-zinc-800/40 rounded-lg p-3">
          <p className="text-[10px] text-zinc-500 font-medium mb-1">Benzer Maç (%{analysis.similarity.similarityScore})</p>
          <p className="text-xs text-zinc-300 font-medium">{analysis.similarity.similarMatch}</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Sonuç: {analysis.similarity.result}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {analysis.similarity.features.map((f, i) => (
              <span key={i} className="text-[9px] bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded">{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Stat Bar helper ----
function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500", red: "bg-red-500", green: "bg-green-500", amber: "bg-amber-500",
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", colorMap[color] || "bg-zinc-500")} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[10px] font-medium text-zinc-400 w-6 text-right">{value}</span>
    </div>
  );
}

// ============================================
// Crazy Picks Section
// ============================================

function CrazyPicksSection({
  results, summary, loading, error, onRetry,
}: {
  results: CrazyPickResult[];
  summary: { totalMatches: number; totalPicks: number; avgEdge: number; bestEdge: number; totalStake: number } | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [expandedCrazy, setExpandedCrazy] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-3" />
        <h3 className="font-semibold text-white mb-1">Hata</h3>
        <p className="text-sm text-zinc-400 mb-4">{error}</p>
        <button onClick={onRetry} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 transition-colors">
          Tekrar Dene
        </button>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-16 text-center">
        <Dices className="mx-auto h-12 w-12 text-zinc-600 mb-4" />
        <h3 className="font-semibold text-lg text-white mb-2">Sürpriz Tahmin Bulunamadı</h3>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Bugün kaotik maçlarda edge&apos;i yüksek exact score tahmini bulunamadı.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard icon={<Flame className="h-4 w-4 text-orange-500" />} label="Maç" value={summary.totalMatches.toString()} sub={`${summary.totalPicks} skor`} />
          <KpiCard icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} label="Ort. Edge" value={`%${summary.avgEdge.toFixed(1)}`} sub={`Max: %${summary.bestEdge.toFixed(1)}`} />
          <KpiCard icon={<Zap className="h-4 w-4 text-yellow-500" />} label="Stake" value={`${summary.totalStake}₺`} sub="50₺/maç" />
          <KpiCard icon={<Dices className="h-4 w-4 text-purple-500" />} label="Pick" value={summary.totalPicks.toString()} sub="Exact score" />
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
        <p className="text-zinc-400">
          <strong className="text-white">Yüksek Risk!</strong> Monte Carlo simülasyonunun piyasadan yüksek
          gördüğü kaotik skor tahminleri. Küçük stake.
        </p>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[55px_1fr_80px_80px_60px_1fr] items-center px-4 py-1.5 text-[10px] text-zinc-600 font-medium border-b border-zinc-800/50 bg-zinc-800/20 gap-x-2">
          <span>Saat</span>
          <span>Maç</span>
          <span className="text-center">Volatilite</span>
          <span className="text-center">Edge</span>
          <span className="text-center">Pick</span>
          <span>Lig</span>
        </div>

        {results.map((result) => {
          const isExp = expandedCrazy === result.match.fixtureId;
          const kickoffTime = new Date(result.match.kickoff).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={result.match.fixtureId} className="border-b border-zinc-800/40 last:border-b-0">
              <button
                onClick={() => setExpandedCrazy(isExp ? null : result.match.fixtureId)}
                className="w-full sm:grid sm:grid-cols-[55px_1fr_80px_80px_60px_1fr] flex flex-wrap items-center px-4 py-2.5 text-left gap-x-2 gap-y-1 hover:bg-zinc-800/30 transition-colors"
              >
                <span className="text-[11px] text-zinc-400">{kickoffTime}</span>
                <span className="text-[13px] text-zinc-200 font-medium truncate">
                  {result.match.homeTeam} - {result.match.awayTeam}
                </span>
                <div className="flex justify-center">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full",
                    result.match.volatilityScore >= 70 ? "bg-red-500/15 text-red-400" :
                    result.match.volatilityScore >= 50 ? "bg-orange-500/15 text-orange-400" :
                    "bg-yellow-500/15 text-yellow-400"
                  )}>
                    {result.match.volatilityScore}
                  </span>
                </div>
                <div className="flex justify-center">
                  <span className="text-[11px] font-bold text-emerald-400">%{result.bestEdge.toFixed(1)}</span>
                </div>
                <div className="flex justify-center">
                  <span className="text-[10px] font-medium bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded">
                    {result.picks.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 truncate">{result.match.league}</span>
                  {isExp ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                </div>
              </button>

              {isExp && (
                <div className="border-t border-zinc-800 p-4 space-y-3">
                  {result.match.chaosFactors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {result.match.chaosFactors.map((f, i) => (
                        <span key={i} className="text-[10px] bg-zinc-800 text-zinc-400 rounded-full px-2.5 py-1">{f}</span>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-2">
                    {result.picks.map((pick, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 p-3 hover:bg-zinc-800/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-indigo-400">{pick.score}</span>
                          <div>
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-zinc-500">Sim: %{pick.simProbability.toFixed(2)}</span>
                              <span className="text-zinc-500">Piyasa: %{pick.impliedProbability.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-medium text-emerald-400">Edge: %{pick.edge.toFixed(1)}</span>
                              <span className="text-[10px] text-zinc-500">{pick.totalGoals} gol</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-orange-400">{pick.bookmakerOdds.toFixed(2)}</p>
                          <p className="text-[10px] text-zinc-500">oran</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800">
                    <span>Stake: {result.stake}₺ (sabit)</span>
                    <span>Ort. Edge: %{result.avgEdge.toFixed(1)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-zinc-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>
    </div>
  );
}
