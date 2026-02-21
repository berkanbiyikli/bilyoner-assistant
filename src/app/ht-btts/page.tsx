"use client";

import { useEffect, useState } from "react";
import {
  Target,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Shield,
  TrendingUp,
  BarChart3,
  Filter,
} from "lucide-react";
import type { HtBttsAnalysis } from "@/types";
import { cn, formatOdds, confidenceColor } from "@/lib/utils";

type GradeFilter = "A+" | "A" | "B" | "C" | "ALL";

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-emerald-500 text-white",
  A: "bg-green-500 text-white",
  B: "bg-yellow-500 text-black",
  C: "bg-orange-500 text-white",
  D: "bg-red-500 text-white",
};

const GRADE_BORDER: Record<string, string> = {
  "A+": "border-emerald-500/40",
  A: "border-green-500/30",
  B: "border-yellow-500/30",
  C: "border-orange-500/30",
  D: "border-red-500/30",
};

interface ApiResponse {
  date: string;
  totalMatches: number;
  filteredCount: number;
  minGrade: string;
  gradeDistribution: Record<string, number>;
  avgHtBttsProb: number;
  analyses: HtBttsAnalysis[];
  allAnalyses?: HtBttsAnalysis[];
  summary: string;
}

export default function HtBttsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("B");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [loadingTime, setLoadingTime] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setLoadingTime(0);

      // Loading süresi göstergesi
      timer = setInterval(() => setLoadingTime((t) => t + 1), 1000);

      try {
        // Her zaman tüm maçları çek, filtreleme client-side
        const res = await fetch("/api/ht-btts?grade=D&all=true");
        if (!res.ok) throw new Error("API hatası");
        const json: ApiResponse = await res.json();
        setData(json);
      } catch (err) {
        setError("IY KG verileri yüklenemedi. Lütfen tekrar deneyin.");
        console.error("HT BTTS fetch error:", err);
      } finally {
        clearInterval(timer);
        setLoading(false);
      }
    };
    fetchData();
    return () => clearInterval(timer);
  }, []); // Sadece 1 kez çek

  const toggleCard = (fixtureId: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(fixtureId)) next.delete(fixtureId);
      else next.add(fixtureId);
      return next;
    });
  };

  // Client-side grade filtresi
  const gradeOrder: Record<string, number> = { "A+": 5, A: 4, B: 3, C: 2, D: 1 };
  const allAnalyses = data?.allAnalyses ?? data?.analyses ?? [];
  const analyses = gradeFilter === "ALL"
    ? allAnalyses
    : allAnalyses.filter((a) => (gradeOrder[a.grade] ?? 0) >= (gradeOrder[gradeFilter] ?? 1));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-emerald-500" />
          İlk Yarı Karşılıklı Gol
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monte Carlo simülasyon + 8 faktörlü analiz ile ilk yarıda her iki takımın gol bulma olasılığını hesapla
        </p>
      </div>

      {/* Grade Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-1">Minimum Derece:</span>
        {(["A+", "A", "B", "C", "ALL"] as GradeFilter[]).map((g) => (
          <button
            key={g}
            onClick={() => setGradeFilter(g)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              gradeFilter === g
                ? g === "ALL"
                  ? "bg-primary text-primary-foreground"
                  : GRADE_COLORS[g]
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {g === "ALL" ? "Tümü" : g}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      {data && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{data.totalMatches}</div>
            <div className="text-xs text-muted-foreground">Toplam Maç</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-primary">{analyses.length}</div>
            <div className="text-xs text-muted-foreground">Fırsat Bulundu</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-emerald-500">
              %{data.avgHtBttsProb}
            </div>
            <div className="text-xs text-muted-foreground">Ort. IY KG Olasılık</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              {(["A+", "A", "B", "C", "D"] as const).map((g) => (
                <span
                  key={g}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                    GRADE_COLORS[g]
                  )}
                >
                  {g}:{data.gradeDistribution[g] || 0}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Derece Dağılımı</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            {loadingTime < 5
              ? "Maçlar analiz ediliyor..."
              : loadingTime < 15
              ? `Monte Carlo simülasyonu çalışıyor... (${loadingTime}s)`
              : loadingTime < 30
              ? `Çok faktörlü analiz devam ediyor... (${loadingTime}s)`
              : `Neredeyse bitti... (${loadingTime}s)`}
          </p>
          {loadingTime >= 5 && (
            <p className="text-xs text-muted-foreground/60">
              İlk yükleme 20-40 saniye sürebilir. Sonraki yüklemeler cache&apos;ten gelir.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-500 font-medium">{error}</p>
        </div>
      )}

      {/* Analysis Cards */}
      {!loading && !error && analyses.length > 0 && (
        <div className="space-y-4">
          {analyses.map((a) => {
            const isExpanded = expandedCards.has(a.fixtureId);
            return (
              <div
                key={a.fixtureId}
                className={cn(
                  "rounded-xl border bg-card overflow-hidden transition-all",
                  GRADE_BORDER[a.grade] || "border-border"
                )}
              >
                {/* Card Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleCard(a.fixtureId)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-bold",
                          GRADE_COLORS[a.grade]
                        )}
                      >
                        {a.grade}
                      </span>
                      <span className="text-xs text-muted-foreground">{a.league}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {a.edge > 0 && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-500">
                          <ArrowUpRight className="h-3 w-3" />
                          +{a.edge.toFixed(1)}% edge
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(a.kickoff).toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <div className="font-semibold text-sm mb-3">
                    {a.homeTeam} vs {a.awayTeam}
                  </div>

                  {/* Key Metrics Row */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-lg font-bold text-primary">
                        %{a.htBttsProb.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">IY KG Var</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-lg font-bold">
                        %{a.htHomeGoalProb.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Ev Gol</div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <div className="text-lg font-bold">
                        %{a.htAwayGoalProb.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Dep Gol</div>
                    </div>
                    <div className="hidden sm:block rounded-lg bg-muted/50 p-2">
                      <div className="text-lg font-bold">{formatOdds(a.fairOdds)}</div>
                      <div className="text-[10px] text-muted-foreground">Fair Odds</div>
                    </div>
                    <div className="hidden sm:block rounded-lg bg-muted/50 p-2">
                      <div className={cn("text-lg font-bold", confidenceColor(a.confidence))}>
                        %{a.confidence}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Güven</div>
                    </div>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {/* Reasoning */}
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-sm leading-relaxed">{a.reasoning}</p>
                    </div>

                    {/* Lambda & Odds */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Ev λ (İY): </span>
                        <span className="font-semibold">{a.homeLambdaHT.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Dep λ (İY): </span>
                        <span className="font-semibold">{a.awayLambdaHT.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">İY 0.5Ü: </span>
                        <span className="font-semibold">%{a.htOver05Prob.toFixed(0)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">İY 1.5Ü: </span>
                        <span className="font-semibold">%{a.htOver15Prob.toFixed(0)}</span>
                      </div>
                    </div>

                    {/* Odds Comparison */}
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Fair Odds: </span>
                        <span className="font-semibold">{formatOdds(a.fairOdds)}</span>
                      </div>
                      {a.bookmakerOdds && (
                        <div>
                          <span className="text-muted-foreground text-xs">Bahisçi: </span>
                          <span className="font-semibold">{formatOdds(a.bookmakerOdds)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground text-xs">Kelly Stake: </span>
                        <span className="font-semibold">%{a.kellyStake.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Top HT Scores */}
                    {a.topHtScores && a.topHtScores.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          İlk Yarı Skor Tahminleri
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {a.topHtScores.slice(0, 8).map((s) => (
                            <div
                              key={s.score}
                              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5"
                            >
                              <span className="font-mono font-bold text-sm">{s.score}</span>
                              <span className="text-xs text-muted-foreground">
                                %{s.probability.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Factors */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Analiz Faktörleri
                      </h4>
                      <div className="space-y-2">
                        {a.factors.map((f, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-40 sm:w-48 text-xs font-medium truncate">
                              {f.name}
                            </div>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  f.value >= 20
                                    ? "bg-emerald-500"
                                    : f.value >= 0
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                )}
                                style={{
                                  width: `${Math.min(100, Math.max(5, (f.value + 30) / 70 * 100))}%`,
                                }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-xs font-bold w-10 text-right",
                                f.value >= 20
                                  ? "text-emerald-500"
                                  : f.value >= 0
                                  ? "text-yellow-500"
                                  : "text-red-500"
                              )}
                            >
                              {f.value > 0 ? "+" : ""}
                              {f.value}
                            </span>
                            <span className="text-[10px] text-muted-foreground w-8 text-right">
                              ×{(f.weight * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && analyses.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Target className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">IY KG Fırsatı Bulunamadı</h3>
          <p className="text-sm text-muted-foreground">
            {data?.summary || "Seçili dereceyle eşleşen maç bulunamadı. Filtreyi genişletmeyi deneyin."}
          </p>
        </div>
      )}
    </div>
  );
}
