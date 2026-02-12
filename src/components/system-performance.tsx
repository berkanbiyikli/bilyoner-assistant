"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Gem,
  Activity,
  Brain,
} from "lucide-react";
import Link from "next/link";

interface WidgetStats {
  totalPredictions: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
  avgConfidence: number;
  avgOdds: number;
  valueBetStats: {
    total: number;
    won: number;
    winRate: number;
    roi: number;
  };
  recentTrend: {
    last7Days: { won: number; lost: number; roi: number };
  };
  simAccuracy: {
    scorelineHitRate: number;
  };
}

/**
 * Ana sayfada küçük "System Performance" widget'ı
 * validator.ts verilerini gösterir
 */
export function SystemPerformanceWidget() {
  const [stats, setStats] = useState<WidgetStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats/validation")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setStats(data.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-40 mb-3" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats || stats.totalPredictions === 0) return null;

  const roiPositive = stats.roi >= 0;
  const trendRoi = stats.recentTrend.last7Days.roi;
  const trendPositive = trendRoi >= 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Sistem Performansı</span>
        </div>
        <Link
          href="/admin"
          className="text-[11px] text-primary hover:underline font-medium"
        >
          Detaylı Dashboard →
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Win Rate */}
          <MiniStat
            icon={<Target className="h-3.5 w-3.5" />}
            label="Başarı"
            value={`%${stats.winRate.toFixed(1)}`}
            details={`${stats.won}W / ${stats.lost}L`}
            color={stats.winRate >= 55 ? "text-green-400" : "text-yellow-400"}
          />

          {/* ROI */}
          <MiniStat
            icon={roiPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            label="ROI"
            value={`${roiPositive ? "+" : ""}${stats.roi.toFixed(1)}%`}
            details={`Ort. oran: ${stats.avgOdds.toFixed(2)}`}
            color={roiPositive ? "text-green-400" : "text-red-400"}
          />

          {/* 7 Day Trend */}
          <MiniStat
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Son 7 Gün"
            value={`${trendPositive ? "+" : ""}${trendRoi.toFixed(1)}%`}
            details={`${stats.recentTrend.last7Days.won}W/${stats.recentTrend.last7Days.lost}L`}
            color={trendPositive ? "text-green-400" : "text-red-400"}
          />

          {/* Value Bets */}
          <MiniStat
            icon={<Gem className="h-3.5 w-3.5" />}
            label="Value Bet"
            value={`%${stats.valueBetStats.winRate.toFixed(0)}`}
            details={`ROI: ${stats.valueBetStats.roi >= 0 ? "+" : ""}${stats.valueBetStats.roi}%`}
            color={stats.valueBetStats.roi >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>

        {/* Confidence Calibration Bar */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-muted-foreground">Model Doğruluğu</span>
            <span className={cn("font-medium", stats.winRate >= 55 ? "text-green-400" : "text-yellow-400")}>
              Tahminlerimiz %{stats.winRate.toFixed(0)} oranında başarıyla sonuçlandı
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                stats.winRate >= 60 ? "bg-green-500" : stats.winRate >= 50 ? "bg-yellow-500" : "bg-red-500"
              )}
              style={{ width: `${Math.min(100, stats.winRate)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  details,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  details: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-muted/20 p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-lg font-bold leading-tight", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{details}</p>
    </div>
  );
}
