"use client";

import { cn } from "@/lib/utils";
import {
  useAppStore,
  MARKET_LABELS,
  type MarketFilter,
  type PreferenceFilters,
} from "@/lib/store";
import { useState, useCallback } from "react";
import {
  SlidersHorizontal,
  ChevronDown,
  RotateCcw,
  Target,
  TrendingUp,
  Gem,
  ArrowUpDown,
  Timer,
  Sparkles,
  Shield,
  Flame,
  Zap,
  BarChart3,
  History,
  X,
} from "lucide-react";

// ---- Bahis Türleri ----
const MARKET_OPTIONS: { key: MarketFilter; icon: string; desc: string }[] = [
  { key: "all", icon: "⚽", desc: "Tüm bahisler" },
  { key: "1x2", icon: "🏆", desc: "Maç sonucu" },
  { key: "over_under", icon: "📊", desc: "Gol sayısı" },
  { key: "btts", icon: "🥅", desc: "Karşılıklı gol" },
  { key: "ht_btts", icon: "🥇", desc: "İlk yarı KG" },
  { key: "htft", icon: "⏱️", desc: "İlk yarı / Maç sonucu" },
  { key: "combo", icon: "🔗", desc: "Kombine bahis" },
  { key: "score", icon: "🎯", desc: "Doğru skor" },
];

// ---- Güven Presetleri ----
const CONFIDENCE_PRESETS = [
  { label: "Hepsi", value: 0 },
  { label: "%50+", value: 50 },
  { label: "%60+", value: 60 },
  { label: "%70+", value: 70 },
  { label: "%80+", value: 80 },
];

// ---- Oran Aralıkları ----
const ODDS_PRESETS = [
  { label: "Tümü", min: 1.0, max: 50.0, icon: "🎲" },
  { label: "1.0-1.5", min: 1.0, max: 1.5, icon: "🟢" },
  { label: "1.5-2.5", min: 1.5, max: 2.5, icon: "🟡" },
  { label: "2.5-5.0", min: 2.5, max: 5.0, icon: "🟠" },
  { label: "5.0+", min: 5.0, max: 50.0, icon: "🔴" },
];

// ---- Sıralama ----
const SORT_OPTIONS: { key: PreferenceFilters["sortBy"]; label: string; icon: React.ReactNode }[] = [
  { key: "confidence", label: "Güven", icon: <Target className="h-3 w-3" /> },
  { key: "ev", label: "EV", icon: <TrendingUp className="h-3 w-3" /> },
  { key: "odds", label: "Oran", icon: <ArrowUpDown className="h-3 w-3" /> },
];

// ---- İY/MS Kombinasyonları ----
const HTFT_COMBOS = [
  { key: "1/1", label: "1/1", ht: "Ev", ft: "Ev", category: "straight" },
  { key: "1/X", label: "1/X", ht: "Ev", ft: "Ber.", category: "draw_path" },
  { key: "1/2", label: "1/2", ht: "Ev", ft: "Dep.", category: "comeback" },
  { key: "X/1", label: "X/1", ht: "Ber.", ft: "Ev", category: "draw_path" },
  { key: "X/X", label: "X/X", ht: "Ber.", ft: "Ber.", category: "straight" },
  { key: "X/2", label: "X/2", ht: "Ber.", ft: "Dep.", category: "draw_path" },
  { key: "2/1", label: "2/1", ht: "Dep.", ft: "Ev", category: "comeback" },
  { key: "2/X", label: "2/X", ht: "Dep.", ft: "Ber.", category: "draw_path" },
  { key: "2/2", label: "2/2", ht: "Dep.", ft: "Dep.", category: "straight" },
];

const HTFT_CATEGORY_PRESETS = [
  { key: "all", label: "Hepsi", icon: "⚽", desc: "Tüm kombinasyonlar" },
  { key: "straight", label: "Düz", icon: "➡️", desc: "1/1, X/X, 2/2" },
  { key: "comeback", label: "Geri Dönüş", icon: "🔄", desc: "1/2, 2/1" },
  { key: "draw_path", label: "Beraberlik Yolu", icon: "↗️", desc: "X/1, X/2, 1/X, 2/X" },
];

