"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Ticket,
  RefreshCw,
  Calendar,
  Trophy,
  Flame,
  TrendingDown,
  Shield,
  History,
  Home,
  AlertTriangle,
  AlertCircle,
  ArrowUp,
  Target,
  Zap,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  BarChart3,
  Trophy as TrophyIcon,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TotoProgram,
  TotoBulletinSummary,
  TotoMatch,
  TotoSelection,
  TotoKeyFactor,
  FormResult,
} from "@/types/spor-toto";

// ============================================
// Helpers
// ============================================

const PICK_LABEL: Record<TotoSelection, string> = {
  "1": "Ev Sahibi",
  "0": "Beraberlik",
  "2": "Deplasman",
};

const PICK_COLOR: Record<TotoSelection, string> = {
  "1": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "0": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "2": "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const RISK_COLOR: Record<"low" | "medium" | "high", string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const DIFFICULTY_LABEL: Record<TotoBulletinSummary["difficulty"], string> = {
  easy: "Kolay",
  medium: "Orta",
  hard: "Zor",
  very_hard: "Çok Zor",
};

const DIFFICULTY_COLOR: Record<TotoBulletinSummary["difficulty"], string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-orange-400",
  very_hard: "text-rose-400",
};

const FACTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Flame,
  TrendingDown,
  Shield,
  History,
  Home,
  AlertTriangle,
  AlertCircle,
  ArrowUp,
  Target,
  Zap,
  Trophy: TrophyIcon,
};

function FormBadge({ result }: { result: FormResult }) {
  const cls =
    result === "W"
      ? "bg-emerald-500/20 text-emerald-400"
      : result === "D"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-rose-500/20 text-rose-400";
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
        cls
      )}
    >
      {result}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFactorIcon(name: string) {
  return FACTOR_ICONS[name] || Sparkles;
}

function factorTypeColor(type: TotoKeyFactor["type"]): string {
  switch (type) {
    case "positive":
      return "border-emerald-500/30 bg-emerald-500/5";
    case "negative":
      return "border-rose-500/30 bg-rose-500/5";
    case "warning":
      return "border-amber-500/30 bg-amber-500/5";
    default:
      return "border-border bg-muted/30";
  }
}

// ============================================
// Page
// ============================================

interface ApiResponse {
  success: boolean;
  program?: TotoProgram;
  summary?: TotoBulletinSummary;
  error?: string;
}

