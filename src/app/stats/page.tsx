"use client";

import { TrendingUp, Trophy, Target, BarChart3 } from "lucide-react";

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          İstatistikler
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tahmin performansı ve detaylı istatistikler
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Trophy className="mx-auto h-8 w-8 text-primary mb-3" />
          <div className="text-2xl font-bold">-</div>
          <div className="text-xs text-muted-foreground mt-1">Toplam Tahmin</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Target className="mx-auto h-8 w-8 text-green-500 mb-3" />
          <div className="text-2xl font-bold">-</div>
          <div className="text-xs text-muted-foreground mt-1">İsabet Oranı</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-yellow-500 mb-3" />
          <div className="text-2xl font-bold">-</div>
          <div className="text-xs text-muted-foreground mt-1">Ortalama Odds</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-2">Veri Yetersiz</h3>
        <p className="text-sm text-muted-foreground">
          İstatistikler için yeterli tahmin verisi birikmeli. Tahminleri kullanarak veri oluşturun.
        </p>
      </div>
    </div>
  );
}