// ---- Akıllı Presetler ----
const SMART_PRESETS = [
  {
    key: "safe",
    label: "Güvenli",
    icon: <Shield className="h-3.5 w-3.5" />,
    desc: "Yüksek güven, düşük oran",
    color: "emerald",
    filters: { minConfidence: 70, minOdds: 1.0, maxOdds: 2.5, valueBetsOnly: false, market: "all" as MarketFilter, minEV: -1.0, minSimProb: 60 },
  },
  {
    key: "value",
    label: "Value Hunter",
    icon: <Gem className="h-3.5 w-3.5" />,
    desc: "Değer bahisleri",
    color: "blue",
    filters: { valueBetsOnly: true, minEV: 0.05, minConfidence: 50, market: "all" as MarketFilter },
  },
  {
    key: "risky",
    label: "Riskli",
    icon: <Flame className="h-3.5 w-3.5" />,
    desc: "Yüksek oran, yüksek kazanç",
    color: "orange",
    filters: { minOdds: 3.0, maxOdds: 50.0, minConfidence: 0, market: "all" as MarketFilter },
  },
  {
    key: "htft_comeback",
    label: "Comeback",
    icon: <History className="h-3.5 w-3.5" />,
    desc: "İY/MS geri dönüş",
    color: "purple",
    filters: { market: "htft" as MarketFilter, htftSubFilter: "comeback", htftSelectedCombos: ["1/2", "2/1"], minConfidence: 0, minOdds: 5.0, maxOdds: 50.0 },
  },
];

// ---- EV Presetleri ----
const EV_PRESETS = [
  { label: "Hepsi", value: -1.0 },
  { label: "EV 0+", value: 0 },
  { label: "EV 0.1+", value: 0.1 },
  { label: "EV 0.3+", value: 0.3 },
];

interface PreferenceFilterProps {
  activeFilterCount?: number;
  totalPicks?: number;
  htftPickCount?: number;
}

