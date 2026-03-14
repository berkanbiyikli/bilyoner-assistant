"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Radio,
  Zap,
  ChevronDown,
  ChevronUp,
  Target,
  BarChart3,
  Users,
  Activity,
  Shield,
  Swords,
  RefreshCw,
  Flame,
  TrendingUp,
  AlertTriangle,
  Eye,
  Crosshair,
  Timer,
} from "lucide-react";
import type {
  FixtureResponse,
  FixtureStatisticsResponse,
  FixtureEvent,
  LineupResponse,
} from "@/types/api-football";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { LEAGUES } from "@/lib/api-football/leagues";

// ---- Types ----

type AlertLevel = "HOT" | "WARM" | "INFO";

type ScenarioType = "BASKI_VAR" | "MAC_UYUDU" | "GOL_FESTIVALI" | "SAVUNMA_SAVASI" | "COMEBACK_KOKUSU" | "ERKEN_FIRTINA" | "SON_DAKIKA_HEYECANI" | "NORMAL";
type OpportunityCategory = "UYUYAN_DEV" | "ERKEN_PATLAMA" | "SON_DAKIKA_VURGUN" | "STANDART";

interface LiveOpportunity {
  level: AlertLevel;
  market: string;
  message: string;
  reasoning: string;
  confidence: number;
  timeWindow: string;
  scenario?: ScenarioType;
  valueScore: number;
  category: OpportunityCategory;
}

interface MomentumData {
  homeScore: number;
  awayScore: number;
  dominantTeam: "home" | "away" | "balanced";
  trend: "increasing" | "decreasing" | "stable";
  description: string;
}

interface DangerLevel {
  homeAttack: number;
  awayAttack: number;
  goalProbability: number;
  description: string;
}

interface EnrichedMomentumData {
  liveXg: { home: number; away: number };
  xgDelta: number;
  pressureIndex: { home: number; away: number };
  recentDangerousRate: { home: number; away: number };
  scenarioType: ScenarioType;
  scenarioMessage: string;
}

interface LiveMatchAnalysis {
  momentum: MomentumData;
  danger: DangerLevel;
  opportunities: LiveOpportunity[];
  insights: string[];
  matchTemperature: number;
  nextGoalTeam: "home" | "away" | "either" | "unlikely";
  scorePressure: number;
  enrichedMomentum?: EnrichedMomentumData;
  winProbability?: { home: number; draw: number; away: number };
  projectedScore?: { home: number; away: number };
  matchPhase?: "early" | "mid" | "late" | "final" | "ht";
}

interface PredictionPick {
  type: string;
  confidence: number;
  odds: number;
  reasoning: string;
  expectedValue: number;
  isValueBet: boolean;
}

interface MatchPrediction {
  picks: PredictionPick[];
  analysisSummary: string;
}

interface EnrichedLiveMatch {
  fixture: FixtureResponse;
  statistics: FixtureStatisticsResponse[] | null;
  events: FixtureEvent[] | null;
  lineups: LineupResponse[] | null;
  prediction: MatchPrediction | null;
  liveInsights: string[];
  analysis: LiveMatchAnalysis | null;
}

// ---- Stat config ----
const STAT_LABELS: Record<string, string> = {
  "Shots on Goal": "İsabetli Şut",
  "Shots off Goal": "İsabetsiz Şut",
  "Total Shots": "Toplam Şut",
  "Blocked Shots": "Bloke Şut",
  "Shots insidebox": "Ceza Sahası İçi",
  "Shots outsidebox": "Ceza Sahası Dışı",
  Fouls: "Faul",
  "Corner Kicks": "Korner",
  Offsides: "Ofsayt",
  "Ball Possession": "Top Hakimiyeti",
  "Yellow Cards": "Sarı Kart",
  "Red Cards": "Kırmızı Kart",
  "Goalkeeper Saves": "Kaleci Kurtarışı",
  "Total passes": "Toplam Pas",
  "Passes accurate": "İsabetli Pas",
  "Passes %": "Pas İsabeti %",
  expected_goals: "xG",
};

// Senaryo badge helper (module-level)
function getScenarioBadge(scenario?: ScenarioType): { icon: string; label: string; color: string } | null {
  switch (scenario) {
    case "BASKI_VAR": return { icon: "🔥", label: "Baskı", color: "bg-red-500/20 text-red-400" };
    case "MAC_UYUDU": return { icon: "😴", label: "Uyudu", color: "bg-blue-500/20 text-blue-400" };
    case "GOL_FESTIVALI": return { icon: "⚽", label: "Festival", color: "bg-green-500/20 text-green-400" };
    case "SAVUNMA_SAVASI": return { icon: "🛡️", label: "Defans", color: "bg-slate-500/20 text-slate-400" };
    case "COMEBACK_KOKUSU": return { icon: "⚡", label: "Comeback", color: "bg-purple-500/20 text-purple-400" };
    case "ERKEN_FIRTINA": return { icon: "🌪️", label: "Fırtına", color: "bg-cyan-500/20 text-cyan-400" };
    case "SON_DAKIKA_HEYECANI": return { icon: "⏰", label: "Son Dk", color: "bg-orange-500/20 text-orange-400" };
    default: return null;
  }
}

const KEY_STATS = [
  "Ball Possession",
  "Total Shots",
  "Shots on Goal",
  "Corner Kicks",
  "Fouls",
  "Yellow Cards",
  "Red Cards",
  "Offsides",
  "Goalkeeper Saves",
  "Passes %",
  "expected_goals",
];

// ============================================
// Main Page
// ============================================

