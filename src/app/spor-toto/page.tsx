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
  Trophy as TrophyIcon,
  Lock,
  Siren,
  HeartCrack,
  UserX,
  Megaphone,
  Calculator,
  Star,
  Layers,
  X,
  Check,
  Search,
  Copy,
  Wallet,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TotoProgram,
  TotoBulletinSummary,
  TotoMatch,
  TotoSelection,
  TotoKeyFactor,
  FormResult,
  TotoSurprise,
  TeamMotivationContext,
  TotoMotivation,
} from "@/types/spor-toto";
import { buildSporTotoCoupons, type SporTotoCoupon, type CouponMatchPick } from "@/lib/spor-toto";

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

const SURPRISE_COLOR: Record<TotoSurprise["level"], string> = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  extreme: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const SURPRISE_LABEL: Record<TotoSurprise["level"], string> = {
  low: "Sürpriz Düşük",
  medium: "Sürpriz Orta",
  high: "Sürpriz Riski",
  extreme: "Tuzak!",
};

const MOTIVATION_COLOR: Record<TotoMotivation["intensity"], string> = {
  high: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-muted/40 text-muted-foreground border-border",
};

const MOTIVATION_STATUS_LABEL: Record<TeamMotivationContext["status"], string> = {
  title_race: "🏆 Şampiyonluk",
  european: "🌍 Avrupa Hattı",
  midtable: "Orta Sıra",
  relegation_battle: "🔥 Küme Hattı",
  relegated_safe: "💤 Garanti",
  unknown: "?",
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
    weekday: "short",
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

interface CandidateApiResponse {
  success: boolean;
  startDate: string;
  endDate: string;
  candidates: ForeignCandidate[];
  error?: string;
}

interface ForeignCandidate {
  fixtureId: number;
  league: { id: number; name: string; country: string; logo: string; flag?: string | null };
  kickoff: string;
  homeTeam: { id: number; name: string; logo: string };
  awayTeam: { id: number; name: string; logo: string };
}

type ViewMode = "all" | "tr" | "foreign" | "surprise" | "banko";

// Hafta başlangıcını (Cuma) hesapla — localStorage anahtarı için
function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Pzr ... 5=Cum 6=Cmt
  const diff = (day - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

function loadSelection(weekKey: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`spor-toto:foreign:${weekKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function saveSelection(weekKey: string, ids: number[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`spor-toto:foreign:${weekKey}`, JSON.stringify(ids));
}

export default function SporTotoPage() {
  const [date, setDate] = useState<string>("");
  const [program, setProgram] = useState<TotoProgram | null>(null);
  const [summary, setSummary] = useState<TotoBulletinSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>("all");
  const [selectedForeignIds, setSelectedForeignIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // İlk render sonrası tarihi ayarla (hydration mismatch'i önle)
  useEffect(() => {
    if (!date) setDate(new Date().toISOString().split("T")[0]);
  }, [date]);

  const weekKey = useMemo(() => (date ? getWeekKey(date) : ""), [date]);

  // localStorage'dan seçimi yükle
  useEffect(() => {
    if (weekKey) setSelectedForeignIds(loadSelection(weekKey));
  }, [weekKey]);

  const fetchData = useCallback(async () => {
    // 6 yabancı maç seçilmeden bülten yükleme — API çok ağır
    if (selectedForeignIds.length !== 6) {
      setLoading(false);
      setProgram(null);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date, days: "4" });
      params.set("foreignIds", selectedForeignIds.join(","));
      const res = await fetch(`/api/spor-toto?${params.toString()}`);
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
  }, [date, selectedForeignIds]);

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

  const filteredMatches = useMemo(() => {
    if (!program) return [];
    return program.matches.filter((m) => {
      switch (view) {
        case "tr":
          return m.totoTier === "tr_banko";
        case "foreign":
          return m.totoTier === "foreign_surprise";
        case "surprise":
          return m.surprise.level === "high" || m.surprise.level === "extreme";
        case "banko":
          return (
            m.aiPrediction &&
            m.aiPrediction.confidence >= 65 &&
            m.surprise.level !== "high" &&
            m.surprise.level !== "extreme"
          );
        default:
          return true;
      }
    });
  }, [program, view]);

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
            Cuma → Pazartesi · 9 TR + 6 yabancı maç ·{" "}
            <span className="text-primary">Az kolon, çok kazanç stratejisi</span>
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
          <button
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              selectedForeignIds.length === 6
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15"
            )}
          >
            <Trophy className="h-4 w-4" />
            Yabancı Maçlar ({selectedForeignIds.length}/6)
          </button>
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

      {/* Yabancı maç seçilmediyse uyarı */}
      {selectedForeignIds.length < 6 && !loading && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Spor Toto&apos;nun bu hafta seçtiği <strong>6 yabancı maçı</strong> belirtmen lazım.
              Şu an <strong>{selectedForeignIds.length}/6</strong> seçili — analiz başlatmak için 6 maç seç.
            </span>
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            className="shrink-0 rounded-md bg-amber-500/20 px-3 py-1 text-xs font-semibold hover:bg-amber-500/30"
          >
            Maçları Seç
          </button>
        </div>
      )}

      {/* Henüz seçim yoksa büyük CTA */}
      {selectedForeignIds.length !== 6 && !loading && !program && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Trophy className="mx-auto h-12 w-12 text-primary/60" />
          <h2 className="mt-3 text-lg font-bold">Yabancı Maçları Seç</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Bu hafta Spor Toto kuponunda yer alan <strong>6 yabancı maçı</strong> işaretle.
            9 TR maçı zaten otomatik geliyor — toplam 15 maç üzerinden detaylı analiz başlayacak.
          </p>
          <button
            onClick={() => {
              console.log("[Spor Toto] Picker button clicked");
              setPickerOpen(true);
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Trophy className="h-4 w-4" />
            Maç Seçim Ekranını Aç ({selectedForeignIds.length}/6)
          </button>
        </div>
      )}

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

      {/* Bülten başlığı */}
      {program && summary && (
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 to-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {program.season} · Cuma → Pazartesi
              </div>
              <h2 className="text-xl font-bold">{program.name}</h2>
              <div className="mt-1 text-sm text-muted-foreground">
                {program.startDate} → {program.endDate} · {program.totalMatches} maç
                {" · "}
                <span className="font-semibold text-emerald-400">
                  {summary.tierBreakdown.trBanko} TR
                </span>
                {" + "}
                <span className="font-semibold text-sky-400">
                  {summary.tierBreakdown.foreignSurprise} Yabancı
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Zorluk</div>
                <div className={cn("text-base font-bold", DIFFICULTY_COLOR[summary.difficulty])}>
                  {DIFFICULTY_LABEL[summary.difficulty]}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Beklenen Doğru</div>
                <div className="text-base font-bold text-primary">
                  {summary.expectedCorrect.toFixed(1)}/{summary.totalMatches}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-muted/40 p-3 text-sm text-foreground/90">
            <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
            {summary.aiSummary}
          </p>
        </div>
      )}

      {/* Sürpriz Alarmı + Banko Adayları */}
      {program && summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Sürpriz Alarm */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
              <Siren className="h-4 w-4" />
              Sürpriz Alarmı ({summary.surpriseAlerts.length})
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Banko görünüp tuzak olabilecek maçlar — çift şans veya alternatif düşün.
            </p>
            <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {summary.surpriseAlerts.length === 0 && (
                <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                  Sürpriz alarmı yok ✅ Sıkı kupon güvenli.
                </div>
              )}
              {summary.surpriseAlerts.map((alert) => {
                const m = program.matches.find((x) => x.id === alert.matchId);
                if (!m) return null;
                return (
                  <div
                    key={alert.matchId}
                    className="rounded-lg border border-rose-500/20 bg-card p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {m.bulletinOrder}
                        </span>
                        <span className="font-medium">
                          {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground line-through">
                          {alert.favoritePick}
                        </span>
                        <span className="text-rose-400">→</span>
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 font-bold",
                            PICK_COLOR[alert.upsetPick]
                          )}
                        >
                          {alert.upsetPick}
                        </span>
                        <span className="ml-1 rounded bg-rose-500/20 px-1.5 py-0.5 font-bold text-rose-400">
                          %{alert.surpriseScore}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {alert.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Banko Adayları */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <Lock className="h-4 w-4" />
              Banko Adayları ({summary.bankoCandidates.length})
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Yüksek güven + düşük sürpriz — sıkı kupon temeli.
            </p>
            <div className="mt-3 space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {summary.bankoCandidates.length === 0 && (
                <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                  Net banko aday yok — çift şans gerekli.
                </div>
              )}
              {summary.bankoCandidates.map((b) => {
                const m = program.matches.find((x) => x.id === b.matchId);
                if (!m) return null;
                return (
                  <div
                    key={b.matchId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-card p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-xs">
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary shrink-0">
                        {m.bulletinOrder}
                      </span>
                      {m.totoTier === "tr_banko" && (
                        <Star className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
                      )}
                      <span className="truncate font-medium">
                        {m.homeTeam.shortName} - {m.awayTeam.shortName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-bold",
                          PICK_COLOR[b.pick]
                        )}
                      >
                        {b.pick}
                      </span>
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        %{b.confidence}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Kupon Stratejisi */}
      {program && summary && (
        <CouponStrategyCard summary={summary} program={program} />
      )}

      {/* 5 Kupon Önerisi */}
      {program && program.matches.length > 0 && (
        <SporTotoCouponsCard matches={program.matches} />
      )}

      {/* View tabs */}
      {program && summary && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <ViewTab current={view} value="all" label={`Tümü (${program.matches.length})`} icon={Layers} onChange={setView} />
          <ViewTab current={view} value="tr" label={`TR (${summary.tierBreakdown.trBanko})`} icon={Star} onChange={setView} />
          <ViewTab current={view} value="foreign" label={`Yabancı (${summary.tierBreakdown.foreignSurprise})`} icon={Trophy} onChange={setView} />
          <ViewTab current={view} value="surprise" label={`Sürpriz (${summary.surpriseAlerts.length})`} icon={Siren} onChange={setView} />
          <ViewTab current={view} value="banko" label={`Banko (${summary.bankoCandidates.length})`} icon={Lock} onChange={setView} />
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
              Bu kriterlerde maç yok.
            </div>
          )}
        </div>
      )}

      {/* Yabancı maç seçim modalı */}
      {pickerOpen && (
        <ForeignPickerModal
          date={date}
          weekKey={weekKey}
          initialSelected={selectedForeignIds}
          onClose={() => setPickerOpen(false)}
          onSave={(ids) => {
            saveSelection(weekKey, ids);
            setSelectedForeignIds(ids);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// View tab
// ============================================

function ViewTab({
  current,
  value,
  label,
  icon: Icon,
  onChange,
}: {
  current: ViewMode;
  value: ViewMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onChange: (v: ViewMode) => void;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onChange(value)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ============================================
// Coupon Strategy Card
// ============================================

function CouponStrategyCard({
  summary,
  program,
}: {
  summary: TotoBulletinSummary;
  program: TotoProgram;
}) {
  const bankoCount = summary.bankoCandidates.length;
  const surpriseCount = summary.surpriseAlerts.length;
  const doubleCount = summary.doubleChanceCandidates.length;

  const hardPicks = bankoCount;
  const doublesNeeded = Math.min(
    doubleCount + surpriseCount,
    program.totalMatches - hardPicks
  );
  const triplesNeeded = Math.max(
    0,
    program.totalMatches - hardPicks - doublesNeeded
  );

  const totalCombinations =
    Math.pow(2, doublesNeeded) * Math.pow(3, triplesNeeded);
  const costPerColumn = 2;
  const totalCost = totalCombinations * costPerColumn;

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Calculator className="h-4 w-4" />
        Önerilen Kupon Stratejisi
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Bankoları tek, dengelileri çift şans, sürpriz dolu maçları üçlü oyna.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <StrategyMetric
          label="Tek Seçim"
          value={hardPicks}
          color="text-emerald-400"
          icon={Lock}
          desc="Banko aday"
        />
        <StrategyMetric
          label="Çift Şans"
          value={doublesNeeded}
          color="text-amber-400"
          icon={Layers}
          desc="1X / X2 / 12"
        />
        <StrategyMetric
          label="Üçlü"
          value={triplesNeeded}
          color="text-rose-400"
          icon={Siren}
          desc="Tüm seçenekler"
        />
        <StrategyMetric
          label="Toplam"
          value={totalCombinations}
          color="text-primary"
          icon={Calculator}
          desc={`~${totalCost.toFixed(0)} TL`}
        />
      </div>

      {hardPicks >= 12 && (
        <div className="mt-3 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
          ✨ <strong>Mükemmel hafta!</strong> Çok fazla banko var — 1-2 kolonlu sıkı kupon yapılabilir.
        </div>
      )}
      {hardPicks < 8 && surpriseCount >= 5 && (
        <div className="mt-3 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-400">
          ⚠️ <strong>Riskli hafta!</strong> Az banko, çok sürpriz — kolon sayısı patlayabilir, sistem oyna.
        </div>
      )}
    </div>
  );
}

function StrategyMetric({
  label,
  value,
  color,
  icon: Icon,
  desc,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
    </div>
  );
}

// ============================================
// 5 Kupon Önerisi (Spor Toto Kupon Kartı)
// ============================================

const RISK_LABEL: Record<SporTotoCoupon["riskLevel"], string> = {
  very_low: "Çok Güvenli",
  low: "Güvenli",
  medium: "Dengeli",
  high: "Riskli",
  very_high: "Yüksek Risk",
};

const COUPON_RISK_COLOR: Record<SporTotoCoupon["riskLevel"], string> = {
  very_low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  low: "bg-green-500/15 text-green-400 border-green-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  very_high: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const MODE_BADGE: Record<CouponMatchPick["mode"], string> = {
  single: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  double: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  triple: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function SporTotoCouponsCard({ matches }: { matches: TotoMatch[] }) {
  const coupons = useMemo(() => buildSporTotoCoupons(matches), [matches]);
  const [activeId, setActiveId] = useState<string>("dengeli");
  const [copied, setCopied] = useState(false);

  if (coupons.length === 0) return null;

  const active = coupons.find((c) => c.id === activeId) ?? coupons[0];

  const handleCopy = async () => {
    const lines = [
      `${active.emoji} ${active.name} — ${active.totalColumns} kolon · ${active.totalCost} TL`,
      "",
      ...active.picks.map(
        (p, i) =>
          `${(i + 1).toString().padStart(2, " ")}. ${p.homeTeam} - ${p.awayTeam}  →  ${p.label}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sessizce yut
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Ticket className="h-4 w-4" />
          5 Spor Toto Kupon Önerisi
        </div>
        <span className="text-[10px] text-muted-foreground">
          Kolon başı {active.pricePerColumn} TL
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Banko + çifte şans + üçlü dağılımıyla ucuzdan pahalıya 5 farklı kupon. Bilyoner&apos;e aynen yazabilirsin.
      </p>

      {/* Kupon seçici tabs */}
      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        {coupons.map((c) => {
          const isActive = c.id === active.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                "rounded-lg border p-2 text-left transition",
                isActive
                  ? "border-primary bg-primary/15 ring-1 ring-primary"
                  : "border-border bg-card hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-1 text-xs font-semibold">
                <span>{c.emoji}</span>
                <span className="truncate">{c.name}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {c.totalColumns} kolon
              </div>
              <div className="text-[11px] font-bold text-primary">
                {c.totalCost} TL
              </div>
            </button>
          );
        })}
      </div>

      {/* Aktif kupon detayı */}
      <div className="mt-4 rounded-lg border border-border bg-card/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <span>{active.emoji}</span>
              <span>{active.name}</span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                  COUPON_RISK_COLOR[active.riskLevel]
                )}
              >
                {RISK_LABEL[active.riskLevel]}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {active.description}
            </p>
          </div>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" /> Kopyalandı
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Kuponu Kopyala
              </>
            )}
          </button>
        </div>

        {/* Özet metrikler */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <CouponMetric
            icon={Lock}
            label="Tek"
            value={active.bankoCount}
            color="text-emerald-400"
          />
          <CouponMetric
            icon={Layers}
            label="Çift"
            value={active.doubleCount}
            color="text-amber-400"
          />
          <CouponMetric
            icon={Siren}
            label="Üçlü"
            value={active.tripleCount}
            color="text-rose-400"
          />
          <CouponMetric
            icon={Calculator}
            label="Kolon"
            value={active.totalColumns}
            color="text-primary"
          />
          <CouponMetric
            icon={Wallet}
            label="Maliyet"
            value={`${active.totalCost} TL`}
            color="text-cyan-400"
          />
        </div>

        {/* Maç listesi */}
        <div className="mt-3 space-y-1.5">
          {active.picks.map((p, idx) => (
            <div
              key={p.matchId}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-xs"
            >
              <span className="w-5 shrink-0 text-right text-[10px] text-muted-foreground">
                {idx + 1}.
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{p.homeTeam}</span>
                <span className="mx-1 text-muted-foreground">vs</span>
                <span className="font-medium">{p.awayTeam}</span>
              </span>
              {p.isBanko && (
                <Star className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
              )}
              {p.isSurprise && (
                <Siren className="h-3 w-3 shrink-0 text-rose-400" />
              )}
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold",
                  MODE_BADGE[p.mode]
                )}
                title={p.reasoning}
              >
                {p.label}
              </span>
            </div>
          ))}
        </div>

        {/* Alt bilgi */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-400">
            <ShieldCheck className="mr-1 inline h-3 w-3" />
            Tutturma olasılığı: <strong>%{active.expectedAccuracy.toFixed(2)}</strong>
          </div>
          <div className="rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] text-primary">
            <TrendingUp className="mr-1 inline h-3 w-3" />
            {active.totalColumns} kolon × {active.pricePerColumn} TL ={" "}
            <strong>{active.totalCost} TL</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function CouponMetric({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-bold", color)}>{value}</div>
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
  const isFinished = match.status === "finished";
  const isLive = match.status === "live" || match.status === "halftime";
  const correctPick =
    match.result && ai && match.result === ai.recommendation;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        match.totoTier === "tr_banko"
          ? "border-emerald-500/20"
          : "border-border",
        match.surprise.level === "extreme" && "border-rose-500/40"
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
      >
        {/* Order badge */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
            match.totoTier === "tr_banko"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-primary/10 text-primary"
          )}
        >
          {match.bulletinOrder}
        </div>

        {/* League + time */}
        <div className="hidden w-36 shrink-0 text-xs text-muted-foreground sm:block">
          <div className="flex items-center gap-1">
            <span>{match.league.flag}</span>
            <span className="truncate">{match.league.name}</span>
            {match.totoTier === "tr_banko" && (
              <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(match.kickoff)}
          </div>
        </div>

        {/* Teams */}
        <div className="min-w-0 flex-1">
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
            {match.homeTeam.position > 0 && (
              <span className="hidden rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                {match.homeTeam.position}.
              </span>
            )}
            {match.injuries.homeCount > 0 && (
              <span className="hidden items-center gap-0.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400 sm:inline-flex">
                <UserX className="h-2.5 w-2.5" />
                {match.injuries.homeCount}
              </span>
            )}
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
            {match.awayTeam.position > 0 && (
              <span className="hidden rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                {match.awayTeam.position}.
              </span>
            )}
            {match.injuries.awayCount > 0 && (
              <span className="hidden items-center gap-0.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400 sm:inline-flex">
                <UserX className="h-2.5 w-2.5" />
                {match.injuries.awayCount}
              </span>
            )}
          </div>
        </div>

        {/* Score / Status */}
        {(isFinished || isLive) && match.score && (
          <div className="hidden text-center sm:block">
            <div className="text-xs text-muted-foreground">
              {isLive ? `${match.elapsed}'` : "MS"}
            </div>
            <div
              className={cn(
                "text-xl font-bold",
                isLive ? "text-emerald-400" : "text-foreground"
              )}
            >
              {match.score.home ?? 0}-{match.score.away ?? 0}
            </div>
          </div>
        )}

        {/* Surprise badge */}
        {match.surprise.level !== "low" && (
          <div
            className={cn(
              "hidden shrink-0 rounded-lg border px-2 py-1 text-center text-[10px] md:block",
              SURPRISE_COLOR[match.surprise.level]
            )}
          >
            <div className="flex items-center gap-1">
              <Siren className="h-3 w-3" />
              <span className="font-bold">%{match.surprise.score}</span>
            </div>
          </div>
        )}

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
              PICK_COLOR[ai.recommendation],
              correctPick && "ring-2 ring-emerald-500/50"
            )}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-80">AI</div>
            <div className="text-base font-bold leading-tight">{ai.recommendation}</div>
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
        <div className="space-y-5 border-t border-border bg-muted/10 p-5">
          {/* Sürpriz uyarısı */}
          {match.surprise.level !== "low" && (
            <div
              className={cn(
                "rounded-lg border p-3",
                SURPRISE_COLOR[match.surprise.level]
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Siren className="h-4 w-4" />
                  {SURPRISE_LABEL[match.surprise.level]} (skor:{" "}
                  {match.surprise.score})
                </div>
                {match.surprise.upsetPick && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Sürpriz:</span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-bold",
                        PICK_COLOR[match.surprise.upsetPick]
                      )}
                    >
                      {match.surprise.upsetPick}
                    </span>
                    {match.surprise.upsetOdds && (
                      <span className="font-bold">
                        @{match.surprise.upsetOdds.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {match.surprise.reasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {match.surprise.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Motivasyon */}
          <div
            className={cn(
              "rounded-lg border p-3",
              MOTIVATION_COLOR[match.motivation.intensity]
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Megaphone className="h-4 w-4" />
              Motivasyon ·{" "}
              {match.motivation.intensity === "high"
                ? "Yüksek"
                : match.motivation.intensity === "medium"
                  ? "Orta"
                  : "Düşük"}
            </div>
            <div className="mt-2 text-sm">{match.motivation.summary}</div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <MotivationPanel
                team={match.homeTeam.name}
                ctx={match.motivation.homeContext}
              />
              <MotivationPanel
                team={match.awayTeam.name}
                ctx={match.motivation.awayContext}
              />
            </div>
          </div>

          {/* AI Recommendation */}
          {ai && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                  <p className="mt-2 text-sm text-foreground/90">{ai.reasoning}</p>
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
                  <div className="text-3xl font-bold text-primary">%{ai.confidence}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Güven
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sakat oyuncular */}
          {(match.injuries.homeCount > 0 || match.injuries.awayCount > 0) && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <HeartCrack className="h-3.5 w-3.5" />
                Sakat / Cezalı Oyuncular
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <InjuryPanel team={match.homeTeam.name} list={match.injuries.home} />
                <InjuryPanel team={match.awayTeam.name} list={match.injuries.away} />
              </div>
            </div>
          )}

          {/* Hakem */}
          {match.refereeName && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Hakem:</span>
              <span className="font-semibold">{match.refereeName}</span>
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
                    <div className="font-bold text-emerald-400">{match.stats.h2h.homeWins}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Beraberlik</div>
                    <div className="font-bold text-amber-400">{match.stats.h2h.draws}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Dep G</div>
                    <div className="font-bold text-sky-400">{match.stats.h2h.awayWins}</div>
                  </div>
                </div>
                {match.stats.h2h.recentMatches.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs">
                    {match.stats.h2h.recentMatches.map((rm, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-muted/30 px-2 py-1">
                        <span className="truncate text-muted-foreground">
                          {new Date(rm.date).toLocaleDateString("tr-TR")}
                        </span>
                        <span className="truncate">
                          {rm.homeTeam} <span className="font-bold">{rm.score}</span> {rm.awayTeam}
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
                        <div className="mt-0.5 text-muted-foreground">{f.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub components
// ============================================

function MotivationPanel({ team, ctx }: { team: string; ctx: TeamMotivationContext }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{team}</div>
      <div className="mt-0.5 text-xs font-semibold">
        {MOTIVATION_STATUS_LABEL[ctx.status]}
      </div>
      <div className="text-[11px] text-muted-foreground">{ctx.label}</div>
      {ctx.targetDescription && (
        <div className="mt-1 text-[10px] text-foreground/80">
          → {ctx.targetDescription}
        </div>
      )}
    </div>
  );
}

function InjuryPanel({
  team,
  list,
}: {
  team: string;
  list: { name: string; reason: string; importance: "key" | "regular" | "rotation" }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold">{team}</div>
      {list.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">Eksik yok ✅</div>
      ) : (
        <ul className="space-y-1 text-[11px]">
          {list.slice(0, 6).map((p, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center justify-between gap-2 rounded px-1.5 py-1",
                p.importance === "key"
                  ? "bg-rose-500/10 text-rose-400"
                  : "bg-muted/30"
              )}
            >
              <span className="truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-[10px] opacity-80">{p.reason}</span>
            </li>
          ))}
          {list.length > 6 && (
            <li className="text-[10px] text-muted-foreground">
              + {list.length - 6} oyuncu daha
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

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
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
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

      {team.form.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Form:</span>
          <div className="flex gap-1">
            {team.form.map((f, i) => (
              <FormBadge key={i} result={f} />
            ))}
          </div>
          <span className="ml-auto text-xs font-semibold">%{team.formPoints}</span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Maç" value={team.played} />
        <Stat label="Avg Gol" value={team.avgGoalsScored.toFixed(2)} />
        <Stat label="Avg Yenilen" value={team.avgGoalsConceded.toFixed(2)} />
        <Stat label="KG Var %" value={`${Math.round(team.bttsRate)}`} />
        <Stat label="Clean Sheet %" value={`${Math.round(team.cleanSheetPct)}`} />
        <Stat label="Gol Atamama %" value={`${Math.round(team.failedToScorePct)}`} />
      </div>

      {record && (
        <div className="mt-3 rounded-md bg-muted/30 p-2 text-[11px]">
          <div className="mb-1 font-semibold text-muted-foreground">
            {side === "home" ? "Evinde" : "Deplasmanda"}: {record.played} maç
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <span className="font-bold text-emerald-400">{record.won}</span> G
            </div>
            <div>
              <span className="font-bold text-amber-400">{record.drawn}</span> B
            </div>
            <div>
              <span className="font-bold text-rose-400">{record.lost}</span> M
            </div>
          </div>
          <div className="mt-1 text-center text-muted-foreground">
            Kazanma %{Math.round(record.winRate)} · Avg gol {record.avgGoals.toFixed(2)}
          </div>
        </div>
      )}

      {(team.streak.wins >= 2 || team.streak.losses >= 2 || team.streak.unbeaten >= 3) && (
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

// ============================================
// Foreign Picker Modal
// ============================================

function ForeignPickerModal({
  date,
  weekKey,
  initialSelected,
  onClose,
  onSave,
}: {
  date: string;
  weekKey: string;
  initialSelected: number[];
  onClose: () => void;
  onSave: (ids: number[]) => void;
}) {
  const [candidates, setCandidates] = useState<ForeignCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set(initialSelected));
  const [search, setSearch] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<number | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/spor-toto?date=${date}&days=4&mode=candidates`
        );
        const data: CandidateApiResponse = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || "Adaylar yüklenemedi");
        } else {
          setCandidates(data.candidates || []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const leagues = useMemo(() => {
    const map = new Map<number, { id: number; name: string; flag?: string | null }>();
    candidates.forEach((c) => {
      if (!map.has(c.league.id)) {
        map.set(c.league.id, { id: c.league.id, name: c.league.name, flag: c.league.flag });
      }
    });
    return Array.from(map.values());
  }, [candidates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (leagueFilter !== "all" && c.league.id !== leagueFilter) return false;
      if (!q) return true;
      return (
        c.homeTeam.name.toLowerCase().includes(q) ||
        c.awayTeam.name.toLowerCase().includes(q) ||
        c.league.name.toLowerCase().includes(q)
      );
    });
  }, [candidates, search, leagueFilter]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 6) return prev; // max 6
        next.add(id);
      }
      return next;
    });
  };

  const canSave = selected.size === 6;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Trophy className="h-5 w-5 text-primary" />
              Yabancı Maç Seçimi
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hafta: {weekKey} · Spor Toto&apos;nun bu hafta seçtiği <strong>6 yabancı maçı</strong> işaretle.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 p-3">
          <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Takım veya lig ara..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={leagueFilter}
            onChange={(e) =>
              setLeagueFilter(
                e.target.value === "all" ? "all" : parseInt(e.target.value, 10)
              )
            }
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none"
          >
            <option value="all">Tüm Ligler</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.flag ?? ""} {l.name}
              </option>
            ))}
          </select>
          <div
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-sm font-bold",
              canSave
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-amber-500/40 bg-amber-500/15 text-amber-400"
            )}
          >
            {selected.size}/6
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Bu kriterlerde maç yok.
            </div>
          )}
          <div className="space-y-1.5">
            {filtered.map((c) => {
              const isSelected = selected.has(c.fixtureId);
              const disabled = !isSelected && selected.size >= 6;
              return (
                <button
                  key={c.fixtureId}
                  onClick={() => toggle(c.fixtureId)}
                  disabled={disabled}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                    isSelected
                      ? "border-primary/50 bg-primary/10"
                      : disabled
                        ? "border-border bg-muted/20 opacity-40"
                        : "border-border bg-card hover:bg-muted/30"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>

                  <div className="hidden w-32 shrink-0 text-xs text-muted-foreground sm:block">
                    <div className="flex items-center gap-1">
                      <span>{c.league.flag ?? "🌍"}</span>
                      <span className="truncate">{c.league.name}</span>
                    </div>
                    <div className="mt-0.5">
                      {new Date(c.kickoff).toLocaleString("tr-TR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      {c.homeTeam.logo && (
                        <Image
                          src={c.homeTeam.logo}
                          alt=""
                          width={18}
                          height={18}
                          className="h-[18px] w-[18px]"
                          unoptimized
                        />
                      )}
                      <span className="truncate font-medium">{c.homeTeam.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      {c.awayTeam.logo && (
                        <Image
                          src={c.awayTeam.logo}
                          alt=""
                          width={18}
                          height={18}
                          className="h-[18px] w-[18px]"
                          unoptimized
                        />
                      )}
                      <span className="truncate font-medium">{c.awayTeam.name}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 p-3">
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Seçimi Temizle
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              İptal
            </button>
            <button
              onClick={() => onSave(Array.from(selected))}
              disabled={!canSave}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
                canSave
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              )}
            >
              Kaydet ({selected.size}/6)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
