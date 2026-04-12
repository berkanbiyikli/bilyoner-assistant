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
  Clock,
  Trophy,
  Gauge,
  ArrowUp,
  ArrowDown,
  Minus,
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

type InsightBias = "over" | "under" | "home" | "away" | "btts" | "draw" | "neutral";

interface SmartInsight {
  type: string;
  icon: string;
  text: string;
  bettingAngle: string;
  bias: InsightBias;
  strength: number;
}

interface LiveMatchAnalysis {
  momentum: MomentumData;
  danger: DangerLevel;
  opportunities: LiveOpportunity[];
  insights: string[];
  smartInsights?: SmartInsight[];
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

// ---- Helpers ----

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

function getScenarioBadge(scenario?: ScenarioType): { icon: string; label: string; color: string } | null {
  switch (scenario) {
    case "BASKI_VAR": return { icon: "🔥", label: "Baskı Var", color: "bg-red-500/20 text-red-400 border-red-500/30" };
    case "MAC_UYUDU": return { icon: "😴", label: "Maç Uyudu", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
    case "GOL_FESTIVALI": return { icon: "⚽", label: "Gol Festivali", color: "bg-green-500/20 text-green-400 border-green-500/30" };
    case "SAVUNMA_SAVASI": return { icon: "🛡️", label: "Defans Savaşı", color: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
    case "COMEBACK_KOKUSU": return { icon: "⚡", label: "Comeback!", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
    case "ERKEN_FIRTINA": return { icon: "🌪️", label: "Fırtına", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" };
    case "SON_DAKIKA_HEYECANI": return { icon: "⏰", label: "Son Dakika!", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    default: return null;
  }
}

// Match time phase helper
type TimePhase = "1h" | "ht" | "2h" | "ended" | "not_started";
function getMatchTimePhase(match: EnrichedLiveMatch): TimePhase {
  const statusShort = match.fixture.fixture.status.short;
  if (statusShort === "HT") return "ht";
  if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN") return "ended";
  const elapsed = match.fixture.fixture.status.elapsed || 0;
  if (elapsed <= 0) return "not_started";
  if (elapsed <= 45) return "1h";
  return "2h";
}

// Context-aware bet label: transforms generic bets to time-specific ones
function getContextAwareBetLabel(
  market: string,
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
  htHome: number | null,
  htAway: number | null
): { label: string; isContextual: boolean; warning?: string } {
  const totalGoals = homeGoals + awayGoals;
  const isFirstHalf = elapsed > 0 && elapsed <= 45;
  const isSecondHalf = elapsed > 45;

  // Already a half-specific market from backend — no transformation needed
  if (market.startsWith("İY") || market.startsWith("2Y")) {
    return { label: market, isContextual: false };
  }

  // First half: convert full-match bets to first-half equivalents
  if (isFirstHalf) {
    // Over that's already won → suggest next İY target
    if (market === "Over 2.5" && totalGoals >= 3) {
      return { label: `İY ${totalGoals + 0.5} Üst`, isContextual: true, warning: "MS 2.5 Üst zaten tuttu" };
    }
    if (market === "Over 1.5" && totalGoals >= 2) {
      return { label: "İY 2.5 Üst", isContextual: true, warning: "MS 1.5 Üst zaten tuttu" };
    }
    // Over 2.5 in first half with 1 or 0 goals → İY 1.5 Üst more actionable
    if (market === "Over 2.5" && totalGoals <= 1 && elapsed >= 15 && elapsed <= 35) {
      return { label: "İY 1.5 Üst", isContextual: true, warning: "İY'de daha değerli" };
    }
    // Over 3.5 in first half → practically İY 2.5 Üst for first half value
    if (market.startsWith("Over") && elapsed <= 40) {
      const lineParts = market.match(/(\d+\.\d+)/);
      const line = lineParts ? parseFloat(lineParts[1]) : 0;
      if (line >= 3.5 && totalGoals >= 2) {
        return { label: `İY ${totalGoals + 0.5} Üst`, isContextual: true, warning: `MS ${market.split(" ")[1]} uzak, İY daha değerli` };
      }
    }
    // MS result in first half with short time left → İY Sonucu more relevant
    if ((market === "MS 1" || market === "MS 2") && elapsed >= 30) {
      const iyLabel = market === "MS 1" ? "İY 1" : "İY 2";
      return { label: iyLabel, isContextual: true, warning: `İY sonucu daha erişilebilir` };
    }
    // BTTS in first half → İY KG Var
    if (market === "BTTS Var" && elapsed >= 20) {
      if (homeGoals > 0 && awayGoals > 0) {
        return { label: "İY KG Var", isContextual: true, warning: "✅ Zaten tuttu" };
      }
      if (homeGoals > 0 || awayGoals > 0) {
        return { label: "İY KG Var", isContextual: true, warning: "1 takım attı, İY KG yakın" };
      }
    }
  }
  
  // Second half: convert to second half specific bets
  if (isSecondHalf && htHome != null && htAway != null) {
    const secondHalfGoals = totalGoals - (htHome + htAway);
    if (market === "Over 2.5" && totalGoals >= 3) {
      return { label: `2Y ${secondHalfGoals + 0.5} Üst`, isContextual: true, warning: "MS 2.5 Üst zaten tuttu" };
    }
    if (market === "Over 1.5" && totalGoals >= 2) {
      return { label: "2Y 0.5 Üst", isContextual: true, warning: "MS 1.5 Üst zaten tuttu" };
    }
    if (market.startsWith("Over")) {
      const lineParts = market.match(/(\d+\.\d+)/);
      const line = lineParts ? parseFloat(lineParts[1]) : 0;
      const goalsNeeded = Math.ceil(line) - totalGoals;
      if (goalsNeeded <= 0) {
        return { label: `2Y ${secondHalfGoals + 0.5} Üst`, isContextual: true, warning: `MS ${market.split(" ")[1]} zaten tuttu` };
      }
      if (goalsNeeded >= 2 && elapsed >= 70) {
        return { label: market, isContextual: false, warning: `⚠️ ${goalsNeeded} gol lazım, zor` };
      }
    }
    if (market === "Under 2.5" && totalGoals >= 2 && elapsed >= 75) {
      return { label: market, isContextual: false, warning: "Riskli: 1 gol bozar" };
    }
    // BTTS in second half → check if already happened
    if (market === "BTTS Var") {
      if (homeGoals > 0 && awayGoals > 0) {
        return { label: market, isContextual: false, warning: "✅ Zaten tuttu" };
      }
    }
  }

  return { label: market, isContextual: false };
}

// Match tempo / speed calculation
function calculateMatchTempo(match: EnrichedLiveMatch): { speed: number; label: string; color: string; emoji: string } {
  const elapsed = match.fixture.fixture.status.elapsed || 0;
  if (elapsed <= 0) return { speed: 0, label: "Başlamadı", color: "text-zinc-500", emoji: "⏸️" };

  const events = match.events || [];
  let score = 0;

  // Goals contribution
  const totalGoals = (match.fixture.goals.home ?? 0) + (match.fixture.goals.away ?? 0);
  score += totalGoals * 15;

  // Events per minute
  const eventsPerMin = events.length / Math.max(elapsed, 1);
  score += eventsPerMin * 40;

  // Goals per minute scaled
  const goalsPerMin = totalGoals / Math.max(elapsed, 1);
  score += goalsPerMin * 300;

  // Shot activity
  const stats = match.statistics;
  if (stats && stats.length >= 2) {
    const homeShotsRaw = stats[0]?.statistics?.find(s => s.type === "Total Shots")?.value;
    const awayShotsRaw = stats[1]?.statistics?.find(s => s.type === "Total Shots")?.value;
    const homeShots = typeof homeShotsRaw === "string" ? parseInt(homeShotsRaw) || 0 : (homeShotsRaw ?? 0);
    const awayShots = typeof awayShotsRaw === "string" ? parseInt(awayShotsRaw) || 0 : (awayShotsRaw ?? 0);
    const shotsPerMin = (homeShots + awayShots) / Math.max(elapsed, 1);
    score += shotsPerMin * 60;
  }

  // Cards add to pace
  const cards = events.filter(e => e.type === "Card").length;
  score += cards * 5;

  // Temperature from analysis
  if (match.analysis?.matchTemperature) {
    score += match.analysis.matchTemperature * 0.3;
  }

  // Danger probability boost
  if (match.analysis?.danger?.goalProbability) {
    score += match.analysis.danger.goalProbability * 0.2;
  }

  const speed = Math.min(100, Math.max(0, Math.round(score)));

  if (speed >= 75) return { speed, label: "Çok Hızlı", color: "text-red-400", emoji: "🔥" };
  if (speed >= 55) return { speed, label: "Hızlı", color: "text-orange-400", emoji: "⚡" };
  if (speed >= 35) return { speed, label: "Normal", color: "text-amber-400", emoji: "⏱️" };
  if (speed >= 15) return { speed, label: "Yavaş", color: "text-blue-400", emoji: "🐌" };
  return { speed, label: "Çok Yavaş", color: "text-zinc-500", emoji: "💤" };
}

function getPickLiveStatus(
  pickType: string, homeGoals: number, awayGoals: number, elapsed: number, match?: FixtureResponse
): { icon: string; color: string; label: string } {
  const totalGoals = homeGoals + awayGoals;
  switch (pickType) {
    case "1": return homeGoals > awayGoals ? { icon: "✅", color: "text-green-400", label: "Tutuyor" } : homeGoals === awayGoals ? { icon: "⏳", color: "text-yellow-400", label: "Berabere" } : { icon: "❌", color: "text-red-400", label: "Tehlikede" };
    case "X": return homeGoals === awayGoals ? { icon: "✅", color: "text-green-400", label: "Tutuyor" } : { icon: "❌", color: "text-red-400", label: "Tehlikede" };
    case "2": return awayGoals > homeGoals ? { icon: "✅", color: "text-green-400", label: "Tutuyor" } : awayGoals === homeGoals ? { icon: "⏳", color: "text-yellow-400", label: "Berabere" } : { icon: "❌", color: "text-red-400", label: "Tehlikede" };
    case "Over 2.5": return totalGoals >= 3 ? { icon: "✅", color: "text-green-400", label: "Tuttu" } : { icon: elapsed >= 70 ? "⚠️" : "⏳", color: elapsed >= 70 ? "text-orange-400" : "text-yellow-400", label: elapsed >= 70 ? "Zaman azalıyor" : "Bekleniyor" };
    case "Over 1.5": return totalGoals >= 2 ? { icon: "✅", color: "text-green-400", label: "Tuttu" } : { icon: elapsed >= 70 ? "⚠️" : "⏳", color: elapsed >= 70 ? "text-orange-400" : "text-yellow-400", label: elapsed >= 70 ? "Zaman azalıyor" : "Bekleniyor" };
    case "Under 2.5": return totalGoals >= 3 ? { icon: "❌", color: "text-red-400", label: "Bozuldu" } : { icon: "✅", color: "text-green-400", label: "Tutuyor" };
    case "BTTS Yes": return homeGoals > 0 && awayGoals > 0 ? { icon: "✅", color: "text-green-400", label: "Tuttu" } : homeGoals > 0 || awayGoals > 0 ? { icon: "⏳", color: "text-yellow-400", label: "1 takım attı" } : { icon: "⏳", color: "text-zinc-500", label: "Bekleniyor" };
    case "BTTS No": return homeGoals > 0 && awayGoals > 0 ? { icon: "❌", color: "text-red-400", label: "Bozuldu" } : { icon: "✅", color: "text-green-400", label: "Tutuyor" };
    case "1X": return homeGoals >= awayGoals ? { icon: "✅", color: "text-green-400", label: "Tutuyor" } : { icon: "❌", color: "text-red-400", label: "Tehlikede" };
    case "X2": return awayGoals >= homeGoals ? { icon: "✅", color: "text-green-400", label: "Tutuyor" } : { icon: "❌", color: "text-red-400", label: "Tehlikede" };
    case "12": return homeGoals !== awayGoals ? { icon: "✅", color: "text-green-400", label: "Tutuyor" } : { icon: "⏳", color: "text-yellow-400", label: "Berabere" };
    default: {
      if (pickType.includes("/") && match) {
        const [htPick, ftPick] = pickType.split("/");
        const htH = match.score?.halftime?.home ?? null;
        const htA = match.score?.halftime?.away ?? null;
        if (htH === null || htA === null) return { icon: "⏳", color: "text-yellow-400", label: "İY bekleniyor" };
        const htResult = htH > htA ? "1" : htH === htA ? "X" : "2";
        const ftResult = homeGoals > awayGoals ? "1" : homeGoals === awayGoals ? "X" : "2";
        if (htResult === htPick && ftResult === ftPick) return { icon: "✅", color: "text-green-400", label: "Tutuyor" };
        if (elapsed >= 46 && htResult !== htPick) return { icon: "❌", color: "text-red-400", label: "İY bozuldu" };
        if (elapsed >= 75 && ftResult !== ftPick) return { icon: "❌", color: "text-red-400", label: "MS risk" };
        return { icon: "⏳", color: "text-yellow-400", label: "Devam" };
      }
      return { icon: "—", color: "text-zinc-500", label: "" };
    }
  }
}

// ============================================
// Main Page
// ============================================

export default function LivePage() {
  const [matches, setMatches] = useState<EnrichedLiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, string>>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<"all" | "hot" | "fast" | "goals" | "1h" | "2h">("all");
  const [mounted, setMounted] = useState(false);

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
    setMounted(true);
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

  // Calculate tempos
  const matchTempos = useMemo(() => {
    const map = new Map<number, ReturnType<typeof calculateMatchTempo>>();
    for (const m of matches) {
      map.set(m.fixture.fixture.id, calculateMatchTempo(m));
    }
    return map;
  }, [matches]);

  // Top betting picks
  const topPicks = useMemo(() => {
    const picks: Array<{ match: EnrichedLiveMatch; opportunity: LiveOpportunity; tempo: ReturnType<typeof calculateMatchTempo> }> = [];
    for (const m of matches) {
      if (m.analysis?.opportunities) {
        const tempo = matchTempos.get(m.fixture.fixture.id) || { speed: 0, label: "", color: "", emoji: "" };
        for (const opp of m.analysis.opportunities) {
          if (opp.level === "HOT" || (opp.level === "WARM" && opp.confidence >= 60)) {
            picks.push({ match: m, opportunity: opp, tempo });
          }
        }
      }
    }
    return picks.sort((a, b) => (b.opportunity.valueScore ?? 0) - (a.opportunity.valueScore ?? 0)).slice(0, 6);
  }, [matches, matchTempos]);

  // Filter & sort
  const filteredMatches = useMemo(() => {
    let filtered = [...matches];
    if (filter === "hot") {
      filtered = filtered.filter(m => m.analysis?.opportunities?.some(o => o.level === "HOT" || o.level === "WARM"));
    } else if (filter === "fast") {
      filtered = filtered.filter(m => (matchTempos.get(m.fixture.fixture.id)?.speed ?? 0) >= 50);
    } else if (filter === "goals") {
      filtered = filtered.filter(m => ((m.fixture.goals.home ?? 0) + (m.fixture.goals.away ?? 0)) >= 2);
    } else if (filter === "1h") {
      filtered = filtered.filter(m => {
        const phase = getMatchTimePhase(m);
        return phase === "1h";
      });
    } else if (filter === "2h") {
      filtered = filtered.filter(m => {
        const phase = getMatchTimePhase(m);
        return phase === "2h";
      });
    }
    return filtered.sort((a, b) => {
      const aHot = a.analysis?.opportunities?.filter(o => o.level === "HOT").length || 0;
      const bHot = b.analysis?.opportunities?.filter(o => o.level === "HOT").length || 0;
      if (aHot !== bHot) return bHot - aHot;
      const aSpeed = matchTempos.get(a.fixture.fixture.id)?.speed ?? 0;
      const bSpeed = matchTempos.get(b.fixture.fixture.id)?.speed ?? 0;
      return bSpeed - aSpeed;
    });
  }, [matches, filter, matchTempos]);

  // League groups
  const leagueGroups = useMemo(() => {
    const groups = new Map<string, EnrichedLiveMatch[]>();
    for (const m of filteredMatches) {
      const key = `${m.fixture.league.country} - ${m.fixture.league.name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    const leaguePriority = new Map<number, number>();
    for (const l of LEAGUES) leaguePriority.set(l.id, l.priority);
    return [...groups.entries()].sort(([, a], [, b]) => {
      const prioA = Math.min(...a.map(m => leaguePriority.get(m.fixture.league.id) ?? 99));
      const prioB = Math.min(...b.map(m => leaguePriority.get(m.fixture.league.id) ?? 99));
      return prioA - prioB;
    });
  }, [filteredMatches]);

  // Dashboard stats
  const dashStats = useMemo(() => {
    const totalGoals = matches.reduce((s, m) => s + (m.fixture.goals.home ?? 0) + (m.fixture.goals.away ?? 0), 0);
    const hotCount = matches.reduce((s, m) => s + (m.analysis?.opportunities?.filter(o => o.level === "HOT").length || 0), 0);
    const fastMatches = matches.filter(m => (matchTempos.get(m.fixture.fixture.id)?.speed ?? 0) >= 55).length;
    const avgTemp = matches.length > 0 ? Math.round(matches.reduce((s, m) => s + (m.analysis?.matchTemperature ?? 0), 0) / matches.length) : 0;
    return { totalGoals, hotCount, fastMatches, avgTemp };
  }, [matches, matchTempos]);

  return (
    <div className="space-y-5">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className="h-6 w-6 text-red-500" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Canlı Maçlar</h1>
            <p className="text-[11px] text-zinc-500">
              {matches.length} maç · {mounted ? lastUpdate.toLocaleTimeString("tr-TR") : "--:--:--"} güncellendi
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchLive(); }}
          className="p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/50 transition-all active:scale-95"
        >
          <RefreshCw className={cn("w-4 h-4 text-zinc-400", loading && "animate-spin")} />
        </button>
      </div>

      {/* ===== DASHBOARD STATS ===== */}
      {matches.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-white tabular-nums">{dashStats.totalGoals}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Gol</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={cn("text-2xl font-black tabular-nums", dashStats.hotCount > 0 ? "text-orange-400" : "text-zinc-600")}>{dashStats.hotCount}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">🔥 Fırsat</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={cn("text-2xl font-black tabular-nums", dashStats.fastMatches > 0 ? "text-red-400" : "text-zinc-600")}>{dashStats.fastMatches}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">⚡ Hızlı Maç</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={cn("text-2xl font-black tabular-nums", dashStats.avgTemp >= 55 ? "text-red-400" : dashStats.avgTemp >= 35 ? "text-amber-400" : "text-zinc-400")}>{dashStats.avgTemp}°</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Sıcaklık</p>
          </div>
        </div>
      )}

      {/* ===== TOP PICKS ===== */}
      {topPicks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Şu An Oyna</h2>
            <span className="text-[10px] text-zinc-500">— En değerli canlı fırsatlar</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topPicks.map(({ match, opportunity, tempo }, i) => {
              const badge = getScenarioBadge(opportunity.scenario);
              const isFirst = i === 0;
              return (
                <button
                  key={i}
                  onClick={() => {
                    setExpandedMatch(match.fixture.fixture.id);
                    setTab(match.fixture.fixture.id, "analysis");
                  }}
                  className={cn(
                    "relative overflow-hidden rounded-xl border p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]",
                    isFirst
                      ? "bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent border-amber-500/40 sm:col-span-2 lg:col-span-1"
                      : "bg-gradient-to-br from-zinc-800/80 to-zinc-900 border-zinc-700/50 hover:border-zinc-600"
                  )}
                >
                  {isFirst && <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-500">{match.fixture.fixture.status.elapsed}&apos;</span>
                      <span className="text-xs font-bold text-white tabular-nums">
                        {match.fixture.goals.home}-{match.fixture.goals.away}
                      </span>
                    </div>
                    <span className={cn("text-[10px] font-medium", tempo.color)}>{tempo.emoji} {tempo.label}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 truncate mb-3">
                    {match.fixture.teams.home.name} — {match.fixture.teams.away.name}
                  </p>
                  <div className="flex items-end justify-between">
                    <div className="space-y-1">
                      {(() => {
                        const tpElapsed = match.fixture.fixture.status.elapsed || 0;
                        const tpHome = match.fixture.goals.home ?? 0;
                        const tpAway = match.fixture.goals.away ?? 0;
                        const tpHtH = match.fixture.score.halftime.home;
                        const tpHtA = match.fixture.score.halftime.away;
                        const ctxBet = getContextAwareBetLabel(opportunity.market, tpElapsed, tpHome, tpAway, tpHtH ?? null, tpHtA ?? null);
                        return (
                          <>
                            <span className={cn(
                              "inline-flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg",
                              opportunity.level === "HOT"
                                ? "bg-orange-500/25 text-orange-300 border border-orange-500/30"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/25"
                            )}>
                              {opportunity.level === "HOT" ? "🔥" : "⚡"} {ctxBet.isContextual ? ctxBet.label : opportunity.market}
                            </span>
                            {ctxBet.isContextual && (
                              <div className="text-[9px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1 ml-1 font-medium">⏱ Süreye özel</div>
                            )}
                            {ctxBet.warning && (
                              <div className="text-[9px] text-zinc-500 ml-1">{ctxBet.warning}</div>
                            )}
                          </>
                        );
                      })()}
                      {badge && (
                        <div className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ml-1", badge.color)}>
                          {badge.icon} {badge.label}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "text-2xl font-black",
                        opportunity.confidence >= 70 ? "text-green-400" : opportunity.confidence >= 55 ? "text-amber-400" : "text-zinc-400"
                      )}>
                        %{opportunity.confidence}
                      </span>
                      <p className="text-[9px] text-zinc-600">Değer: {opportunity.valueScore ?? 0}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 line-clamp-1">{opportunity.message}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== FILTERS ===== */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          { key: "all" as const, label: "Tümü", icon: "📺", count: matches.length },
          { key: "1h" as const, label: "İlk Yarı (1-45')", icon: "🥇", count: matches.filter(m => getMatchTimePhase(m) === "1h").length },
          { key: "2h" as const, label: "İkinci Yarı (46-90')", icon: "🥈", count: matches.filter(m => getMatchTimePhase(m) === "2h").length },
          { key: "hot" as const, label: "Fırsatlar", icon: "🔥", count: matches.filter(m => m.analysis?.opportunities?.some(o => o.level === "HOT" || o.level === "WARM")).length },
          { key: "fast" as const, label: "Hızlı Maçlar", icon: "⚡", count: matches.filter(m => (matchTempos.get(m.fixture.fixture.id)?.speed ?? 0) >= 50).length },
          { key: "goals" as const, label: "Gollü", icon: "⚽", count: matches.filter(m => ((m.fixture.goals.home ?? 0) + (m.fixture.goals.away ?? 0)) >= 2).length },
        ]).filter(f => f.count > 0).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap",
              filter === f.key
                ? "bg-white/10 text-white border border-white/20"
                : "bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600"
            )}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
            <span className="text-[10px] bg-zinc-700/60 px-1.5 py-0.5 rounded-full">{f.count}</span>
          </button>
        ))}
      </div>

      {/* ===== MATCH LIST ===== */}
      {loading && matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-600" />
          <p className="text-sm text-zinc-500">Canlı maçlar yükleniyor...</p>
        </div>
      ) : filteredMatches.length > 0 ? (
        <div className="space-y-4">
          {/* Time-phase context banner */}
          {filter === "1h" && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20 rounded-xl px-4 py-3">
              <span className="text-lg">🥇</span>
              <div>
                <p className="text-sm font-bold text-blue-300">İlk Yarı Fırsatları (1-45&apos;)</p>
                <p className="text-[11px] text-zinc-400">İY bahisleri en verimli dönem · İY Üst/Alt, İY Sonucu, İY KG Var</p>
              </div>
            </div>
          )}
          {filter === "2h" && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/20 rounded-xl px-4 py-3">
              <span className="text-lg">🥈</span>
              <div>
                <p className="text-sm font-bold text-purple-300">İkinci Yarı Fırsatları (46-90&apos;)</p>
                <p className="text-[11px] text-zinc-400">2Y bahisleri · Geç gol, 2Y Üst/Alt, Son dakika fırsatları</p>
              </div>
            </div>
          )}
          {leagueGroups.map(([league, leagueMatches]) => (
            <div key={league} className="space-y-2">
              {/* League Header */}
              <div className="flex items-center gap-2 px-1">
                {leagueMatches[0].fixture.league.flag && (
                  <Image src={leagueMatches[0].fixture.league.flag} alt="" width={16} height={12} className="rounded-sm" />
                )}
                <span className="text-[11px] font-semibold text-zinc-400">{league}</span>
                <div className="flex-1 h-px bg-zinc-800/50" />
              </div>

              {/* Match Cards */}
              {leagueMatches.map((match) => {
                const fid = match.fixture.fixture.id;
                const isExpanded = expandedMatch === fid;
                const elapsed = match.fixture.fixture.status.elapsed;
                const statusShort = match.fixture.fixture.status.short;
                const homeGoals = match.fixture.goals.home ?? 0;
                const awayGoals = match.fixture.goals.away ?? 0;
                const totalGoals = homeGoals + awayGoals;
                const htHome = match.fixture.score.halftime.home;
                const htAway = match.fixture.score.halftime.away;
                const analysis = match.analysis;
                const hasHotOpp = analysis?.opportunities?.some(o => o.level === "HOT");
                const bestOpp = analysis?.opportunities?.[0];
                const bestPick = match.prediction?.picks?.[0];
                const tempo = matchTempos.get(fid) || { speed: 0, label: "", color: "", emoji: "" };
                const scenario = analysis?.enrichedMomentum?.scenarioType;
                const scenBadge = getScenarioBadge(scenario);

                return (
                  <div key={fid} className={cn(
                    "rounded-xl border overflow-hidden transition-all",
                    hasHotOpp
                      ? "border-orange-500/30 bg-gradient-to-r from-orange-500/[0.04] to-transparent"
                      : tempo.speed >= 60
                      ? "border-red-500/20 bg-gradient-to-r from-red-500/[0.03] to-transparent"
                      : "border-zinc-800 bg-zinc-900"
                  )}>
                    {/* Main Row */}
                    <button
                      onClick={() => toggleExpand(fid)}
                      className="w-full p-3 sm:p-4 text-left"
                    >
                      {/* Top: Time + Tempo + Scenario */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {statusShort === "HT" ? (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">DEVRE ARASI</span>
                          ) : statusShort === "FT" || statusShort === "AET" || statusShort === "PEN" ? (
                            <span className="text-[10px] font-bold text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">BİTTİ</span>
                          ) : elapsed ? (
                            <div className="flex items-center gap-1.5 bg-red-500/10 px-2.5 py-0.5 rounded-full">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                              </span>
                              <span className="text-[11px] font-bold text-red-400 tabular-nums">{elapsed}&apos;</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full" suppressHydrationWarning>
                              {mounted ? new Date(match.fixture.fixture.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                            </span>
                          )}
                          {htHome != null && htAway != null && (
                            <span className="text-[10px] text-zinc-600 tabular-nums">İY: {htHome}-{htAway}</span>
                          )}
                          {scenBadge && (
                            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", scenBadge.color)}>
                              {scenBadge.icon} {scenBadge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("text-[10px] font-bold", tempo.color)}>
                              {tempo.emoji} {tempo.label}
                            </span>
                            <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-700",
                                  tempo.speed >= 75 ? "bg-red-500" : tempo.speed >= 55 ? "bg-orange-500" : tempo.speed >= 35 ? "bg-amber-500" : "bg-zinc-600"
                                )}
                                style={{ width: `${tempo.speed}%` }}
                              />
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
                        </div>
                      </div>

                      {/* Middle: Teams + Score */}
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {match.fixture.teams.home.logo && (
                            <Image src={match.fixture.teams.home.logo} alt="" width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
                          )}
                          <span className={cn("text-sm font-medium truncate", homeGoals > awayGoals ? "text-white font-bold" : "text-zinc-300")}>
                            {match.fixture.teams.home.name}
                          </span>
                          {analysis?.nextGoalTeam === "home" && (
                            <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">GOL GELİYOR</span>
                          )}
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0",
                          totalGoals >= 4 ? "bg-green-500/10 border border-green-500/20" :
                          totalGoals >= 2 ? "bg-zinc-800 border border-zinc-700" :
                          "bg-zinc-800/60"
                        )}>
                          {elapsed || statusShort === "HT" || statusShort === "FT" ? (
                            <>
                              <span className={cn("text-lg font-black tabular-nums", homeGoals > awayGoals ? "text-white" : "text-zinc-400")}>
                                {homeGoals}
                              </span>
                              <span className="text-zinc-600">:</span>
                              <span className={cn("text-lg font-black tabular-nums", awayGoals > homeGoals ? "text-white" : "text-zinc-400")}>
                                {awayGoals}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-zinc-600 font-bold">vs</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                          {analysis?.nextGoalTeam === "away" && (
                            <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">GOL GELİYOR</span>
                          )}
                          <span className={cn("text-sm font-medium truncate text-right", awayGoals > homeGoals ? "text-white font-bold" : "text-zinc-300")}>
                            {match.fixture.teams.away.name}
                          </span>
                          {match.fixture.teams.away.logo && (
                            <Image src={match.fixture.teams.away.logo} alt="" width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Bottom: Bet recommendation + Stats */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {bestOpp ? (() => {
                          const ctxBet = getContextAwareBetLabel(bestOpp.market, elapsed || 0, homeGoals, awayGoals, htHome ?? null, htAway ?? null);
                          return (
                            <div className="flex items-center gap-1.5">
                              <div className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border",
                                bestOpp.level === "HOT"
                                  ? "bg-orange-500/15 text-orange-300 border-orange-500/25"
                                  : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              )}>
                                {bestOpp.level === "HOT" ? "🔥" : "⚡"} {ctxBet.isContextual ? ctxBet.label : bestOpp.market}
                                <span className="text-white/60 font-normal">%{bestOpp.confidence}</span>
                              </div>
                              {ctxBet.warning && (
                                <span className="text-[9px] text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded-full">{ctxBet.warning}</span>
                              )}
                              {ctxBet.isContextual && (
                                <span className="text-[9px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-full font-medium">⏱ Süreye özel</span>
                              )}
                            </div>
                          );
                        })() : bestPick ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[11px] font-bold">
                            📊 {bestPick.type}
                            <span className="text-white/60 font-normal">%{bestPick.confidence}</span>
                            <span className="text-yellow-500/70 font-normal">{bestPick.odds.toFixed(2)}</span>
                            {bestPick.isValueBet && <span className="text-[8px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded">VAL</span>}
                          </div>
                        ) : null}

                        {match.prediction?.picks?.slice(1, 4).map((pick, i) => {
                          const status = getPickLiveStatus(pick.type, homeGoals, awayGoals, elapsed || 0, match.fixture);
                          return (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-zinc-800/60 text-zinc-400 px-2 py-1 rounded-lg border border-zinc-700/30">
                              <span className="font-semibold text-zinc-300">{pick.type}</span>
                              <span className="text-zinc-600">%{pick.confidence}</span>
                              <span className={cn("text-[9px]", status.color)}>{status.icon}</span>
                            </span>
                          );
                        })}

                        {analysis && analysis.danger.goalProbability >= 50 && (
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-lg",
                            analysis.danger.goalProbability >= 70
                              ? "bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse"
                              : "bg-orange-500/10 text-orange-400 border border-orange-500/15"
                          )}>
                            ⚽ Gol %{analysis.danger.goalProbability}
                          </span>
                        )}

                        {analysis?.winProbability && elapsed && (
                          <div className="flex items-center gap-1 text-[9px] bg-zinc-800/40 px-1.5 py-1 rounded-lg">
                            <span className="text-blue-400 font-bold">{analysis.winProbability.home.toFixed(0)}%</span>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-400 font-bold">{analysis.winProbability.draw.toFixed(0)}%</span>
                            <span className="text-zinc-600">·</span>
                            <span className="text-red-400 font-bold">{analysis.winProbability.away.toFixed(0)}%</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* ===== EXPANDED ===== */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800">
                        {analysis && <LiveAnalysisPanel analysis={analysis} match={match} tempo={tempo} />}
                        <div className="flex border-b border-zinc-800 bg-zinc-900/50">
                          {[
                            { key: "analysis", icon: Flame, label: "Fırsatlar" },
                            { key: "stats", icon: BarChart3, label: "İstatistik" },
                            { key: "events", icon: Activity, label: "Olaylar" },
                            { key: "lineups", icon: Users, label: "Kadro" },
                            { key: "predictions", icon: Target, label: "Tahminler" },
                          ].map(({ key, icon: Icon, label }) => (
                            <button
                              key={key}
                              onClick={(e) => { e.stopPropagation(); setTab(fid, key); }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
                                getTab(fid) === key ? "text-white border-b-2 border-indigo-500 bg-indigo-500/5" : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {label}
                            </button>
                          ))}
                        </div>
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
          <Radio className="mx-auto h-12 w-12 text-zinc-700 mb-4" />
          <p className="text-sm text-zinc-400 mb-1">
            {filter !== "all"
              ? "Bu filtreye uygun maç bulunamadı."
              : "Şu anda canlı maç bulunmuyor."}
          </p>
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-3 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs hover:bg-zinc-700 transition-colors"
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
// Live Analysis Panel
// ============================================

function LiveAnalysisPanel({ analysis, match, tempo }: { analysis: LiveMatchAnalysis; match: EnrichedLiveMatch; tempo: ReturnType<typeof calculateMatchTempo> }) {
  const { momentum, danger, matchTemperature, nextGoalTeam, enrichedMomentum, winProbability, projectedScore, matchPhase } = analysis;
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
      {/* Win Probability */}
      {winProbability && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {matchPhase && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-700/50", phaseColor)}>{phaseLabel}</span>}
              {projectedScore && (
                <span className="text-[10px] text-zinc-400">
                  Tahmini: <span className="font-bold text-white">{projectedScore.home.toFixed(1)}-{projectedScore.away.toFixed(1)}</span>
                </span>
              )}
            </div>
            <span className={cn("text-xs font-bold flex items-center gap-1",
              nextGoalTeam === "unlikely" ? "text-zinc-500" : "text-green-400"
            )}>
              <Crosshair className="w-3 h-3" />
              Sıradaki gol → {nextGoalLabel}
            </span>
          </div>
          <div className="flex h-8 rounded-xl overflow-hidden bg-zinc-700/30 text-[10px] font-bold">
            <div
              className="bg-blue-500/80 flex items-center justify-center transition-all duration-700"
              style={{ width: `${winProbability.home}%`, minWidth: winProbability.home > 5 ? "36px" : "0" }}
            >
              {winProbability.home >= 8 && <span className="text-white">{winProbability.home.toFixed(0)}%</span>}
            </div>
            <div
              className="bg-zinc-500/60 flex items-center justify-center transition-all duration-700"
              style={{ width: `${winProbability.draw}%`, minWidth: winProbability.draw > 5 ? "36px" : "0" }}
            >
              {winProbability.draw >= 8 && <span className="text-white">{winProbability.draw.toFixed(0)}%</span>}
            </div>
            <div
              className="bg-red-500/80 flex items-center justify-center transition-all duration-700"
              style={{ width: `${winProbability.away}%`, minWidth: winProbability.away > 5 ? "36px" : "0" }}
            >
              {winProbability.away >= 8 && <span className="text-white">{winProbability.away.toFixed(0)}%</span>}
            </div>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-blue-400">{homeName}</span>
            <span className="text-zinc-600">Beraberlik</span>
            <span className="text-red-400">{awayName}</span>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-zinc-800/50 rounded-xl p-2.5 text-center border border-zinc-700/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Gauge className="w-3 h-3 text-zinc-500" />
            <span className="text-[9px] text-zinc-500 font-medium">TEMPO</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className={cn("text-lg font-black", tempo.color)}>{tempo.speed}</span>
            <span className="text-[9px] text-zinc-600">/100</span>
          </div>
          <div className="w-full h-1 bg-zinc-700 rounded-full mt-1.5 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all",
              tempo.speed >= 75 ? "bg-red-500" : tempo.speed >= 55 ? "bg-orange-500" : tempo.speed >= 35 ? "bg-amber-500" : "bg-zinc-500"
            )} style={{ width: `${tempo.speed}%` }} />
          </div>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-2.5 text-center border border-zinc-700/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="w-3 h-3 text-zinc-500" />
            <span className="text-[9px] text-zinc-500 font-medium">SICAKLIK</span>
          </div>
          <span className={cn("text-lg font-black",
            matchTemperature >= 70 ? "text-red-400" : matchTemperature >= 50 ? "text-amber-400" : "text-zinc-400"
          )}>{matchTemperature}°</span>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-2.5 text-center border border-zinc-700/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3 text-zinc-500" />
            <span className="text-[9px] text-zinc-500 font-medium">GOL İHTİMALİ</span>
          </div>
          <span className={cn("text-lg font-black",
            danger.goalProbability >= 70 ? "text-red-400 animate-pulse" : danger.goalProbability >= 50 ? "text-orange-400" : "text-zinc-400"
          )}>%{danger.goalProbability}</span>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-2.5 text-center border border-zinc-700/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-zinc-500" />
            <span className="text-[9px] text-zinc-500 font-medium">MOMENTUM</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-blue-400 font-bold text-sm">{momentum.homeScore.toFixed(0)}</span>
            <span className="text-zinc-600 text-xs">-</span>
            <span className="text-red-400 font-bold text-sm">{momentum.awayScore.toFixed(0)}</span>
            {momentum.trend === "increasing" && <ArrowUp className="w-3 h-3 text-green-400" />}
            {momentum.trend === "decreasing" && <ArrowDown className="w-3 h-3 text-red-400" />}
            {momentum.trend === "stable" && <Minus className="w-3 h-3 text-zinc-500" />}
          </div>
        </div>
      </div>

      {/* xG */}
      {enrichedMomentum && (
        <div className="flex items-center justify-center gap-4 bg-zinc-800/30 rounded-lg px-3 py-2">
          <span className="text-[10px] text-zinc-500">xG</span>
          <span className="text-sm font-bold text-blue-400">{enrichedMomentum.liveXg.home.toFixed(2)}</span>
          <span className="text-zinc-600">-</span>
          <span className="text-sm font-bold text-red-400">{enrichedMomentum.liveXg.away.toFixed(2)}</span>
          {enrichedMomentum.xgDelta > 0.5 && (
            <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
              xG üstü +{enrichedMomentum.xgDelta.toFixed(1)}
            </span>
          )}
        </div>
      )}

      {/* Event Timeline */}
      {match.events && match.events.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-zinc-600 font-medium">MAÇIN AKIŞI</span>
          <div className="relative h-8 bg-zinc-800/40 rounded-xl overflow-hidden border border-zinc-700/30">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600/40 z-10" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-700/30" />
            {match.events.filter(e => e.type === "Goal" || (e.type === "Card" && e.detail === "Red Card")).map((event, i) => {
              const minute = event.time.elapsed || 0;
              const leftPct = Math.min(Math.max((minute / 95) * 100, 2), 98);
              const isGoal = event.type === "Goal";
              const isHome = event.team.id === match.fixture.teams.home.id;
              return (
                <div
                  key={i}
                  className="absolute z-20"
                  style={{ left: `${leftPct}%`, top: isHome ? "2px" : "18px" }}
                  title={`${minute}' ${event.player?.name || ""}`}
                >
                  {isGoal ? (
                    <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px] shadow-lg",
                      isHome ? "bg-blue-500 text-white" : "bg-red-500 text-white"
                    )}>⚽</div>
                  ) : (
                    <div className="w-3 h-3 rounded-sm bg-red-500 shadow-lg" />
                  )}
                </div>
              );
            })}
            <div className="absolute bottom-0.5 left-2 text-[7px] text-zinc-600">0&apos;</div>
            <div className="absolute bottom-0.5 left-[calc(50%-4px)] text-[7px] text-zinc-600">45&apos;</div>
            <div className="absolute bottom-0.5 right-2 text-[7px] text-zinc-600">90&apos;</div>
          </div>
        </div>
      )}

