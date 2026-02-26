"use client";

import { cn } from "@/lib/utils";
import type { MatchPrediction, Pick as PickType, MonteCarloResult } from "@/types";
import { useAppStore } from "@/lib/store";
import { formatOdds, getMatchDate } from "@/lib/utils";
import {
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { ConfidenceGauge } from "@/components/confidence-gauge";
import {
  ScenarioBadges,
  ScoreDistributionChart,
  XgMomentumBar,
  GoalTimeline,
  RefereeCard,
  InjuryReport,
  InsightsList,
} from "@/components/match-visualizations";

interface MatchCardProps {
  prediction: MatchPrediction;
}

export function MatchCard({ prediction }: MatchCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { activeCoupon, addToCoupon } = useAppStore();

  const isInCoupon = (fixtureId: number, pickType: string) =>
    activeCoupon.some(
      (item) => item.fixtureId === fixtureId && item.pick === pickType
    );

  const handleAddToCoupon = (pick: PickType) => {
    addToCoupon({
      fixtureId: prediction.fixtureId,
      homeTeam: prediction.homeTeam.name,
      awayTeam: prediction.awayTeam.name,
      league: prediction.league.name,
      kickoff: prediction.kickoff,
      pick: pick.type,
      odds: pick.odds,
      confidence: pick.confidence,
      result: "pending",
    });
  };

  const bestPick = prediction.picks[0];
  const analysis = prediction.analysis;
  const sim = analysis.simulation;
  const insights = prediction.insights;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/30">
      {/* ====================================================
          ÜST KATMAN — Genel Tahmin + Confidence Gauge
          ==================================================== */}
      <div className="p-4 pb-3">
        {/* League & Date */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {prediction.league.flag && (
              <Image
                src={prediction.league.flag}
                alt={prediction.league.country}
                width={14}
                height={10}
                className="h-2.5 w-3.5 object-cover rounded-[1px]"
              />
            )}
            <span>{prediction.league.name}</span>
            <span>•</span>
            <span>{getMatchDate(prediction.kickoff)}</span>
          </div>
        </div>

        {/* Teams + Confidence Gauge */}
        <div className="flex items-center gap-4">
          {/* Home Team */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {prediction.homeTeam.logo && (
              <Image
                src={prediction.homeTeam.logo}
                alt={prediction.homeTeam.name}
                width={36}
                height={36}
                className="h-9 w-9 object-contain shrink-0"
              />
            )}
            <span className="font-semibold text-sm truncate">{prediction.homeTeam.name}</span>
          </div>

          {/* Confidence Gauge (Center) */}
          {bestPick && (
            <div className="shrink-0">
              <ConfidenceGauge confidence={bestPick.confidence} size="md" />
            </div>
          )}

          {/* Away Team */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <span className="font-semibold text-sm truncate text-right">{prediction.awayTeam.name}</span>
            {prediction.awayTeam.logo && (
              <Image
                src={prediction.awayTeam.logo}
                alt={prediction.awayTeam.name}
                width={36}
                height={36}
                className="h-9 w-9 object-contain shrink-0"
              />
            )}
          </div>
        </div>

        {/* Best Pick Reasoning (tek satır) */}
        {bestPick && (
          <p className="text-[11px] text-muted-foreground mt-2 line-clamp-1">
            <Sparkles className="inline h-3 w-3 text-primary mr-1" />
            {bestPick.reasoning}
          </p>
        )}
      </div>

      {/* ====================================================
          ORTA KATMAN — Senaryo Etiketleri + Pick Butonları
          ==================================================== */}
      <div className="px-4 pb-3 space-y-3">
        {/* Scenario Badges */}
        <ScenarioBadges analysis={analysis} />

        {/* Monte Carlo Probability Strip — Compact Ana Ekran */}
        {sim && (
          <ProbabilityStrip sim={sim} homeXg={analysis.homeXg} awayXg={analysis.awayXg} />
        )}

        {/* Picks */}
        <div className="flex flex-wrap gap-2">
          {prediction.picks.slice(0, detailOpen ? undefined : 3).map((pick) => {
            const inCoupon = isInCoupon(prediction.fixtureId, pick.type);
            return (
              <button
                key={pick.type}
                onClick={() => handleAddToCoupon(pick)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  inCoupon
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                )}
              >
                {inCoupon ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                <span>{pick.type}</span>
                <span className="text-muted-foreground">@{formatOdds(pick.odds)}</span>
                {pick.isValueBet && <GemIcon className="h-3 w-3 text-yellow-500" />}
                {pick.simProbability !== undefined && (
                  <span className="text-[10px] text-muted-foreground/70">
                    sim:{pick.simProbability.toFixed(0)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ====================================================
          DERİN KATMAN — Detaylı Analiz (Toggle)
          ==================================================== */}
      <div className="border-t border-border">
        <button
          onClick={() => setDetailOpen(!detailOpen)}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            detailOpen
              ? "text-primary bg-primary/5"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          )}
        >
          {detailOpen ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Detayları Gizle
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Detaylı Analiz
            </>
          )}
        </button>

        {detailOpen && (
          <div className="px-4 pb-4 space-y-4 animate-slide-up">
            {/* Monte Carlo Skor Dağılımı */}
            {sim && sim.topScorelines.length > 0 && (
              <ScoreDistributionChart scorelines={sim.topScorelines} />
            )}

            {/* xG & Hücum Kıyaslaması */}
            <XgMomentumBar
              homeXg={analysis.homeXg ?? 1.2}
              awayXg={analysis.awayXg ?? 1.0}
              homeAttack={analysis.homeAttack}
              awayAttack={analysis.awayAttack}
              homeName={prediction.homeTeam.name}
              awayName={prediction.awayTeam.name}
            />

            {/* Gol Zamanlaması Timeline */}
            {analysis.goalTiming && (
              <GoalTimeline goalTiming={analysis.goalTiming} />
            )}

            {/* Stat Bars Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  🏠 {prediction.homeTeam.name}
                </p>
                <StatBar label="Form" value={analysis.homeForm} />
                <StatBar label="Hücum" value={analysis.homeAttack} />
                <StatBar label="Savunma" value={analysis.homeDefense} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  ✈️ {prediction.awayTeam.name}
                </p>
                <StatBar label="Form" value={analysis.awayForm} />
                <StatBar label="Hücum" value={analysis.awayAttack} />
                <StatBar label="Savunma" value={analysis.awayDefense} />
              </div>
            </div>

            {/* Monte Carlo Sim Özet */}
            {sim && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  🎲 Simülasyon Sonuçları ({sim.simRuns.toLocaleString()} iterasyon)
                </p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <SimStat label="1" value={sim.simHomeWinProb} />
                  <SimStat label="X" value={sim.simDrawProb} />
                  <SimStat label="2" value={sim.simAwayWinProb} />
                  <SimStat label="Ü2.5" value={sim.simOver25Prob} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center mt-2">
                  <SimStat label="Ü1.5" value={sim.simOver15Prob} />
                  <SimStat label="Ü3.5" value={sim.simOver35Prob} />
                  <SimStat label="KG" value={sim.simBttsProb} />
                  <SimStat label="KG Yok" value={100 - sim.simBttsProb} />
                </div>
              </div>
            )}

            {/* Hakem Profili */}
            <RefereeCard analysis={analysis} />

            {/* Sakatlık Raporu */}
            <InjuryReport analysis={analysis} />

            {/* Algoritmik İçgörüler */}
            {insights && <InsightsList notes={insights.notes} />}

            {/* Analiz Özeti */}
            <p className="text-[11px] text-muted-foreground italic border-t border-border pt-3">
              {analysis.summary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Yardımcı Bileşenler ----

function StatBar({ label, value }: { label: string; value: number }) {
  const barColor =
    value >= 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  const textColor =
    value >= 70 ? "text-green-400" : value >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold", textColor)}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function SimStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-background/50 py-1.5 px-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">%{value.toFixed(1)}</p>
    </div>
  );
}

// ---- Monte Carlo Olasılık Şeridi (Ana Ekran) ----
function ProbabilityStrip({
  sim,
  homeXg,
  awayXg,
}: {
  sim: MonteCarloResult;
  homeXg?: number;
  awayXg?: number;
}) {
  const probItems = [
    { label: "1", value: sim.simHomeWinProb, color: "text-blue-400" },
    { label: "X", value: sim.simDrawProb, color: "text-zinc-400" },
    { label: "2", value: sim.simAwayWinProb, color: "text-red-400" },
    { label: "Ü2.5", value: sim.simOver25Prob, color: sim.simOver25Prob >= 50 ? "text-green-400" : "text-yellow-400" },
    { label: "KG", value: sim.simBttsProb, color: sim.simBttsProb >= 50 ? "text-green-400" : "text-yellow-400" },
  ];

  // 1X2 bar widths
  const total1X2 = sim.simHomeWinProb + sim.simDrawProb + sim.simAwayWinProb;
  const homeW = total1X2 > 0 ? (sim.simHomeWinProb / total1X2) * 100 : 33;
  const drawW = total1X2 > 0 ? (sim.simDrawProb / total1X2) * 100 : 34;
  const awayW = total1X2 > 0 ? (sim.simAwayWinProb / total1X2) * 100 : 33;

  return (
    <div className="rounded-lg bg-muted/20 border border-border/50 p-2.5 space-y-2">
      {/* 1X2 Visual Bar */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground w-6 shrink-0">1X2</span>
        <div className="flex-1 flex h-4 rounded-md overflow-hidden">
          <div
            className="bg-blue-500/70 flex items-center justify-center text-[9px] font-bold text-white transition-all"
            style={{ width: `${homeW}%` }}
          >
            {sim.simHomeWinProb >= 15 && `${sim.simHomeWinProb.toFixed(0)}%`}
          </div>
          <div
            className="bg-zinc-500/60 flex items-center justify-center text-[9px] font-bold text-white transition-all"
            style={{ width: `${drawW}%` }}
          >
            {sim.simDrawProb >= 15 && `${sim.simDrawProb.toFixed(0)}%`}
          </div>
          <div
            className="bg-red-500/60 flex items-center justify-center text-[9px] font-bold text-white transition-all"
            style={{ width: `${awayW}%` }}
          >
            {sim.simAwayWinProb >= 15 && `${sim.simAwayWinProb.toFixed(0)}%`}
          </div>
        </div>
      </div>

      {/* Probability Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {probItems.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-0.5 text-[10px]"
          >
            <span className="text-muted-foreground">{item.label}</span>
            <span className={cn("font-bold", item.color)}>{item.value.toFixed(1)}%</span>
          </span>
        ))}
        {sim.simOver15Prob !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-0.5 text-[10px]">
            <span className="text-muted-foreground">Ü1.5</span>
            <span className={cn("font-bold", sim.simOver15Prob >= 70 ? "text-green-400" : "text-yellow-400")}>{sim.simOver15Prob.toFixed(1)}%</span>
          </span>
        )}
        {sim.simOver35Prob !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-0.5 text-[10px]">
            <span className="text-muted-foreground">Ü3.5</span>
            <span className={cn("font-bold", sim.simOver35Prob >= 40 ? "text-green-400" : "text-yellow-400")}>{sim.simOver35Prob.toFixed(1)}%</span>
          </span>
        )}
      </div>

      {/* Mini xG Bar */}
      {homeXg != null && awayXg != null && (homeXg + awayXg) > 0 && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[9px] text-muted-foreground w-6 shrink-0">xG</span>
          <div className="flex-1 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-blue-400 w-8 text-right">{homeXg.toFixed(1)}</span>
            <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-muted/30">
              <div
                className="bg-blue-500/70 rounded-l-full transition-all"
                style={{ width: `${(homeXg / (homeXg + awayXg)) * 100}%` }}
              />
              <div
                className="bg-red-500/60 rounded-r-full transition-all"
                style={{ width: `${(awayXg / (homeXg + awayXg)) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-red-400 w-8">{awayXg.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Top Scoreline */}
      {sim.topScorelines.length > 0 && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[9px] text-muted-foreground">En olası:</span>
          {sim.topScorelines.slice(0, 3).map((s, i) => (
            <span
              key={i}
              className={cn(
                "text-[10px] rounded px-1.5 py-0.5",
                i === 0
                  ? "bg-primary/15 text-primary font-bold"
                  : "bg-muted/40 text-muted-foreground"
              )}
            >
              {s.score} ({s.probability.toFixed(1)}%)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GemIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 3h12l4 6-10 13L2 9Z" />
      <path d="M11 3 8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </svg>
  );
}
