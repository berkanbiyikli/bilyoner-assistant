"use client";

import { cn } from "@/lib/utils";
import type { CascadeStrategy, CascadeRiskLevel, CascadePickItem } from "@/types";
import { useAppStore } from "@/lib/store";
import {
  Shield, Swords, Flame, ArrowRight, Clock, TrendingUp,
  Plus, Check, AlertTriangle, ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";

interface CascadeStrategyProps {
  strategies: Record<CascadeRiskLevel, CascadeStrategy> | null;
  loading: boolean;
}

const RISK_LABELS: Record<CascadeRiskLevel, { label: string; icon: typeof Shield; color: string; bg: string; border: string }> = {
  safe: { label: "Güvenli", icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  balanced: { label: "Dengeli", icon: Swords, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  risky: { label: "Riskli", icon: Flame, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
};

function pickLabel(type: string): string {
  const map: Record<string, string> = {
    "1": "1", X: "X", "2": "2", "Over 2.5": "Ü2.5", "Under 2.5": "A2.5",
    "Over 1.5": "Ü1.5", "Over 3.5": "Ü3.5", "BTTS Yes": "KG+", "BTTS No": "KG-",
    "1X": "1X", "X2": "X2", "12": "12", "1 & Over 1.5": "1&Ü1.5", "2 & Over 1.5": "2&Ü1.5",
    "HT BTTS Yes": "İY KG+", "HT Over 0.5": "İY Ü0.5",
  };
  if (type.startsWith("CS ")) return type.replace("CS ", "");
  return map[type] || type;
}

export function CascadeStrategyComponent({ strategies, loading }: CascadeStrategyProps) {
  const [selectedRisk, setSelectedRisk] = useState<CascadeRiskLevel>("balanced");
  const [expanded, setExpanded] = useState(false);
  const { addToCoupon, activeCoupon } = useAppStore();

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 animate-pulse">
        <div className="h-5 w-48 bg-zinc-800 rounded mb-3" />
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => <div key={i} className="h-8 w-24 bg-zinc-800 rounded-lg" />)}
        </div>
        <div className="flex gap-3">
          {[1, 2, 3].map(i => <div key={i} className="flex-1 h-32 bg-zinc-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!strategies) return null;

  const strategy = strategies[selectedRisk];
  if (!strategy || strategy.timeSlots.length === 0) return null;

  const isInCoupon = (fixtureId: number, pick: string) =>
    activeCoupon.some(i => i.fixtureId === fixtureId && i.pick === pick);

  const handleAddAllToCoupon = () => {
    for (const slot of strategy.timeSlots) {
      for (const pick of slot.picks) {
        addToCoupon({
          fixtureId: pick.fixtureId,
          homeTeam: pick.homeTeam,
          awayTeam: pick.awayTeam,
          league: pick.league,
          kickoff: pick.kickoff,
          pick: pick.pick as import("@/types").PickType,
          odds: pick.odds,
          confidence: pick.confidence,
          result: "pending",
        });
      }
    }
  };

  const riskConfig = RISK_LABELS[selectedRisk];
  const RiskIcon = riskConfig.icon;

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Saat Stratejisi</h2>
            <span className="text-[10px] text-zinc-600">Kademeli bahis planı</span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-md hover:bg-zinc-800 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
          </button>
        </div>

        {/* Risk Level Tabs */}
        <div className="flex gap-1.5 mb-3">
          {(["safe", "balanced", "risky"] as const).map(risk => {
            const cfg = RISK_LABELS[risk];
            const Icon = cfg.icon;
            const s = strategies[risk];
            const active = selectedRisk === risk;
            return (
              <button
                key={risk}
                onClick={() => setSelectedRisk(risk)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                  active
                    ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
                {s && s.timeSlots.length > 0 && (
                  <span className={cn("text-[10px] font-bold", active ? cfg.color : "text-zinc-600")}>
                    {s.totalPotentialReturn.toFixed(0)}₺
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Summary Bar */}
        <div className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <RiskIcon className={cn("h-3.5 w-3.5", riskConfig.color)} />
            <span className="text-xs text-zinc-400">{strategy.initialStake}₺ →</span>
          </div>
          {strategy.cascadeReturns.map((ret, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="h-3 w-3 text-zinc-600" />}
              <span className={cn(
                "text-xs font-bold",
                i === strategy.cascadeReturns.length - 1 ? "text-green-400" : "text-zinc-300"
              )}>
                {ret.toFixed(0)}₺
              </span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              Toplam: ×{strategy.totalCombinedOdds.toFixed(1)}
            </span>
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded",
              strategy.overallWinProbability >= 15 ? "bg-green-500/15 text-green-400" :
              strategy.overallWinProbability >= 5 ? "bg-yellow-500/15 text-yellow-400" :
              "bg-red-500/10 text-red-400"
            )}>
              %{strategy.overallWinProbability.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Timeline (always visible in compact, expanded shows details) */}
      <div className={cn("px-4 pb-4", !expanded && "hidden sm:block")}>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${strategy.timeSlots.length}, 1fr)` }}>
          {strategy.timeSlots.map((slot, slotIdx) => (
            <TimeSlotCard
              key={slot.label}
              slot={slot}
              slotIndex={slotIdx}
              isLast={slotIdx === strategy.timeSlots.length - 1}
              cascadeReturn={strategy.cascadeReturns[slotIdx]}
              previousReturn={slotIdx > 0 ? strategy.cascadeReturns[slotIdx - 1] : strategy.initialStake}
              riskColor={riskConfig.color}
              expanded={expanded}
              isInCoupon={isInCoupon}
              onAddPick={(pick) => {
                addToCoupon({
                  fixtureId: pick.fixtureId,
                  homeTeam: pick.homeTeam,
                  awayTeam: pick.awayTeam,
                  league: pick.league,
                  kickoff: pick.kickoff,
                  pick: pick.pick as import("@/types").PickType,
                  odds: pick.odds,
                  confidence: pick.confidence,
                  result: "pending",
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* Mobile: compact pills when not expanded */}
      {!expanded && (
        <div className="px-4 pb-3 sm:hidden">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {strategy.timeSlots.map((slot, idx) => (
              <div key={slot.label} className="flex items-center gap-1 shrink-0">
                <div className="flex items-center gap-1 rounded-lg bg-zinc-800/50 px-2 py-1">
                  <Clock className="h-3 w-3 text-zinc-500" />
                  <span className="text-[10px] text-zinc-400">{slot.label.split(" - ")[0]}</span>
                  <span className="text-[10px] font-bold text-zinc-300">×{slot.combinedOdds.toFixed(1)}</span>
                  <span className="text-[9px] text-zinc-500">({slot.picks.length})</span>
                </div>
                {idx < strategy.timeSlots.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-zinc-700 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-2.5 bg-zinc-900/50">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <AlertTriangle className="h-3 w-3" />
          <span>Kademeli bahis: Her dilim kazanırsa sonraki dilime aktar</span>
        </div>
        <button
          onClick={handleAddAllToCoupon}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
            riskConfig.bg, riskConfig.color, "border", riskConfig.border,
            "hover:opacity-80"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Tümünü Kupona Ekle
        </button>
      </div>
    </div>
  );
}

// ---- Time Slot Card ----
interface TimeSlotCardProps {
  slot: import("@/types").CascadeTimeSlot;
  slotIndex: number;
  isLast: boolean;
  cascadeReturn: number;
  previousReturn: number;
  riskColor: string;
  expanded: boolean;
  isInCoupon: (fixtureId: number, pick: string) => boolean;
  onAddPick: (pick: CascadePickItem) => void;
}

function TimeSlotCard({
  slot, slotIndex, isLast, cascadeReturn, previousReturn,
  riskColor, expanded, isInCoupon, onAddPick,
}: TimeSlotCardProps) {
  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      isLast ? "border-green-500/20 bg-green-500/5" : "border-zinc-800 bg-zinc-900/30"
    )}>
      {/* Slot Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/40">
        <div className="flex items-center gap-1.5">
          <Clock className={cn("h-3 w-3", riskColor)} />
          <span className="text-xs font-bold text-zinc-200">{slot.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">×{slot.combinedOdds.toFixed(1)}</span>
          <span className={cn(
            "text-[10px] font-bold px-1 rounded",
            slot.winProbability >= 40 ? "text-green-400" :
            slot.winProbability >= 20 ? "text-yellow-400" : "text-red-400"
          )}>
            %{slot.winProbability.toFixed(0)}
          </span>
        </div>
      </div>

      {/* Picks */}
      <div className="p-2 space-y-1.5">
        {slot.picks.map((pick) => {
          const inCoupon = isInCoupon(pick.fixtureId, pick.pick);
          return (
            <button
              key={`${pick.fixtureId}-${pick.pick}`}
              onClick={() => onAddPick(pick)}
              className={cn(
                "w-full rounded-lg p-2 text-left transition-all border",
                inCoupon
                  ? "border-indigo-500/50 bg-indigo-500/10"
                  : "border-zinc-800/50 bg-zinc-800/20 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {pick.leagueFlag && (
                    pick.leagueFlag.startsWith('http') ? (
                      <Image
                        src={pick.leagueFlag}
                        alt=""
                        width={12}
                        height={9}
                        className="h-2 w-3 object-cover rounded-[1px] shrink-0"
                      />
                    ) : (
                      <span className="text-[10px]">{pick.leagueFlag}</span>
                    )
                  )}
                  <span className="text-[10px] text-zinc-500 truncate">{pick.league}</span>
                </div>
                <div className="flex items-center gap-1">
                  {inCoupon ? (
                    <Check className="h-3 w-3 text-indigo-400" />
                  ) : (
                    <Plus className="h-3 w-3 text-zinc-600" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-zinc-300 font-medium truncate">
                {pick.homeTeam} vs {pick.awayTeam}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                  pick.isValueBet ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"
                )}>
                  {pickLabel(pick.pick)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500">%{pick.confidence}</span>
                  <span className="text-xs font-bold text-yellow-500">{pick.odds.toFixed(2)}</span>
                </div>
              </div>
              {expanded && pick.aiHeadline && (
                <p className="text-[9px] text-zinc-500 mt-1 line-clamp-2">{pick.aiHeadline}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Cascade Return */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/20 border-t border-zinc-800/30">
        <span className="text-[10px] text-zinc-500">
          {previousReturn.toFixed(0)}₺ yatır
        </span>
        <div className="flex items-center gap-1">
          <TrendingUp className={cn("h-3 w-3", isLast ? "text-green-400" : "text-zinc-500")} />
          <span className={cn(
            "text-[11px] font-bold",
            isLast ? "text-green-400" : "text-zinc-300"
          )}>
            {cascadeReturn.toFixed(0)}₺
          </span>
        </div>
      </div>
    </div>
  );
}