export function PreferenceFilter({ activeFilterCount, totalPicks, htftPickCount }: PreferenceFilterProps) {
  const { filters, setFilters, resetFilters } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const count =
    activeFilterCount ??
    [
      filters.market !== "all",
      filters.minConfidence > 0,
      filters.minOdds > 1.0 || filters.maxOdds < 50.0,
      filters.valueBetsOnly,
      filters.sortBy !== "confidence",
      filters.minEV > -1.0,
      filters.minSimProb > 0,
      filters.htftSubFilter !== "all",
      filters.htftSelectedCombos.length > 0,
      filters.showOnlyH2HSupported,
    ].filter(Boolean).length;

  const isHtftMode = filters.market === "htft";

  const applyPreset = useCallback((preset: typeof SMART_PRESETS[0]) => {
    resetFilters();
    setFilters(preset.filters);
    setActivePreset(preset.key);
  }, [resetFilters, setFilters]);

  const handleReset = useCallback(() => {
    resetFilters();
    setActivePreset(null);
  }, [resetFilters]);

  const toggleHtftCombo = useCallback((combo: string) => {
    const current = filters.htftSelectedCombos;
    const next = current.includes(combo)
      ? current.filter(c => c !== combo)
      : [...current, combo];
    setFilters({ htftSelectedCombos: next, htftSubFilter: next.length > 0 ? "custom" : "all" });
    setActivePreset(null);
  }, [filters.htftSelectedCombos, setFilters]);

  const selectHtftCategory = useCallback((category: string) => {
    if (category === "all") {
      setFilters({ htftSubFilter: "all", htftSelectedCombos: [] });
    } else {
      const combos = HTFT_COMBOS.filter(c => c.category === category).map(c => c.key);
      setFilters({ htftSubFilter: category, htftSelectedCombos: combos });
    }
    setActivePreset(null);
  }, [setFilters]);

  return (
    <div className="space-y-2">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all w-full",
          expanded
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-card text-foreground hover:border-primary/50"
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Gelişmiş Filtreler</span>
        {count > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
            {count}
          </span>
        )}
        {!expanded && count > 0 && (
          <div className="flex items-center gap-1.5 ml-2 overflow-hidden">
            {filters.market !== "all" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 whitespace-nowrap">
                {MARKET_LABELS[filters.market]}
              </span>
            )}
            {filters.minConfidence > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                %{filters.minConfidence}+
              </span>
            )}
            {filters.valueBetsOnly && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                💎 Value
              </span>
            )}
            {activePreset && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 whitespace-nowrap">
                {SMART_PRESETS.find(p => p.key === activePreset)?.label}
              </span>
            )}
          </div>
        )}
        <ChevronDown
          className={cn("h-4 w-4 ml-auto transition-transform shrink-0", expanded && "rotate-180")}
        />
      </button>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="rounded-xl border border-border bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200">

          {/* Akıllı Presetler */}
          <div className="px-4 pt-4 pb-3 border-b border-border/50">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Akıllı Presetler
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SMART_PRESETS.map((preset) => {
                const isActive = activePreset === preset.key;
                const colorMap: Record<string, string> = {
                  emerald: isActive ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "",
                  blue: isActive ? "border-blue-500 bg-blue-500/10 text-blue-400" : "",
                  orange: isActive ? "border-orange-500 bg-orange-500/10 text-orange-400" : "",
                  purple: isActive ? "border-purple-500 bg-purple-500/10 text-purple-400" : "",
                };
                return (
                  <button
                    key={preset.key}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                      isActive
                        ? colorMap[preset.color]
                        : "border-border hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-800/50"
                    )}
                  >
                    <div className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      isActive ? "" : "text-foreground"
                    )}>
                      {preset.icon}
                      {preset.label}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Bahis Türü */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" />
                Bahis Türü
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MARKET_OPTIONS.map(({ key, icon, desc }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setFilters({ market: key });
                      if (key !== "htft") setFilters({ htftSubFilter: "all", htftSelectedCombos: [] });
                      setActivePreset(null);
                    }}
                    title={desc}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-all border relative",
                      filters.market === key
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {icon} {MARKET_LABELS[key]}
                    {key === "htft" && htftPickCount !== undefined && htftPickCount > 0 && (
                      <span className="ml-1 text-[9px] px-1 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                        {htftPickCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ---------- İY/MS Detaylı Filtre ---------- */}
            {isHtftMode && (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" />
                    İY/MS Filtresi
                    {htftPickCount !== undefined && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20">
                        {htftPickCount} tahmin
                      </span>
                    )}
                  </p>
                  {filters.htftSelectedCombos.length > 0 && (
                    <button
                      onClick={() => setFilters({ htftSelectedCombos: [], htftSubFilter: "all" })}
                      className="text-[10px] text-orange-400/60 hover:text-orange-400 transition-colors flex items-center gap-0.5"
                    >
                      <X className="h-3 w-3" /> Temizle
                    </button>
                  )}
                </div>

                {/* Kategori Presetleri */}
                <div className="flex flex-wrap gap-1.5">
                  {HTFT_CATEGORY_PRESETS.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => selectHtftCategory(cat.key)}
                      title={cat.desc}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                        filters.htftSubFilter === cat.key
                          ? "border-orange-500 bg-orange-500/15 text-orange-400"
                          : "border-orange-500/20 text-orange-400/60 hover:border-orange-500/40 hover:text-orange-400"
                      )}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>

                {/* 3x3 İY/MS Grid */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                    <div className="text-center font-bold">İY ↓ MS →</div>
                    <div className="text-center font-semibold text-emerald-400/70">Ev (1)</div>
                    <div className="text-center font-semibold text-zinc-400">Ber. (X)</div>
                    <div className="text-center font-semibold text-blue-400/70">Dep. (2)</div>
                  </div>
                  {["1", "X", "2"].map((ht) => (
                    <div key={ht} className="grid grid-cols-4 gap-1">
                      <div className="flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                        {ht === "1" ? "Ev (1)" : ht === "X" ? "Ber. (X)" : "Dep. (2)"}
                      </div>
                      {["1", "X", "2"].map((ft) => {
                        const combo = `${ht}/${ft}`;
                        const isSelected = filters.htftSelectedCombos.length === 0 || filters.htftSelectedCombos.includes(combo);
                        const comboInfo = HTFT_COMBOS.find(c => c.key === combo)!;
                        const isComebackType = comboInfo.category === "comeback";
                        const isStraightType = comboInfo.category === "straight";
                        return (
                          <button
                            key={combo}
                            onClick={() => toggleHtftCombo(combo)}
                            className={cn(
                              "rounded-lg py-2 text-xs font-bold transition-all border text-center relative",
                              isSelected
                                ? isComebackType
                                  ? "border-red-500 bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                                  : isStraightType
                                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                                    : "border-orange-500 bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30"
                                : "border-zinc-700/50 bg-zinc-900/30 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400"
                            )}
                          >
                            {combo}
                            {isComebackType && isSelected && (
                              <span className="absolute -top-1 -right-1 text-[8px]">🔄</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* H2H Destekli Filtre */}
                <button
                  onClick={() => {
                    setFilters({ showOnlyH2HSupported: !filters.showOnlyH2HSupported });
                    setActivePreset(null);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border w-full justify-center",
                    filters.showOnlyH2HSupported
                      ? "border-purple-500 bg-purple-500/10 text-purple-400"
                      : "border-orange-500/20 text-orange-400/60 hover:border-purple-500/30 hover:text-purple-400"
                  )}
                >
                  <History className="h-3 w-3" />
                  Sadece H2H Destekli
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15">
                    Geçmişte bu skor varsa
                  </span>
                </button>
              </div>
            )}

            {/* Güven & Oran Aralığı (yan yana) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Güven */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="h-3 w-3" />
                  Min. Güven
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CONFIDENCE_PRESETS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => { setFilters({ minConfidence: value }); setActivePreset(null); }}
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
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={5}
                    value={filters.minConfidence}
                    onChange={(e) => { setFilters({ minConfidence: Number(e.target.value) }); setActivePreset(null); }}
                    className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-700 accent-primary cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3"
                  />
                  <span className="text-xs font-mono text-muted-foreground min-w-[32px] text-right">
                    %{filters.minConfidence}
                  </span>
                </div>
              </div>

              {/* Oran Aralığı */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowUpDown className="h-3 w-3" />
                  Oran Aralığı
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ODDS_PRESETS.map(({ label, min, max, icon }) => (
                    <button
                      key={label}
                      onClick={() => { setFilters({ minOdds: min, maxOdds: max }); setActivePreset(null); }}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all border",
                        filters.minOdds === min && filters.maxOdds === max
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1.0}
                    max={50}
                    step={0.1}
                    value={filters.minOdds}
                    onChange={(e) => { setFilters({ minOdds: Math.max(1, Number(e.target.value)) }); setActivePreset(null); }}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-center text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-zinc-500 text-xs">—</span>
                  <input
                    type="number"
                    min={1.0}
                    max={50}
                    step={0.1}
                    value={filters.maxOdds}
                    onChange={(e) => { setFilters({ maxOdds: Math.min(50, Number(e.target.value)) }); setActivePreset(null); }}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-center text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* EV & Sim Olasılığı */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  Min. Beklenen Değer (EV)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EV_PRESETS.map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => { setFilters({ minEV: value }); setActivePreset(null); }}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                        filters.minEV === value
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-emerald-500/30"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="h-3 w-3" />
                  Min. Simülasyon %
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    value={filters.minSimProb}
                    onChange={(e) => { setFilters({ minSimProb: Number(e.target.value) }); setActivePreset(null); }}
                    className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-700 accent-blue-500 cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3"
                  />
                  <span className="text-xs font-mono text-muted-foreground min-w-[32px] text-right">
                    {filters.minSimProb > 0 ? `%${filters.minSimProb}` : "Hepsi"}
                  </span>
                </div>
              </div>
            </div>

            {/* Alt çizgi: Value bet + Sort + Reset */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
              <button
                onClick={() => { setFilters({ valueBetsOnly: !filters.valueBetsOnly }); setActivePreset(null); }}
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

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sırala:</span>
                {SORT_OPTIONS.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => { setFilters({ sortBy: key }); setActivePreset(null); }}
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

              {count > 0 && (
                <button
                  onClick={handleReset}
                  className="ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 border border-red-500/20 hover:bg-red-500/5 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Sıfırla
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
