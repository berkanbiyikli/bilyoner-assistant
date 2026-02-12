"use client";

import { useEffect, useState } from "react";
import { MatchCard } from "@/components/match-card";
import { LeagueFilter } from "@/components/league-filter";
import { CouponSidebar } from "@/components/coupon-sidebar";
import { SystemPerformanceWidget } from "@/components/system-performance";
import { MatchCardSkeleton } from "@/components/skeletons";
import { useAppStore } from "@/lib/store";
import type { MatchPrediction } from "@/types";
import { Trophy, Calendar, RefreshCw } from "lucide-react";

export function PredictionsPage() {
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const selectedLeagues = useAppStore((s) => s.selectedLeagues);

  const fetchPredictions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/predictions?date=${date}`);
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch (error) {
      console.error("Tahminler yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, [date]);

  const filteredPredictions =
    selectedLeagues.length > 0
      ? predictions.filter((p) => selectedLeagues.includes(p.league.id))
      : predictions;

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </div>
            <button
              onClick={fetchPredictions}
              disabled={loading}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* League Filter */}
        <LeagueFilter predictions={predictions} />

        {/* System Performance */}
        <SystemPerformanceWidget />

        {/* Predictions */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <MatchCardSkeleton key={i} />)
          ) : filteredPredictions.length > 0 ? (
            filteredPredictions.map((prediction) => (
              <MatchCard key={prediction.fixtureId} prediction={prediction} />
            ))
          ) : (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">Tahmin Bulunamadı</h3>
              <p className="text-sm text-muted-foreground">
                Bu tarih için henüz tahmin bulunmuyor. Farklı bir tarih deneyin.
              </p>
            </div>
          )}
        </div>
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
