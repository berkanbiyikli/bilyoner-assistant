"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  Trophy,
  Target,
  BarChart3,
  Twitter,
  RefreshCw,
  Gem,
  Activity,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Percent,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchStats();
  }, []);

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
            Tahmin, kupon ve bot performansı tam takip
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Ana İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Trophy className="h-5 w-5 text-primary" />}
          label="Toplam Tahmin"
          value={o?.totalPredictions || 0}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
          label="Kazanan"
          value={o?.won || 0}
          accent="text-green-500"
        />
        <StatCard
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          label="Kaybeden"
          value={o?.lost || 0}
          accent="text-red-500"
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          label="Bekleyen"
          value={o?.pending || 0}
          accent="text-yellow-500"
        />
      </div>

      {/* Performans Metrikleri */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Target className="h-5 w-5" />}
          label="İsabet Oranı"
          value={`%${o?.hitRate || 0}`}
          color={getHitRateColor(o?.hitRate || 0)}
        />
        <MetricCard
          icon={<Percent className="h-5 w-5" />}
          label="ROI"
          value={`${(o?.roi || 0) >= 0 ? "+" : ""}${o?.roi || 0}%`}
          color={(o?.roi || 0) >= 0 ? "text-green-500" : "text-red-500"}
        />
        <MetricCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Ort. Odds"
          value={(o?.avgOdds || 0).toFixed(2)}
          color="text-blue-400"
        />
        <MetricCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Ort. Kazanan Odds"
          value={(o?.avgWonOdds || 0).toFixed(2)}
          color="text-green-400"
        />
      </div>

      {/* Value Bet + Tweet Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Value Bet İstatistikleri */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Gem className="h-4 w-4 text-yellow-500" />
            Value Bet Performansı
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold">{stats?.valueBets.total || 0}</div>
              <div className="text-[11px] text-muted-foreground">Toplam</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold text-green-500">{stats?.valueBets.won || 0}</div>
              <div className="text-[11px] text-muted-foreground">Kazanan</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold">{stats?.valueBets.settled || 0}</div>
              <div className="text-[11px] text-muted-foreground">Sonuçlanan</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className={cn("text-xl font-bold", getHitRateColor(stats?.valueBets.hitRate || 0))}>
                %{stats?.valueBets.hitRate || 0}
              </div>
              <div className="text-[11px] text-muted-foreground">İsabet</div>
            </div>
          </div>
        </div>

        {/* Twitter Bot İstatistikleri */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Twitter className="h-4 w-4 text-blue-400" />
            Twitter Bot Aktivitesi
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold text-blue-400">{stats?.tweetStats.total || 0}</div>
              <div className="text-[11px] text-muted-foreground">Toplam Tweet</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold">{stats?.tweetStats.dailyPicks || 0}</div>
              <div className="text-[11px] text-muted-foreground">Günlük Tahminler</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold">{stats?.tweetStats.coupons || 0}</div>
              <div className="text-[11px] text-muted-foreground">Kupon Tweetleri</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-xl font-bold">{stats?.tweetStats.liveAlerts || 0}</div>
              <div className="text-[11px] text-muted-foreground">Canlı Bildirimler</div>
            </div>
          </div>
        </div>
      </div>

      {/* Günlük Performans */}
      {stats?.dailyStats && stats.dailyStats.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-primary" />
            Günlük Performans (Son 30 Gün)
          </h3>
          <div className="space-y-2">
            {stats.dailyStats.map((day) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-24 text-xs">{formatDate(day.date)}</span>
                <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden flex">
                  {day.won > 0 && (
                    <div
                      className="h-full bg-green-500/80 flex items-center justify-center text-[10px] font-medium text-white"
                      style={{ width: `${(day.won / day.total) * 100}%` }}
                    >
                      {day.won}
                    </div>
                  )}
                  {day.lost > 0 && (
                    <div
                      className="h-full bg-red-500/60 flex items-center justify-center text-[10px] font-medium text-white"
                      style={{ width: `${(day.lost / day.total) * 100}%` }}
                    >
                      {day.lost}
                    </div>
                  )}
                </div>
                <span className={cn("text-xs font-medium w-12 text-right", getHitRateColor(day.hitRate))}>
                  %{day.hitRate.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lig + Pick Tabloları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lig Bazlı */}
        {stats?.leagueStats && stats.leagueStats.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-primary" />
              Lig Bazlı Performans
            </h3>
            <div className="space-y-0.5">
              <div className="grid grid-cols-6 gap-1 text-[10px] text-muted-foreground font-medium py-1 px-2">
                <span className="col-span-2">Lig</span>
                <span className="text-center">Toplam</span>
                <span className="text-center">W</span>
                <span className="text-center">L</span>
                <span className="text-right">İsabet</span>
              </div>
              {stats.leagueStats.slice(0, 15).map((ls) => (
                <div key={ls.league} className="grid grid-cols-6 gap-1 text-xs py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
                  <span className="col-span-2 truncate font-medium">{ls.league}</span>
                  <span className="text-center text-muted-foreground">{ls.total}</span>
                  <span className="text-center text-green-500">{ls.won}</span>
                  <span className="text-center text-red-500">{ls.lost}</span>
                  <span className={cn("text-right font-medium", getHitRateColor(ls.hitRate))}>
                    %{ls.hitRate.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pick Tipi Bazlı */}
        {stats?.pickStats && stats.pickStats.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-primary" />
              Tahmin Tipi Performansı
            </h3>
            <div className="space-y-0.5">
              <div className="grid grid-cols-6 gap-1 text-[10px] text-muted-foreground font-medium py-1 px-2">
                <span className="col-span-2">Tip</span>
                <span className="text-center">Toplam</span>
                <span className="text-center">W</span>
                <span className="text-center">L</span>
                <span className="text-right">İsabet</span>
              </div>
              {stats.pickStats.map((ps) => (
                <div key={ps.pick} className="grid grid-cols-6 gap-1 text-xs py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
                  <span className="col-span-2 font-medium">{ps.pick}</span>
                  <span className="text-center text-muted-foreground">{ps.total}</span>
                  <span className="text-center text-green-500">{ps.won}</span>
                  <span className="text-center text-red-500">{ps.lost}</span>
                  <span className={cn("text-right font-medium", getHitRateColor(ps.hitRate))}>
                    %{ps.hitRate.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Son Tweetler */}
      {stats?.tweetStats.recentTweets && stats.tweetStats.recentTweets.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Twitter className="h-4 w-4 text-blue-400" />
            Son Tweetler
          </h3>
          <div className="space-y-3">
            {stats.tweetStats.recentTweets.map((tweet) => (
              <div key={tweet.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium border shrink-0",
                  tweet.type === "daily_picks" ? "border-primary text-primary" :
                  tweet.type === "coupon" ? "border-yellow-500 text-yellow-500" :
                  tweet.type === "live_alert" ? "border-red-500 text-red-500" :
                  "border-green-500 text-green-500"
                )}>
                  {tweet.type === "daily_picks" ? "Tahmin" :
                   tweet.type === "coupon" ? "Kupon" :
                   tweet.type === "live_alert" ? "Canlı" : "Sonuç"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2">{tweet.content}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {new Date(tweet.createdAt).toLocaleString("tr-TR")}
                  </p>
                </div>
                <a
                  href={`https://x.com/i/status/${tweet.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs shrink-0"
                >
                  Görüntüle →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Veri yoksa */}
      {(!stats || stats.overview.totalPredictions === 0) && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Henüz Veri Yok</h3>
          <p className="text-sm text-muted-foreground">
            Cron job&apos;lar çalışmaya başladığında veriler burada görünecek.
            <br />
            Günlük tahminler, kupon tweetleri ve sonuç takipleri otomatik kaydedilir.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Helper Components ----

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold", accent)}>{value.toLocaleString("tr-TR")}</div>
    </div>
  );
}

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
