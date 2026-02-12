"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
  Area,
  AreaChart,
} from "recharts";
import {
  RefreshCw,
  Brain,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Radio,
  Gauge,
  Activity,
  BarChart3,
  Zap,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Settings2,
  Sparkles,
  Dices,
  Flame,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Colors ----
const COLORS = {
  primary: "#3b82f6",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  purple: "#a855f7",
  cyan: "#06b6d4",
  pink: "#ec4899",
  slate: "#64748b",
  emerald: "#10b981",
  indigo: "#6366f1",
};

type TabKey = "live-tracker" | "simulation" | "roi" | "optimizer" | "crazy-picks";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("live-tracker");

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "live-tracker", label: "Live Tracker", icon: Radio },
    { key: "simulation", label: "Simülasyon", icon: Brain },
    { key: "roi", label: "ROI Dashboard", icon: TrendingUp },
    { key: "optimizer", label: "Self-Correction", icon: Settings2 },
    { key: "crazy-picks", label: "Crazy Picks", icon: Dices },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-indigo-400" />
          Advanced Dashboard
        </h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Live Tracker · Simülasyon · ROI · Self-Correction · Crazy Picks
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center",
              activeTab === key
                ? "bg-zinc-800 text-white shadow-lg"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "live-tracker" && <LiveTrackerTab />}
      {activeTab === "simulation" && <SimulationTab />}
      {activeTab === "roi" && <ROIDashboardTab />}
      {activeTab === "optimizer" && <OptimizerTab />}
      {activeTab === "crazy-picks" && <CrazyPicksTab />}
    </div>
  );
}

// ============================================
// Live Tracker Tab
// ============================================

