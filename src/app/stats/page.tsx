"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  Trophy,
  Target,
  BarChart3,
  RefreshCw,
  Gem,
  Activity,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Percent,
  DollarSign,
  History,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Flame,
  Zap,
  Award,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = "performance" | "history";

// ---- Interfaces ----
interface StatsData {
  overview: {
    totalPredictions: number;
    pending: number;
    settled: number;
    won: number;
    lost: number;
    hitRate: number;
    avgOdds: number;
    avgWonOdds: number;
    avgConfidence: number;
    roi: number;
  };
  valueBets: {
    total: number;
    settled: number;
    won: number;
    hitRate: number;
  };
  leagueStats: Array<{
    league: string;
    total: number;
    won: number;
    lost: number;
    pending: number;
    avgOdds: number;
    hitRate: number;
  }>;
  pickStats: Array<{
    pick: string;
    total: number;
    won: number;
    lost: number;
    avgOdds: number;
    hitRate: number;
  }>;
  dailyStats: Array<{
    date: string;
    total: number;
    won: number;
    lost: number;
    hitRate: number;
  }>;
  tweetStats: {
    total: number;
    dailyPicks: number;
    coupons: number;
    liveAlerts: number;
    results: number;
    recentTweets: Array<{
      id: string;
      type: string;
      content: string;
      createdAt: string;
    }>;
  };
  mlModel: {
    trainedAt: string;
    recordCount: number;
    version: string;
    marketCount: number;
    markets: Array<{
      market: string;
      accuracy: number;
      auc: number;
    }>;
  } | null;
}

interface HistoryPrediction {
  id: string;
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  pick: string;
  odds: number;
  confidence: number;
  expectedValue: number;
  isValueBet: boolean;
  result: string;
  analysisSummary: string;
  createdAt: string;
}

