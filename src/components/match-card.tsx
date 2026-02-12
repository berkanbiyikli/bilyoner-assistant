"use client";

import { cn } from "@/lib/utils";
import type { MatchPrediction, Pick as PickType } from "@/types";
import { useAppStore } from "@/lib/store";
import {
  formatOdds,
  confidenceColor,
  confidenceBg,
  getMatchDate,
} from "@/lib/utils";
import {
  Trophy,
  TrendingUp,
  Shield,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";

interface MatchCardProps {
  prediction: MatchPrediction;
}

export function MatchCard({ prediction }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30">
      {/* Header */}
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
        {bestPick && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold border",
              confidenceBg(bestPick.confidence),
              confidenceColor(bestPick.confidence)
            )}
          >
            %{bestPick.confidence}
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          {prediction.homeTeam.logo && (
            <Image
              src={prediction.homeTeam.logo}
              alt={prediction.homeTeam.name}
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          )}
          <span className="font-semibold text-sm">{prediction.homeTeam.name}</span>
        </div>
        <span className="text-muted-foreground text-xs font-medium px-3">VS</span>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <span className="font-semibold text-sm">{prediction.awayTeam.name}</span>
          {prediction.awayTeam.logo && (
            <Image
              src={prediction.awayTeam.logo}
              alt={prediction.awayTeam.name}
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          )}
        </div>
      </div>

      {/* Picks */}
      <div className="flex flex-wrap gap-2 mb-3">
        {prediction.picks.slice(0, expanded ? undefined : 3).map((pick) => {
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
              {pick.isValueBet && <Gem className="h-3 w-3 text-yellow-500" />}
            </button>
          );
        })}
      </div>

      {/* Analysis Summary */}
      {bestPick && (
        <p className="text-xs text-muted-foreground mb-2">
          {bestPick.reasoning}
        </p>
      )}

      {/* Expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3 w-3" /> Daralt
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" /> Detaylı Analiz
          </>
        )}
      </button>

      {/* Expanded Analysis */}
      {expanded && (
        <div className="mt-4 space-y-3 animate-slide-up">
          <div className="grid grid-cols-3 gap-2">
            <StatBar
              label="Ev Formu"
              value={prediction.analysis.homeForm}
              icon={<Trophy className="h-3 w-3" />}
            />
            <StatBar
              label="Hücum"
              value={prediction.analysis.homeAttack}
              icon={<TrendingUp className="h-3 w-3" />}
            />
            <StatBar
              label="Savunma"
              value={prediction.analysis.homeDefense}
              icon={<Shield className="h-3 w-3" />}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatBar
              label="Dep Formu"
              value={prediction.analysis.awayForm}
              icon={<Trophy className="h-3 w-3" />}
            />
            <StatBar
              label="Hücum"
              value={prediction.analysis.awayAttack}
              icon={<TrendingUp className="h-3 w-3" />}
            />
            <StatBar
              label="Savunma"
              value={prediction.analysis.awayDefense}
              icon={<Shield className="h-3 w-3" />}
            />
          </div>
          <p className="text-xs text-muted-foreground italic">
            {prediction.analysis.summary}
          </p>
        </div>
      )}
    </div>
  );
}

function StatBar({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className={confidenceColor(value)}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", {
            "bg-green-500": value >= 70,
            "bg-yellow-500": value >= 50 && value < 70,
            "bg-red-500": value < 50,
          })}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Gem(props: React.SVGProps<SVGSVGElement>) {
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
