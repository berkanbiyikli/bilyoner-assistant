"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type { MatchAnalysis } from "@/types";

// ============================================
// Senaryo Badge'leri — Maçın karakterini özetler
// ============================================

interface ScenarioBadge {
  label: string;
  color: string;   // tailwind bg class
  icon: string;     // emoji
}

export function getScenarioBadges(analysis: MatchAnalysis): ScenarioBadge[] {
  const badges: ScenarioBadge[] = [];

  // xG verimsizlik → Patlama Uyarısı
  if ((analysis.xgDelta ?? 0) > 0.5) {
    badges.push({
      label: "Patlama Uyarısı",
      icon: "💥",
      color: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    });
  }

  // Her iki savunma güçlü → Savunma Duvarı
  if (analysis.homeDefense > 65 && analysis.awayDefense > 65) {
    badges.push({
      label: "Savunma Duvarı",
      icon: "🧱",
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    });
  }

  // Her iki hücum güçlü → Gol Şöleni
  if (analysis.homeAttack > 65 && analysis.awayAttack > 60) {
    badges.push({
      label: "Gol Şöleni",
      icon: "⚽",
      color: "bg-green-500/15 text-green-400 border-green-500/30",
    });
  }

  // Geç gol olasılığı yüksek → Son Dakika Tehlikesi
  if (analysis.goalTiming && analysis.goalTiming.lateGoalProb > 55) {
    badges.push({
      label: "Son Dakika",
      icon: "⏰",
      color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    });
  }

  // Hakemden dolayı kart beklentisi → Kartlı Maç
  if (analysis.refereeProfile?.cardTendency === "strict") {
    badges.push({
      label: "Kartlı Maç",
      icon: "🟨",
      color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    });
  }

  // Kilit oyuncu eksikleri → Sakatlık Riski
  if (analysis.keyMissingPlayers && analysis.keyMissingPlayers.filter(p => p.impactLevel === "critical").length >= 2) {
    badges.push({
      label: "Sakatlık Riski",
      icon: "🚑",
      color: "bg-red-500/15 text-red-400 border-red-500/30",
    });
  }

  // H2H geçmişi baskın → Tarihsel Üstünlük
  if (analysis.h2hAdvantage !== "neutral") {
    badges.push({
      label: analysis.h2hAdvantage === "home" ? "Ev H2H Üstün" : "Dep H2H Üstün",
      icon: "📜",
      color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    });
  }

  // Korner beklentisi yüksek
  if (analysis.cornerData && analysis.cornerData.totalAvg > 10) {
    badges.push({
      label: "Korner Fırtınası",
      icon: "⚡",
      color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    });
  }

  return badges.slice(0, 3); // En fazla 3 badge
}

export function ScenarioBadges({ analysis }: { analysis: MatchAnalysis }) {
  const badges = getScenarioBadges(analysis);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
            badge.color
          )}
        >
          <span>{badge.icon}</span>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

// ============================================
// Poisson Skor Dağılımı — Mini Bar Chart
// ============================================

export function ScoreDistributionChart({
  scorelines,
}: {
  scorelines: { score: string; probability: number }[];
}) {
  if (!scorelines || scorelines.length === 0) return null;

  const data = scorelines.map((s) => ({
    score: s.score,
    prob: s.probability,
  }));

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        🎲 Monte Carlo Skor Dağılımı
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis
            dataKey="score"
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`%${value}`, "Olasılık"]}
            labelFormatter={(label) => `Skor: ${label}`}
          />
          <Bar dataKey="prob" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === 0 ? "#3b82f6" : i === 1 ? "#6366f1" : "#8b5cf6"}
                opacity={1 - i * 0.15}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================
// xG Momentum Bar — İki takımın hücum kıyaslaması
// ============================================

