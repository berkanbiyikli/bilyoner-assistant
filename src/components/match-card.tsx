"use client";

import { cn } from "@/lib/utils";
import type { MatchPrediction, Pick as PickType } from "@/types";
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