export default function LivePage() {
  const [matches, setMatches] = useState<EnrichedLiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, string>>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showOnlyOpportunities, setShowOnlyOpportunities] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/live");
      const data = await res.json();
      setMatches(data.enriched || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Canlı maçlar yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  const toggleExpand = (fixtureId: number) => {
    setExpandedMatch((prev) => (prev === fixtureId ? null : fixtureId));
  };

  const getTab = (fixtureId: number) => activeTab[fixtureId] || "analysis";
  const setTab = (fixtureId: number, tab: string) => {
    setActiveTab((prev) => ({ ...prev, [fixtureId]: tab }));
  };

  // HOT fırsatları olan maçları topla
  const allHotOpportunities = useMemo(() => {
    const hot: Array<{ match: EnrichedLiveMatch; opportunity: LiveOpportunity }> = [];
    for (const m of matches) {
      if (m.analysis?.opportunities) {
        for (const opp of m.analysis.opportunities) {
          if (opp.level === "HOT") {
            hot.push({ match: m, opportunity: opp });
          }
        }
      }
    }
    return hot.sort((a, b) => b.opportunity.confidence - a.opportunity.confidence);
  }, [matches]);

  // Altın Vuruş: En yüksek valueScore'a sahip HOT fırsat
  const goldenStrike = useMemo(() => {
    let best: { match: EnrichedLiveMatch; opportunity: LiveOpportunity } | null = null;
    for (const m of matches) {
      if (m.analysis?.opportunities) {
        for (const opp of m.analysis.opportunities) {
          if (opp.level === "HOT" && (opp.valueScore ?? 0) > (best?.opportunity.valueScore ?? 0)) {
            best = { match: m, opportunity: opp };
          }
        }
      }
    }
    return best;
  }, [matches]);

  // Kategorize edilmiş fırsatlar
  const categorizedOpportunities = useMemo(() => {
    const cats: Record<string, Array<{ match: EnrichedLiveMatch; opportunity: LiveOpportunity }>> = {
      UYUYAN_DEV: [],
      ERKEN_PATLAMA: [],
      SON_DAKIKA_VURGUN: [],
      all: [],
    };
    for (const m of matches) {
      if (m.analysis?.opportunities) {
        for (const opp of m.analysis.opportunities) {
          if (opp.level === "HOT" || opp.level === "WARM") {
            const cat = opp.category || "STANDART";
            if (cats[cat]) cats[cat].push({ match: m, opportunity: opp });
            cats.all.push({ match: m, opportunity: opp });
          }
        }
      }
    }
    for (const key of Object.keys(cats)) {
      cats[key].sort((a, b) => (b.opportunity.valueScore ?? 0) - (a.opportunity.valueScore ?? 0));
    }
    return cats;
  }, [matches]);

  // Maçları sırala
  const sortedMatches = useMemo(() => {
    const filtered = showOnlyOpportunities
      ? matches.filter(m => m.analysis?.opportunities && m.analysis.opportunities.length > 0)
      : matches;

    return [...filtered].sort((a, b) => {
      const aHot = a.analysis?.opportunities?.filter(o => o.level === "HOT").length || 0;
      const bHot = b.analysis?.opportunities?.filter(o => o.level === "HOT").length || 0;
      if (aHot !== bHot) return bHot - aHot;
      const aTemp = a.analysis?.matchTemperature || 0;
      const bTemp = b.analysis?.matchTemperature || 0;
      return bTemp - aTemp;
    });
  }, [matches, showOnlyOpportunities]);

  // Liga bazlı grupla + lig büyüklüğüne göre sırala
  const leagueGroups = useMemo(() => {
    const groups = new Map<string, EnrichedLiveMatch[]>();
    for (const m of sortedMatches) {
      const key = `${m.fixture.league.country} - ${m.fixture.league.name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    // LEAGUES priority'sine göre sırala (düşük priority = büyük lig = önce)
    const leaguePriority = new Map<number, number>();
    for (const l of LEAGUES) leaguePriority.set(l.id, l.priority);

    const sorted = [...groups.entries()].sort(([, matchesA], [, matchesB]) => {
      const prioA = Math.min(...matchesA.map(m => leaguePriority.get(m.fixture.league.id) ?? 99));
      const prioB = Math.min(...matchesB.map(m => leaguePriority.get(m.fixture.league.id) ?? 99));
      return prioA - prioB;
    });
    return sorted;
  }, [sortedMatches]);

  const totalOpportunities = matches.reduce((sum, m) => sum + (m.analysis?.opportunities?.length || 0), 0);

  // Pick status helper
  const getPickLiveStatus = (
    pickType: string, homeGoals: number, awayGoals: number, elapsed: number, match?: FixtureResponse
  ): { icon: string; color: string } => {
    const totalGoals = homeGoals + awayGoals;
    switch (pickType) {
      case "1": return homeGoals > awayGoals ? { icon: "✅", color: "text-green-400" } : homeGoals === awayGoals ? { icon: "⏳", color: "text-yellow-400" } : { icon: "❌", color: "text-red-400" };
      case "X": return homeGoals === awayGoals ? { icon: "✅", color: "text-green-400" } : { icon: "❌", color: "text-red-400" };
      case "2": return awayGoals > homeGoals ? { icon: "✅", color: "text-green-400" } : awayGoals === homeGoals ? { icon: "⏳", color: "text-yellow-400" } : { icon: "❌", color: "text-red-400" };
      case "Over 2.5": return totalGoals >= 3 ? { icon: "✅", color: "text-green-400" } : { icon: elapsed >= 70 ? "⚠️" : "⏳", color: elapsed >= 70 ? "text-orange-400" : "text-yellow-400" };
      case "Over 1.5": return totalGoals >= 2 ? { icon: "✅", color: "text-green-400" } : { icon: elapsed >= 70 ? "⚠️" : "⏳", color: elapsed >= 70 ? "text-orange-400" : "text-yellow-400" };
      case "Under 2.5": return totalGoals >= 3 ? { icon: "❌", color: "text-red-400" } : { icon: "✅", color: "text-green-400" };
      case "BTTS Yes": return homeGoals > 0 && awayGoals > 0 ? { icon: "✅", color: "text-green-400" } : homeGoals > 0 || awayGoals > 0 ? { icon: "⏳", color: "text-yellow-400" } : { icon: "⏳", color: "text-zinc-500" };
      case "BTTS No": return homeGoals > 0 && awayGoals > 0 ? { icon: "❌", color: "text-red-400" } : { icon: "✅", color: "text-green-400" };
      case "1X": return homeGoals >= awayGoals ? { icon: "✅", color: "text-green-400" } : { icon: "❌", color: "text-red-400" };
      case "X2": return awayGoals >= homeGoals ? { icon: "✅", color: "text-green-400" } : { icon: "❌", color: "text-red-400" };
      case "12": return homeGoals !== awayGoals ? { icon: "✅", color: "text-green-400" } : { icon: "⏳", color: "text-yellow-400" };
      default: {
        // İY/MS pick tracking
        if (pickType.includes("/") && match) {
          const [htPick, ftPick] = pickType.split("/");
          const htH = match.score?.halftime?.home ?? null;
          const htA = match.score?.halftime?.away ?? null;
          if (htH === null || htA === null) return { icon: "⏳", color: "text-yellow-400" };
          const htResult = htH > htA ? "1" : htH === htA ? "X" : "2";
          const ftResult = homeGoals > awayGoals ? "1" : homeGoals === awayGoals ? "X" : "2";
          if (htResult === htPick && ftResult === ftPick) return { icon: "✅", color: "text-green-400" };
          if (elapsed >= 46 && htResult !== htPick) return { icon: "❌", color: "text-red-400" };
          if (elapsed >= 75 && ftResult !== ftPick) return { icon: "❌", color: "text-red-400" };
          return { icon: "⏳", color: "text-yellow-400" };
        }
        return { icon: "—", color: "text-zinc-500" };
      }
    }
  };

  // Senaryo badge helper (delegates to module-level)
  const scenarioBadge = getScenarioBadge;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="h-6 w-6 text-red-500 animate-pulse" />
            Canlı Maçlar
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Anlık Fırsatlar · Momentum · Tehlike Analizi — 30 sn&apos;de bir güncellenir
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500">
            Son: {lastUpdate.toLocaleTimeString("tr-TR")}
          </span>
          <button
            onClick={() => { setLoading(true); fetchLive(); }}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-zinc-400", loading && "animate-spin")} />
          </button>
          <div className="flex items-center gap-1.5 bg-zinc-800/50 px-3 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-xs font-medium text-zinc-300">{matches.length} maç</span>
          </div>
        </div>
      </div>

      {/* ========== LIVE DASHBOARD SUMMARY ========== */}
      {matches.length > 0 && (() => {
        const totalGoals = matches.reduce((s, m) => s + (m.fixture.goals.home ?? 0) + (m.fixture.goals.away ?? 0), 0);
        const avgTemp = matches.reduce((s, m) => s + (m.analysis?.matchTemperature ?? 0), 0) / matches.length;
        const hotCount = allHotOpportunities.length;
        const withPreds = matches.filter(m => m.prediction && m.prediction.picks.length > 0).length;
        const highDanger = matches.filter(m => (m.analysis?.danger.goalProbability ?? 0) >= 60).length;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 text-sm">⚽</div>
              <div>
                <p className="text-lg font-black text-white leading-none">{totalGoals}</p>
                <p className="text-[10px] text-zinc-500">Toplam Gol</p>
              </div>
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm",
                avgTemp >= 60 ? "bg-red-500/15 text-red-400" : avgTemp >= 35 ? "bg-amber-500/15 text-amber-400" : "bg-zinc-700/50 text-zinc-400"
              )}>🌡️</div>
              <div>
                <p className="text-lg font-black text-white leading-none">{avgTemp.toFixed(0)}°</p>
                <p className="text-[10px] text-zinc-500">Ort. Sıcaklık</p>
              </div>
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm",
                hotCount > 0 ? "bg-orange-500/15 text-orange-400" : "bg-zinc-700/50 text-zinc-400"
              )}>🔥</div>
              <div>
                <p className="text-lg font-black text-white leading-none">{hotCount}</p>
                <p className="text-[10px] text-zinc-500">HOT Fırsat</p>
              </div>
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm",
                highDanger > 0 ? "bg-red-500/15 text-red-400" : "bg-zinc-700/50 text-zinc-400"
              )}>⚡</div>
              <div>
                <p className="text-lg font-black text-white leading-none">{highDanger}</p>
                <p className="text-[10px] text-zinc-500">Yüksek Tehlike</p>
              </div>
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 flex items-center gap-2 col-span-2 sm:col-span-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 text-sm">🎯</div>
              <div>
                <p className="text-lg font-black text-white leading-none">{withPreds}</p>
                <p className="text-[10px] text-zinc-500">Tahminli Maç</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      {totalOpportunities > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowOnlyOpportunities(!showOnlyOpportunities)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              showOnlyOpportunities
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
            )}
          >
            <Flame className="w-4 h-4" />
            Sadece Fırsatlar ({totalOpportunities})
          </button>
          <span className="text-xs text-zinc-500">
            {allHotOpportunities.length} HOT fırsat aktif
          </span>
        </div>
      )}

      {/* ========== ALTIN VURUŞ (Hero) ========== */}
      {goldenStrike && (
        <button
          onClick={() => {
            setExpandedMatch(goldenStrike.match.fixture.fixture.id);
            setTab(goldenStrike.match.fixture.fixture.id, "analysis");
          }}
          className="w-full relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5 text-left hover:border-amber-500/50 transition-all"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🏆</span>
            <h2 className="text-sm font-black text-amber-400 tracking-wide">ALTIN VURUŞ</h2>
            <span className="text-[10px] text-zinc-500">— En yüksek değerli fırsat</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 animate-pulse">
                  🔥 {goldenStrike.opportunity.market}
                </span>
                {(() => { const badge = getScenarioBadge(goldenStrike.opportunity.scenario); return badge ? <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", badge.color)}>{badge.icon} {badge.label}</span> : null; })()}
                <span className="text-[10px] text-zinc-500">
                  Değer: {goldenStrike.opportunity.valueScore ?? 0}/100
                </span>
              </div>
              <p className="text-base font-bold text-white">
                {goldenStrike.match.fixture.teams.home.name} vs {goldenStrike.match.fixture.teams.away.name}
                <span className="text-zinc-500 text-sm ml-2">
                  {goldenStrike.match.fixture.goals.home}-{goldenStrike.match.fixture.goals.away}
                  ({goldenStrike.match.fixture.fixture.status.elapsed}&apos;)
                </span>
              </p>
              <p className="text-sm text-zinc-300">{goldenStrike.opportunity.message}</p>
              <p className="text-xs text-zinc-500">{goldenStrike.opportunity.reasoning}</p>
            </div>
            <div className="text-right shrink-0">
              <div className={cn(
                "text-3xl font-black",
                goldenStrike.opportunity.confidence >= 70 ? "text-green-400" : "text-amber-400"
              )}>
                %{goldenStrike.opportunity.confidence}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">{goldenStrike.opportunity.timeWindow}</p>
            </div>
          </div>
          {/* Mini stats row */}
          {goldenStrike.match.analysis?.enrichedMomentum && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-700/50 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">xG:</span>
                <span className="text-xs font-bold text-blue-400">
                  {goldenStrike.match.analysis.enrichedMomentum.liveXg.home.toFixed(1)}
                </span>
                <span className="text-[10px] text-zinc-600">v</span>
                <span className="text-xs font-bold text-red-400">
                  {goldenStrike.match.analysis.enrichedMomentum.liveXg.away.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Baskı:</span>
                <span className="text-xs font-bold text-blue-400">
                  {goldenStrike.match.analysis.enrichedMomentum.pressureIndex.home}
                </span>
                <span className="text-[10px] text-zinc-600">v</span>
                <span className="text-xs font-bold text-red-400">
                  {goldenStrike.match.analysis.enrichedMomentum.pressureIndex.away}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Sıcaklık:</span>
                <span className={cn("text-xs font-bold",
                  (goldenStrike.match.analysis?.matchTemperature ?? 0) >= 70 ? "text-red-400" :
                  (goldenStrike.match.analysis?.matchTemperature ?? 0) >= 45 ? "text-amber-400" : "text-zinc-400"
                )}>
                  {goldenStrike.match.analysis?.matchTemperature ?? 0}°
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Momentum:</span>
                <div className="flex h-1.5 w-16 rounded-full overflow-hidden bg-zinc-700">
                  <div className="bg-blue-500" style={{ width: `${goldenStrike.match.analysis?.momentum?.homeScore ?? 50}%` }} />
                  <div className="bg-red-500" style={{ width: `${goldenStrike.match.analysis?.momentum?.awayScore ?? 50}%` }} />
                </div>
              </div>
            </div>
          )}
        </button>
      )}

      {/* ========== KATEGORİ SEKMELERİ + FIRSATLAR ========== */}
      {allHotOpportunities.length > 0 && (
        <div className="space-y-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { key: "all", label: "Tüm Fırsatlar", icon: "🔥", count: categorizedOpportunities.all?.length || 0 },
              { key: "UYUYAN_DEV", label: "Uyuyan Devler", icon: "😴", count: categorizedOpportunities.UYUYAN_DEV?.length || 0 },
              { key: "ERKEN_PATLAMA", label: "Erken Patlayanlar", icon: "⚡", count: categorizedOpportunities.ERKEN_PATLAMA?.length || 0 },
              { key: "SON_DAKIKA_VURGUN", label: "Son Dakika", icon: "⏰", count: categorizedOpportunities.SON_DAKIKA_VURGUN?.length || 0 },
            ].filter(t => t.count > 0).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveCategory(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  activeCategory === tab.key
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className="text-[10px] bg-zinc-700/50 px-1.5 py-0.5 rounded-full">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Category description */}
          <p className="text-[10px] text-zinc-500 px-1">
            {activeCategory === "UYUYAN_DEV" && "😴 Golsüz giden ama baskı/xG çok yüksek maçlar — oranlar hâlâ yüksek, asıl değer burada!"}
            {activeCategory === "ERKEN_PATLAMA" && "⚡ Erken gol patlaması yaşayan maçlar — barem yüksekten verildi, düşük barem önerilmez."}
            {activeCategory === "SON_DAKIKA_VURGUN" && "⏰ 75+ dakika, son bölümde fırsatlar — tek gole odaklı, skoru koru."}
            {activeCategory === "all" && "🔥 Tüm aktif fırsatlar — değer puanına göre sıralanır."}
          </p>

          {/* Category Cards */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(categorizedOpportunities[activeCategory] || []).slice(0, 9).map(({ match, opportunity }, i) => (
              <button
                key={i}
                onClick={() => {
                  setExpandedMatch(match.fixture.fixture.id);
                  setTab(match.fixture.fixture.id, "analysis");
                }}
                className={cn(
                  "border rounded-xl p-3 text-left transition-all group",
                  opportunity.category === "UYUYAN_DEV"
                    ? "bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20 hover:border-blue-500/40"
                    : opportunity.category === "ERKEN_PATLAMA"
                    ? "bg-gradient-to-r from-cyan-500/10 via-teal-500/5 to-transparent border-cyan-500/20 hover:border-cyan-500/40"
                    : opportunity.category === "SON_DAKIKA_VURGUN"
                    ? "bg-gradient-to-r from-orange-500/10 via-red-500/5 to-transparent border-orange-500/20 hover:border-orange-500/40"
                    : "bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20 hover:border-amber-500/40"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    opportunity.level === "HOT" ? "bg-orange-500/20 text-orange-400" : "bg-amber-500/15 text-amber-400"
                  )}>
                    {opportunity.level === "HOT" ? "🔥" : "⚡"} {opportunity.market}
                  </span>
                  {(() => { const badge = getScenarioBadge(opportunity.scenario); return badge ? <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", badge.color)}>{badge.icon} {badge.label}</span> : null; })()}
                  <span className="text-[10px] text-zinc-500 ml-auto">
                    %{opportunity.confidence}
                    <span className="text-zinc-600 ml-1">D:{opportunity.valueScore ?? 0}</span>
                  </span>
                </div>
                <p className="text-xs font-medium text-white truncate">
                  {match.fixture.teams.home.name} - {match.fixture.teams.away.name}
                  <span className="text-zinc-500 ml-1">
                    {match.fixture.goals.home}-{match.fixture.goals.away} ({match.fixture.fixture.status.elapsed}&apos;)
                  </span>
                </p>
                <p className="text-[10px] text-zinc-400 truncate mt-0.5">{opportunity.message}</p>
                {/* Mini aksiyon sinyali */}
                {match.analysis?.enrichedMomentum && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[9px] text-zinc-600">Aksiyon:</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }, (_, idx) => {
                        const rate = Math.max(
                          match.analysis!.enrichedMomentum!.recentDangerousRate.home,
                          match.analysis!.enrichedMomentum!.recentDangerousRate.away
                        );
                        const filled = idx < Math.ceil(rate * 2.5);
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "w-3 h-1 rounded-full",
                              filled
                                ? rate > 1.5 ? "bg-red-500" : rate > 0.8 ? "bg-amber-500" : "bg-green-500"
                                : "bg-zinc-700"
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ========== MAIN TABLE ========== */}
      {loading && matches.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : sortedMatches.length > 0 ? (
        <div className="space-y-3">
          {leagueGroups.map(([league, leagueMatches]) => (
            <div key={league} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {/* League Header */}
              <div className="flex items-center justify-between bg-zinc-800/60 px-4 py-2">
                <div className="flex items-center gap-2">
                  {leagueMatches[0].fixture.league.flag && (
                    <Image src={leagueMatches[0].fixture.league.flag} alt="" width={16} height={12} className="rounded-sm" />
                  )}
                  <span className="text-xs font-semibold text-zinc-300">{league}</span>
                </div>
                <span className="text-[10px] text-zinc-500">İY</span>
              </div>

              {/* Table Header */}
              <div className="hidden sm:grid sm:grid-cols-[60px_1fr_60px_1fr_50px_minmax(200px,1fr)_120px] items-center px-4 py-1.5 text-[10px] text-zinc-600 font-medium border-b border-zinc-800/50 bg-zinc-800/20 gap-x-2">
                <span>Saat</span>
                <span>Ev Sahibi</span>
                <span className="text-center">Skor</span>
                <span>Deplasman</span>
                <span className="text-center">İY</span>
                <span>Tahmin / Fırsat</span>
                <span className="text-center">Durum</span>
              </div>

              {/* Match Rows */}
              {leagueMatches.map((match) => {
                const fid = match.fixture.fixture.id;
                const isExpanded = expandedMatch === fid;
                const elapsed = match.fixture.fixture.status.elapsed;
                const statusShort = match.fixture.fixture.status.short;
                const homeGoals = match.fixture.goals.home ?? 0;
                const awayGoals = match.fixture.goals.away ?? 0;
                const htHome = match.fixture.score.halftime.home;
                const htAway = match.fixture.score.halftime.away;
                const analysis = match.analysis;
                const hasHotOpp = analysis?.opportunities?.some(o => o.level === "HOT");
                const hasWarmOpp = analysis?.opportunities?.some(o => o.level === "WARM");
                const bestPick = match.prediction?.picks?.[0];
                const bestOpp = analysis?.opportunities?.[0];
                const temp = analysis?.matchTemperature || 0;

                return (
                  <div key={fid} className={cn(
                    "border-b border-zinc-800/40 last:border-b-0 transition-colors",
                    hasHotOpp ? "bg-orange-500/[0.03]" : hasWarmOpp ? "bg-amber-500/[0.02]" : "hover:bg-zinc-800/30"
                  )}>
                    {/* ---- Main Row ---- */}
                    <button
                      onClick={() => toggleExpand(fid)}
                      className="w-full sm:grid sm:grid-cols-[60px_1fr_60px_1fr_50px_minmax(200px,1fr)_120px] flex flex-wrap items-center px-4 py-2.5 text-left gap-x-2 gap-y-1"
                    >
                      {/* Time / Minute */}
                      <div className="flex items-center gap-1.5 min-w-[60px]">
                        {statusShort === "HT" ? (
                          <span className="text-[11px] font-bold text-amber-400">DV</span>
                        ) : statusShort === "FT" || statusShort === "AET" || statusShort === "PEN" ? (
                          <span className="text-[11px] font-bold text-zinc-500">MS</span>
                        ) : elapsed ? (
                          <div className="flex items-center gap-1">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                            </span>
                            <span className="text-[11px] font-bold text-red-400">{elapsed}&apos;</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-500">
                            {new Date(match.fixture.fixture.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {/* Mini temp icon */}
                        {temp >= 60 && <span className="text-[9px]">{temp >= 70 ? "🔥" : "⚡"}</span>}
                      </div>

                      {/* Home Team */}
                      <div className="flex items-center gap-2 min-w-0">
                        {match.fixture.teams.home.logo && (
                          <Image src={match.fixture.teams.home.logo} alt="" width={18} height={18} className="w-[18px] h-[18px] object-contain shrink-0" />
                        )}
                        <span className={cn("text-[13px] truncate", homeGoals > awayGoals ? "text-white font-semibold" : "text-zinc-300")}>
                          {match.fixture.teams.home.name}
                        </span>
                        {analysis?.nextGoalTeam === "home" && <Crosshair className="w-3 h-3 text-green-400 shrink-0 animate-pulse" />}
                      </div>

                      {/* Score */}
                      <div className="flex items-center justify-center gap-1 min-w-[60px]">
                        {elapsed || statusShort === "HT" || statusShort === "FT" ? (
                          <>
                            <span className={cn("text-base font-black tabular-nums", homeGoals > awayGoals ? "text-white" : "text-zinc-400")}>
                              {homeGoals}
                            </span>
                            <span className="text-zinc-600 text-xs">-</span>
                            <span className={cn("text-base font-black tabular-nums", awayGoals > homeGoals ? "text-white" : "text-zinc-400")}>
                              {awayGoals}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-zinc-600">v</span>
                        )}
                      </div>

                      {/* Away Team */}
                      <div className="flex items-center gap-2 min-w-0">
                        {match.fixture.teams.away.logo && (
                          <Image src={match.fixture.teams.away.logo} alt="" width={18} height={18} className="w-[18px] h-[18px] object-contain shrink-0" />
                        )}
                        <span className={cn("text-[13px] truncate", awayGoals > homeGoals ? "text-white font-semibold" : "text-zinc-300")}>
                          {match.fixture.teams.away.name}
                        </span>
                        {analysis?.nextGoalTeam === "away" && <Crosshair className="w-3 h-3 text-green-400 shrink-0 animate-pulse" />}
                      </div>

                      {/* HT Score */}
                      <div className="text-center min-w-[50px]">
                        {htHome != null && htAway != null ? (
                          <span className="text-[11px] text-zinc-500 tabular-nums">{htHome}-{htAway}</span>
                        ) : (
                          <span className="text-[11px] text-zinc-700">-</span>
                        )}
                      </div>

                      {/* Prediction / Opportunity Column */}
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        {bestOpp ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                              bestOpp.level === "HOT" ? "bg-orange-500/20 text-orange-400" : "bg-amber-500/15 text-amber-400"
                            )}>
                              {bestOpp.level === "HOT" ? "🔥" : "⚡"} {bestOpp.market}
                            </span>
                            <span className="text-[10px] text-zinc-400 truncate">{bestOpp.message}</span>
                          </div>
                        ) : bestPick ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 shrink-0">
                              {bestPick.type}
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0">
                              %{bestPick.confidence}
                            </span>
                            <span className="text-[10px] text-yellow-500/80 shrink-0">
                              {bestPick.odds.toFixed(2)}
                            </span>
                            {bestPick.isValueBet && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/15 text-green-400 shrink-0">VAL</span>
                            )}
                            <span className="text-[10px] text-zinc-600 truncate">{bestPick.reasoning}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-600">—</span>
                        )}
                      </div>

                      {/* Status / Indicators */}
                      <div className="flex items-center justify-end gap-1.5 min-w-[120px]">
                        {/* Pick live status */}
                        {bestPick && elapsed && (() => {
                          const { icon, color } = getPickLiveStatus(bestPick.type, homeGoals, awayGoals, elapsed, match.fixture);
                          return <span className={cn("text-[11px] font-medium", color)}>{icon}</span>;
                        })()}
                        {/* Goal probability */}
                        {analysis && analysis.danger.goalProbability >= 40 && (
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                            analysis.danger.goalProbability >= 70 ? "bg-red-500/15 text-red-400" :
                            analysis.danger.goalProbability >= 50 ? "bg-orange-500/10 text-orange-400" :
                            "bg-zinc-800 text-zinc-500"
                          )}>
                            ⚽{analysis.danger.goalProbability}%
                          </span>
                        )}
                        {/* Aksiyon Sinyali: son dakika tehlikeli atak yoğunluğu */}
                        {analysis?.enrichedMomentum && (
                          <div className="flex gap-0.5" title="Aksiyon yoğunluğu">
                            {Array.from({ length: 5 }, (_, idx) => {
                              const rate = Math.max(
                                analysis.enrichedMomentum!.recentDangerousRate.home,
                                analysis.enrichedMomentum!.recentDangerousRate.away
                              );
                              const filled = idx < Math.ceil(rate * 2.5);
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    "w-1.5 h-3 rounded-sm",
                                    filled
                                      ? rate > 1.5 ? "bg-red-500" : rate > 0.8 ? "bg-amber-500" : "bg-green-500"
                                      : "bg-zinc-700"
                                  )}
                                />
                              );
                            })}
                          </div>
                        )}
                        {/* Momentum mini bar */}
                        {analysis && (
                          <div className="flex h-1.5 w-12 rounded-full overflow-hidden bg-zinc-700">
                            <div className="bg-blue-500" style={{ width: `${analysis.momentum.homeScore}%` }} />
                            <div className="bg-red-500" style={{ width: `${analysis.momentum.awayScore}%` }} />
                          </div>
                        )}
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                      </div>
                    </button>

                    {/* ---- Extra picks row (compact, below main) ---- */}
                    {match.prediction && match.prediction.picks.length > 1 && !isExpanded && (
                      <div className="px-4 pb-2 flex flex-wrap gap-1.5 sm:pl-[64px]">
                        {match.prediction.picks.slice(1, 5).map((pick, i) => {
                          const { icon, color } = getPickLiveStatus(pick.type, homeGoals, awayGoals, elapsed || 0, match.fixture);
                          return (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-zinc-800/60 text-zinc-400 px-2 py-0.5 rounded">
                              <span className="font-medium text-zinc-300">{pick.type}</span>
                              <span className="text-zinc-600">%{pick.confidence}</span>
                              <span className="text-yellow-500/60">{pick.odds.toFixed(2)}</span>
                              <span className={cn("text-[9px]", color)}>{icon}</span>
                            </span>
                          );
                        })}
                        {/* Opportunity badges */}
                        {analysis?.opportunities?.slice(0, 2).map((opp, i) => (
                          <span key={`opp-${i}`} className={cn(
                            "text-[10px] px-2 py-0.5 rounded font-medium",
                            opp.level === "HOT" ? "bg-orange-500/10 text-orange-400" : "bg-amber-500/10 text-amber-400"
                          )}>
                            {opp.level === "HOT" ? "🔥" : "⚡"} {opp.market}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ---- Expanded Detail ---- */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800">
                        {/* Live Analysis Panel */}
                        {analysis && <LiveAnalysisPanel analysis={analysis} match={match} />}

                        {/* Insights */}
                        {match.liveInsights.length > 0 && (
                          <div className="px-4 py-3 bg-zinc-800/30 flex flex-wrap gap-1.5">
                            {match.liveInsights.map((insight, i) => (
                              <span key={i} className="text-xs bg-zinc-700/50 text-zinc-200 px-2.5 py-1 rounded-lg">
                                {insight}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* HT Score + Referee */}
                        <div className="px-4 py-2 flex items-center justify-center gap-4 text-[10px] text-zinc-500 bg-zinc-800/20">
                          <span>İY: {match.fixture.score.halftime.home ?? 0} - {match.fixture.score.halftime.away ?? 0}</span>
                          <span>·</span>
                          <span>Hakem: {match.fixture.fixture.referee || "Bilinmiyor"}</span>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-zinc-800">
                          {[
                            { key: "analysis", icon: Flame, label: "Analiz" },
                            { key: "stats", icon: BarChart3, label: "İstatistik" },
                            { key: "events", icon: Activity, label: "Olaylar" },
                            { key: "lineups", icon: Users, label: "Kadro" },
                            { key: "predictions", icon: Target, label: "Tahminler" },
                          ].map(({ key, icon: Icon, label }) => (
                            <button
                              key={key}
                              onClick={(e) => { e.stopPropagation(); setTab(fid, key); }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                                getTab(fid) === key ? "text-white border-b-2 border-indigo-500" : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* Tab Content */}
                        <div className="p-4">
                          {getTab(fid) === "analysis" && <OpportunitiesPanel analysis={analysis} match={match} />}
                          {getTab(fid) === "stats" && <StatsPanel stats={match.statistics} match={match.fixture} />}
                          {getTab(fid) === "events" && <EventsPanel events={match.events} />}
                          {getTab(fid) === "lineups" && <LineupsPanel lineups={match.lineups} />}
                          {getTab(fid) === "predictions" && <PredictionsPanel prediction={match.prediction} match={match.fixture} />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-16 text-center">
          <Radio className="mx-auto h-12 w-12 text-zinc-600 mb-4" />
          <h3 className="font-semibold text-lg text-white mb-2">
            {showOnlyOpportunities ? "Aktif Fırsat Yok" : "Canlı Maç Yok"}
          </h3>
          <p className="text-sm text-zinc-400">
            {showOnlyOpportunities
              ? "Şu anda tespit edilen fırsat bulunmuyor. Filtreyi kaldırıp tüm maçlara bakabilirsin."
              : "Şu anda oynanan maç bulunmuyor."}
          </p>
          {showOnlyOpportunities && (
            <button
              onClick={() => setShowOnlyOpportunities(false)}
              className="mt-4 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
            >
              Tüm Maçları Göster
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Live Analysis Panel (Compact header in expanded view)
// ============================================

function LiveAnalysisPanel({ analysis, match }: { analysis: LiveMatchAnalysis | null; match: EnrichedLiveMatch }) {
  if (!analysis) return null;

  const { momentum, danger, matchTemperature, nextGoalTeam, scorePressure, enrichedMomentum, winProbability, projectedScore, matchPhase } = analysis;
  const homeName = match.fixture.teams.home.name;
  const awayName = match.fixture.teams.away.name;

  const nextGoalLabel =
    nextGoalTeam === "home" ? homeName :
    nextGoalTeam === "away" ? awayName :
    nextGoalTeam === "either" ? "Her iki takım" : "Düşük ihtimal";

  const phaseLabel = matchPhase === "early" ? "Erken" : matchPhase === "mid" ? "Orta" : matchPhase === "late" ? "Geç" : matchPhase === "final" ? "Final" : matchPhase === "ht" ? "Devre Arası" : "—";
  const phaseColor = matchPhase === "late" || matchPhase === "final" ? "text-red-400" : matchPhase === "ht" ? "text-amber-400" : "text-zinc-400";

  return (
    <div className="bg-gradient-to-b from-zinc-800/60 to-transparent px-4 py-4 space-y-4">
      {/* Win Probability Bar */}
      {winProbability && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-500 font-medium flex items-center gap-1"><Target className="w-3 h-3" /> Kazanma Olasılığı</p>
            <div className="flex items-center gap-2">
              {matchPhase && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-700/50", phaseColor)}>{phaseLabel}</span>}
              {projectedScore && (
                <span className="text-[10px] text-zinc-400 bg-zinc-700/50 px-2 py-0.5 rounded-full">
                  Projeksiyon: <span className="font-bold text-white">{projectedScore.home.toFixed(1)}</span> - <span className="font-bold text-white">{projectedScore.away.toFixed(1)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex h-6 rounded-lg overflow-hidden bg-zinc-700/30 text-[10px] font-bold">
            <div
              className="bg-blue-500/80 flex items-center justify-center transition-all duration-700"
              style={{ width: `${winProbability.home}%`, minWidth: winProbability.home > 5 ? "32px" : "0" }}
            >
              {winProbability.home >= 10 && <span className="text-white">{winProbability.home.toFixed(0)}%</span>}
            </div>
            <div
              className="bg-zinc-500/60 flex items-center justify-center transition-all duration-700"
              style={{ width: `${winProbability.draw}%`, minWidth: winProbability.draw > 5 ? "32px" : "0" }}
            >
              {winProbability.draw >= 10 && <span className="text-white">{winProbability.draw.toFixed(0)}%</span>}
            </div>
            <div
              className="bg-red-500/80 flex items-center justify-center transition-all duration-700"
              style={{ width: `${winProbability.away}%`, minWidth: winProbability.away > 5 ? "32px" : "0" }}
            >
              {winProbability.away >= 10 && <span className="text-white">{winProbability.away.toFixed(0)}%</span>}
            </div>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-blue-400">{homeName}</span>
            <span className="text-zinc-500">Beraberlik</span>
            <span className="text-red-400">{awayName}</span>
          </div>
        </div>
      )}

      {/* Top row: Momentum + Temperature + Danger */}
      <div className="grid grid-cols-3 gap-3">
        {/* Momentum */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Momentum
            {momentum.trend === "increasing" && <span className="text-green-400 text-[10px]">▲</span>}
            {momentum.trend === "decreasing" && <span className="text-red-400 text-[10px]">▼</span>}
            {momentum.trend === "stable" && <span className="text-zinc-500 text-[10px]">—</span>}
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("font-bold", momentum.homeScore > momentum.awayScore ? "text-blue-400" : "text-zinc-500")}>
              {momentum.homeScore.toFixed(0)}
            </span>
            <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-zinc-700">
              <div className="bg-blue-500 transition-all duration-700 rounded-l-full" style={{ width: `${momentum.homeScore}%` }} />
              <div className="bg-red-500 transition-all duration-700 rounded-r-full" style={{ width: `${momentum.awayScore}%` }} />
            </div>
            <span className={cn("font-bold", momentum.awayScore > momentum.homeScore ? "text-red-400" : "text-zinc-500")}>
              {momentum.awayScore.toFixed(0)}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400">{momentum.description}</p>
        </div>

        {/* Match Heat */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
            <Flame className="w-3 h-3" /> Maç Sıcaklığı
          </p>
          <div className={cn(
            "text-2xl font-black",
            matchTemperature >= 70 ? "text-red-400" :
            matchTemperature >= 45 ? "text-amber-400" :
            matchTemperature >= 25 ? "text-yellow-400" : "text-zinc-500"
          )}>
            {matchTemperature}°
          </div>
          <p className="text-[10px] text-zinc-500">
            {matchTemperature >= 70 ? "Çılgın maç!" :
             matchTemperature >= 45 ? "Hareketli" :
             matchTemperature >= 25 ? "Normal" : "Sakin"}
          </p>
        </div>

        {/* Danger */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Gol Tehlikesi
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  danger.goalProbability >= 70 ? "bg-red-500" :
                  danger.goalProbability >= 50 ? "bg-orange-500" :
                  danger.goalProbability >= 30 ? "bg-yellow-500" : "bg-green-500"
                )}
                style={{ width: `${danger.goalProbability}%` }}
              />
            </div>
            <span className={cn(
              "text-sm font-bold",
              danger.goalProbability >= 70 ? "text-red-400" :
              danger.goalProbability >= 50 ? "text-orange-400" : "text-zinc-400"
            )}>
              %{danger.goalProbability}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400">{danger.description}</p>
        </div>
      </div>

      {/* xG Comparison */}
      {enrichedMomentum && (
        <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2">
          <p className="text-[10px] text-zinc-500 font-medium">xG Akış Karşılaştırma</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-400 min-w-[36px]">{enrichedMomentum.liveXg.home.toFixed(2)}</span>
                <div className="flex-1 h-2.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(enrichedMomentum.liveXg.home / Math.max(enrichedMomentum.liveXg.home + enrichedMomentum.liveXg.away, 0.1) * 100, 100)}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-400 min-w-[36px]">{enrichedMomentum.liveXg.away.toFixed(2)}</span>
                <div className="flex-1 h-2.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(enrichedMomentum.liveXg.away / Math.max(enrichedMomentum.liveXg.home + enrichedMomentum.liveXg.away, 0.1) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
            <div className="text-center px-2">
              <span className={cn(
                "text-xs font-bold",
                enrichedMomentum.xgDelta > 0.3 ? "text-blue-400" : enrichedMomentum.xgDelta < -0.3 ? "text-red-400" : "text-zinc-400"
              )}>
                Δ{enrichedMomentum.xgDelta > 0 ? "+" : ""}{enrichedMomentum.xgDelta.toFixed(2)}
              </span>
              <p className="text-[9px] text-zinc-600">xG Farkı</p>
            </div>
          </div>
          {/* Pressure Index */}
          <div className="flex items-center gap-3 pt-1 border-t border-zinc-700/40">
            <span className="text-[10px] text-zinc-500 min-w-[52px]">Baskı İndeksi</span>
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-[10px] font-bold text-blue-400">{enrichedMomentum.pressureIndex.home.toFixed(0)}</span>
              <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-zinc-700">
                <div className="bg-blue-500 transition-all" style={{ width: `${enrichedMomentum.pressureIndex.home / (enrichedMomentum.pressureIndex.home + enrichedMomentum.pressureIndex.away || 1) * 100}%` }} />
                <div className="bg-red-500 transition-all" style={{ width: `${enrichedMomentum.pressureIndex.away / (enrichedMomentum.pressureIndex.home + enrichedMomentum.pressureIndex.away || 1) * 100}%` }} />
              </div>
              <span className="text-[10px] font-bold text-red-400">{enrichedMomentum.pressureIndex.away.toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom row: Next goal + Score pressure */}
      <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <Crosshair className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[10px] text-zinc-500">Sıradaki gol:</span>
          <span className={cn(
            "text-xs font-bold",
            nextGoalTeam === "unlikely" ? "text-zinc-500" : "text-green-400"
          )}>
            {nextGoalLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] text-zinc-500">Baskı:</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full",
                  i < Math.ceil(scorePressure / 20)
                    ? scorePressure >= 80 ? "bg-red-500" : scorePressure >= 50 ? "bg-amber-500" : "bg-green-500"
                    : "bg-zinc-700"
                )}
              />
            ))}
          </div>
          <span className="text-[10px] text-zinc-400">{scorePressure}/100</span>
        </div>
      </div>

      {/* Mini Event Timeline */}
      {match.events && match.events.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
            <Activity className="w-3 h-3" /> Maç Akışı
          </p>
          <div className="relative h-8 bg-zinc-800/50 rounded-lg overflow-hidden">
            {/* Half-time line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600/50 z-10" />
            <span className="absolute left-1/2 -translate-x-1/2 top-0 text-[8px] text-zinc-600 z-10">45&apos;</span>
            {/* Events positioned along the timeline */}
            {match.events.filter(e => e.type === "Goal" || e.type === "Card").map((event, i) => {
              const minute = event.time.elapsed || 0;
              const leftPct = Math.min(Math.max((minute / 95) * 100, 2), 98);
              const isGoal = event.type === "Goal";
              const isRed = event.detail === "Red Card";
              const isHome = event.team.id === match.fixture.teams.home.id;
              return (
                <div
                  key={i}
                  className="absolute z-20"
                  style={{ left: `${leftPct}%`, top: isHome ? "2px" : "16px" }}
                  title={`${minute}' ${event.player?.name || ""} (${event.team.name})`}
                >
                  {isGoal ? (
                    <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px]",
                      isHome ? "bg-blue-500/80 text-white" : "bg-red-500/80 text-white"
                    )}>⚽</div>
                  ) : (
                    <div className={cn("w-3 h-3 rounded-sm",
                      isRed ? "bg-red-500" : "bg-yellow-500"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-zinc-600 px-1">
            <span>0&apos;</span>
            <span>90&apos;</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Opportunities Panel (Full tab view)
// ============================================

function OpportunitiesPanel({ analysis, match }: { analysis: LiveMatchAnalysis | null; match: EnrichedLiveMatch }) {
  if (!analysis || analysis.opportunities.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        <Eye className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
        <p>Bu maçta şu an belirgin fırsat tespit edilmedi</p>
        <p className="text-[10px] text-zinc-600 mt-1">Maç ilerledikçe fırsatlar ortaya çıkabilir</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scenario Banner */}
      {analysis.enrichedMomentum && analysis.enrichedMomentum.scenarioType !== "NORMAL" && (() => {
        const badge = getScenarioBadge(analysis.enrichedMomentum!.scenarioType);
        if (!badge) return null;
        return (
          <div className={cn("rounded-xl border p-3 flex items-center gap-3", badge.color.replace("text-", "border-").replace("/20", "/30"))}>
            <span className="text-2xl">{badge.icon}</span>
            <div>
              <span className={cn("text-xs font-bold", badge.color.split(" ")[1])}>{badge.label} Senaryosu</span>
              <p className="text-xs text-zinc-300 mt-0.5">{analysis.enrichedMomentum!.scenarioMessage}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-[10px] text-zinc-500">xG Farkı: {analysis.enrichedMomentum!.xgDelta.toFixed(1)}</span>
                <span className="text-[10px] text-zinc-500">Baskı: {analysis.enrichedMomentum!.pressureIndex.home.toFixed(0)} - {analysis.enrichedMomentum!.pressureIndex.away.toFixed(0)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">
            {analysis.opportunities.length} Fırsat Tespit Edildi
          </span>
        </div>
        <div className="flex gap-2">
          {analysis.opportunities.filter(o => o.level === "HOT").length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-bold">
              {analysis.opportunities.filter(o => o.level === "HOT").length} HOT
            </span>
          )}
          {analysis.opportunities.filter(o => o.level === "WARM").length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
              {analysis.opportunities.filter(o => o.level === "WARM").length} WARM
            </span>
          )}
        </div>
      </div>

      {/* Opportunity Cards */}
      <div className="space-y-3">
        {analysis.opportunities.map((opp, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-4 space-y-3",
              opp.level === "HOT"
                ? "bg-gradient-to-r from-orange-500/10 via-red-500/5 to-transparent border-orange-500/20"
                : opp.level === "WARM"
                ? "bg-gradient-to-r from-amber-500/5 to-transparent border-amber-500/15"
                : "bg-zinc-800/30 border-zinc-700/50"
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  opp.level === "HOT" ? "bg-orange-500/20 text-orange-400" :
                  opp.level === "WARM" ? "bg-amber-500/20 text-amber-400" :
                  "bg-zinc-700 text-zinc-400"
                )}>
                  {opp.level === "HOT" ? "🔥 HOT" : opp.level === "WARM" ? "⚡ WARM" : "ℹ️ INFO"}
                </span>
                <span className={cn(
                  "text-sm font-bold px-3 py-1 rounded-lg",
                  opp.level === "HOT" ? "bg-orange-500/15 text-orange-300" : "bg-zinc-700/50 text-zinc-200"
                )}>
                  {opp.market}
                </span>
                {(() => { const badge = getScenarioBadge(opp.scenario); return badge ? <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", badge.color)}>{badge.icon} {badge.label}</span> : null; })()}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className={cn(
                  "text-sm font-black",
                  opp.confidence >= 70 ? "text-green-400" :
                  opp.confidence >= 50 ? "text-amber-400" : "text-zinc-400"
                )}>
                  %{opp.confidence}
                </span>
                <span className="text-[10px] text-zinc-500">{opp.timeWindow}</span>
              </div>
            </div>

            {/* Message */}
            <p className="text-sm text-white font-medium">{opp.message}</p>

            {/* Reasoning */}
            <p className="text-xs text-zinc-400 leading-relaxed">{opp.reasoning}</p>

            {/* Confidence bar */}
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  opp.confidence >= 70 ? "bg-green-500" :
                  opp.confidence >= 50 ? "bg-amber-500" : "bg-zinc-500"
                )}
                style={{ width: `${opp.confidence}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Attack comparison */}
      <div className="bg-zinc-800/30 rounded-lg p-3 space-y-2">
        <p className="text-[10px] text-zinc-500 font-medium">Atak Güçleri Karşılaştırma</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{match.fixture.teams.home.name}</span>
              <span className="text-xs font-bold text-blue-400">{analysis.danger.homeAttack.toFixed(0)}</span>
            </div>
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${analysis.danger.homeAttack}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{match.fixture.teams.away.name}</span>
              <span className="text-xs font-bold text-red-400">{analysis.danger.awayAttack.toFixed(0)}</span>
            </div>
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ width: `${analysis.danger.awayAttack}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Stats Panel
// ============================================

function StatsPanel({ stats, match }: { stats: FixtureStatisticsResponse[] | null; match: FixtureResponse }) {
  if (!stats || stats.length < 2) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
        İstatistik henüz mevcut değil
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
        <span className="font-medium">{match.teams.home.name}</span>
        <span className="font-medium">{match.teams.away.name}</span>
      </div>

      {KEY_STATS.map((statType) => {
        const homeStat = stats[0]?.statistics?.find((s) => s.type === statType);
        const awayStat = stats[1]?.statistics?.find((s) => s.type === statType);
        if (!homeStat && !awayStat) return null;

        const homeVal = homeStat?.value ?? 0;
        const awayVal = awayStat?.value ?? 0;
        const homeNum = typeof homeVal === "string" ? parseFloat(homeVal) || 0 : homeVal;
        const awayNum = typeof awayVal === "string" ? parseFloat(awayVal) || 0 : awayVal;
        const total = homeNum + awayNum || 1;
        const homePct = (homeNum / total) * 100;
        const awayPct = (awayNum / total) * 100;
        const label = STAT_LABELS[statType] || statType;

        return (
          <div key={statType} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={cn("font-medium", homeNum > awayNum ? "text-white" : "text-zinc-500")}>{String(homeVal)}</span>
              <span className="text-zinc-500 text-[10px]">{label}</span>
              <span className={cn("font-medium", awayNum > homeNum ? "text-white" : "text-zinc-500")}>{String(awayVal)}</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800">
              <div className={cn("transition-all duration-500", homeNum >= awayNum ? "bg-blue-500" : "bg-blue-500/40")} style={{ width: `${homePct}%` }} />
              <div className={cn("transition-all duration-500", awayNum >= homeNum ? "bg-red-500" : "bg-red-500/40")} style={{ width: `${awayPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Events Panel
// ============================================

function EventsPanel({ events }: { events: FixtureEvent[] | null }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        <Activity className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
        Henüz olay yok
      </div>
    );
  }

  const getEventIcon = (type: string, detail: string) => {
    if (type === "Goal") return detail === "Own Goal" ? "🔴" : detail === "Penalty" ? "⚽(P)" : "⚽";
    if (type === "Card" && detail === "Yellow Card") return "🟨";
    if (type === "Card" && detail === "Red Card") return "🟥";
    if (type === "Card" && detail === "Second Yellow card") return "🟨🟥";
    if (type === "subst") return "🔄";
    if (type === "Var") return "📺";
    return "•";
  };

  return (
    <div className="space-y-1">
      {events.map((event, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 py-2 px-2 rounded-lg",
            event.type === "Goal" ? "bg-green-500/5" : event.type === "Card" && event.detail === "Red Card" ? "bg-red-500/5" : "hover:bg-zinc-800/50"
          )}
        >
          <span className="text-xs text-zinc-500 min-w-[32px] text-right font-mono">
            {event.time.elapsed}&apos;{event.time.extra ? `+${event.time.extra}` : ""}
          </span>
          <span className="text-sm min-w-[28px] text-center">{getEventIcon(event.type, event.detail)}</span>
          <div className="flex-1 min-w-0">
            <p className={cn("text-xs font-medium truncate", event.type === "Goal" ? "text-green-400" : "text-zinc-300")}>
              {event.player.name}
              {event.assist?.name && <span className="text-zinc-500 font-normal"> ({event.assist.name})</span>}
            </p>
            <p className="text-[10px] text-zinc-600">{event.team.name}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Lineups Panel
// ============================================

function LineupsPanel({ lineups }: { lineups: LineupResponse[] | null }) {
  if (!lineups || lineups.length < 2) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        <Users className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
        Kadro bilgisi henüz mevcut değil
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {lineups.map((lineup, idx) => (
        <div key={idx} className="space-y-3">
          {/* Team Header */}
          <div className="flex items-center gap-2">
            {lineup.team.logo && <Image src={lineup.team.logo} alt="" width={20} height={20} className="w-5 h-5 object-contain" />}
            <span className="text-xs font-semibold text-white">{lineup.team.name}</span>
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{lineup.formation}</span>
          </div>

          {/* Coach */}
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {lineup.coach.name}
          </div>

          {/* Starting XI */}
          <div className="space-y-0.5">
            <p className="text-[10px] text-zinc-500 font-medium mb-1 flex items-center gap-1">
              <Swords className="w-3 h-3" /> İlk 11
            </p>
            {lineup.startXI.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                <span className="text-zinc-600 w-5 text-right font-mono text-[10px]">{p.player.number}</span>
                <span className="text-[10px] text-zinc-600 w-5">{p.player.pos}</span>
                <span className="text-zinc-300 truncate">{p.player.name}</span>
              </div>
            ))}
          </div>

          {/* Subs */}
          {lineup.substitutes.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] text-zinc-600 font-medium mb-1">Yedekler</p>
              {lineup.substitutes.slice(0, 7).map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="text-zinc-700 w-5 text-right font-mono text-[10px]">{p.player.number}</span>
                  <span className="text-[10px] text-zinc-700 w-5">{p.player.pos || "-"}</span>
                  <span className="text-zinc-500 truncate">{p.player.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================
// Predictions Panel
// ============================================

function PredictionsPanel({ prediction, match }: { prediction: MatchPrediction | null; match: FixtureResponse }) {
  if (!prediction || prediction.picks.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        <Target className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
        Bu maç için tahmin bulunmuyor
      </div>
    );
  }

  const homeGoals = match.goals.home ?? 0;
  const awayGoals = match.goals.away ?? 0;
  const totalGoals = homeGoals + awayGoals;
  const elapsed = match.fixture.status.elapsed || 0;

  const getPickStatus = (pickType: string): { status: string; color: string } => {
    switch (pickType) {
      case "1":
        return homeGoals > awayGoals
          ? { status: "✅ Tutuyor", color: "text-green-400" }
          : homeGoals === awayGoals
          ? { status: "⏳ Berabere", color: "text-yellow-400" }
          : { status: "❌ Tehlikede", color: "text-red-400" };
      case "X":
        return homeGoals === awayGoals
          ? { status: "✅ Tutuyor", color: "text-green-400" }
          : { status: "❌ Tehlikede", color: "text-red-400" };
      case "2":
        return awayGoals > homeGoals
          ? { status: "✅ Tutuyor", color: "text-green-400" }
          : awayGoals === homeGoals
          ? { status: "⏳ Berabere", color: "text-yellow-400" }
          : { status: "❌ Tehlikede", color: "text-red-400" };
      case "Over 1.5":
        return totalGoals >= 2
          ? { status: "✅ Tuttu", color: "text-green-400" }
          : { status: elapsed >= 70 ? "⚠️ Zaman daralıyor" : "⏳ Bekleniyor", color: elapsed >= 70 ? "text-orange-400" : "text-yellow-400" };
      case "Under 1.5":
        return totalGoals >= 2 ? { status: "❌ Bozuldu", color: "text-red-400" } : { status: "✅ Tutuyor", color: "text-green-400" };
      case "Over 2.5":
        return totalGoals >= 3
          ? { status: "✅ Tuttu", color: "text-green-400" }
          : { status: elapsed >= 70 ? "⚠️ Zaman daralıyor" : "⏳ Bekleniyor", color: elapsed >= 70 ? "text-orange-400" : "text-yellow-400" };
      case "Under 2.5":
        return totalGoals >= 3 ? { status: "❌ Bozuldu", color: "text-red-400" } : { status: "✅ Tutuyor", color: "text-green-400" };
      case "Over 3.5":
        return totalGoals >= 4
          ? { status: "✅ Tuttu", color: "text-green-400" }
          : { status: elapsed >= 75 ? "⚠️ Zor görünüyor" : "⏳ Bekleniyor", color: elapsed >= 75 ? "text-orange-400" : "text-yellow-400" };
      case "Under 3.5":
        return totalGoals >= 4 ? { status: "❌ Bozuldu", color: "text-red-400" } : { status: "✅ Tutuyor", color: "text-green-400" };
      case "BTTS Yes":
        return homeGoals > 0 && awayGoals > 0
          ? { status: "✅ Tuttu", color: "text-green-400" }
          : homeGoals > 0 || awayGoals > 0
          ? { status: "⏳ Bir takım daha", color: "text-yellow-400" }
          : { status: "⏳ Bekleniyor", color: "text-yellow-400" };
      case "BTTS No":
        return homeGoals > 0 && awayGoals > 0 ? { status: "❌ Bozuldu", color: "text-red-400" } : { status: "✅ Tutuyor", color: "text-green-400" };
      case "1X":
        return homeGoals >= awayGoals ? { status: "✅ Tutuyor", color: "text-green-400" } : { status: "❌ Tehlikede", color: "text-red-400" };
      case "X2":
        return awayGoals >= homeGoals ? { status: "✅ Tutuyor", color: "text-green-400" } : { status: "❌ Tehlikede", color: "text-red-400" };
      case "12":
        return homeGoals !== awayGoals
          ? { status: "✅ Tutuyor", color: "text-green-400" }
          : { status: elapsed >= 80 ? "⚠️ Beraberlik riski" : "⏳ Berabere", color: elapsed >= 80 ? "text-orange-400" : "text-yellow-400" };
      default: {
        // İY/MS pick tracking
        if (pickType.includes("/")) {
          const [htPick, ftPick] = pickType.split("/");
          const htH = match.score?.halftime?.home ?? null;
          const htA = match.score?.halftime?.away ?? null;
          if (htH === null || htA === null) return { status: "⏳ İlk yarı bekleniyor", color: "text-yellow-400" };
          const htResult = htH > htA ? "1" : htH === htA ? "X" : "2";
          const ftResult = homeGoals > awayGoals ? "1" : homeGoals === awayGoals ? "X" : "2";
          if (htResult === htPick && ftResult === ftPick) return { status: "✅ Tutuyor", color: "text-green-400" };
          if (elapsed >= 46 && htResult !== htPick) return { status: "❌ İY bozuldu", color: "text-red-400" };
          if (elapsed >= 75 && ftResult !== ftPick) return { status: "⚠️ MS risk", color: "text-orange-400" };
          return { status: "⏳ Devam", color: "text-yellow-400" };
        }
        return { status: "—", color: "text-zinc-500" };
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Analysis Summary */}
      {prediction.analysisSummary && (
        <div className="bg-zinc-800/30 rounded-lg p-3">
          <p className="text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3" /> Analiz Özeti
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed">{prediction.analysisSummary}</p>
        </div>
      )}

      {/* All Picks */}
      <div className="space-y-2">
        {prediction.picks.map((pick, i) => {
          const { status, color } = getPickStatus(pick.type);
          return (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                i === 0 ? "bg-indigo-500/5 border-indigo-500/20" : "bg-zinc-800/20 border-zinc-800"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("text-sm font-bold px-3 py-1 rounded-lg", i === 0 ? "bg-indigo-500/20 text-indigo-400" : "bg-zinc-800 text-zinc-300")}>
                  {pick.type}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Güven: %{pick.confidence}</span>
                    <span className="text-xs text-zinc-500">·</span>
                    <span className="text-xs text-yellow-400">{pick.odds.toFixed(2)}</span>
                    {pick.isValueBet && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">VALUE</span>}
                  </div>
                  {pick.reasoning && <p className="text-[10px] text-zinc-600 mt-0.5 max-w-[300px] truncate">{pick.reasoning}</p>}
                </div>
              </div>
              <div className="text-right">
                <span className={cn("text-xs font-medium", color)}>{status}</span>
                {pick.expectedValue > 0 && <p className="text-[10px] text-zinc-600">EV: {pick.expectedValue.toFixed(2)}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Score Context */}
      <div className="flex items-center justify-center gap-4 py-2 text-zinc-500">
        <span className="text-xs">
          Skor: {homeGoals} - {awayGoals} ({elapsed}&apos;)
        </span>
        <span className="text-xs">Toplam Gol: {totalGoals}</span>
      </div>
    </div>
  );
}
