"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Trophy,
  Target,
  TrendingUp,
  TrendingDown,
  Shield,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Swords,
  History,
  Flame,
  AlertTriangle,
  AlertCircle,
  Home,
  Plane,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Hash,
  Star,
  Eye,
  CircleDot,
  RefreshCw,
  Filter,
  Columns,
  Plus,
  Trash2,
  Copy,
  Check,
  Calculator,
  Brain,
  Info,
  Calendar,
  MapPin,
  Users,
  Activity,
  Percent,
  Award,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TotoProgram,
  TotoMatch,
  TotoSelection,
  TotoColumn,
  TotoBulletinSummary,
  TotoKeyFactor,
  TotoTeamInfo,
  FormResult,
} from "@/types/spor-toto";

// ============================================
// ANA BÜLTEN SAYFASI
// ============================================

interface ApiResponse {
  success: boolean;
  program: TotoProgram;
  summary: TotoBulletinSummary;
}

export default function SporTotoPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"bulletin" | "analysis" | "coupon">("bulletin");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"order" | "confidence" | "kickoff" | "league">("order");
  const [showAI, setShowAI] = useState(true);

  // Kolon yönetimi
  const [columns, setColumns] = useState<TotoColumn[]>([
    createDefaultColumn("Kolon 1"),
  ]);
  const [activeColumnId, setActiveColumnId] = useState<string>("col-1");

  // Veri çek
  useEffect(() => {
    fetchBulletin();
  }, []);

  const fetchBulletin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spor-toto");
      if (!res.ok) throw new Error("API hatası");
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error("Bülten yüklenemedi");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  };

  // Filtreleme ve sıralama
  const filteredMatches = useMemo(() => {
    if (!data) return [];
    let matches = [...data.program.matches];

    if (leagueFilter !== "all") {
      matches = matches.filter((m) => m.league.name === leagueFilter);
    }

    switch (sortBy) {
      case "confidence":
        matches.sort((a, b) => (b.aiPrediction?.confidence || 0) - (a.aiPrediction?.confidence || 0));
        break;
      case "kickoff":
        matches.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
        break;
      case "league":
        matches.sort((a, b) => a.league.name.localeCompare(b.league.name));
        break;
      default:
        matches.sort((a, b) => a.bulletinOrder - b.bulletinOrder);
    }

    return matches;
  }, [data, leagueFilter, sortBy]);

  // Lig listesi
  const leagues = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.program.matches.map((m) => m.league.name));
    return Array.from(set).sort();
  }, [data]);

  // Aktif kolon
  const activeColumn = columns.find((c) => c.id === activeColumnId) || columns[0];

  // Seçim yapma
  const makeSelection = useCallback(
    (matchId: string, selection: TotoSelection) => {
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== activeColumnId) return col;
          const current = col.selections[matchId] || [];
          let newSelection: TotoSelection[];

          if (current.includes(selection)) {
            newSelection = current.filter((s) => s !== selection);
          } else {
            newSelection = [...current, selection];
          }

          const newSelections = { ...col.selections };
          if (newSelection.length === 0) {
            delete newSelections[matchId];
          } else {
            newSelections[matchId] = newSelection;
          }

          return {
            ...col,
            selections: newSelections,
            ...calculateColumnCost(newSelections),
          };
        })
      );
    },
    [activeColumnId]
  );

  // Kolon ekle
  const addColumn = () => {
    const num = columns.length + 1;
    const newCol = createDefaultColumn(`Kolon ${num}`);
    setColumns((prev) => [...prev, newCol]);
    setActiveColumnId(newCol.id);
  };

  // Kolon sil
  const removeColumn = (colId: string) => {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
    if (activeColumnId === colId) {
      setActiveColumnId(columns[0].id === colId ? columns[1]?.id : columns[0].id);
    }
  };

  // AI önerilerini uygula
  const applyAIPicks = () => {
    if (!data) return;
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== activeColumnId) return col;
        const newSelections: Record<string, TotoSelection[]> = {};
        for (const match of data.program.matches) {
          if (match.aiPrediction) {
            newSelections[match.id] = [match.aiPrediction.recommendation];
          }
        }
        return {
          ...col,
          selections: newSelections,
          ...calculateColumnCost(newSelections),
        };
      })
    );
  };

  // Kolonu temizle
  const clearColumn = () => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== activeColumnId) return col;
        return {
          ...col,
          selections: {},
          totalCombinations: 0,
          costPerColumn: 1,
          totalCost: 0,
        };
      })
    );
  };

  // ---- RENDER ----

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500 mb-3" />
          <p className="text-red-400 font-semibold">{error || "Veri yüklenemedi"}</p>
          <button onClick={fetchBulletin} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  const { program, summary } = data;
  const selectionCount = Object.keys(activeColumn.selections).length;
  const totalMatches = program.totalMatches;

  return (
    <div className="space-y-6 pb-32">
      <PageHeader />

      {/* Bülten Bilgisi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg bg-card border border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Bülten</span>
          <p className="font-bold text-sm">{program.name}</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Maç Sayısı</span>
          <p className="font-bold text-sm">{totalMatches}</p>
        </div>
        <div className="rounded-lg bg-card border border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Zorluk</span>
          <DifficultyBadge difficulty={summary.difficulty} />
        </div>
        <div className="rounded-lg bg-card border border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Beklenen Doğru</span>
          <p className="font-bold text-sm text-primary">{summary.expectedCorrect}/{totalMatches}</p>
        </div>
        <button onClick={fetchBulletin} className="ml-auto rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Yenile
        </button>
      </div>

      {/* Tab Menü */}
      <div className="flex gap-1 rounded-lg bg-secondary/50 p-1">
        {[
          { id: "bulletin" as const, label: "Bülten", icon: Hash },
          { id: "analysis" as const, label: "Analiz", icon: BarChart3 },
          { id: "coupon" as const, label: "Kupon", icon: Columns },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.id === "coupon" && selectionCount > 0 && (
              <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                {selectionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* BÜLTEN TAB */}
      {activeTab === "bulletin" && (
        <div className="space-y-4">
          {/* Filtreler */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Lig filtresi */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={leagueFilter}
                onChange={(e) => setLeagueFilter(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
              >
                <option value="all">Tüm Ligler ({totalMatches})</option>
                {leagues.map((league) => (
                  <option key={league} value={league}>
                    {league}
                  </option>
                ))}
              </select>
            </div>

            {/* Sıralama */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
            >
              <option value="order">Bülten Sırası</option>
              <option value="confidence">AI Güven</option>
              <option value="kickoff">Maç Saati</option>
              <option value="league">Lig</option>
            </select>

            {/* AI göster/gizle */}
            <button
              onClick={() => setShowAI(!showAI)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                showAI ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
              )}
            >
              <Brain className="h-3.5 w-3.5" />
              AI Tahmin
            </button>
          </div>

          {/* Bülten Özeti */}
          <BulletinSummaryPanel summary={summary} />

          {/* Maç Listesi */}
          <div className="space-y-2">
            {filteredMatches.map((match) => (
              <TotoMatchCard
                key={match.id}
                match={match}
                isExpanded={expandedMatch === match.id}
                onToggleExpand={() => setExpandedMatch(expandedMatch === match.id ? null : match.id)}
                selections={activeColumn.selections[match.id] || []}
                onSelect={(sel) => makeSelection(match.id, sel)}
                showAI={showAI}
              />
            ))}
          </div>
        </div>
      )}

      {/* ANALİZ TAB */}
      {activeTab === "analysis" && (
        <AnalysisTab matches={program.matches} summary={summary} />
      )}

      {/* KUPON TAB */}
      {activeTab === "coupon" && (
        <CouponTab
          matches={program.matches}
          columns={columns}
          activeColumnId={activeColumnId}
          onSetActiveColumn={setActiveColumnId}
          onAddColumn={addColumn}
          onRemoveColumn={removeColumn}
          onApplyAI={applyAIPicks}
          onClearColumn={clearColumn}
          onMakeSelection={makeSelection}
        />
      )}

      {/* Sabit Alt Bar - Seçim Özeti */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CircleDot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectionCount}/{totalMatches} maç seçildi
                </span>
              </div>
              {activeColumn.totalCombinations > 0 && (
                <div className="text-xs text-muted-foreground">
                  {activeColumn.totalCombinations} kombinasyon
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Kolon seçici */}
              <div className="flex items-center gap-1">
                {columns.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => setActiveColumnId(col.id)}
                    className={cn(
                      "rounded px-2 py-1 text-xs font-medium transition-colors",
                      col.id === activeColumnId
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {col.label}
                  </button>
                ))}
                <button onClick={addColumn} className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-primary">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button onClick={applyAIPicks} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Brain className="inline h-3.5 w-3.5 mr-1.5" />
                AI Doldur
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ALT COMPONENTLER
// ============================================

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20">
          <Trophy className="h-5 w-5 text-orange-500" />
        </div>
        Spor Toto Bülteni
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Haftalık bülteni takip et, detaylı analiz yap, kuponunu oluştur
      </p>
    </div>
  );
}

// ---- Zorluk Badge ----

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const config = {
    easy: { label: "Kolay", color: "text-green-500" },
    medium: { label: "Orta", color: "text-yellow-500" },
    hard: { label: "Zor", color: "text-orange-500" },
    very_hard: { label: "Çok Zor", color: "text-red-500" },
  }[difficulty] || { label: difficulty, color: "text-muted-foreground" };

  return <p className={cn("font-bold text-sm", config.color)}>{config.label}</p>;
}

// ---- Bülten Özet Paneli ----

function BulletinSummaryPanel({ summary }: { summary: TotoBulletinSummary }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <PieChart className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Bülten Özeti</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-green-500/10 p-3 text-center">
          <p className="text-lg font-bold text-green-500">{summary.distribution.strongHome}</p>
          <p className="text-[10px] text-muted-foreground">Net Ev Sahibi</p>
        </div>
        <div className="rounded-lg bg-yellow-500/10 p-3 text-center">
          <p className="text-lg font-bold text-yellow-500">{summary.distribution.balanced}</p>
          <p className="text-[10px] text-muted-foreground">Dengeli Maç</p>
        </div>
        <div className="rounded-lg bg-blue-500/10 p-3 text-center">
          <p className="text-lg font-bold text-blue-500">{summary.distribution.strongAway}</p>
          <p className="text-[10px] text-muted-foreground">Net Deplasman</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-3 text-center">
          <p className="text-lg font-bold text-primary">{summary.expectedCorrect}</p>
          <p className="text-[10px] text-muted-foreground">Beklenen Doğru</p>
        </div>
      </div>

      {/* Lig dağılımı */}
      <div className="flex flex-wrap gap-2 mb-3">
        {summary.matchesByLeague.map((l) => (
          <span key={l.league} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
            {l.flag} {l.league} <span className="font-semibold">({l.count})</span>
          </span>
        ))}
      </div>

      {/* Oran ortalamaları */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Ort. Oranlar:</span>
        <span>1: <b className="text-foreground">{summary.averageOdds.home.toFixed(2)}</b></span>
        <span>0: <b className="text-foreground">{summary.averageOdds.draw.toFixed(2)}</b></span>
        <span>2: <b className="text-foreground">{summary.averageOdds.away.toFixed(2)}</b></span>
      </div>
    </div>
  );
}

// ============================================
// MAÇ KARTI
// ============================================

interface TotoMatchCardProps {
  match: TotoMatch;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selections: TotoSelection[];
  onSelect: (sel: TotoSelection) => void;
  showAI: boolean;
}

function TotoMatchCard({
  match,
  isExpanded,
  onToggleExpand,
  selections,
  onSelect,
  showAI,
}: TotoMatchCardProps) {
  const kickoffDate = new Date(match.kickoff);
  const isLive = match.status === "live" || match.status === "halftime";
  const isFinished = match.status === "finished";
  const ai = match.aiPrediction;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-all",
        isFinished ? "border-border/50 opacity-80" : "border-border",
        isLive && "border-green-500/40 ring-1 ring-green-500/20",
        selections.length > 0 && !isFinished && "border-primary/30",
      )}
    >
      {/* Üst Başlık */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground">
            {match.bulletinOrder}
          </span>
          <span className="text-xs text-muted-foreground">
            {match.league.flag} {match.league.name}
          </span>
          {match.mbs > 1 && (
            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-500">
              MBS {match.mbs}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-500 animate-pulse">
              <Activity className="h-3 w-3" />
              {match.elapsed}&apos;
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-0.5" />
            {kickoffDate.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}{" "}
            {kickoffDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Maç Ana Alan */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Ev Sahibi */}
          <div className="text-right">
            <p className="font-semibold text-sm leading-tight">{match.homeTeam.name}</p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <FormDisplay form={match.homeTeam.form} />
              <span className="text-[10px] text-muted-foreground ml-1">
                ({match.homeTeam.position}.)
              </span>
            </div>
          </div>

          {/* Skor / Oranlar / Seçim */}
          <div className="flex flex-col items-center min-w-[140px]">
            {isFinished || isLive ? (
              <div className="text-center mb-2">
                <span className={cn("text-2xl font-black", isLive && "text-green-500")}>
                  {match.score?.home ?? 0} - {match.score?.away ?? 0}
                </span>
                {isFinished && match.result && (
                  <p className="text-xs mt-0.5">
                    Sonuç: <span className="font-bold text-primary">{match.result === "1" ? "Ev Sahibi" : match.result === "0" ? "Beraberlik" : "Deplasman"}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center mb-2">
                <span className="text-lg font-bold text-muted-foreground">vs</span>
              </div>
            )}

            {/* 1 / 0 / 2 Seçim Butonları */}
            <div className="flex items-center gap-1">
              {(["1", "0", "2"] as TotoSelection[]).map((sel) => {
                const isSelected = selections.includes(sel);
                const isResult = isFinished && match.result === sel;
                const odds = sel === "1" ? match.odds.home : sel === "0" ? match.odds.draw : match.odds.away;
                const isAIPick = showAI && ai?.recommendation === sel;

                return (
                  <button
                    key={sel}
                    onClick={() => onSelect(sel)}
                    className={cn(
                      "relative flex flex-col items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all min-w-[42px]",
                      isSelected
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/50"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      isResult && "ring-2 ring-green-500",
                      isFinished && !isResult && match.result && "opacity-40"
                    )}
                  >
                    {isAIPick && !isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-yellow-500 flex items-center justify-center">
                        <Star className="h-2 w-2 text-black" />
                      </span>
                    )}
                    <span className="text-[10px] text-inherit/70">
                      {sel === "1" ? "MS 1" : sel === "0" ? "MS 0" : "MS 2"}
                    </span>
                    <span>{odds.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deplasman */}
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">{match.awayTeam.name}</p>
            <div className="flex items-center gap-1 mt-1">
              <FormDisplay form={match.awayTeam.form} />
              <span className="text-[10px] text-muted-foreground ml-1">
                ({match.awayTeam.position}.)
              </span>
            </div>
          </div>
        </div>

        {/* Olasılık Barı */}
        <div className="mt-3">
          <ProbabilityBar probs={match.stats.probabilities} />
        </div>

        {/* AI Tahmin Mini */}
        {showAI && ai && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-xs">
                AI: <b className="text-primary">{ai.recommendation === "1" ? "Ev Sahibi" : ai.recommendation === "0" ? "Beraberlik" : "Deplasman"}</b>
              </span>
              <ConfidencePill confidence={ai.confidence} />
              <RiskBadge risk={ai.riskLevel} />
            </div>
            {ai.predictedScore && (
              <span className="text-xs text-muted-foreground">
                Tahmini Skor: <b>{ai.predictedScore}</b>
              </span>
            )}
          </div>
        )}

        {/* Kısa istatistik bar */}
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span>Ü2.5: <b className="text-foreground">%{match.stats.goalStats.over25Pct}</b></span>
          <span>KG: <b className="text-foreground">%{match.stats.goalStats.bttsPct}</b></span>
          <span>Gol Ort: <b className="text-foreground">{match.stats.goalStats.avgTotalGoals.toFixed(1)}</b></span>
          {match.stats.h2h.totalMatches > 0 && (
            <span>H2H: <b className="text-foreground">{match.stats.h2h.homeWins}-{match.stats.h2h.draws}-{match.stats.h2h.awayWins}</b></span>
          )}
        </div>
      </div>

      {/* Detay Aç/Kapa */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-center gap-1 border-t border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Detayları Gizle
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            Detaylı Analiz
          </>
        )}
      </button>

      {/* Genişletilmiş Detay */}
      {isExpanded && <MatchDetailPanel match={match} />}
    </div>
  );
}

// ============================================
// MAÇ DETAY PANELİ
// ============================================

function MatchDetailPanel({ match }: { match: TotoMatch }) {
  const [detailTab, setDetailTab] = useState<"overview" | "teams" | "h2h" | "goals" | "factors">("overview");

  return (
    <div className="border-t border-border bg-card/50 animate-slide-up">
      {/* Alt tab menü */}
      <div className="flex overflow-x-auto gap-1 px-4 pt-3 pb-1">
        {[
          { id: "overview" as const, label: "Genel", icon: Eye },
          { id: "teams" as const, label: "Takımlar", icon: Users },
          { id: "h2h" as const, label: "H2H", icon: Swords },
          { id: "goals" as const, label: "Goller", icon: Target },
          { id: "factors" as const, label: "Faktörler", icon: Zap },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={cn(
              "flex items-center gap-1 whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors",
              detailTab === tab.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
        {detailTab === "overview" && <OverviewDetail match={match} />}
        {detailTab === "teams" && <TeamsDetail match={match} />}
        {detailTab === "h2h" && <H2HDetail match={match} />}
        {detailTab === "goals" && <GoalsDetail match={match} />}
        {detailTab === "factors" && <FactorsDetail match={match} />}
      </div>
    </div>
  );
}

// ---- Genel Bakış ----

function OverviewDetail({ match }: { match: TotoMatch }) {
  const ai = match.aiPrediction;
  const stats = match.stats;

  return (
    <div className="space-y-4">
      {/* Güç karşılaştırma */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <Swords className="h-3 w-3" /> Güç Karşılaştırması
        </h4>
        <div className="space-y-2">
          <PowerBar label="Hücum" homeValue={stats.powerComparison.homeAttack} awayValue={stats.powerComparison.awayAttack} />
          <PowerBar label="Savunma" homeValue={stats.powerComparison.homeDefense} awayValue={stats.powerComparison.awayDefense} />
        </div>
      </div>

      {/* Olasılıklar */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <Percent className="h-3 w-3" /> Olasılık Dağılımı
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-green-500/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">Ev Sahibi</p>
            <p className="text-xl font-black text-green-500">%{stats.probabilities.homeWin}</p>
          </div>
          <div className="rounded-lg bg-yellow-500/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">Beraberlik</p>
            <p className="text-xl font-black text-yellow-500">%{stats.probabilities.draw}</p>
          </div>
          <div className="rounded-lg bg-blue-500/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">Deplasman</p>
            <p className="text-xl font-black text-blue-500">%{stats.probabilities.awayWin}</p>
          </div>
        </div>
      </div>

      {/* AI Detaylı Tahmin */}
      {ai && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-semibold">AI Analiz</span>
            <ConfidencePill confidence={ai.confidence} />
          </div>
          <p className="text-sm text-muted-foreground">{ai.reasoning}</p>
          {ai.alternativePick && (
            <p className="text-xs text-muted-foreground mt-2">
              <b>Alternatif:</b> {ai.alternativePick === "1" ? "Ev Sahibi" : ai.alternativePick === "0" ? "Beraberlik" : "Deplasman"} — {ai.alternativeReason}
            </p>
          )}
          {ai.topScores && ai.topScores.length > 0 && (
            <div className="flex gap-2 mt-2">
              {ai.topScores.map((s, i) => (
                <span key={i} className="rounded bg-secondary px-2 py-0.5 text-xs">
                  {s.score} <span className="text-muted-foreground">(%{(s.probability * 100).toFixed(1)})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Oran hareketleri */}
      {match.odds.openingOdds && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Oran Değişimleri</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <OddsMovement label="MS 1" opening={match.odds.openingOdds.home} current={match.odds.home} />
            <OddsMovement label="MS 0" opening={match.odds.openingOdds.draw} current={match.odds.draw} />
            <OddsMovement label="MS 2" opening={match.odds.openingOdds.away} current={match.odds.away} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Takımlar ----

function TeamsDetail({ match }: { match: TotoMatch }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TeamCard team={match.homeTeam} side="home" />
      <TeamCard team={match.awayTeam} side="away" />
    </div>
  );
}

function TeamCard({ team, side }: { team: TotoTeamInfo; side: "home" | "away" }) {
  const record = side === "home" ? team.homeRecord : team.awayRecord;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {side === "home" ? <Home className="h-4 w-4 text-green-500" /> : <Plane className="h-4 w-4 text-blue-500" />}
        <span className="font-semibold text-sm">{team.name}</span>
        <span className="text-xs text-muted-foreground">
          ({team.position}. sıra — {team.points} puan)
        </span>
      </div>

      {/* Form */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Form:</span>
        <FormDisplay form={team.form} size="md" />
        <span className="text-xs font-semibold">{team.formPoints}/100</span>
      </div>

      {/* Genel istatistik */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-secondary p-2">
          <p className="text-muted-foreground">G-B-M</p>
          <p className="font-bold">{team.won}-{team.drawn}-{team.lost}</p>
        </div>
        <div className="rounded bg-secondary p-2">
          <p className="text-muted-foreground">Gol Att/Yed</p>
          <p className="font-bold">{team.goalsFor}/{team.goalsAgainst}</p>
        </div>
        <div className="rounded bg-secondary p-2">
          <p className="text-muted-foreground">Averaj</p>
          <p className={cn("font-bold", team.goalDifference > 0 ? "text-green-500" : team.goalDifference < 0 ? "text-red-500" : "")}>
            {team.goalDifference > 0 ? "+" : ""}{team.goalDifference}
          </p>
        </div>
      </div>

      {/* Ev/Deplasman sicili */}
      {record && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {side === "home" ? "🏟 İç Saha" : "✈ Dış Saha"} Sicili
          </p>
          <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
            <div className="rounded bg-green-500/10 p-1">
              <p className="font-bold text-green-500">{record.won}G</p>
            </div>
            <div className="rounded bg-yellow-500/10 p-1">
              <p className="font-bold text-yellow-500">{record.drawn}B</p>
            </div>
            <div className="rounded bg-red-500/10 p-1">
              <p className="font-bold text-red-500">{record.lost}M</p>
            </div>
            <div className="rounded bg-primary/10 p-1">
              <p className="font-bold text-primary">%{Math.round(record.winRate)}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>Att: <b className="text-foreground">{record.avgGoals.toFixed(1)}</b>/maç</span>
            <span>Yed: <b className="text-foreground">{record.avgConceded.toFixed(1)}</b>/maç</span>
          </div>
        </div>
      )}

      {/* Gol istatistikleri */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Gol Ort:</span>
          <span className="font-semibold">{team.avgGoalsScored.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Yed. Ort:</span>
          <span className="font-semibold">{team.avgGoalsConceded.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Clean Sheet:</span>
          <span className="font-semibold">%{Math.round(team.cleanSheetPct)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">KG Var:</span>
          <span className="font-semibold">%{Math.round(team.bttsRate)}</span>
        </div>
      </div>

      {/* Gol dağılımı */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Gol Dağılımı (Dakika)</p>
        <div className="flex gap-0.5">
          {Object.entries(team.goalsByPeriod).map(([period, pct]) => (
            <div key={period} className="flex-1 text-center">
              <div
                className="mx-auto rounded bg-primary/30"
                style={{ height: `${Math.max(4, pct * 0.6)}px`, width: "100%" }}
              />
              <p className="text-[8px] text-muted-foreground mt-0.5">{period}</p>
              <p className="text-[9px] font-bold">%{Math.round(pct)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Seriler */}
      <div className="flex flex-wrap gap-1.5">
        {team.streak.wins > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-500">
            🔥 {team.streak.wins}G serisi
          </span>
        )}
        {team.streak.unbeaten > 2 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500">
            🛡 {team.streak.unbeaten} yenilmezlik
          </span>
        )}
        {team.streak.losses > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-500">
            📉 {team.streak.losses}M serisi
          </span>
        )}
      </div>
    </div>
  );
}

// ---- H2H ----

function H2HDetail({ match }: { match: TotoMatch }) {
  const h2h = match.stats.h2h;

  if (h2h.totalMatches === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Bu takımlar arasında kayıtlı karşılaşma bulunamadı
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* H2H Özet */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-green-500/10 p-3">
          <p className="text-lg font-black text-green-500">{h2h.homeWins}</p>
          <p className="text-[10px] text-muted-foreground">{match.homeTeam.shortName} Galibiyet</p>
        </div>
        <div className="rounded-lg bg-yellow-500/10 p-3">
          <p className="text-lg font-black text-yellow-500">{h2h.draws}</p>
          <p className="text-[10px] text-muted-foreground">Beraberlik</p>
        </div>
        <div className="rounded-lg bg-blue-500/10 p-3">
          <p className="text-lg font-black text-blue-500">{h2h.awayWins}</p>
          <p className="text-[10px] text-muted-foreground">{match.awayTeam.shortName} Galibiyet</p>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {h2h.totalMatches} maç — Ort. {h2h.avgGoals.toFixed(1)} gol/maç
      </div>

      {/* Son Karşılaşmalar */}
      <div className="space-y-1.5">
        {h2h.recentMatches.map((m, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
            <span className="text-muted-foreground w-20">
              {new Date(m.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "2-digit" })}
            </span>
            <span className={cn("flex-1 text-center", m.homeTeam === match.homeTeam.name && "font-semibold")}>
              {m.homeTeam}
            </span>
            <span className="font-bold text-primary mx-2">{m.score}</span>
            <span className={cn("flex-1 text-center", m.awayTeam === match.awayTeam.name && "font-semibold")}>
              {m.awayTeam}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Goller ----

function GoalsDetail({ match }: { match: TotoMatch }) {
  const gs = match.stats.goalStats;

  return (
    <div className="space-y-4">
      {/* Gol İstatistikleri */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Maç Başı Gol Ort." value={gs.avgTotalGoals.toFixed(1)} icon={<Target className="h-3.5 w-3.5" />} />
        <StatCard label="Üst 2.5 Oranı" value={`%${gs.over25Pct}`} icon={<ArrowUp className="h-3.5 w-3.5" />} highlight={gs.over25Pct >= 60} />
        <StatCard label="KG Var Oranı" value={`%${gs.bttsPct}`} icon={<Swords className="h-3.5 w-3.5" />} highlight={gs.bttsPct >= 60} />
        <StatCard label="Üst 1.5" value={`%${gs.over15Pct}`} icon={<ArrowUp className="h-3.5 w-3.5" />} />
        <StatCard label="Üst 3.5" value={`%${gs.over35Pct}`} icon={<ArrowUp className="h-3.5 w-3.5" />} />
        <StatCard label="Toplam Oran" value={`Ü2.5: ${match.odds.over25?.toFixed(2) || "-"}`} icon={<Calculator className="h-3.5 w-3.5" />} />
      </div>

      {/* Gol Atma Oranları */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2">Gol Atma Olasılıkları</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground mb-1">{match.homeTeam.shortName} Gol Atar</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-black text-green-500">%{gs.homeScoredPct}</span>
              <span className="text-[10px] text-muted-foreground mb-1">
                ({match.homeTeam.avgGoalsScored.toFixed(2)} gol/maç)
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-xs text-muted-foreground mb-1">{match.awayTeam.shortName} Gol Atar</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-black text-blue-500">%{gs.awayScoredPct}</span>
              <span className="text-[10px] text-muted-foreground mb-1">
                ({match.awayTeam.avgGoalsScored.toFixed(2)} gol/maç)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Oranlar ile karşılaştırma */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2">Alt/Üst Oranları</h4>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div className="rounded bg-secondary p-2">
            <p className="text-muted-foreground">Ü1.5</p>
            <p className="font-bold">{match.odds.over15?.toFixed(2) || "-"}</p>
          </div>
          <div className="rounded bg-secondary p-2">
            <p className="text-muted-foreground">Ü2.5</p>
            <p className="font-bold">{match.odds.over25?.toFixed(2) || "-"}</p>
          </div>
          <div className="rounded bg-secondary p-2">
            <p className="text-muted-foreground">Ü3.5</p>
            <p className="font-bold">{match.odds.over35?.toFixed(2) || "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Faktörler ----

function FactorsDetail({ match }: { match: TotoMatch }) {
  const factors = match.stats.keyFactors;

  if (factors.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Bu maç için belirgin faktör bulunamadı
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {factors.map((factor, i) => (
        <FactorCard key={i} factor={factor} />
      ))}
    </div>
  );
}

function FactorCard({ factor }: { factor: TotoKeyFactor }) {
  const colors = {
    positive: "border-green-500/20 bg-green-500/5",
    negative: "border-red-500/20 bg-red-500/5",
    neutral: "border-yellow-500/20 bg-yellow-500/5",
    warning: "border-orange-500/20 bg-orange-500/5",
  };

  const iconColors = {
    positive: "text-green-500",
    negative: "text-red-500",
    neutral: "text-yellow-500",
    warning: "text-orange-500",
  };

  const impactBadge = {
    high: "bg-red-500/20 text-red-400",
    medium: "bg-yellow-500/20 text-yellow-400",
    low: "bg-blue-500/20 text-blue-400",
  };

  return (
    <div className={cn("rounded-lg border p-3 flex items-start gap-3", colors[factor.type])}>
      <div className={cn("mt-0.5", iconColors[factor.type])}>
        {getFactorIcon(factor.icon)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{factor.title}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", impactBadge[factor.impactLevel])}>
            {factor.impactLevel === "high" ? "Yüksek" : factor.impactLevel === "medium" ? "Orta" : "Düşük"}
          </span>
          {factor.affectsTeam && factor.affectsTeam !== "both" && (
            <span className="text-[10px] text-muted-foreground">
              ({factor.affectsTeam === "home" ? "Ev" : "Dep"})
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{factor.description}</p>
      </div>
    </div>
  );
}

function getFactorIcon(name: string) {
  const size = "h-4 w-4";
  switch (name) {
    case "Flame": return <Flame className={size} />;
    case "TrendingDown": return <TrendingDown className={size} />;
    case "Zap": return <Zap className={size} />;
    case "Shield": return <Shield className={size} />;
    case "History": return <History className={size} />;
    case "Home": return <Home className={size} />;
    case "AlertTriangle": return <AlertTriangle className={size} />;
    case "Trophy": return <Trophy className={size} />;
    case "AlertCircle": return <AlertCircle className={size} />;
    case "ArrowUp": return <ArrowUp className={size} />;
    case "Target": return <Target className={size} />;
    default: return <Info className={size} />;
  }
}

// ============================================
// ANALİZ TAB
// ============================================

function AnalysisTab({ matches, summary }: { matches: TotoMatch[]; summary: TotoBulletinSummary }) {
  // Favori maçlar
  const favorites = matches
    .filter((m) => m.aiPrediction && m.aiPrediction.confidence >= 60)
    .sort((a, b) => (b.aiPrediction?.confidence || 0) - (a.aiPrediction?.confidence || 0));

  // Riskli maçlar (dengeli)
  const risky = matches.filter(
    (m) => m.stats.probabilities.homeWin < 40 && m.stats.probabilities.awayWin < 40
  );

  // Gol zengini
  const highGoal = matches
    .filter((m) => m.stats.goalStats.over25Pct >= 60)
    .sort((a, b) => b.stats.goalStats.over25Pct - a.stats.goalStats.over25Pct);

  return (
    <div className="space-y-6">
      {/* AI Güvenilir Tahminler */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-yellow-500" />
          AI Güvenilir Tahminler ({favorites.length})
        </h3>
        <div className="space-y-2">
          {favorites.map((match) => (
            <div key={match.id} className="flex items-center justify-between rounded-lg bg-card border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{match.league.flag}</span>
                <span className="text-sm font-medium">{match.homeTeam.shortName} - {match.awayTeam.shortName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-primary">
                  {match.aiPrediction?.recommendation === "1" ? "1" : match.aiPrediction?.recommendation === "0" ? "0" : "2"}
                </span>
                <ConfidencePill confidence={match.aiPrediction?.confidence || 0} />
                <RiskBadge risk={match.aiPrediction?.riskLevel || "medium"} />
              </div>
            </div>
          ))}
          {favorites.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Yüksek güvenli tahmin bulunamadı</p>
          )}
        </div>
      </div>

      {/* Riskli / Dengeli Maçlar */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Riskli Maçlar — Dikkatli Ol ({risky.length})
        </h3>
        <div className="space-y-2">
          {risky.map((match) => (
            <div key={match.id} className="flex items-center justify-between rounded-lg bg-orange-500/5 border border-orange-500/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs">{match.league.flag}</span>
                <span className="text-sm font-medium">{match.homeTeam.shortName} - {match.awayTeam.shortName}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>%{match.stats.probabilities.homeWin}</span>
                <span>%{match.stats.probabilities.draw}</span>
                <span>%{match.stats.probabilities.awayWin}</span>
              </div>
            </div>
          ))}
          {risky.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Dengeli maç bulunamadı</p>
          )}
        </div>
      </div>

      {/* Gol Zengini */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-green-500" />
          Gol Zengini Maçlar ({highGoal.length})
        </h3>
        <div className="space-y-2">
          {highGoal.map((match) => (
            <div key={match.id} className="flex items-center justify-between rounded-lg bg-card border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs">{match.league.flag}</span>
                <span className="text-sm font-medium">{match.homeTeam.shortName} - {match.awayTeam.shortName}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>Ü2.5: <b className="text-green-500">%{match.stats.goalStats.over25Pct}</b></span>
                <span>KG: <b className="text-primary">%{match.stats.goalStats.bttsPct}</b></span>
                <span>Ort: <b>{match.stats.goalStats.avgTotalGoals.toFixed(1)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bülten Genel Değerlendirme */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          Bülten Genel Değerlendirme
        </h3>
        <p className="text-sm text-muted-foreground">{summary.aiSummary}</p>
        <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
          <span>Zorluk: <b className="text-foreground">{summary.difficulty === "easy" ? "Kolay" : summary.difficulty === "medium" ? "Orta" : summary.difficulty === "hard" ? "Zor" : "Çok Zor"}</b></span>
          <span>Beklenen: <b className="text-primary">{summary.expectedCorrect}/{summary.totalMatches}</b></span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// KUPON TAB
// ============================================

interface CouponTabProps {
  matches: TotoMatch[];
  columns: TotoColumn[];
  activeColumnId: string;
  onSetActiveColumn: (id: string) => void;
  onAddColumn: () => void;
  onRemoveColumn: (id: string) => void;
  onApplyAI: () => void;
  onClearColumn: () => void;
  onMakeSelection: (matchId: string, sel: TotoSelection) => void;
}

function CouponTab({
  matches,
  columns,
  activeColumnId,
  onSetActiveColumn,
  onAddColumn,
  onRemoveColumn,
  onApplyAI,
  onClearColumn,
  onMakeSelection,
}: CouponTabProps) {
  const activeColumn = columns.find((c) => c.id === activeColumnId) || columns[0];

  return (
    <div className="space-y-4">
      {/* Kolon yönetimi */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {columns.map((col) => (
            <div key={col.id} className="flex items-center gap-0.5">
              <button
                onClick={() => onSetActiveColumn(col.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  col.id === activeColumnId
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {col.label}
                <span className="ml-1 text-[10px] opacity-70">
                  ({Object.keys(col.selections).length})
                </span>
              </button>
              {columns.length > 1 && (
                <button
                  onClick={() => onRemoveColumn(col.id)}
                  className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <button onClick={onAddColumn} className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-primary border border-dashed border-border">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onApplyAI} className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-500">
            <Brain className="h-3.5 w-3.5" />
            AI ile Doldur
          </button>
          <button onClick={onClearColumn} className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
            Temizle
          </button>
        </div>
      </div>

      {/* Kupon Tablosu */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary/50 text-xs text-muted-foreground">
              <th className="py-2 px-3 text-left w-8">#</th>
              <th className="py-2 px-3 text-left">Maç</th>
              <th className="py-2 px-3 text-center w-10">MBS</th>
              <th className="py-2 px-3 text-center w-16">1</th>
              <th className="py-2 px-3 text-center w-16">0</th>
              <th className="py-2 px-3 text-center w-16">2</th>
              <th className="py-2 px-3 text-center w-16">AI</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const sels = activeColumn.selections[match.id] || [];
              const ai = match.aiPrediction;

              return (
                <tr
                  key={match.id}
                  className={cn(
                    "border-t border-border/50 text-sm hover:bg-secondary/20 transition-colors",
                    sels.length > 0 && "bg-primary/5"
                  )}
                >
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">{match.bulletinOrder}</td>
                  <td className="py-2.5 px-3">
                    <div className="text-xs text-muted-foreground">{match.league.flag} {match.league.name}</div>
                    <div className="font-medium text-sm">{match.homeTeam.shortName} - {match.awayTeam.shortName}</div>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {match.mbs > 1 && (
                      <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold text-orange-500">
                        {match.mbs}
                      </span>
                    )}
                  </td>
                  {(["1", "0", "2"] as TotoSelection[]).map((sel) => {
                    const isSelected = sels.includes(sel);
                    const odds = sel === "1" ? match.odds.home : sel === "0" ? match.odds.draw : match.odds.away;
                    return (
                      <td key={sel} className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => onMakeSelection(match.id, sel)}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          )}
                        >
                          {odds.toFixed(2)}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center">
                    {ai && (
                      <span className={cn("text-xs font-bold", ai.confidence >= 60 ? "text-green-500" : ai.confidence >= 45 ? "text-yellow-500" : "text-red-500")}>
                        {ai.recommendation}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Kupon Özeti */}
      <CouponSummary column={activeColumn} matches={matches} />
    </div>
  );
}

function CouponSummary({ column, matches }: { column: TotoColumn; matches: TotoMatch[] }) {
  const selectionCount = Object.keys(column.selections).length;
  const multiSelections = Object.values(column.selections).filter((s) => s.length > 1);

  // Toplam seçim sayısını hesapla
  let totalCombinations = 1;
  for (const sels of Object.values(column.selections)) {
    totalCombinations *= sels.length;
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        Kupon Özeti — {column.label}
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
        <div className="rounded-lg bg-background p-3">
          <p className="text-muted-foreground text-xs">Seçilen Maç</p>
          <p className="text-lg font-bold">{selectionCount}/{matches.length}</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="text-muted-foreground text-xs">Çoklu Seçim</p>
          <p className="text-lg font-bold">{multiSelections.length}</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="text-muted-foreground text-xs">Kombinasyon</p>
          <p className="text-lg font-bold">{selectionCount > 0 ? totalCombinations : 0}</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="text-muted-foreground text-xs">Kalan Maç</p>
          <p className="text-lg font-bold text-orange-500">{matches.length - selectionCount}</p>
        </div>
      </div>

      {selectionCount < matches.length && (
        <p className="text-xs text-orange-500 mt-3 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Tüm maçları seçmen gerekiyor ({matches.length - selectionCount} maç kaldı)
        </p>
      )}
    </div>
  );
}

// ============================================
// ORTAK YARDIMCI COMPONENTLER
// ============================================

function FormDisplay({ form, size = "sm" }: { form: FormResult[]; size?: "sm" | "md" }) {
  const dotSize = size === "md" ? "h-5 w-5 text-[10px]" : "h-4 w-4 text-[9px]";

  return (
    <div className="flex items-center gap-0.5">
      {form.map((f, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-center rounded-full font-bold",
            dotSize,
            f === "W" && "bg-green-500 text-white",
            f === "D" && "bg-yellow-500 text-black",
            f === "L" && "bg-red-500 text-white"
          )}
        >
          {f === "W" ? "G" : f === "D" ? "B" : "M"}
        </div>
      ))}
    </div>
  );
}

function ProbabilityBar({ probs }: { probs: { homeWin: number; draw: number; awayWin: number } }) {
  return (
    <div className="flex items-center gap-0.5 h-2 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-500 rounded-l-full transition-all"
        style={{ width: `${probs.homeWin}%` }}
        title={`Ev: %${probs.homeWin}`}
      />
      <div
        className="h-full bg-yellow-500 transition-all"
        style={{ width: `${probs.draw}%` }}
        title={`Ber: %${probs.draw}`}
      />
      <div
        className="h-full bg-blue-500 rounded-r-full transition-all"
        style={{ width: `${probs.awayWin}%` }}
        title={`Dep: %${probs.awayWin}`}
      />
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold",
        confidence >= 65 ? "bg-green-500/20 text-green-500" :
        confidence >= 45 ? "bg-yellow-500/20 text-yellow-500" :
        "bg-red-500/20 text-red-500"
      )}
    >
      %{confidence}
    </span>
  );
}

function RiskBadge({ risk }: { risk: "low" | "medium" | "high" }) {
  const config = {
    low: { label: "Düşük", color: "bg-green-500/10 text-green-500" },
    medium: { label: "Orta", color: "bg-yellow-500/10 text-yellow-500" },
    high: { label: "Yüksek", color: "bg-red-500/10 text-red-500" },
  };
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", config[risk].color)}>
      {config[risk].label}
    </span>
  );
}

function PowerBar({
  label,
  homeValue,
  awayValue,
}: {
  label: string;
  homeValue: number;
  awayValue: number;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 text-right font-bold text-green-500">{homeValue}</span>
      <div className="flex-1 flex items-center gap-0.5 h-3">
        <div className="flex-1 flex justify-end">
          <div
            className="h-full bg-green-500 rounded-l transition-all"
            style={{ width: `${homeValue}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground w-14 text-center">{label}</span>
        <div className="flex-1">
          <div
            className="h-full bg-blue-500 rounded-r transition-all"
            style={{ width: `${awayValue}%` }}
          />
        </div>
      </div>
      <span className="w-8 font-bold text-blue-500">{awayValue}</span>
    </div>
  );
}

function OddsMovement({ label, opening, current }: { label: string; opening: number; current: number }) {
  const diff = current - opening;
  const direction = diff > 0.05 ? "up" : diff < -0.05 ? "down" : "stable";

  return (
    <div className="rounded bg-secondary p-2 text-center">
      <p className="text-muted-foreground">{label}</p>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        <span className="text-muted-foreground line-through">{opening.toFixed(2)}</span>
        {direction === "up" && <ArrowUp className="h-3 w-3 text-red-500" />}
        {direction === "down" && <ArrowDown className="h-3 w-3 text-green-500" />}
        <span className="font-bold">{current.toFixed(2)}</span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", highlight ? "border-green-500/20 bg-green-500/5" : "border-border bg-secondary/50")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className={cn("text-lg font-bold", highlight && "text-green-500")}>{value}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-10 w-12 rounded bg-muted" />
              <div className="h-10 w-12 rounded bg-muted" />
              <div className="h-10 w-12 rounded bg-muted" />
            </div>
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Yardımcı Fonksiyonlar ----

function createDefaultColumn(label: string): TotoColumn {
  return {
    id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    label,
    selections: {},
    type: "single",
    totalCombinations: 0,
    costPerColumn: 1,
    totalCost: 0,
  };
}

function calculateColumnCost(selections: Record<string, TotoSelection[]>): {
  totalCombinations: number;
  totalCost: number;
} {
  let combinations = 1;
  for (const sels of Object.values(selections)) {
    combinations *= sels.length;
  }
  return {
    totalCombinations: combinations,
    totalCost: combinations * 1, // 1 TL per column
  };
}