      {/* Smart Insights */}
      {analysis.smartInsights && analysis.smartInsights.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] text-zinc-600 font-medium flex items-center gap-1">
            <Crosshair className="w-3 h-3" /> İSTATİSTİK SİNYALLERİ
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {analysis.smartInsights.map((insight, i) => {
              const biasColors: Record<string, string> = {
                over: "border-green-500/20 bg-green-500/5",
                under: "border-blue-500/20 bg-blue-500/5",
                home: "border-blue-400/20 bg-blue-400/5",
                away: "border-red-400/20 bg-red-400/5",
                btts: "border-amber-500/20 bg-amber-500/5",
                draw: "border-zinc-400/20 bg-zinc-400/5",
                neutral: "border-zinc-600/20 bg-zinc-700/5",
              };
              const biasLabels: Record<string, string> = {
                over: "OVER", under: "UNDER", home: "EV", away: "DEP", btts: "KG", draw: "X", neutral: "—",
              };
              const biasLabelColors: Record<string, string> = {
                over: "text-green-400", under: "text-blue-400", home: "text-blue-400",
                away: "text-red-400", btts: "text-amber-400", draw: "text-zinc-400", neutral: "text-zinc-500",
              };
              const strengthDots = Array.from({ length: 5 }, (_, j) => j < insight.strength);

              return (
                <div key={i} className={cn("rounded-lg border px-3 py-2", biasColors[insight.bias] || biasColors.neutral)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{insight.icon}</span>
                        <span className="text-[11px] font-medium text-zinc-200">{insight.text}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{insight.bettingAngle}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800/60", biasLabelColors[insight.bias])}>
                        {biasLabels[insight.bias] || "—"}
                      </span>
                      <div className="flex gap-0.5">
                        {strengthDots.map((active, j) => (
                          <div key={j} className={cn("w-1.5 h-1.5 rounded-full",
                            active ? insight.strength >= 4 ? "bg-green-400" : insight.strength >= 3 ? "bg-amber-400" : "bg-zinc-400" : "bg-zinc-700"
                          )} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Opportunities Panel
// ============================================

function OpportunitiesPanel({ analysis, match }: { analysis: LiveMatchAnalysis | null; match?: EnrichedLiveMatch }) {
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
    <div className="space-y-3">
      {analysis.enrichedMomentum && analysis.enrichedMomentum.scenarioType !== "NORMAL" && (() => {
        const badge = getScenarioBadge(analysis.enrichedMomentum!.scenarioType);
        if (!badge) return null;
        return (
          <div className={cn("rounded-xl border px-4 py-3 flex items-center gap-3", badge.color)}>
            <span className="text-2xl">{badge.icon}</span>
            <div>
              <span className="text-sm font-bold">{badge.label}</span>
              <p className="text-[11px] text-zinc-400 mt-0.5">{analysis.enrichedMomentum!.scenarioMessage}</p>
            </div>
          </div>
        );
      })()}

      <div className="space-y-2">
        {analysis.opportunities.map((opp, i) => {
          const oppElapsed = match?.fixture.fixture.status.elapsed || 0;
          const oppHomeGoals = match?.fixture.goals.home ?? 0;
          const oppAwayGoals = match?.fixture.goals.away ?? 0;
          const oppHtH = match?.fixture.score.halftime.home ?? null;
          const oppHtA = match?.fixture.score.halftime.away ?? null;
          const ctxBet = getContextAwareBetLabel(opp.market, oppElapsed, oppHomeGoals, oppAwayGoals, oppHtH, oppHtA);
          return (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-4 space-y-2",
              opp.level === "HOT"
                ? "bg-gradient-to-r from-orange-500/10 via-red-500/5 to-transparent border-orange-500/25"
                : opp.level === "WARM"
                ? "bg-gradient-to-r from-amber-500/5 to-transparent border-amber-500/20"
                : "bg-zinc-800/30 border-zinc-700/50"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-sm font-black px-3 py-1.5 rounded-lg",
                  opp.level === "HOT" ? "bg-orange-500/25 text-orange-300 border border-orange-500/30" : "bg-zinc-700/50 text-zinc-200"
                )}>
                  {opp.level === "HOT" ? "🔥 " : "⚡ "}{ctxBet.isContextual ? ctxBet.label : opp.market}
                </span>
                {ctxBet.isContextual && (
                  <span className="text-[9px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-full font-medium">⏱ Süreye özel</span>
                )}
                {ctxBet.warning && (
                  <span className="text-[9px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded-full">{ctxBet.warning}</span>
                )}
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {opp.timeWindow}
                </span>
                {opp.scenario && (() => {
                  const badge = getScenarioBadge(opp.scenario);
                  return badge ? <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", badge.color)}>{badge.icon} {badge.label}</span> : null;
                })()}
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-xl font-black",
                  opp.confidence >= 70 ? "text-green-400" : opp.confidence >= 50 ? "text-amber-400" : "text-zinc-400"
                )}>
                  %{opp.confidence}
                </span>
                <p className="text-[9px] text-zinc-600">Değer: {opp.valueScore ?? 0}/100</p>
              </div>
            </div>
            <p className="text-sm text-white font-medium">{opp.message}</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">{opp.reasoning}</p>
          </div>
          );
        })}
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
              <span className={cn("font-medium tabular-nums", homeNum > awayNum ? "text-white" : "text-zinc-500")}>{String(homeVal)}</span>
              <span className="text-zinc-500 text-[10px]">{label}</span>
              <span className={cn("font-medium tabular-nums", awayNum > homeNum ? "text-white" : "text-zinc-500")}>{String(awayVal)}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 gap-0.5">
              <div className={cn("transition-all duration-500 rounded-l-full", homeNum >= awayNum ? "bg-blue-500" : "bg-blue-500/40")} style={{ width: `${homePct}%` }} />
              <div className={cn("transition-all duration-500 rounded-r-full", awayNum >= homeNum ? "bg-red-500" : "bg-red-500/40")} style={{ width: `${awayPct}%` }} />
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
            "flex items-center gap-3 py-2.5 px-3 rounded-lg",
            event.type === "Goal" ? "bg-green-500/5 border border-green-500/10" : event.type === "Card" && event.detail === "Red Card" ? "bg-red-500/5 border border-red-500/10" : "hover:bg-zinc-800/50"
          )}
        >
          <span className="text-xs text-zinc-500 min-w-[36px] text-right font-mono tabular-nums">
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
          <div className="flex items-center gap-2">
            {lineup.team.logo && <Image src={lineup.team.logo} alt="" width={20} height={20} className="w-5 h-5 object-contain" />}
            <span className="text-xs font-semibold text-white">{lineup.team.name}</span>
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{lineup.formation}</span>
          </div>
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {lineup.coach.name}
          </div>
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

  return (
    <div className="space-y-4">
      {prediction.analysisSummary && (
        <div className="bg-zinc-800/30 rounded-xl p-3 border border-zinc-700/30">
          <p className="text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3" /> Analiz Özeti
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed">{prediction.analysisSummary}</p>
        </div>
      )}

      <div className="space-y-2">
        {prediction.picks.map((pick, i) => {
          const status = getPickLiveStatus(pick.type, homeGoals, awayGoals, elapsed, match);
          return (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl border",
                i === 0 ? "bg-indigo-500/5 border-indigo-500/20" : "bg-zinc-800/20 border-zinc-800"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("text-sm font-bold px-3 py-1.5 rounded-lg", i === 0 ? "bg-indigo-500/20 text-indigo-400" : "bg-zinc-800 text-zinc-300")}>
                  {pick.type}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">%{pick.confidence}</span>
                    <span className="text-xs text-yellow-400">{pick.odds.toFixed(2)}</span>
                    {pick.isValueBet && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">VALUE</span>}
                  </div>
                  {pick.reasoning && <p className="text-[10px] text-zinc-600 mt-0.5 max-w-[300px] truncate">{pick.reasoning}</p>}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-sm", status.color)}>{status.icon}</span>
                  <span className={cn("text-xs font-medium", status.color)}>{status.label}</span>
                </div>
                {pick.expectedValue > 0 && <p className="text-[10px] text-zinc-600 mt-0.5">EV: {pick.expectedValue.toFixed(2)}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 py-2 text-zinc-500 bg-zinc-800/20 rounded-lg">
        <span className="text-xs">Skor: {homeGoals} - {awayGoals} ({elapsed}&apos;)</span>
        <span className="text-xs">Toplam Gol: {totalGoals}</span>
      </div>
    </div>
  );
}
