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
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ReferenceLine,
} from "recharts";
import {
  RefreshCw,
  Brain,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Gem,
  Activity,
  BarChart3,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Types ----
interface ValidationStats {
  totalPredictions: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
  avgConfidence: number;
  avgOdds: number;
  byConfidenceBand: {
    band: string;
    total: number;
    won: number;
    winRate: number;
    roi: number;
  }[];
  byMarket: {
    market: string;
    total: number;
    won: number;
    winRate: number;
    roi: number;
  }[];
  simAccuracy: {
    scorelineHitRate: number;
    top1HitRate: number;
    simEdgeROI: number;
    avgSimConfidence: number;
  };
  valueBetStats: {
    total: number;
    won: number;
    winRate: number;
    roi: number;
    avgEdge: number;
  };
  recentTrend: {
    last7Days: { won: number; lost: number; roi: number };
    last30Days: { won: number; lost: number; roi: number };
  };
}

interface CalibrationData {
  heuristicWeight: number;
  simWeight: number;
  calibrationError: number;
  sampleSize: number;
  bandErrors: {
    band: string;
    predictedWinRate: number;
    actualWinRate: number;
    error: number;
    improvement: string;
  }[];
  lastUpdated: string;
}

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
};

const PIE_COLORS = [COLORS.success, COLORS.danger, COLORS.warning, COLORS.purple, COLORS.cyan];