function LiveTrackerTab() {
  const [data, setData] = useState<{
    threads: Array<{
      fixtureId: number;
      seedTweet: { tweet_id: string; content: string; created_at: string };
      replies: Array<{ tweet_id: string; type: string; content: string; created_at: string }>;
      status: string;
    }>;
    tweetTypeCounts: Record<string, number>;
    hourlyDistribution: Array<{ hour: string; count: number }>;
    totalTweets: number;
    activeThreads: number;
    settledThreads: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?section=live-tracker");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error("Live tracker error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <EmptyState message="Live tracker verisi yüklenemedi" />;

  const typeData = Object.entries(data.tweetTypeCounts).map(([type, count]) => ({
    type: formatTweetType(type),
    count,
    fill: getTweetTypeColor(type),
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={MessageCircle} label="Toplam Tweet" value={data.totalTweets} color="text-blue-400" />
        <KpiCard icon={Radio} label="Aktif Thread" value={data.activeThreads} color="text-green-400" />
        <KpiCard icon={CheckCircle2} label="Settle Edilen" value={data.settledThreads} color="text-emerald-400" />
        <KpiCard icon={Zap} label="Thread Sayısı" value={data.threads.length} color="text-purple-400" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tweet Tipi Dağılımı */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            Tweet Tipi Dağılımı
          </h3>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="type" stroke="#71717a" fontSize={11} tickLine={false} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
                <Bar dataKey="count" name="Adet" radius={[6, 6, 0, 0]}>
                  {typeData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-10">Henüz tweet yok</p>
          )}
        </div>

        {/* Saatlik Dağılım */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Saatlik Tweet Dağılımı (Rate Limit)
          </h3>
          {data.hourlyDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.hourlyDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="hour" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
                <ReferenceLine y={4} stroke={COLORS.danger} strokeDasharray="5 5" label={{ value: "Limit", fill: COLORS.danger, fontSize: 10 }} />
                <Area type="monotone" dataKey="count" name="Tweet" stroke={COLORS.cyan} fill={COLORS.cyan} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-10">Saatlik veri yok</p>
          )}
        </div>
      </div>

      {/* Active Threads */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-400" />
          Aktif Thread Zincirleri
        </h3>
        {data.threads.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">Henüz aktif thread yok. tweet-picks cron'u çalıştığında burada görünecek.</p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {data.threads.map((thread) => (
              <div key={thread.fixtureId} className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      thread.status === "tracking" ? "bg-green-400 animate-pulse" : "bg-zinc-500"
                    )} />
                    <span className="text-xs text-zinc-400">Fixture #{thread.fixtureId}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                    thread.status === "tracking" ? "bg-green-500/10 text-green-400" : "bg-zinc-600/30 text-zinc-400"
                  )}>
                    {thread.status === "tracking" ? "CANLI TAKİP" : "SETTLE EDİLDİ"}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 line-clamp-2 mb-2">{thread.seedTweet.content.replace("[THREAD SEED] ", "")}</p>
                <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                  <span>Seed: {new Date(thread.seedTweet.created_at).toLocaleString("tr-TR")}</span>
                  <span>Reply: {thread.replies.length}</span>
                  <a
                    href={`https://x.com/i/status/${thread.seedTweet.tweet_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Tweet →
                  </a>
                </div>
                {thread.replies.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-zinc-700 space-y-1">
                    {thread.replies.slice(0, 3).map((reply, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-medium",
                          reply.type === "live_alert" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          {reply.type === "live_alert" ? "⚡ CANLI" : "✅ SONUÇ"}
                        </span>
                        <span className="text-zinc-400 truncate">{reply.content.slice(0, 60)}...</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Simulation Visualizer Tab
// ============================================

function SimulationTab() {
  const [data, setData] = useState<{
    scoreDistribution: Array<{ score: string; predicted: number; actual: number }>;
    scatterData: Array<{
      confidence: number;
      simProb: number;
      result: string;
      pick: string;
      odds: number;
      match: string;
      actualScore: string | null;
      simTopScore: string | null;
    }>;
    recentPredictions: Array<{
      match: string;
      confidence: number;
      odds: number;
      pick: string;
      league: string;
    }>;
    totalValidated: number;
    scorelineHits: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?section=simulation");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error("Simulation error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <EmptyState message="Simülasyon verisi yüklenemedi" />;

  const hitRate = data.totalValidated > 0
    ? Math.round((data.scorelineHits / data.totalValidated) * 1000) / 10
    : 0;

  // Poisson-like distribution from score data
  const scoreChartData = data.scoreDistribution.slice(0, 15);

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Brain} label="Validasyon Kayıtları" value={data.totalValidated} color="text-purple-400" />
        <KpiCard icon={Target} label="Skor Tutma" value={`%${hitRate}`} color="text-green-400" />
        <KpiCard icon={BarChart3} label="Skor Dağılımı" value={data.scoreDistribution.length} color="text-blue-400" />
        <KpiCard icon={Activity} label="Son Tahminler" value={data.recentPredictions.length} color="text-cyan-400" />
      </div>

      {/* Score Distribution — Poisson Visualization */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          Poisson Skor Dağılımı: Tahmin vs Gerçek
        </h3>
        <p className="text-[11px] text-zinc-500 mb-4">Monte Carlo simülasyonunun öngördüğü vs gerçekleşen skor sıklıkları</p>
        {scoreChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={scoreChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="score" stroke="#71717a" fontSize={11} tickLine={false} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
              <Bar dataKey="predicted" name="Tahmin (Sim)" fill={COLORS.indigo} radius={[4, 4, 0, 0]} opacity={0.8} />
              <Bar dataKey="actual" name="Gerçekleşen" fill={COLORS.emerald} radius={[4, 4, 0, 0]} opacity={0.8} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-10">Henüz yeterli simülasyon verisi yok</p>
        )}
      </div>

      {/* Scatter: Confidence vs Sim Probability */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          Confidence vs Sim Olasılığı (Scatter)
        </h3>
        <p className="text-[11px] text-zinc-500 mb-4">Heuristic confidence ile Monte Carlo olasılığının korelasyonu. Yeşil = Kazanan, Kırmızı = Kaybeden</p>
        {data.scatterData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis type="number" dataKey="confidence" name="Confidence" stroke="#71717a" fontSize={12} domain={[40, 100]} unit="%" />
              <YAxis type="number" dataKey="simProb" name="Sim %" stroke="#71717a" fontSize={12} domain={[0, 100]} unit="%" />
              <ZAxis type="number" dataKey="odds" range={[30, 200]} name="Odds" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                formatter={(value: number, name: string) => [`${value}${name.includes("%") ? "" : ""}`, name]}
                labelFormatter={(label) => `Confidence: ${label}%`}
              />
              <Scatter
                data={data.scatterData.filter((d) => d.result === "won")}
                fill={COLORS.success}
                name="Kazanan"
                opacity={0.7}
              />
              <Scatter
                data={data.scatterData.filter((d) => d.result === "lost")}
                fill={COLORS.danger}
                name="Kaybeden"
                opacity={0.5}
              />
              <Legend />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-10">Scatter verisi yok</p>
        )}
      </div>

      {/* Recent Predictions Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          Son Tahminler (Simülasyon Sonrası)
        </h3>
        {data.recentPredictions.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">Tahmin verisi yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 px-3 text-zinc-400 text-xs">Maç</th>
                  <th className="text-left py-2 px-3 text-zinc-400 text-xs">Lig</th>
                  <th className="text-center py-2 px-3 text-zinc-400 text-xs">Pick</th>
                  <th className="text-center py-2 px-3 text-zinc-400 text-xs">Güven</th>
                  <th className="text-center py-2 px-3 text-zinc-400 text-xs">Odds</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPredictions.slice(0, 20).map((p, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2 px-3 text-white text-xs">{p.match}</td>
                    <td className="py-2 px-3 text-zinc-400 text-xs truncate max-w-[120px]">{p.league}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-medium">{p.pick}</span>
                    </td>
                    <td className={cn("py-2 px-3 text-center text-xs font-medium",
                      p.confidence >= 70 ? "text-green-400" : p.confidence >= 55 ? "text-yellow-400" : "text-zinc-400"
                    )}>%{p.confidence}</td>
                    <td className="py-2 px-3 text-center text-zinc-300 text-xs">{p.odds.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// ROI Dashboard Tab
// ============================================

function ROIDashboardTab() {
  const [data, setData] = useState<{
    validationStats: {
      totalPredictions: number;
      won: number;
      lost: number;
      winRate: number;
      roi: number;
      avgConfidence: number;
      avgOdds: number;
      byConfidenceBand: Array<{ band: string; total: number; won: number; winRate: number; roi: number }>;
      byMarket: Array<{ market: string; total: number; won: number; winRate: number; roi: number }>;
      valueBetStats: { total: number; won: number; winRate: number; roi: number; avgEdge: number };
      recentTrend: { last7Days: { won: number; lost: number; roi: number }; last30Days: { won: number; lost: number; roi: number } };
    };
    dailyROI: Array<{ date: string; roi: number; cumROI: number; won: number; lost: number }>;
    leagueROI: Array<{ league: string; total: number; won: number; lost: number; winRate: number; roi: number }>;
    totalStake: number;
    totalReturn: number;
    overallROI: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?section=roi");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error("ROI error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <EmptyState message="ROI verisi yüklenemedi" />;

  const vs = data.validationStats;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard icon={Target} label="Toplam Bahis" value={data.totalStake} color="text-blue-400" />
        <KpiCard icon={TrendingUp} label="Toplam Dönüş" value={data.totalReturn.toFixed(1)} color="text-emerald-400" />
        <KpiCard
          icon={data.overallROI >= 0 ? TrendingUp : TrendingDown}
          label="Genel ROI"
          value={`${data.overallROI >= 0 ? "+" : ""}${data.overallROI}%`}
          color={data.overallROI >= 0 ? "text-green-400" : "text-red-400"}
        />
        <KpiCard icon={CheckCircle2} label="Başarı" value={`%${vs.winRate}`} color="text-green-400" />
        <KpiCard icon={Activity} label="Son 7 Gün ROI" value={`${vs.recentTrend.last7Days.roi >= 0 ? "+" : ""}${vs.recentTrend.last7Days.roi}%`} color={vs.recentTrend.last7Days.roi >= 0 ? "text-green-400" : "text-red-400"} />
      </div>

      {/* Cumulative ROI Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-400" />
          Kümülatif ROI Trendi
        </h3>
        <p className="text-[11px] text-zinc-500 mb-4">Günlük kümülatif ROI eğrisi — sürdürülebilir kârlılık göstergesi</p>
        {data.dailyROI.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.dailyROI}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickLine={false} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
              <ReferenceLine y={0} stroke={COLORS.danger} strokeDasharray="3 3" />
              <Area type="monotone" dataKey="cumROI" name="Kümülatif ROI" stroke={COLORS.success} fill={COLORS.success} fillOpacity={0.1} strokeWidth={2} />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-10">ROI trendi için veri yok</p>
        )}
      </div>

      {/* Daily Win/Loss + ROI */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          Günlük Performans
        </h3>
        {data.dailyROI.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.dailyROI.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickLine={false} tickFormatter={(v) => v.slice(5)} />
              <YAxis yAxisId="left" stroke="#71717a" fontSize={12} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#71717a" fontSize={12} tickLine={false} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
              <Bar yAxisId="left" dataKey="won" name="Kazanan" fill={COLORS.success} radius={[2, 2, 0, 0]} opacity={0.8} />
              <Bar yAxisId="left" dataKey="lost" name="Kaybeden" fill={COLORS.danger} radius={[2, 2, 0, 0]} opacity={0.6} />
              <Line yAxisId="right" type="monotone" dataKey="roi" name="Günlük ROI" stroke={COLORS.warning} strokeWidth={2} dot={false} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-10">Günlük veri yok</p>
        )}
      </div>

      {/* Confidence Band ROI + League ROI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Band ROI */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-purple-400" />
            Güven Bandı ROI
          </h3>
          {vs.byConfidenceBand.length > 0 ? (
            <div className="space-y-3">
              {vs.byConfidenceBand.map((band) => (
                <div key={band.band} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-14">{band.band}%</span>
                  <div className="flex-1 h-6 bg-zinc-800 rounded-full overflow-hidden relative">
                    <div
                      className={cn("h-full rounded-full transition-all", band.roi >= 0 ? "bg-green-500/70" : "bg-red-500/60")}
                      style={{ width: `${Math.min(100, Math.abs(band.roi) + 20)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                      {band.roi >= 0 ? "+" : ""}{band.roi}% ({band.won}/{band.total})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-6">Veri yok</p>
          )}
        </div>

        {/* League ROI */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            Lig Bazlı ROI
          </h3>
          {data.leagueROI.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {data.leagueROI.map((l) => (
                <div key={l.league} className="flex items-center justify-between bg-zinc-800/30 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs text-white font-medium truncate max-w-[140px]">{l.league}</p>
                    <p className="text-[10px] text-zinc-500">{l.total} maç · %{l.winRate} başarı</p>
                  </div>
                  <span className={cn("text-sm font-bold", l.roi >= 0 ? "text-green-400" : "text-red-400")}>
                    {l.roi >= 0 ? "+" : ""}{l.roi}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-6">Lig verisi yok</p>
          )}
        </div>
      </div>

      {/* Value Bet Performance */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          Value Bet Performansı
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatMini label="Toplam" value={vs.valueBetStats.total.toString()} />
          <StatMini label="Kazanan" value={vs.valueBetStats.won.toString()} positive={true} />
          <StatMini label="Başarı" value={`%${vs.valueBetStats.winRate}`} positive={vs.valueBetStats.winRate > 50} />
          <StatMini label="ROI" value={`${vs.valueBetStats.roi >= 0 ? "+" : ""}${vs.valueBetStats.roi}%`} positive={vs.valueBetStats.roi > 0} />
          <StatMini label="Ort. Edge" value={`%${vs.valueBetStats.avgEdge}`} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Optimizer (Self-Correction) Tab
// ============================================

function OptimizerTab() {
  const [data, setData] = useState<{
    timestamp: string;
    totalRecords: number;
    leagueCalibrations: Array<{
      leagueId: number;
      leagueName: string;
      homeAdvantage: number;
      previousHomeAdvantage: number;
      adjustment: number;
      sampleSize: number;
      metrics: {
        predictedHomeWinRate: number;
        actualHomeWinRate: number;
        predictedOverRate: number;
        actualOverRate: number;
        predictedBttsRate: number;
        actualBttsRate: number;
        avgGoalDeviation: number;
      };
    }>;
    marketCalibrations: Array<{
      market: string;
      totalPredictions: number;
      predictedWinRate: number;
      actualWinRate: number;
      deviation: number;
      lambdaAdjustment: number;
      status: "over" | "under" | "calibrated";
    }>;
    globalMetrics: {
      overallCalibrationError: number;
      overConfidentMarkets: string[];
      underConfidentMarkets: string[];
      bestPerformingLeague: string;
      worstPerformingLeague: string;
    };
    appliedAdjustments: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?section=overview");
      const json = await res.json();
      if (json.optimization) setData(json.optimization);
    } catch (e) {
      console.error("Optimizer error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const runOptimize = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin?section=optimize");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error("Optimize error:", e);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Header + Run Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-400" />
            Self-Correction Engine
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Haftalık otomatik kalibrasyon — lambda çarpanlarını geçmiş performansa göre ayarlar
          </p>
        </div>
        <button
          onClick={runOptimize}
          disabled={running}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition",
            running ? "bg-zinc-700 text-zinc-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"
          )}
        >
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {running ? "Çalışıyor..." : "Manuel Optimizasyon"}
        </button>
      </div>

      {!data ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Settings2 className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
          <p className="text-zinc-400">Henüz optimizasyon çalıştırılmamış</p>
          <p className="text-xs text-zinc-600 mt-2">
            &quot;Manuel Optimizasyon&quot; butonuna tıklayın veya haftalık cron bekleyin
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={Activity} label="Analiz Edilen" value={data.totalRecords} color="text-blue-400" />
            <KpiCard icon={Settings2} label="Uygulanan Ayar" value={data.appliedAdjustments} color="text-indigo-400" />
            <KpiCard icon={Gauge} label="Kalibrasyon Hatası" value={`%${data.globalMetrics.overallCalibrationError}`} color={data.globalMetrics.overallCalibrationError < 5 ? "text-green-400" : "text-yellow-400"} />
            <KpiCard icon={AlertTriangle} label="Over-Confident" value={data.globalMetrics.overConfidentMarkets.length} color="text-red-400" />
          </div>

          {/* League Calibrations */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-400" />
              Liga Lambda Kalibrasyonu
            </h3>
            {data.leagueCalibrations.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-6">Yeterli lig verisi yok (min 15 maç gerekli)</p>
            ) : (
              <>
                {/* Bar chart for league adjustments */}
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.leagueCalibrations.filter((l) => l.adjustment !== 0)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} />
                    <YAxis type="category" dataKey="leagueName" stroke="#71717a" fontSize={11} tickLine={false} width={130} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                      formatter={(value: number) => [`${value > 0 ? "+" : ""}${value}`, "Ayarlama"]}
                    />
                    <ReferenceLine x={0} stroke={COLORS.warning} strokeDasharray="3 3" />
                    <Bar dataKey="adjustment" name="Lambda Ayarı" radius={[0, 4, 4, 0]}>
                      {data.leagueCalibrations.filter((l) => l.adjustment !== 0).map((entry, i) => (
                        <Cell key={i} fill={entry.adjustment > 0 ? COLORS.success : COLORS.danger} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Table */}
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-3 text-zinc-400 text-xs">Lig</th>
                        <th className="text-center py-2 px-3 text-zinc-400 text-xs">Önceki</th>
                        <th className="text-center py-2 px-3 text-zinc-400 text-xs">Yeni</th>
                        <th className="text-center py-2 px-3 text-zinc-400 text-xs">Ayar</th>
                        <th className="text-center py-2 px-3 text-zinc-400 text-xs">Örneklem</th>
                        <th className="text-center py-2 px-3 text-zinc-400 text-xs">HW Tahmin</th>
                        <th className="text-center py-2 px-3 text-zinc-400 text-xs">HW Gerçek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leagueCalibrations.map((l) => (
                        <tr key={l.leagueId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-2 px-3 text-white text-xs font-medium">{l.leagueName}</td>
                          <td className="py-2 px-3 text-center text-zinc-400 text-xs">{l.previousHomeAdvantage}</td>
                          <td className="py-2 px-3 text-center text-white text-xs font-medium">{l.homeAdvantage}</td>
                          <td className={cn("py-2 px-3 text-center text-xs font-bold",
                            l.adjustment > 0 ? "text-green-400" : l.adjustment < 0 ? "text-red-400" : "text-zinc-500"
                          )}>
                            {l.adjustment > 0 ? "+" : ""}{l.adjustment}
                          </td>
                          <td className="py-2 px-3 text-center text-zinc-400 text-xs">{l.sampleSize}</td>
                          <td className="py-2 px-3 text-center text-zinc-300 text-xs">%{l.metrics.predictedHomeWinRate}</td>
                          <td className="py-2 px-3 text-center text-zinc-300 text-xs">%{l.metrics.actualHomeWinRate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Market Calibrations */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Pazar Sapma Analizi
            </h3>
            {data.marketCalibrations.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-6">Pazar verisi yok</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.marketCalibrations.map((m) => (
                  <div key={m.market} className={cn(
                    "rounded-lg p-4 border",
                    m.status === "calibrated" ? "bg-zinc-800/30 border-zinc-700/50" :
                    m.status === "over" ? "bg-red-500/5 border-red-500/20" :
                    "bg-yellow-500/5 border-yellow-500/20"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-sm font-medium">{m.market}</span>
                      <span className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full",
                        m.status === "calibrated" ? "bg-green-500/10 text-green-400" :
                        m.status === "over" ? "bg-red-500/10 text-red-400" :
                        "bg-yellow-500/10 text-yellow-400"
                      )}>
                        {m.status === "calibrated" ? "✓ KALİBRE" : m.status === "over" ? "↑ OVER" : "↓ UNDER"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Tahmin: %{m.predictedWinRate}</span>
                      <span className="text-zinc-500">Gerçek: %{m.actualWinRate}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-zinc-500">{m.totalPredictions} bahis</span>
                      <span className={cn("font-medium", m.deviation > 0 ? "text-red-400" : m.deviation < 0 ? "text-yellow-400" : "text-green-400")}>
                        Sapma: {m.deviation > 0 ? "+" : ""}{m.deviation}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-green-400 mb-3">🏆 En İyi Lig</h3>
              <p className="text-white text-sm">{data.globalMetrics.bestPerformingLeague}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-red-400 mb-3">⚠️ En Kötü Lig</h3>
              <p className="text-white text-sm">{data.globalMetrics.worstPerformingLeague}</p>
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-[10px] text-zinc-600 text-right">
            Son optimizasyon: {new Date(data.timestamp).toLocaleString("tr-TR")}
          </p>
        </>
      )}
    </div>
  );
}

// ============================================
// Crazy Picks Tab (Black Swan)
// ============================================

interface CrazyPickData {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueId: number;
  kickoff: string;
  score: string;
  simProbability: number;
  impliedProbability: number;
  edge: number;
  bookmakerOdds: number;
  volatilityScore: number;
  chaosFactors: string[];
  totalGoals: number;
}

interface CrazyPickResultData {
  match: {
    fixtureId: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId: number;
    kickoff: string;
    volatilityScore: number;
    chaosFactors: string[];
  };
  picks: CrazyPickData[];
  bestEdge: number;
  avgEdge: number;
  stake: number;
}

interface CrazyPickSummary {
  totalMatches: number;
  totalPicks: number;
  avgVolatility: number;
  avgEdge: number;
  totalStake: number;
  potentialMaxReturn: number;
}

function CrazyPicksTab() {
  const [data, setData] = useState<{
    results: CrazyPickResultData[];
    summary: CrazyPickSummary;
    date: string;
    totalFixtures: number;
    analyzedFixtures: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crazy-picks");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error("Crazy picks error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <EmptyState message="Crazy Pick verisi yüklenemedi" />;

  const { results, summary } = data;

  // Volatilite dağılımı bar chart (lig bazlı)
  const leagueVolatilityMap = new Map<string, { volatility: number; count: number }>();
  for (const r of results) {
    const existing = leagueVolatilityMap.get(r.match.league);
    if (existing) {
      existing.volatility = Math.max(existing.volatility, r.match.volatilityScore);
      existing.count++;
    } else {
      leagueVolatilityMap.set(r.match.league, { volatility: r.match.volatilityScore, count: 1 });
    }
  }
  const volatilityChartData = Array.from(leagueVolatilityMap.entries())
    .map(([league, d]) => ({ league: league.length > 14 ? league.slice(0, 12) + "…" : league, volatility: d.volatility, count: d.count }))
    .sort((a, b) => b.volatility - a.volatility);

  // Edge dağılımı – tüm pick'leri düzleştir
  const allPicks = results.flatMap((r) => r.picks);
  const edgeBuckets = [
    { range: "5-10%", min: 5, max: 10, count: 0 },
    { range: "10-20%", min: 10, max: 20, count: 0 },
    { range: "20-40%", min: 20, max: 40, count: 0 },
    { range: "40-60%", min: 40, max: 60, count: 0 },
    { range: "60%+", min: 60, max: 999, count: 0 },
  ];
  for (const p of allPicks) {
    const bucket = edgeBuckets.find((b) => p.edge >= b.min && p.edge < b.max);
    if (bucket) bucket.count++;
  }

  const volatilityColor = (score: number) =>
    score >= 70 ? "text-red-400" : score >= 50 ? "text-orange-400" : "text-yellow-400";

  const volatilityBg = (score: number) =>
    score >= 70 ? "bg-red-500/10 border-red-500/30" : score >= 50 ? "bg-orange-500/10 border-orange-500/30" : "bg-yellow-500/10 border-yellow-500/30";

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard icon={Dices} label="Crazy Maç" value={summary.totalMatches} color="text-purple-400" />
        <KpiCard icon={Target} label="Toplam Pick" value={summary.totalPicks} color="text-blue-400" />
        <KpiCard icon={Flame} label="Ort. Volatilite" value={summary.avgVolatility} color="text-orange-400" />
        <KpiCard icon={TrendingUp} label="Ort. Edge" value={`%${summary.avgEdge}`} color="text-green-400" />
        <KpiCard icon={Trophy} label="Max Kazanç" value={`${summary.potentialMaxReturn} ₺`} color="text-yellow-400" />
      </div>

      {/* Toplam stake bilgisi */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-purple-400" />
          <div>
            <p className="text-sm text-white font-medium">Bugünün Black Swan Kuponu</p>
            <p className="text-xs text-zinc-400">
              {data.analyzedFixtures} maç analiz edildi · {summary.totalPicks} skor varyasyonu · {data.date}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-white">{summary.totalStake} ₺</p>
          <p className="text-[10px] text-zinc-500">Toplam Stake ({summary.totalPicks} × 50₺)</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lig Volatilite Heatmap */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            Lig Bazlı Volatilite
          </h3>
          {volatilityChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={volatilityChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis type="number" domain={[0, 100]} stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis type="category" dataKey="league" stroke="#71717a" fontSize={11} tickLine={false} width={110} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                  formatter={(value: number) => [`${value}/100`, "Volatilite"]}
                />
                <Bar dataKey="volatility" name="Volatilite" radius={[0, 6, 6, 0]}>
                  {volatilityChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.volatility >= 70 ? COLORS.danger : entry.volatility >= 50 ? COLORS.warning : COLORS.cyan} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-10">Crazy pick bulunamadı</p>
          )}
        </div>

        {/* Edge Dağılımı */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Edge Dağılımı
          </h3>
          {allPicks.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={edgeBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="range" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
                <Bar dataKey="count" name="Pick Sayısı" fill={COLORS.emerald} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-10">Henüz pick yok</p>
          )}
        </div>
      </div>

      {/* Match Cards */}
      {results.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Dices className="w-4 h-4 text-purple-400" />
            Aktif Crazy Pick&apos;ler
          </h3>
          {results.map((result) => (
            <div key={result.match.fixtureId} className={cn("border rounded-xl p-5 space-y-4", volatilityBg(result.match.volatilityScore))}>
              {/* Match Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">
                    {result.match.homeTeam} vs {result.match.awayTeam}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{result.match.league}</p>
                </div>
                <div className="text-right">
                  <div className={cn("text-lg font-bold", volatilityColor(result.match.volatilityScore))}>
                    {result.match.volatilityScore}/100
                  </div>
                  <p className="text-[10px] text-zinc-500">Volatilite</p>
                </div>
              </div>

              {/* Chaos Factors */}
              {result.match.chaosFactors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.match.chaosFactors.map((factor, i) => (
                    <span key={i} className="text-[10px] bg-zinc-800/80 text-zinc-300 px-2 py-0.5 rounded-full">
                      {factor}
                    </span>
                  ))}
                </div>
              )}

              {/* Score Picks Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-700/50">
                      <th className="text-left py-2 pr-3">Skor</th>
                      <th className="text-right py-2 px-3">Sim %</th>
                      <th className="text-right py-2 px-3">Piyasa %</th>
                      <th className="text-right py-2 px-3">Edge</th>
                      <th className="text-right py-2 px-3">Oran</th>
                      <th className="text-right py-2 pl-3">Potansiyel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.picks.map((pick, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2 pr-3 font-bold text-white">{pick.score}</td>
                        <td className="text-right py-2 px-3 text-cyan-400">%{pick.simProbability}</td>
                        <td className="text-right py-2 px-3 text-zinc-400">%{pick.impliedProbability}</td>
                        <td className={cn("text-right py-2 px-3 font-medium", pick.edge >= 30 ? "text-green-400" : "text-emerald-400")}>
                          +{pick.edge}%
                        </td>
                        <td className="text-right py-2 px-3 text-yellow-400 font-medium">{pick.bookmakerOdds.toFixed(1)}</td>
                        <td className="text-right py-2 pl-3 text-white font-medium">{(50 * pick.bookmakerOdds).toFixed(0)} ₺</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Match Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-700/30">
                <p className="text-[10px] text-zinc-500">
                  {result.picks.length} skor varyasyonu · Avg Edge: %{result.avgEdge} · Best: %{result.bestEdge}
                </p>
                <p className="text-[10px] text-zinc-500">
                  Stake: {result.picks.length * result.stake} ₺
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <Dices className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-sm">Bugün için crazy pick bulunamadı</p>
          <p className="text-zinc-600 text-xs mt-1">Yüksek volatilite + edge koşulları sağlanan maç yok</p>
        </div>
      )}

      {/* Scatter: Sim Prob vs Odds */}
      {allPicks.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Sim Olasılık vs Oran (Scatter)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis type="number" dataKey="simProbability" name="Sim %" stroke="#71717a" fontSize={11} tickLine={false} unit="%" />
              <YAxis type="number" dataKey="bookmakerOdds" name="Oran" stroke="#71717a" fontSize={11} tickLine={false} />
              <ZAxis type="number" dataKey="edge" range={[40, 400]} name="Edge" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                formatter={(value: number, name: string) => [name === "Edge" ? `%${value}` : name === "Sim %" ? `%${value}` : value, name]}
                labelFormatter={() => ""}
              />
              <Scatter
                name="Crazy Picks"
                data={allPicks.map((p) => ({
                  simProbability: p.simProbability,
                  bookmakerOdds: p.bookmakerOdds,
                  edge: p.edge,
                  score: p.score,
                }))}
                fill={COLORS.purple}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ============================================
// Shared Components
// ============================================

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-zinc-400 text-xs">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function StatMini({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <p className="text-[10px] text-zinc-500 mb-1">{label}</p>
      <p className={cn("text-lg font-bold", positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-white")}>
        {value}
      </p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <AlertTriangle className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
      <p className="text-zinc-400 text-sm">{message}</p>
    </div>
  );
}

function formatTweetType(type: string): string {
  const map: Record<string, string> = {
    daily_picks: "Tahminler",
    live_alert: "Canlı Alert",
    outcome_reply: "Sonuç Reply",
    coupon: "Kupon",
    result: "Sonuç",
    value_alert: "Value Alert",
    weekly_report: "Haftalık Rapor",
    analytic: "Analitik",
  };
  return map[type] || type;
}

function getTweetTypeColor(type: string): string {
  const map: Record<string, string> = {
    daily_picks: COLORS.primary,
    live_alert: COLORS.danger,
    outcome_reply: COLORS.emerald,
    coupon: COLORS.warning,
    result: COLORS.success,
    value_alert: COLORS.purple,
    weekly_report: COLORS.cyan,
    analytic: COLORS.indigo,
  };
  return map[type] || COLORS.slate;
}
