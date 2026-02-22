"use client";

import { useEffect, useState } from "react";
import { MatchCard } from "@/components/match-card";
import { LeagueFilter } from "@/components/league-filter";
import { PreferenceFilter } from "@/components/preference-filter";
import { CouponSidebar } from "@/components/coupon-sidebar";
import { SystemPerformanceWidget } from "@/components/system-performance";
import { MatchCardSkeleton } from "@/components/skeletons";
import { useAppStore, MARKET_PICK_MAP } from "@/lib/store";
import type { MatchPrediction, CrazyPickResult } from "@/types";
import { Trophy, Calendar, RefreshCw, Dices, Flame, TrendingUp, Zap, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

type TabType = "predictions" | "crazy-picks";

export function PredictionsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(
    searchParams.get("tab") === "crazy" ? "crazy-picks" : "predictions"
  );
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);

  // Sync tab with URL params
  useEffect(() => {
    const tab = searchParams.get("tab");
    setActiveTab(tab === "crazy" ? "crazy-picks" : "predictions");
  }, [searchParams]);
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<string[]>(() => [new Date().toISOString().split("T")[0]]);
  const selectedLeagues = useAppStore((s) => s.selectedLeagues);

  // Crazy Picks state
  const [crazyPicks, setCrazyPicks] = useState<CrazyPickResult[]>([]);
  const [crazyLoading, setCrazyLoading] = useState(false);
  const [crazyError, setCrazyError] = useState<string | null>(null);
  const [crazySummary, setCrazySummary] = useState<{
    totalMatches: number;
    totalPicks: number;
    avgEdge: number;
    bestEdge: number;
    totalStake: number;
  } | null>(null);

  // Date helpers
  const formatDateStr = (d: Date) => d.toISOString().split("T")[0];
  const today = formatDateStr(new Date());

  const getWeekendDates = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    const dates: string[] = [];

    // Cuma, Cumartesi, Pazar’ı bul (bu haftaki veya sonraki)
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      const dow = d.getDay();
      if (dow === 5 || dow === 6 || dow === 0) { // Cuma, Cmt, Pazar
        dates.push(formatDateStr(d));
      }
      if (dates.length >= 3) break;
    }
    return dates;
  };

  const shiftDates = (direction: number) => {
    setSelectedDates((prev) => {
      return prev.map((d) => {
        const dt = new Date(d);
        dt.setDate(dt.getDate() + direction);
        return formatDateStr(dt);
      });
    });
  };

  const toggleDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) {
        // En az 1 tarih olmalı
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
      if (data.source === "fallback" && data.message) {
        setApiMessage(data.message);
      }
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
      if (data.error) {
        setCrazyError(data.error);
      } else {
        setCrazyPicks(data.results || []);
        setCrazySummary(data.summary || null);
      }
    } catch {
      setCrazyError("Sürpriz tahminler yüklenemedi");
    } finally {
      setCrazyLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, [selectedDates]);

  // Lazy load crazy picks when tab first opens
  useEffect(() => {
    if (activeTab === "crazy-picks" && crazyPicks.length === 0 && !crazyLoading && !crazyError) {
      fetchCrazyPicks();
    }
  }, [activeTab]);

  const filters = useAppStore((s) => s.filters);

  // Lig filtresi
  const leagueFiltered =
    selectedLeagues.length > 0
      ? predictions.filter((p) => selectedLeagues.includes(p.league.id))
      : predictions;

  // Bitmiş maçları filtrele (FT, AET, PEN, AWD, WO, CANC, ABD, PST statusleri)
  const FINISHED_STATUSES = ["FT", "AET", "PEN", "AWD", "WO", "CANC", "ABD"];
  const activeMatches = leagueFiltered.filter((p) => {
    // fixture yoksa kickoff saatine bak
    const fixtureStatus = p.fixture?.fixture?.status?.short;
    if (fixtureStatus && FINISHED_STATUSES.includes(fixtureStatus)) return false;
    // Kickoff'u geçmiş ve fixture bilgisi olmayan maçları da kontrol et
    if (!fixtureStatus && p.kickoff) {
      const kickoffTime = new Date(p.kickoff).getTime();
      const now = Date.now();
      // 2 saatten fazla geçmişse muhtemelen bitmiştir
      if (now - kickoffTime > 2 * 60 * 60 * 1000) return false;
    }
    return true;
  });

  // Tercih filtreleri uygula
  const filteredPredictions = activeMatches
    .map((p) => {
      // Pick seviyesinde filtrele
      let filteredPicks = p.picks || [];

      // Market filtresi
      if (filters.market !== "all") {
        const allowedPicks = MARKET_PICK_MAP[filters.market];
        if (filters.market === "score") {
          filteredPicks = filteredPicks.filter((pick) => pick.type.startsWith("CS "));
        } else if (allowedPicks.length > 0) {
          filteredPicks = filteredPicks.filter((pick) => allowedPicks.includes(pick.type));
        }
      }

      // Güven filtresi
      if (filters.minConfidence > 0) {
        filteredPicks = filteredPicks.filter((pick) => pick.confidence >= filters.minConfidence);
      }

      // Oran filtresi
      if (filters.minOdds > 1.0 || filters.maxOdds < 50.0) {
        filteredPicks = filteredPicks.filter(
          (pick) => pick.odds >= filters.minOdds && pick.odds <= filters.maxOdds
        );
      }

      // Value bet filtresi
      if (filters.valueBetsOnly) {
        filteredPicks = filteredPicks.filter((pick) => pick.isValueBet);
      }

      if (filteredPicks.length === 0) return null;
      return { ...p, picks: filteredPicks };
    })
    .filter(Boolean) as typeof predictions;

  // Sıralama: Önce kickoff saatine göre (yakın olan önce), sonra tercih filtresine göre
  const sortedPredictions = [...filteredPredictions].sort((a, b) => {
    // Öncelik 1: Kickoff saati (erken olan önce)
    const kickoffA = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const kickoffB = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    if (kickoffA !== kickoffB) return kickoffA - kickoffB;

    // Aynı saatteki maçları tercih filtresine göre sırala
    const pickA = a.picks[0];
    const pickB = b.picks[0];
    if (!pickA || !pickB) return 0;

    switch (filters.sortBy) {
      case "confidence":
        return pickB.confidence - pickA.confidence;
      case "odds":
        return pickB.odds - pickA.odds;
      case "ev":
        return (pickB.expectedValue || 0) - (pickA.expectedValue || 0);
      default:
        return 0;
    }
  });

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Günün Tahminleri
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI destekli maç analizi ve tahminler
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={activeTab === "predictions" ? fetchPredictions : fetchCrazyPicks}
              disabled={loading || crazyLoading}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${(loading || crazyLoading) ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <button
            onClick={() => setActiveTab("predictions")}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
              activeTab === "predictions"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Trophy className="h-4 w-4" />
            Tahminler
            {predictions.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {predictions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("crazy-picks")}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
              activeTab === "crazy-picks"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Dices className="h-4 w-4" />
            Sürpriz Tahminler
            {crazyPicks.length > 0 && (
              <span className="ml-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-500">
                {crazyPicks.length}
              </span>
            )}
          </button>
        </div>

        {/* Date Picker Bar */}
        {activeTab === "predictions" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            {/* Preset buttons */}
            <button
              onClick={() => setPreset("today")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                selectedDates.length === 1 && selectedDates[0] === today
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Bugün
            </button>
            <button
              onClick={() => setPreset("tomorrow")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                selectedDates.length === 1 && selectedDates[0] === formatDateStr((() => { const t = new Date(); t.setDate(t.getDate() + 1); return t; })())
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Yarın
            </button>
            <button
              onClick={() => setPreset("weekend")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                selectedDates.length >= 2
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Hafta Sonu
            </button>

            <div className="mx-2 h-6 w-px bg-border" />

            {/* Navigation arrows */}
            <button
              onClick={() => shiftDates(-1)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Önceki gün"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Selected date chips */}
            <div className="flex flex-wrap gap-1.5">
              {selectedDates.map((d) => {
                const dt = new Date(d + "T12:00:00");
                const dayName = dt.toLocaleDateString("tr-TR", { weekday: "short" });
                const dayMonth = dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
                return (
                  <button
                    key={d}
                    onClick={() => toggleDate(d)}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Calendar className="h-3 w-3" />
                    {dayName} {dayMonth}
                    {selectedDates.length > 1 && <span className="ml-0.5 text-primary/50">×</span>}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => shiftDates(1)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Sonraki gün"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Custom date picker */}
            <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                onChange={(e) => {
                  if (e.target.value) toggleDate(e.target.value);
                }}
                className="bg-transparent text-xs outline-none w-[110px]"
              />
            </div>
          </div>
        )}

        {/* TAB: Predictions */}
        {activeTab === "predictions" && (
          <>
            {apiMessage && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                <p className="text-sm text-yellow-500">{apiMessage}</p>
              </div>
            )}
            <LeagueFilter predictions={predictions} />
            <PreferenceFilter />
            <SystemPerformanceWidget />
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <MatchCardSkeleton key={i} />)
              ) : sortedPredictions.length > 0 ? (
                sortedPredictions.map((prediction) => (
                  <MatchCard key={prediction.fixtureId} prediction={prediction} />
                ))
              ) : (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <Trophy className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">
                    {predictions.length > 0 ? "Filtreye Uygun Tahmin Yok" : "Tahmin Bulunamadı"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {predictions.length > 0
                      ? "Filtre ayarlarını değiştirip tekrar deneyin."
                      : "Bu tarih için henüz tahmin bulunmuyor. Farklı bir tarih deneyin."}
                  </p>
                </div>
              )}
            </div>
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
      <div className="hidden md:block w-80 shrink-0">
        <div className="sticky top-20">
          <CouponSidebar />
        </div>
      </div>
    </div>
  );
}

// ---- Crazy Picks Section ----
function CrazyPicksSection({
  results,
  summary,
  loading,
  error,
  onRetry,
}: {
  results: CrazyPickResult[];
  summary: { totalMatches: number; totalPicks: number; avgEdge: number; bestEdge: number; totalStake: number } | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-3" />
        <h3 className="font-semibold mb-1">Hata</h3>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <Dices className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-2">Sürpriz Tahmin Bulunamadı</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Bugün kaotik maçlarda edge&apos;i yüksek exact score tahmini bulunamadı.
          Monte Carlo simülasyonu piyasadan anlamlı bir fark görmedi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={<Flame className="h-5 w-5 text-orange-500" />}
            label="Maç"
            value={summary.totalMatches.toString()}
            sub={`${summary.totalPicks} skor tahmini`}
          />
          <KpiCard
            icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
            label="Ort. Edge"
            value={`%${summary.avgEdge.toFixed(1)}`}
            sub={`En iyi: %${summary.bestEdge.toFixed(1)}`}
          />
          <KpiCard
            icon={<Zap className="h-5 w-5 text-yellow-500" />}
            label="Toplam Stake"
            value={`${summary.totalStake} ₺`}
            sub="Sabit 50₺/maç"
          />
          <KpiCard
            icon={<Dices className="h-5 w-5 text-purple-500" />}
            label="Toplam Pick"
            value={summary.totalPicks.toString()}
            sub="Exact score"
          />
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Yüksek Risk!</strong> Bu tahminler Monte Carlo simülasyonunun
          piyasadan daha yüksek gördüğü kaotik skor tahminleridir. Küçük stake ile oynayın.
        </p>
      </div>

      {/* Match Cards */}
      {results.map((result) => (
        <CrazyMatchCard key={result.match.fixtureId} result={result} />
      ))}
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function CrazyMatchCard({ result }: { result: CrazyPickResult }) {
  const [expanded, setExpanded] = useState(false);
  const kickoffTime = new Date(result.match.kickoff).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const volatilityColor =
    result.match.volatilityScore >= 70
      ? "text-red-500 bg-red-500/10"
      : result.match.volatilityScore >= 50
        ? "text-orange-500 bg-orange-500/10"
        : "text-yellow-500 bg-yellow-500/10";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{kickoffTime}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{result.match.league}</p>
          </div>
          <div>
            <p className="font-semibold text-sm">
              {result.match.homeTeam} - {result.match.awayTeam}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", volatilityColor)}>
                Volatilite: {result.match.volatilityScore}
              </span>
              <span className="text-[10px] text-emerald-500 font-medium">
                Edge: %{result.bestEdge.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-lg">
            {result.picks.length} skor
          </span>
          <span className="text-muted-foreground text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {/* Chaos Factors */}
          {result.match.chaosFactors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.match.chaosFactors.map((f, i) => (
                <span key={i} className="text-[11px] bg-muted rounded-full px-2.5 py-1">
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Score Picks */}
          <div className="grid gap-2">
            {result.picks.map((pick, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-primary">{pick.score}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Sim: %{pick.simProbability.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Piyasa: %{pick.impliedProbability.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-medium text-emerald-500">
                        Edge: %{pick.edge.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {pick.totalGoals} gol
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-orange-500">{pick.bookmakerOdds.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">oran</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
            <span>Stake: {result.stake} ₺ (sabit)</span>
            <span>Ort. Edge: %{result.avgEdge.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