export default function SporTotoPage() {
  const [date, setDate] = useState<string>(() =>
    new Date().toISOString().split("T")[0]
  );
  const [days, setDays] = useState<number>(7);
  const [program, setProgram] = useState<TotoProgram | null>(null);
  const [summary, setSummary] = useState<TotoBulletinSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [pickFilter, setPickFilter] = useState<"all" | TotoSelection>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spor-toto?date=${date}&days=${days}`);
      const data: ApiResponse = await res.json();
      if (!data.success || !data.program) {
        setError(data.error || "Bülten yüklenemedi");
        setProgram(null);
        setSummary(null);
      } else {
        setProgram(data.program);
        setSummary(data.summary || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, [date, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const leagues = useMemo(() => {
    if (!program) return [];
    const set = new Map<string, string>();
    for (const m of program.matches) set.set(m.league.name, m.league.flag);
    return Array.from(set.entries()).map(([name, flag]) => ({ name, flag }));
  }, [program]);

  const filteredMatches = useMemo(() => {
    if (!program) return [];
    return program.matches.filter((m) => {
      if (leagueFilter !== "all" && m.league.name !== leagueFilter) return false;
      if (pickFilter !== "all" && m.aiPrediction?.recommendation !== pickFilter)
        return false;
      return true;
    });
  }, [program, leagueFilter, pickFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Ticket className="h-6 w-6 text-primary" />
            Spor Toto Analiz
          </h1>
          <p className="text-sm text-muted-foreground">
            Bu haftanın Spor Toto liglerindeki maçlar — derinlemesine AI analizi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"
          >
            <option value={3}>3 gün</option>
            <option value={5}>5 gün</option>
            <option value={7}>7 gün</option>
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Yenile
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading && !program && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Program Header */}
      {program && (
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 to-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {program.season} Sezonu
              </div>
              <h2 className="text-xl font-bold">{program.name}</h2>
              <div className="mt-1 text-sm text-muted-foreground">
                {program.startDate} → {program.endDate} ·{" "}
                {program.totalMatches} maç
              </div>
            </div>
            {summary && (
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Zorluk</div>
                  <div
                    className={cn(
                      "text-base font-bold",
                      DIFFICULTY_COLOR[summary.difficulty]
                    )}
                  >
                    {DIFFICULTY_LABEL[summary.difficulty]}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">
                    Beklenen Doğru
                  </div>
                  <div className="text-base font-bold text-primary">
                    {summary.expectedCorrect.toFixed(1)}/
                    {summary.totalMatches}
                  </div>
                </div>
              </div>
            )}
          </div>

          {summary && (
            <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm text-foreground/90">
              <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
              {summary.aiSummary}
            </p>
          )}
        </div>
      )}

      {/* Summary cards */}
      {summary && program && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Distribution */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Dağılım
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <DistributionBar
                label="Net Ev Sahibi"
                value={summary.distribution.strongHome}
                total={summary.totalMatches}
                color="bg-emerald-500"
              />
              <DistributionBar
                label="Dengeli"
                value={summary.distribution.balanced}
                total={summary.totalMatches}
                color="bg-amber-500"
              />
              <DistributionBar
                label="Net Deplasman"
                value={summary.distribution.strongAway}
                total={summary.totalMatches}
                color="bg-sky-500"
              />
            </div>
          </div>

          {/* Leagues */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-primary" />
              Lig Dağılımı
            </div>
            <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-sm">
              {summary.matchesByLeague.map((l) => (
                <div
                  key={l.league}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span>{l.flag}</span>
                    <span className="truncate">{l.league}</span>
                  </span>
                  <span className="font-semibold text-foreground">
                    {l.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Popular Picks */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Flame className="h-4 w-4 text-primary" />
              En Güvenli Tahminler
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {summary.popularPicks.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Yüksek güvenli tahmin yok.
                </div>
              )}
              {summary.popularPicks.map((p) => {
                const m = program.matches.find((x) => x.id === p.matchId);
                if (!m) return null;
                return (
                  <div
                    key={p.matchId}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                  >
                    <span className="truncate text-xs">
                      {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                    </span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] font-bold",
                        PICK_COLOR[p.pick]
                      )}
                    >
                      {p.pick} · %{m.aiPrediction?.confidence ?? 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {program && program.matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
          >
            <option value="all">Tüm Ligler</option>
            {leagues.map((l) => (
              <option key={l.name} value={l.name}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {(["all", "1", "0", "2"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPickFilter(p)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  pickFilter === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "all" ? "Tümü" : p}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-muted-foreground">
            {filteredMatches.length} / {program.matches.length} maç
          </span>
        </div>
      )}

      {/* Match cards */}
      {program && (
        <div className="space-y-3">
          {filteredMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              expanded={expanded.has(m.id)}
              onToggle={() => toggleExpanded(m.id)}
            />
          ))}
          {filteredMatches.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Bu kriterlerde maç bulunamadı.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Distribution bar
// ============================================

function DistributionBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">
          {value} (%{Math.round(pct)})
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ============================================
// Match card
// ============================================

function MatchCard({
  match,
  expanded,
  onToggle,
}: {
  match: TotoMatch;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ai = match.aiPrediction;
  const probs = match.stats.probabilities;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Top row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
      >
        {/* Order badge */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
          {match.bulletinOrder}
        </div>

        {/* League + time */}
        <div className="hidden w-32 shrink-0 text-xs text-muted-foreground sm:block">
          <div className="flex items-center gap-1">
            <span>{match.league.flag}</span>
            <span className="truncate">{match.league.name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(match.kickoff)}
          </div>
        </div>

        {/* Teams */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {match.homeTeam.logo && (
              <Image
                src={match.homeTeam.logo}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5"
                unoptimized
              />
            )}
            <span className="truncate font-medium">{match.homeTeam.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {match.awayTeam.logo && (
              <Image
                src={match.awayTeam.logo}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5"
                unoptimized
              />
            )}
            <span className="truncate font-medium">{match.awayTeam.name}</span>
          </div>
        </div>

        {/* Odds */}
        <div className="hidden gap-1 sm:flex">
          <OddsCell label="1" value={match.odds.home} highlight={ai?.recommendation === "1"} />
          <OddsCell label="X" value={match.odds.draw} highlight={ai?.recommendation === "0"} />
          <OddsCell label="2" value={match.odds.away} highlight={ai?.recommendation === "2"} />
        </div>

        {/* AI pick */}
        {ai && (
          <div
            className={cn(
              "hidden shrink-0 rounded-lg border px-3 py-1.5 text-center md:block",
              PICK_COLOR[ai.recommendation]
            )}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-80">
              AI
            </div>
            <div className="text-base font-bold leading-tight">
              {ai.recommendation}
            </div>
            <div className="text-[10px] font-medium">%{ai.confidence}</div>
          </div>
        )}

        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 p-5 space-y-5">
          {/* AI Recommendation */}
          {ai && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">AI Tahmini</span>
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-xs font-bold",
                        PICK_COLOR[ai.recommendation]
                      )}
                    >
                      {ai.recommendation} · {PICK_LABEL[ai.recommendation]}
                    </span>
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                        RISK_COLOR[ai.riskLevel]
                      )}
                    >
                      {ai.riskLevel === "low"
                        ? "Düşük Risk"
                        : ai.riskLevel === "medium"
                          ? "Orta Risk"
                          : "Yüksek Risk"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/90">
                    {ai.reasoning}
                  </p>
                  {ai.alternativePick && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold">Alternatif:</span>{" "}
                      {ai.alternativePick} — {ai.alternativeReason}
                    </p>
                  )}
                  {ai.predictedScore && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold">Skor Tahmini:</span>{" "}
                      {ai.predictedScore}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    %{ai.confidence}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Güven
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Probabilities */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Olasılık Dağılımı
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <ProbCell label="1" value={probs.homeWin} color="emerald" />
              <ProbCell label="X" value={probs.draw} color="amber" />
              <ProbCell label="2" value={probs.awayWin} color="sky" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ProbCell label="Üst 2.5" value={probs.over25} color="violet" />
              <ProbCell label="KG Var" value={probs.btts} color="rose" />
            </div>
          </div>

          {/* Power comparison */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Güç Karşılaştırması
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-2">
                <PowerBar label="Hücum" value={match.stats.powerComparison.homeAttack} color="bg-emerald-500" />
                <PowerBar label="Savunma" value={match.stats.powerComparison.homeDefense} color="bg-blue-500" />
              </div>
              <div className="space-y-2">
                <PowerBar label="Hücum" value={match.stats.powerComparison.awayAttack} color="bg-emerald-500" align="right" />
                <PowerBar label="Savunma" value={match.stats.powerComparison.awayDefense} color="bg-blue-500" align="right" />
              </div>
            </div>
          </div>

          {/* Team summaries */}
          <div className="grid gap-3 md:grid-cols-2">
            <TeamPanel team={match.homeTeam} side="home" />
            <TeamPanel team={match.awayTeam} side="away" />
          </div>

          {/* H2H */}
          {match.stats.h2h.totalMatches > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                H2H Geçmişi
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Toplam</div>
                    <div className="font-bold">{match.stats.h2h.totalMatches}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ev G</div>
                    <div className="font-bold text-emerald-400">
                      {match.stats.h2h.homeWins}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Beraberlik</div>
                    <div className="font-bold text-amber-400">
                      {match.stats.h2h.draws}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Dep G</div>
                    <div className="font-bold text-sky-400">
                      {match.stats.h2h.awayWins}
                    </div>
                  </div>
                </div>
                {match.stats.h2h.recentMatches.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs">
                    {match.stats.h2h.recentMatches.map((rm, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded bg-muted/30 px-2 py-1"
                      >
                        <span className="truncate text-muted-foreground">
                          {new Date(rm.date).toLocaleDateString("tr-TR")}
                        </span>
                        <span className="truncate">
                          {rm.homeTeam}{" "}
                          <span className="font-bold">{rm.score}</span>{" "}
                          {rm.awayTeam}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Goal stats */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gol İstatistikleri
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <StatPill label="Toplam Gol Ort." value={match.stats.goalStats.avgTotalGoals.toFixed(2)} />
              <StatPill label="Üst 1.5" value={`%${match.stats.goalStats.over15Pct}`} />
              <StatPill label="Üst 2.5" value={`%${match.stats.goalStats.over25Pct}`} />
              <StatPill label="Üst 3.5" value={`%${match.stats.goalStats.over35Pct}`} />
              <StatPill label="KG Var" value={`%${match.stats.goalStats.bttsPct}`} />
              <StatPill label="Ev Gol Atma" value={`%${match.stats.goalStats.homeScoredPct}`} />
              <StatPill label="Dep Gol Atma" value={`%${match.stats.goalStats.awayScoredPct}`} />
              <StatPill label="MBS" value={`${match.mbs}`} />
            </div>
          </div>

          {/* Key factors */}
          {match.stats.keyFactors.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kilit Faktörler
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {match.stats.keyFactors.map((f, i) => {
                  const Icon = getFactorIcon(f.icon);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                        factorTypeColor(f.type)
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div className="font-semibold">{f.title}</div>
                        <div className="mt-0.5 text-muted-foreground">
                          {f.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Odds detail */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Oranlar {match.odds.bookmaker && `(${match.odds.bookmaker})`}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <OddBox label="1" value={match.odds.home} />
              <OddBox label="X" value={match.odds.draw} />
              <OddBox label="2" value={match.odds.away} />
              {match.odds.over25 !== undefined && (
                <OddBox label="Ü 2.5" value={match.odds.over25} />
              )}
              {match.odds.under25 !== undefined && (
                <OddBox label="A 2.5" value={match.odds.under25} />
              )}
              {match.odds.bttsYes !== undefined && (
                <OddBox label="KG+" value={match.odds.bttsYes} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub components
// ============================================

function OddsCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[44px] rounded-md border px-2 py-1 text-center",
        highlight
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-muted/30"
      )}
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value.toFixed(2)}</div>
    </div>
  );
}

function ProbCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "emerald" | "amber" | "sky" | "violet" | "rose";
}) {
  const cls = {
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    sky: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    violet: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    rose: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  }[color];
  return (
    <div className={cn("rounded-lg border p-2 text-center", cls)}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="text-lg font-bold">%{value}</div>
    </div>
  );
}

function PowerBar({
  label,
  value,
  color,
  align = "left",
}: {
  label: string;
  value: number;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <div>
      <div
        className={cn(
          "flex items-center justify-between text-[10px] text-muted-foreground",
          align === "right" && "flex-row-reverse"
        )}
      >
        <span>{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div
        className={cn(
          "mt-1 h-1.5 overflow-hidden rounded-full bg-muted",
          align === "right" && "flex justify-end"
        )}
      >
        <div className={cn("h-full", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

function OddBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value.toFixed(2)}</div>
    </div>
  );
}

function TeamPanel({
  team,
  side,
}: {
  team: TotoMatch["homeTeam"];
  side: "home" | "away";
}) {
  const record = side === "home" ? team.homeRecord : team.awayRecord;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        {team.logo && (
          <Image
            src={team.logo}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6"
            unoptimized
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{team.name}</div>
          <div className="text-xs text-muted-foreground">
            {side === "home" ? "Ev Sahibi" : "Deplasman"}
            {team.position > 0 && ` · ${team.position}. sırada`}
            {team.points > 0 && ` · ${team.points} puan`}
          </div>
        </div>
      </div>

      {/* Form */}
      {team.form.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Form:</span>
          <div className="flex gap-1">
            {team.form.map((f, i) => (
              <FormBadge key={i} result={f} />
            ))}
          </div>
          <span className="ml-auto text-xs font-semibold">
            %{team.formPoints}
          </span>
        </div>
      )}

      {/* Quick stats */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Maç" value={team.played} />
        <Stat label="Avg Gol" value={team.avgGoalsScored.toFixed(2)} />
        <Stat label="Avg Yenilen" value={team.avgGoalsConceded.toFixed(2)} />
        <Stat label="KG Var %" value={`${Math.round(team.bttsRate)}`} />
        <Stat label="Clean Sheet %" value={`${Math.round(team.cleanSheetPct)}`} />
        <Stat
          label="Gol Atamama %"
          value={`${Math.round(team.failedToScorePct)}`}
        />
      </div>

      {/* Side specific */}
      {record && (
        <div className="mt-3 rounded-md bg-muted/30 p-2 text-[11px]">
          <div className="mb-1 font-semibold text-muted-foreground">
            {side === "home" ? "Evinde" : "Deplasmanda"}: {record.played} maç
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <span className="text-emerald-400 font-bold">{record.won}</span>{" "}
              G
            </div>
            <div>
              <span className="text-amber-400 font-bold">{record.drawn}</span>{" "}
              B
            </div>
            <div>
              <span className="text-rose-400 font-bold">{record.lost}</span> M
            </div>
          </div>
          <div className="mt-1 text-center text-muted-foreground">
            Kazanma %{Math.round(record.winRate)} · Avg gol{" "}
            {record.avgGoals.toFixed(2)}
          </div>
        </div>
      )}

      {/* Streaks */}
      {(team.streak.wins >= 2 ||
        team.streak.losses >= 2 ||
        team.streak.unbeaten >= 3) && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
          {team.streak.wins >= 2 && (
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
              {team.streak.wins} maç galibiyet
            </span>
          )}
          {team.streak.losses >= 2 && (
            <span className="rounded bg-rose-500/15 px-2 py-0.5 text-rose-400">
              {team.streak.losses} maç yenilgi
            </span>
          )}
          {team.streak.unbeaten >= 3 && (
            <span className="rounded bg-blue-500/15 px-2 py-0.5 text-blue-400">
              {team.streak.unbeaten} maç yenilmez
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between rounded bg-muted/20 px-1.5 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