interface HistoryData {
  kpis: {
    total: number;
    won: number;
    lost: number;
    pending: number;
    hitRate: number;
    avgOdds: number;
    avgWonOdds: number;
    avgConfidence: number;
    roi: number;
    highConfHitRate: number;
    streak: { count: number; type: string };
    highestOddsWon: {
      homeTeam: string;
      awayTeam: string;
      pick: string;
      odds: number;
      kickoff: string;
    } | null;
  };
  filters: {
    leagues: string[];
    picks: string[];
  };
  predictions: HistoryPrediction[];
  pagination: {
    page: number;
    limit: number;
    totalFiltered: number;
    totalPages: number;
  };
}

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("performance");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  // History state
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historySort, setHistorySort] = useState("kickoff");
  const [historySortDir, setHistorySortDir] = useState("desc");
  const [historyPickFilter, setHistoryPickFilter] = useState("");
  const [historyLeagueFilter, setHistoryLeagueFilter] = useState("");

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (!data.error) setStats(data);
    } catch (error) {
      console.error("Stats yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        filter: historyFilter,
        page: historyPage.toString(),
        limit: "20",
        sort: historySort,
        dir: historySortDir,
        ...(historySearch && { search: historySearch }),
        ...(historyPickFilter && { pick: historyPickFilter }),
        ...(historyLeagueFilter && { league: historyLeagueFilter }),
      });
      const res = await fetch(`/api/stats/history?${params}`);
      const data = await res.json();
      if (!data.error) setHistory(data);
    } catch (error) {
      console.error("History yüklenemedi:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilter, historyPage, historySort, historySortDir, historySearch, historyPickFilter, historyLeagueFilter]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const handleFilterChange = (f: string) => {
    setHistoryFilter(f);
    setHistoryPage(1);
  };

  const handleSearchSubmit = () => {
    setHistoryPage(1);
    fetchHistory();
  };

  const toggleSort = (field: string) => {
    if (historySort === field) {
      setHistorySortDir(historySortDir === "desc" ? "asc" : "desc");
    } else {
      setHistorySort(field);
      setHistorySortDir("desc");
    }
    setHistoryPage(1);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Performans Takibi
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Yükleniyor...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="h-4 w-16 bg-muted rounded mb-3" />
              <div className="h-8 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const o = stats?.overview;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Performans Takibi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tahmin performansı ve geçmiş karşılaşmalar
          </p>
        </div>
        <button
          onClick={activeTab === "performance" ? fetchStats : fetchHistory}
          disabled={loading || historyLoading}
          className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${(loading || historyLoading) ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          onClick={() => setActiveTab("performance")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
            activeTab === "performance"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <BarChart3 className="h-4 w-4" />
          Performans
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
            activeTab === "history"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <History className="h-4 w-4" />
          Geçmiş Tahminler
        </button>
      </div>

      {/* TAB: Performance */}
      {activeTab === "performance" && (
        loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                <div className="h-4 w-16 bg-muted rounded mb-3" />
                <div className="h-8 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : (
          <PerformanceTab stats={stats} />
        )
      )}

      {/* TAB: History */}
      {activeTab === "history" && (
        <HistoryTab
          data={history}
          loading={historyLoading}
          filter={historyFilter}
          search={historySearch}
          sort={historySort}
          sortDir={historySortDir}
          pickFilter={historyPickFilter}
          leagueFilter={historyLeagueFilter}
          page={historyPage}
          onFilterChange={handleFilterChange}
          onSearchChange={setHistorySearch}
          onSearchSubmit={handleSearchSubmit}
          onSortToggle={toggleSort}
          onPickFilterChange={(v) => { setHistoryPickFilter(v); setHistoryPage(1); }}
          onLeagueFilterChange={(v) => { setHistoryLeagueFilter(v); setHistoryPage(1); }}
          onPageChange={setHistoryPage}
        />
      )}
    </div>
  );
}

// ==========================================
// Performance Tab
// ==========================================
function PerformanceTab({ stats }: { stats: StatsData | null }) {
  const o = stats?.overview;

  // Sort leagues by hit rate (desc), min 3 settled
  const rankedLeagues = [...(stats?.leagueStats || [])]
    .filter(ls => (ls.won + ls.lost) >= 3)
    .sort((a, b) => b.hitRate - a.hitRate);

  // Sort pick types by hit rate (desc), min 3 settled
  const rankedPicks = [...(stats?.pickStats || [])]
    .filter(ps => (ps.won + ps.lost) >= 3)
    .sort((a, b) => b.hitRate - a.hitRate);
  
  return (
    <div className="space-y-6">
      {/* Overview KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Trophy className="h-5 w-5 text-primary" />} label="Toplam" value={`${o?.totalPredictions || 0}`} color="text-foreground" />
        <MetricCard icon={<Target className="h-5 w-5" />} label="İsabet" value={`%${o?.hitRate || 0}`} color={getHitRateColor(o?.hitRate || 0)} />
        <MetricCard icon={<Percent className="h-5 w-5" />} label="ROI" value={`${(o?.roi || 0) >= 0 ? "+" : ""}${o?.roi || 0}%`} color={(o?.roi || 0) >= 0 ? "text-green-500" : "text-red-500"} />
        <MetricCard icon={<BarChart3 className="h-5 w-5" />} label="Ort. Odds" value={(o?.avgOdds || 0).toFixed(2)} color="text-blue-400" />
      </div>

      {/* W/L/P summary bar */}
      {o && o.totalPredictions > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Kazanan <strong className="text-green-500">{o.won}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-xs text-muted-foreground">Kaybeden <strong className="text-red-500">{o.lost}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              <span className="text-xs text-muted-foreground">Bekleyen <strong className="text-yellow-500">{o.pending}</strong></span>
            </div>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted/50">
            {o.won > 0 && <div className="bg-green-500" style={{ width: `${(o.won / o.totalPredictions) * 100}%` }} />}
            {o.lost > 0 && <div className="bg-red-500" style={{ width: `${(o.lost / o.totalPredictions) * 100}%` }} />}
            {o.pending > 0 && <div className="bg-yellow-500/60" style={{ width: `${(o.pending / o.totalPredictions) * 100}%` }} />}
          </div>
        </div>
      )}

      {/* League & Pick Reliability — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* League Reliability Ranking */}
        {rankedLeagues.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-primary" />
              Lig Güvenilirliği
            </h3>
            <p className="text-[10px] text-muted-foreground mb-4">İsabet oranına göre sıralanmış (min. 3 sonuçlanan)</p>
            <div className="space-y-2">
              {rankedLeagues.map((ls, i) => {
                const settled = ls.won + ls.lost;
                const isReliable = ls.hitRate >= 60 && settled >= 5;
                return (
                  <div key={ls.league} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center shrink-0",
                        i === 0 ? "bg-amber-500/15 text-amber-400" :
                        i === 1 ? "bg-zinc-400/15 text-zinc-400" :
                        i === 2 ? "bg-orange-500/15 text-orange-400" :
                        "bg-muted/50 text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium truncate flex-1">{ls.league}</span>
                      {isReliable && (
                        <span className="text-[9px] font-bold bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full shrink-0">
                          GÜVENİLİR
                        </span>
                      )}
                      <span className={cn("text-xs font-bold shrink-0", getHitRateColor(ls.hitRate))}>
                        %{ls.hitRate.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-7">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            ls.hitRate >= 65 ? "bg-green-500" : ls.hitRate >= 50 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${ls.hitRate}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-right">
                        {ls.won}W {ls.lost}L
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pick Type Reliability Ranking */}
        {rankedPicks.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-primary" />
              Bahis Tipi Güvenilirliği
            </h3>
            <p className="text-[10px] text-muted-foreground mb-4">Hangi marketlerde başarılıyız? (min. 3 sonuçlanan)</p>
            <div className="space-y-2">
              {rankedPicks.map((ps, i) => {
                const settled = ps.won + ps.lost;
                const isReliable = ps.hitRate >= 60 && settled >= 5;
                return (
                  <div key={ps.pick} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center shrink-0",
                        i === 0 ? "bg-amber-500/15 text-amber-400" :
                        i === 1 ? "bg-zinc-400/15 text-zinc-400" :
                        i === 2 ? "bg-orange-500/15 text-orange-400" :
                        "bg-muted/50 text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium flex-1">{ps.pick}</span>
                      {isReliable && (
                        <span className="text-[9px] font-bold bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full shrink-0">
                          GÜVENİLİR
                        </span>
                      )}
                      <span className={cn("text-xs font-bold shrink-0", getHitRateColor(ps.hitRate))}>
                        %{ps.hitRate.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-7">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            ps.hitRate >= 65 ? "bg-green-500" : ps.hitRate >= 50 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${ps.hitRate}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-right">
                        {ps.won}W {ps.lost}L
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Value Bet Stats */}
      {stats?.valueBets && stats.valueBets.total > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Gem className="h-4 w-4 text-yellow-500" />
            Value Bet Performansı
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold">{stats.valueBets.total}</div>
              <div className="text-[10px] text-muted-foreground">Toplam</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-green-500">{stats.valueBets.won}</div>
              <div className="text-[10px] text-muted-foreground">Kazanan</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold">{stats.valueBets.settled}</div>
              <div className="text-[10px] text-muted-foreground">Sonuçlanan</div>
            </div>
            <div className="text-center">
              <div className={cn("text-xl font-bold", getHitRateColor(stats.valueBets.hitRate))}>
                %{stats.valueBets.hitRate}
              </div>
              <div className="text-[10px] text-muted-foreground">İsabet</div>
            </div>
          </div>
        </div>
      )}

      {/* ML Model Insights */}
      {stats?.mlModel && (
        <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-indigo-400" />
              ML Model
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>v{stats.mlModel.version}</span>
              <span>·</span>
              <span>{stats.mlModel.recordCount} kayıt</span>
              <span>·</span>
              <span>{new Date(stats.mlModel.trainedAt).toLocaleDateString("tr-TR")}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {stats.mlModel.markets.map((m) => (
              <div key={m.market} className="bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2">
                <p className="text-[10px] text-muted-foreground truncate">{m.market}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={cn(
                    "text-sm font-bold",
                    m.accuracy >= 65 ? "text-green-400" : m.accuracy >= 50 ? "text-yellow-400" : "text-red-400"
                  )}>
                    %{(m.accuracy * 100).toFixed(0)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">AUC {(m.auc * 100).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Performance */}
      {stats?.dailyStats && stats.dailyStats.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-primary" />
            Günlük Performans
          </h3>
          <div className="space-y-1.5">
            {stats.dailyStats.map((day) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-16 text-[11px] tabular-nums">{formatDate(day.date)}</span>
                <div className="flex-1 h-4 bg-muted/30 rounded-full overflow-hidden flex">
                  {day.won > 0 && (
                    <div className="h-full bg-green-500/80 flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ width: `${(day.won / day.total) * 100}%` }}>{day.won}</div>
                  )}
                  {day.lost > 0 && (
                    <div className="h-full bg-red-500/60 flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ width: `${(day.lost / day.total) * 100}%` }}>{day.lost}</div>
                  )}
                </div>
                <span className={cn("text-[11px] font-bold w-10 text-right tabular-nums", getHitRateColor(day.hitRate))}>
                  %{day.hitRate.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data */}
      {(!stats || stats.overview.totalPredictions === 0) && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Henüz Veri Yok</h3>
          <p className="text-xs text-muted-foreground">
            Cron job&apos;lar çalışmaya başladığında veriler burada görünecek.
          </p>
        </div>
      )}
    </div>
  );
}

// ==========================================
// History Tab
// ==========================================
function HistoryTab({
  data,
  loading,
  filter,
  search,
  sort,
  sortDir,
  pickFilter,
  leagueFilter,
  page,
  onFilterChange,
  onSearchChange,
  onSearchSubmit,
  onSortToggle,
  onPickFilterChange,
  onLeagueFilterChange,
  onPageChange,
}: {
  data: HistoryData | null;
  loading: boolean;
  filter: string;
  search: string;
  sort: string;
  sortDir: string;
  pickFilter: string;
  leagueFilter: string;
  page: number;
  onFilterChange: (f: string) => void;
  onSearchChange: (s: string) => void;
  onSearchSubmit: () => void;
  onSortToggle: (field: string) => void;
  onPickFilterChange: (v: string) => void;
  onLeagueFilterChange: (v: string) => void;
  onPageChange: (p: number) => void;
}) {
  const kpis = data?.kpis;
  const predictions = data?.predictions || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Trophy className="h-5 w-5 text-primary" />}
          label="Tüm Bahisler"
          value={kpis?.total.toLocaleString("tr-TR") || "0"}
          loading={loading}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
          label="Toplam Kazanma"
          value={kpis?.won.toLocaleString("tr-TR") || "0"}
          accent="text-green-500"
          loading={loading}
        />
        <KpiCard
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          label="Toplam Kaybetme"
          value={kpis?.lost.toLocaleString("tr-TR") || "0"}
          accent="text-red-500"
          loading={loading}
        />
        <KpiCard
          icon={<Target className="h-5 w-5 text-emerald-500" />}
          label="Kazanma Oranı"
          value={`${kpis?.hitRate || 0}%`}
          accent={getHitRateColor(kpis?.hitRate || 0)}
          loading={loading}
        />
      </div>

      {/* Extra KPIs Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Percent className="h-5 w-5 text-blue-500" />}
          label="ROI"
          value={`${(kpis?.roi || 0) >= 0 ? "+" : ""}${kpis?.roi || 0}%`}
          accent={(kpis?.roi || 0) >= 0 ? "text-green-500" : "text-red-500"}
          loading={loading}
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-yellow-500" />}
          label="Ort. Odds"
          value={(kpis?.avgOdds || 0).toFixed(2)}
          loading={loading}
        />
        <KpiCard
          icon={<Flame className="h-5 w-5 text-orange-500" />}
          label="Seri"
          value={kpis?.streak ? `${kpis.streak.count} ${kpis.streak.type === "won" ? "Kazanma" : "Kayıp"}` : "-"}
          accent={kpis?.streak?.type === "won" ? "text-green-500" : "text-red-500"}
          loading={loading}
        />
        <KpiCard
          icon={<Zap className="h-5 w-5 text-purple-500" />}
          label="Yüksek Güven İsabeti"
          value={`${kpis?.highConfHitRate || 0}%`}
          sub="70+ güven"
          accent={getHitRateColor(kpis?.highConfHitRate || 0)}
          loading={loading}
        />
      </div>

      {/* Highest Odds Won Banner */}
      {kpis?.highestOddsWon && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-center gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-yellow-500/10 shrink-0">
            <Award className="h-6 w-6 text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">En Yüksek Oranlı Kazanan Tahmin</p>
            <p className="font-semibold truncate">
              {kpis.highestOddsWon.homeTeam} - {kpis.highestOddsWon.awayTeam}
            </p>
            <p className="text-xs text-muted-foreground">
              {kpis.highestOddsWon.pick} •{" "}
              {new Date(kpis.highestOddsWon.kickoff).toLocaleDateString("tr-TR")}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-yellow-500">{kpis.highestOddsWon.odds.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">oran</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "Bütün Tahminler", count: kpis?.total },
          { value: "won", label: "Kazananlar", count: kpis?.won },
          { value: "lost", label: "Kaybedenler", count: kpis?.lost },
          { value: "pending", label: "Bekleyenler", count: kpis?.pending },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-all border",
              filter === f.value
                ? "bg-primary/10 text-primary border-primary/20"
                : "text-muted-foreground border-border hover:text-foreground hover:bg-muted/50"
            )}
          >
            {f.label}
            {f.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">({f.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search + Filters Row */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Takım veya lig ara..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
            className="bg-transparent text-sm outline-none flex-1"
          />
        </div>

        {/* Pick Type Filter */}
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={pickFilter}
            onChange={(e) => onPickFilterChange(e.target.value)}
            className="bg-transparent text-sm outline-none cursor-pointer"
          >
            <option value="">Tüm Tipler</option>
            {data?.filters.picks.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* League Filter */}
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <select
            value={leagueFilter}
            onChange={(e) => onLeagueFilterChange(e.target.value)}
            className="bg-transparent text-sm outline-none cursor-pointer max-w-[150px]"
          >
            <option value="">Tüm Ligler</option>
            {data?.filters.leagues.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Sort Buttons */}
        <div className="flex items-center gap-1">
          {[
            { field: "kickoff", label: "Tarih" },
            { field: "odds", label: "Oran" },
            { field: "confidence", label: "Güven" },
          ].map((s) => (
            <button
              key={s.field}
              onClick={() => onSortToggle(s.field)}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all border",
                sort === s.field
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {s.label}
              {sort === s.field && (
                <ArrowUpDown className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Predictions Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : predictions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {predictions.map((pred) => (
            <HistoryCard key={pred.id} prediction={pred} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <History className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Sonuç Bulunamadı</h3>
          <p className="text-sm text-muted-foreground">
            Bu filtrelere uygun tahmin bulunamadı. Filtreleri değiştirin.
          </p>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.totalFiltered} sonuçtan {(page - 1) * pagination.limit + 1}-
            {Math.min(page * pagination.limit, pagination.totalFiltered)} gösteriliyor
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-lg border border-border p-2 text-sm disabled:opacity-30 hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium px-2">
              {page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pagination.totalPages}
              className="rounded-lg border border-border p-2 text-sm disabled:opacity-30 hover:bg-muted/50 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- History Card ----
function HistoryCard({ prediction }: { prediction: HistoryPrediction }) {
  const kickoffDate = new Date(prediction.kickoff);
  const dateStr = kickoffDate.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = kickoffDate.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const resultConfig = {
    won: { label: "Kazanç", class: "text-green-500 bg-green-500/10 border-green-500/20" },
    lost: { label: "Kayıp", class: "text-red-500 bg-red-500/10 border-red-500/20" },
    pending: { label: "Bekliyor", class: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" },
    void: { label: "İptal", class: "text-muted-foreground bg-muted/50 border-border" },
  };
  const rc = resultConfig[prediction.result as keyof typeof resultConfig] || resultConfig.pending;

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:bg-muted/20 transition-colors">
      {/* Top Row: Teams + Result */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">
            {prediction.homeTeam} - {prediction.awayTeam}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {prediction.league}
          </p>
        </div>
        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full border shrink-0", rc.class)}>
          {rc.label}
        </span>
      </div>

      {/* Date */}
      <p className="text-xs text-primary mb-3">{dateStr} {timeStr}</p>

      {/* Pick + Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground">Tahmin</p>
            <p className="text-sm font-semibold">{prediction.pick}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Oran</p>
            <p className="text-sm font-bold text-primary">{prediction.odds.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Güven</p>
            <p className={cn("text-sm font-semibold", getHitRateColor(prediction.confidence))}>
              %{prediction.confidence}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {prediction.isValueBet && (
            <span className="text-[10px] font-medium bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
              VALUE
            </span>
          )}
          {prediction.expectedValue > 0 && (
            <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">
              EV +{prediction.expectedValue.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- KPI Card ----
function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-16 bg-muted rounded mb-3" />
        <div className="h-8 w-20 bg-muted rounded" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ---- Helper Components ----

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
    </div>
  );
}

function getHitRateColor(rate: number): string {
  if (rate >= 65) return "text-green-500";
  if (rate >= 50) return "text-yellow-500";
  return "text-red-500";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}