export default function AdminDashboard() {
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "calibration" | "markets">("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, calibRes] = await Promise.all([
        fetch("/api/stats/validation"),
        fetch("/api/stats/calibration"),
      ]);
      const statsData = await statsRes.json();
      const calibData = await calibRes.json();
      if (statsData.success) setStats(statsData.stats);
      if (calibData.success) setCalibration(calibData.calibration);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Brain className="w-8 h-8 text-blue-400" />
            Admin Dashboard
          </h1>
          <p className="text-zinc-400 mt-1">
            Prediction engine analitikleri & kalibrasyon
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Yenile
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-zinc-800 pb-1">
        {[
          { key: "overview" as const, label: "Genel Bakış", icon: BarChart3 },
          { key: "calibration" as const, label: "Kalibrasyon", icon: Sliders },
          { key: "markets" as const, label: "Pazar Analizi", icon: Target },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition",
              activeTab === key
                ? "bg-zinc-800 text-white border-b-2 border-blue-500"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "overview" && stats && <OverviewTab stats={stats} calibration={calibration} />}
      {activeTab === "calibration" && <CalibrationTab stats={stats} calibration={calibration} />}
      {activeTab === "markets" && stats && <MarketsTab stats={stats} />}

      {!stats && !loading && (
        <div className="text-center py-20 text-zinc-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg">Henüz yeterli validasyon verisi yok</p>
          <p className="text-sm mt-2">Maçlar settle edildikçe veriler burada görünecek</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Overview Tab
// ============================================

function OverviewTab({ stats, calibration }: { stats: ValidationStats; calibration: CalibrationData | null }) {
  // KPI Cards
  const kpis = [
    {
      label: "Toplam Tahmin",
      value: stats.totalPredictions,
      icon: Target,
      color: "text-blue-400",
    },
    {
      label: "Başarı Oranı",
      value: `%${stats.winRate.toFixed(1)}`,
      icon: stats.winRate >= 55 ? CheckCircle2 : AlertTriangle,
      color: stats.winRate >= 55 ? "text-green-400" : "text-yellow-400",
    },
    {
      label: "ROI",
      value: `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`,
      icon: stats.roi >= 0 ? TrendingUp : TrendingDown,
      color: stats.roi >= 0 ? "text-green-400" : "text-red-400",
    },
    {
      label: "Kalibrasyon Hatası",
      value: calibration ? `${calibration.calibrationError.toFixed(1)}%` : "—",
      icon: Gauge,
      color: (calibration?.calibrationError ?? 10) < 5 ? "text-green-400" : "text-yellow-400",
    },
  ];

  // Win/Loss pie data
  const pieData = [
    { name: "Kazanılan", value: stats.won, color: COLORS.success },
    { name: "Kaybedilen", value: stats.lost, color: COLORS.danger },
  ];

  // Confidence band chart data
  const bandData = stats.byConfidenceBand.map((b) => ({
    band: b.band,
    total: b.total,
    winRate: Math.round(b.winRate * 10) / 10,
    roi: b.roi,
  }));

  // Trend data
  const trendData = [
    {
      period: "Son 7 Gün",
      won: stats.recentTrend.last7Days.won,
      lost: stats.recentTrend.last7Days.lost,
      roi: stats.recentTrend.last7Days.roi,
    },
    {
      period: "Son 30 Gün",
      won: stats.recentTrend.last30Days.won,
      lost: stats.recentTrend.last30Days.lost,
      roi: stats.recentTrend.last30Days.roi,
    },
    {
      period: "Tümü",
      won: stats.won,
      lost: stats.lost,
      roi: stats.roi,
    },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={cn("w-5 h-5", color)} />
              <span className="text-zinc-400 text-sm">{label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1: Win/Loss Pie + Confidence Bands */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Win/Loss Pie */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Kazanma / Kaybetme
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Confidence Band Win Rate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-400" />
            Güven Bandı Başarı Oranı
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={bandData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="band" stroke="#71717a" fontSize={12} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
              />
              <Bar dataKey="winRate" name="Başarı %" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2: ROI by Band + Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ROI by Confidence Band */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Güven Bandı ROI
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={bandData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="band" stroke="#71717a" fontSize={12} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
              />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
              <Bar
                dataKey="roi"
                name="ROI %"
                radius={[4, 4, 0, 0]}
              >
                {bandData.map((entry, i) => (
                  <Cell key={i} fill={entry.roi >= 0 ? COLORS.success : COLORS.danger} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Comparison */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Trend Karşılaştırması
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="period" stroke="#71717a" fontSize={12} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
              />
              <Bar dataKey="won" name="Kazanılan" fill={COLORS.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="lost" name="Kaybedilen" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sim Accuracy + Value Bet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            Simülasyon Doğruluğu
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <StatMini label="Top5 Skor Tutma" value={`%${stats.simAccuracy.scorelineHitRate}`} />
            <StatMini label="Top1 Skor Tutma" value={`%${stats.simAccuracy.top1HitRate}`} />
            <StatMini label="Edge>10% ROI" value={`${stats.simAccuracy.simEdgeROI}%`} positive={stats.simAccuracy.simEdgeROI > 0} />
            <StatMini label="Ort. Sim Güven" value={`%${stats.simAccuracy.avgSimConfidence}`} />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Gem className="w-5 h-5 text-emerald-400" />
            Value Bet Performansı
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <StatMini label="Toplam" value={stats.valueBetStats.total.toString()} />
            <StatMini label="Başarı" value={`%${stats.valueBetStats.winRate}`} positive={stats.valueBetStats.winRate > 50} />
            <StatMini label="ROI" value={`${stats.valueBetStats.roi}%`} positive={stats.valueBetStats.roi > 0} />
            <StatMini label="Ort. Edge" value={`%${stats.valueBetStats.avgEdge}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={cn("text-lg font-bold", positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-white")}>
        {value}
      </p>
    </div>
  );
}

// ============================================
// Calibration Tab
// ============================================

function CalibrationTab({
  stats,
  calibration,
}: {
  stats: ValidationStats | null;
  calibration: CalibrationData | null;
}) {
  if (!calibration) {
    return (
      <div className="text-center py-20 text-zinc-500">
        <Gauge className="w-12 h-12 mx-auto mb-4" />
        <p>Kalibrasyon verisi yükleniyor veya henüz yeterli veri yok</p>
      </div>
    );
  }

  // Perfect calibration line data
  const calibrationChartData = calibration.bandErrors.map((b) => ({
    band: b.band,
    predicted: b.predictedWinRate,
    actual: b.actualWinRate,
    error: b.error,
  }));

  // Radar chart for weights
  const radarData = [
    { subject: "Heuristic", A: calibration.heuristicWeight * 100, fullMark: 100 },
    { subject: "Simülasyon", A: calibration.simWeight * 100, fullMark: 100 },
    { subject: "Kalibrasyon", A: Math.max(0, 100 - calibration.calibrationError * 5), fullMark: 100 },
    { subject: "Örneklem", A: Math.min(100, calibration.sampleSize / 2), fullMark: 100 },
  ];

  return (
    <div className="space-y-8">
      {/* Calibration KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <span className="text-zinc-400 text-sm">Heuristic Ağırlık</span>
          </div>
          <p className="text-2xl font-bold text-white">{(calibration.heuristicWeight * 100).toFixed(0)}%</p>
          <p className="text-xs text-zinc-500 mt-1">Default: 40%</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <span className="text-zinc-400 text-sm">Sim Ağırlık</span>
          </div>
          <p className="text-2xl font-bold text-white">{(calibration.simWeight * 100).toFixed(0)}%</p>
          <p className="text-xs text-zinc-500 mt-1">Default: 60%</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-5 h-5 text-yellow-400" />
            <span className="text-zinc-400 text-sm">Kalibrasyon Hatası</span>
          </div>
          <p className={cn("text-2xl font-bold", calibration.calibrationError < 5 ? "text-green-400" : "text-yellow-400")}>
            {calibration.calibrationError.toFixed(1)}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">MAE (düşük = iyi)</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span className="text-zinc-400 text-sm">Örneklem</span>
          </div>
          <p className="text-2xl font-bold text-white">{calibration.sampleSize}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {calibration.sampleSize >= 100 ? "✅ Yeterli" : calibration.sampleSize >= 30 ? "⚠️ Orta" : "❌ Yetersiz"}
          </p>
        </div>
      </div>

      {/* Calibration Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Predicted vs Actual Win Rate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            📐 Predicted vs Actual Win Rate
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={calibrationChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="band" stroke="#71717a" fontSize={12} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} unit="%" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
              />
              <Bar dataKey="predicted" name="Tahmin Edilen %" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Gerçekleşen %" fill={COLORS.success} radius={[4, 4, 0, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* System Radar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            🎯 Sistem Sağlığı
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Mevcut"
                dataKey="A"
                stroke={COLORS.primary}
                fill={COLORS.primary}
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Band Error Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          📊 Confidence Band Kalibrasyon Detayı
        </h3>
        {calibration.bandErrors.length === 0 ? (
          <p className="text-zinc-500 text-sm">Yeterli veri yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-4 text-zinc-400">Band</th>
                  <th className="text-right py-3 px-4 text-zinc-400">Tahmin %</th>
                  <th className="text-right py-3 px-4 text-zinc-400">Gerçek %</th>
                  <th className="text-right py-3 px-4 text-zinc-400">Hata</th>
                  <th className="text-right py-3 px-4 text-zinc-400">Durum</th>
                </tr>
              </thead>
              <tbody>
                {calibration.bandErrors.map((b) => (
                  <tr key={b.band} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-3 px-4 text-white font-medium">{b.band}</td>
                    <td className="py-3 px-4 text-right text-zinc-300">%{b.predictedWinRate.toFixed(1)}</td>
                    <td className="py-3 px-4 text-right text-zinc-300">%{b.actualWinRate.toFixed(1)}</td>
                    <td className={cn("py-3 px-4 text-right font-medium", b.error < 5 ? "text-green-400" : "text-yellow-400")}>
                      {b.error.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        b.improvement.includes("✓") ? "bg-green-500/10 text-green-400" :
                        b.improvement.includes("↓") ? "bg-red-500/10 text-red-400" :
                        "bg-yellow-500/10 text-yellow-400"
                      )}>
                        {b.improvement}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Last Updated */}
      <p className="text-xs text-zinc-600 text-right">
        Son güncelleme: {new Date(calibration.lastUpdated).toLocaleString("tr-TR")}
      </p>
    </div>
  );
}

// ============================================
// Markets Tab
// ============================================

function MarketsTab({ stats }: { stats: ValidationStats }) {
  const marketData = stats.byMarket
    .filter((m) => m.total >= 3)
    .map((m) => ({
      market: m.market,
      total: m.total,
      winRate: Math.round(m.winRate * 10) / 10,
      roi: m.roi,
    }));

  // Separate positive and negative ROI markets
  const profitableMarkets = marketData.filter((m) => m.roi > 0);
  const losingMarkets = marketData.filter((m) => m.roi <= 0);

  return (
    <div className="space-y-8">
      {/* Market ROI Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          Pazar Bazlı ROI
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={marketData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} unit="%" />
            <YAxis
              type="category"
              dataKey="market"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              width={110}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
              labelStyle={{ color: "#fff" }}
            />
            <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" />
            <Bar dataKey="roi" name="ROI %" radius={[0, 4, 4, 0]}>
              {marketData.map((entry, i) => (
                <Cell key={i} fill={entry.roi >= 0 ? COLORS.success : COLORS.danger} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Market Win Rate Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-400" />
          Pazar Bazlı Başarı Oranı
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={marketData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} unit="%" domain={[0, 100]} />
            <YAxis
              type="category"
              dataKey="market"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              width={110}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
              labelStyle={{ color: "#fff" }}
            />
            <ReferenceLine x={50} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "50%", fill: "#f59e0b", fontSize: 12 }} />
            <Bar dataKey="winRate" name="Başarı %" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Market Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profitable Markets */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Kârlı Pazarlar
          </h3>
          {profitableMarkets.length === 0 ? (
            <p className="text-zinc-500 text-sm">Henüz kârlı pazar yok</p>
          ) : (
            <div className="space-y-3">
              {profitableMarkets.sort((a, b) => b.roi - a.roi).map((m) => (
                <div key={m.market} className="flex items-center justify-between bg-zinc-800/30 rounded-lg p-3">
                  <div>
                    <p className="text-white font-medium">{m.market}</p>
                    <p className="text-xs text-zinc-500">{m.total} tahmin</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">+{m.roi}%</p>
                    <p className="text-xs text-zinc-400">%{m.winRate} başarı</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Losing Markets */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Zararlı Pazarlar
          </h3>
          {losingMarkets.length === 0 ? (
            <p className="text-zinc-500 text-sm">Zararlı pazar yok — harika!</p>
          ) : (
            <div className="space-y-3">
              {losingMarkets.sort((a, b) => a.roi - b.roi).map((m) => (
                <div key={m.market} className="flex items-center justify-between bg-zinc-800/30 rounded-lg p-3">
                  <div>
                    <p className="text-white font-medium">{m.market}</p>
                    <p className="text-xs text-zinc-500">{m.total} tahmin</p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-400 font-bold">{m.roi}%</p>
                    <p className="text-xs text-zinc-400">%{m.winRate} başarı</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