export function XgMomentumBar({
  homeXg,
  awayXg,
  homeAttack,
  awayAttack,
  homeName,
  awayName,
}: {
  homeXg: number;
  awayXg: number;
  homeAttack: number;
  awayAttack: number;
  homeName: string;
  awayName: string;
}) {
  const totalXg = homeXg + awayXg || 1;
  const homePercent = (homeXg / totalXg) * 100;
  const awayPercent = (awayXg / totalXg) * 100;

  const totalAttack = homeAttack + awayAttack || 1;
  const homeAtkPercent = (homeAttack / totalAttack) * 100;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        📊 xG & Hücum Kıyaslaması
      </p>

      {/* xG Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-blue-400 font-medium">{homeName} ({homeXg.toFixed(2)})</span>
          <span className="text-[10px] text-muted-foreground">xG</span>
          <span className="text-purple-400 font-medium">({awayXg.toFixed(2)}) {awayName}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
            style={{ width: `${homePercent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-500"
            style={{ width: `${awayPercent}%` }}
          />
        </div>
      </div>

      {/* Attack Power Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-emerald-400 font-medium">{homeAttack}</span>
          <span className="text-[10px] text-muted-foreground">Hücum Gücü</span>
          <span className="text-emerald-400 font-medium">{awayAttack}</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
            style={{ width: `${homeAtkPercent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500"
            style={{ width: `${100 - homeAtkPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Gol Zamanlaması Timeline — Renkli heatmap bar
// ============================================

interface TimingSlot {
  label: string;
  homeVal: number;
  awayVal: number;
}

export function GoalTimeline({
  goalTiming,
}: {
  goalTiming: NonNullable<MatchAnalysis["goalTiming"]>;
}) {
  const slots: TimingSlot[] = [
    { label: "0-15'", homeVal: goalTiming.home.first15, awayVal: goalTiming.away.first15 },
    {
      label: "16-45'",
      homeVal: Math.max(0, goalTiming.home.first45 - goalTiming.home.first15),
      awayVal: Math.max(0, goalTiming.away.first45 - goalTiming.away.first15),
    },
    {
      label: "46-60'",
      homeVal: Math.max(0, 100 - goalTiming.home.first45 - goalTiming.home.last30),
      awayVal: Math.max(0, 100 - goalTiming.away.first45 - goalTiming.away.last30),
    },
    {
      label: "61-75'",
      homeVal: Math.max(0, goalTiming.home.last30 - goalTiming.home.last15),
      awayVal: Math.max(0, goalTiming.away.last30 - goalTiming.away.last15),
    },
    { label: "76-90'+", homeVal: goalTiming.home.last15, awayVal: goalTiming.away.last15 },
  ];

  const getHeatColor = (val: number) => {
    if (val >= 30) return "bg-red-500";
    if (val >= 20) return "bg-orange-500";
    if (val >= 15) return "bg-yellow-500";
    if (val >= 10) return "bg-emerald-500";
    return "bg-zinc-700";
  };

  const getHeatOpacity = (val: number) => {
    if (val >= 30) return "opacity-100";
    if (val >= 20) return "opacity-90";
    if (val >= 15) return "opacity-75";
    if (val >= 10) return "opacity-60";
    return "opacity-40";
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        ⏱️ Gol Zamanlaması Haritası
      </p>
      <div className="space-y-1.5">
        {/* Home row */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-8 shrink-0">Ev</span>
          <div className="flex flex-1 gap-0.5">
            {slots.map((slot) => (
              <div
                key={`h-${slot.label}`}
                className={cn(
                  "flex-1 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold text-white transition-all",
                  getHeatColor(slot.homeVal),
                  getHeatOpacity(slot.homeVal)
                )}
                title={`${slot.label}: %${slot.homeVal}`}
              >
                {slot.homeVal > 0 ? `${slot.homeVal}` : ""}
              </div>
            ))}
          </div>
        </div>
        {/* Away row */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-8 shrink-0">Dep</span>
          <div className="flex flex-1 gap-0.5">
            {slots.map((slot) => (
              <div
                key={`a-${slot.label}`}
                className={cn(
                  "flex-1 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold text-white transition-all",
                  getHeatColor(slot.awayVal),
                  getHeatOpacity(slot.awayVal)
                )}
                title={`${slot.label}: %${slot.awayVal}`}
              >
                {slot.awayVal > 0 ? `${slot.awayVal}` : ""}
              </div>
            ))}
          </div>
        </div>
        {/* Labels */}
        <div className="flex items-center gap-1">
          <span className="w-8 shrink-0" />
          <div className="flex flex-1 gap-0.5">
            {slots.map((slot) => (
              <span key={`l-${slot.label}`} className="flex-1 text-center text-[9px] text-muted-foreground">
                {slot.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* Insights */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {goalTiming.lateGoalProb > 50 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Geç gol: %{goalTiming.lateGoalProb}
          </span>
        )}
        {goalTiming.firstHalfGoalProb > 55 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            İY gol: %{goalTiming.firstHalfGoalProb}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// Hakem & Sakatlık Bilgi Kartları
// ============================================

export function RefereeCard({ analysis }: { analysis: MatchAnalysis }) {
  const ref = analysis.refereeProfile;
  if (!ref) return null;

  const tendencyLabel = ref.cardTendency === "strict" ? "Kartçı" : ref.cardTendency === "lenient" ? "Sakin" : "Dengeli";
  const tendencyColor = ref.cardTendency === "strict" ? "text-red-400" : ref.cardTendency === "lenient" ? "text-green-400" : "text-yellow-400";
  const tempoLabel = ref.tempoImpact === "low-tempo" ? "Tempo ↓" : ref.tempoImpact === "high-tempo" ? "Tempo ↑" : "Nötr";

  return (
    <div className="rounded-lg bg-muted/30 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        🟨 Hakem Profili
      </p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{ref.name}</span>
        <span className={cn("text-xs font-semibold", tendencyColor)}>{tendencyLabel}</span>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>Ort. {ref.avgCardsPerMatch} kart/maç</span>
        <span className={cn(
          ref.tempoImpact === "low-tempo" ? "text-red-400" :
          ref.tempoImpact === "high-tempo" ? "text-green-400" : "text-zinc-400"
        )}>
          {tempoLabel}
        </span>
      </div>
    </div>
  );
}

export function InjuryReport({ analysis }: { analysis: MatchAnalysis }) {
  const players = analysis.keyMissingPlayers;
  if (!players || players.length === 0) return null;

  const impactColor = (level: string) => {
    if (level === "critical") return "text-red-400 bg-red-500/10";
    if (level === "high") return "text-orange-400 bg-orange-500/10";
    return "text-yellow-400 bg-yellow-500/10";
  };

  return (
    <div className="rounded-lg bg-muted/30 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        🚑 Sakatlık Raporu ({players.length} eksik)
      </p>
      <div className="space-y-1.5">
        {players.slice(0, 6).map((p, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", impactColor(p.impactLevel))}>
                {p.position}
              </span>
              <span className="text-foreground">{p.name}</span>
            </div>
            <span className="text-muted-foreground">{p.team === "home" ? "🏠" : "✈️"} {p.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Insights Bullet Points
// ============================================

export function InsightsList({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        💡 Algoritmik İçgörüler
      </p>
      <ul className="space-y-1">
        {notes.slice(0, 6).map((note, i) => (
          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <span className="text-primary mt-0.5 shrink-0">›</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
