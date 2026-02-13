"use client";

import { cn } from "@/lib/utils";
import {
  useAppStore,
  MARKET_LABELS,
  type MarketFilter,
  type PreferenceFilters,
} from "@/lib/store";
import { useState } from "react";
import {
  SlidersHorizontal,
  ChevronDown,
  RotateCcw,
  Target,
  TrendingUp,
  Gem,
  ArrowUpDown,
} from "lucide-react";

const MARKET_OPTIONS: { key: MarketFilter; icon: string }[] = [
  { key: "all", icon: "⚽" },
  { key: "1x2", icon: "🏆" },
  { key: "over_under", icon: "📊" },
  { key: "btts", icon: "🥅" },
  { key: "htft", icon: "⏱️" },
  { key: "combo", icon: "🔗" },
  { key: "score", icon: "🎯" },
];

const CONFIDENCE_PRESETS = [
  { label: "Hepsi", value: 0 },
  { label: "%50+", value: 50 },
  { label: "%60+", value: 60 },
  { label: "%70+", value: 70 },
  { label: "%80+", value: 80 },
];

const ODDS_PRESETS = [
  { label: "Tümü", min: 1.0, max: 50.0 },
  { label: "Düşük (1-1.5)", min: 1.0, max: 1.5 },
  { label: "Orta (1.5-2.5)", min: 1.5, max: 2.5 },
  { label: "Yüksek (2.5-5)", min: 2.5, max: 5.0 },
  { label: "Çok Yüksek (5+)", min: 5.0, max: 50.0 },
];

const SORT_OPTIONS: { key: PreferenceFilters["sortBy"]; label: string; icon: React.ReactNode }[] = [
  { key: "confidence", label: "Güven", icon: <Target className="h-3 w-3" /> },
  { key: "ev", label: "Beklenen Değer", icon: <TrendingUp className="h-3 w-3" /> },
  { key: "odds", label: "Oran", icon: <ArrowUpDown className="h-3 w-3" /> },
];

interface PreferenceFilterProps {
  activeFilterCount?: number;
}

export function PreferenceFilter({ activeFilterCount }: PreferenceFilterProps) {
  const { filters, setFilters, resetFilters } = useAppStore();
  const [expanded, setExpanded] = useState(false);

  // Aktif filtre sayısı hesapla
  const count =
    activeFilterCount ??
    [
      filters.market !== "all",
      filters.minConfidence > 0,
      filters.minOdds > 1.0 || filters.maxOdds < 50.0,
      filters.valueBetsOnly,
      filters.sortBy !== "confidence",
    ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all w-full sm:w-auto",
          expanded
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-card text-foreground hover:border-primary/50"
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Filtreler</span>
        {count > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
            {count}
          </span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 ml-auto transition-transform", expanded && "rotate-180")}
        />
      </button>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          {/* Market Type */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Bahis Türü
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MARKET_OPTIONS.map(({ key, icon }) => (
                <button
                  key={key}
                  onClick={() => setFilters({ market: key })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                    filters.market === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {icon} {MARKET_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Min. Güven
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CONFIDENCE_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setFilters({ minConfidence: value })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                    filters.minConfidence === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Odds range */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Oran Aralığı
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ODDS_PRESETS.map(({ label, min, max }) => (
                <button
                  key={label}
                  onClick={() => setFilters({ minOdds: min, maxOdds: max })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                    filters.minOdds === min && filters.maxOdds === max
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom row: Value bet toggle + Sort + Reset */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            {/* Value bet only */}
            <button
              onClick={() => setFilters({ valueBetsOnly: !filters.valueBetsOnly })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                filters.valueBetsOnly
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                  : "border-border text-muted-foreground hover:border-emerald-500/30"
              )}
            >
              <Gem className="h-3 w-3" />
              Sadece Value Bet
            </button>

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sırala:</span>
              {SORT_OPTIONS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setFilters({ sortBy: key })}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all border",
                    filters.sortBy === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {/* Reset */}
            {count > 0 && (
              <button
                onClick={resetFilters}
                className="ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 border border-red-500/20 hover:bg-red-500/5 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Sıfırla
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
