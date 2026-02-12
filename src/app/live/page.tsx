"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import type {
  FixtureResponse,
  FixtureStatisticsResponse,
  FixtureEvent,
  LineupResponse,
} from "@/types/api-football";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ---- Types ----

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

  const getTab = (fixtureId: number) => activeTab[fixtureId] || "stats";
  const setTab = (fixtureId: number, tab: string) => {
    setActiveTab((prev) => ({ ...prev, [fixtureId]: tab }));
  };

  // Liga bazlı grupla
  const leagueGroups = new Map<string, EnrichedLiveMatch[]>();
  for (const m of matches) {
    const key = `${m.fixture.league.country} - ${m.fixture.league.name}`;
    if (!leagueGroups.has(key)) leagueGroups.set(key, []);
    leagueGroups.get(key)!.push(m);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="h-6 w-6 text-red-500 animate-pulse" />
            Canlı Maçlar
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            İstatistikler · Olaylar · Kadro · Tahmin Takibi — 30 sn&apos;de bir güncellenir
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500">
            Son: {lastUpdate.toLocaleTimeString("tr-TR")}
          </span>
          <button
            onClick={() => {
              setLoading(true);
              fetchLive();
            }}
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

      {loading && matches.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : matches.length > 0 ? (
        <div className="space-y-6">
          {Array.from(leagueGroups.entries()).map(([league, leagueMatches]) => (
            <div key={league} className="space-y-2">
              {/* League Header */}
              <div className="flex items-center gap-2 px-1">
                {leagueMatches[0].fixture.league.flag && (
                  <Image
                    src={leagueMatches[0].fixture.league.flag}
                    alt=""
                    width={16}
                    height={12}
                    className="rounded-sm"
                  />
                )}
                <span className="text-xs font-medium text-zinc-400">{league}</span>
              </div>

              {/* Matches */}
              {leagueMatches.map((match) => {
                const fid = match.fixture.fixture.id;
                const isExpanded = expandedMatch === fid;
                const elapsed = match.fixture.fixture.status.elapsed;
                const statusShort = match.fixture.fixture.status.short;
                const homeGoals = match.fixture.goals.home ?? 0;
                const awayGoals = match.fixture.goals.away ?? 0;

                return (
                  <div
                    key={fid}
                    className={cn(
                      "bg-zinc-900 border rounded-xl overflow-hidden transition-all",
                      isExpanded ? "border-zinc-600" : "border-zinc-800 hover:border-zinc-700"
                    )}
                  >
                    {/* Match Row */}
                    <button onClick={() => toggleExpand(fid)} className="w-full p-4 flex items-center gap-4 text-left">
                      {/* Live Badge */}
                      <div className="flex flex-col items-center min-w-[48px]">
                        <div className="flex items-center gap-1">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                          </span>
                          <span className="text-[10px] font-bold text-red-400">
                            {statusShort === "HT" ? "DV" : `${elapsed}'`}
                          </span>
                        </div>
                      </div>

                      {/* Teams + Score */}
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            {match.fixture.teams.home.logo && (
                              <Image src={match.fixture.teams.home.logo} alt="" width={20} height={20} className="w-5 h-5 object-contain" />
                            )}
                            <span className={cn("text-sm font-medium", homeGoals > awayGoals ? "text-white" : "text-zinc-400")}>
                              {match.fixture.teams.home.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {match.fixture.teams.away.logo && (
                              <Image src={match.fixture.teams.away.logo} alt="" width={20} height={20} className="w-5 h-5 object-contain" />
                            )}
                            <span className={cn("text-sm font-medium", awayGoals > homeGoals ? "text-white" : "text-zinc-400")}>
                              {match.fixture.teams.away.name}
                            </span>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="flex flex-col items-center mx-4">
                          <span className={cn("text-xl font-bold", homeGoals > awayGoals ? "text-white" : "text-zinc-400")}>{homeGoals}</span>
                          <span className={cn("text-xl font-bold", awayGoals > homeGoals ? "text-white" : "text-zinc-400")}>{awayGoals}</span>
                        </div>
                      </div>

                      {/* Prediction Badge */}
                      {match.prediction?.picks?.[0] && (
                        <div className="flex flex-col items-end gap-1 min-w-[80px]">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">
                            {match.prediction.picks[0].type}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            %{match.prediction.picks[0].confidence} · {match.prediction.picks[0].odds.toFixed(2)}
                          </span>
                        </div>
                      )}

                      {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                    </button>

                    {/* Insights Preview */}
                    {match.liveInsights.length > 0 && !isExpanded && (
                      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                        {match.liveInsights.slice(0, 3).map((insight, i) => (
                          <span key={i} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                            {insight}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800">
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
                            { key: "stats", icon: BarChart3, label: "İstatistik" },
                            { key: "events", icon: Activity, label: "Olaylar" },
                            { key: "lineups", icon: Users, label: "Kadro" },
                            { key: "predictions", icon: Target, label: "Tahminler" },
                          ].map(({ key, icon: Icon, label }) => (
                            <button
                              key={key}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTab(fid, key);
                              }}
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
          <h3 className="font-semibold text-lg text-white mb-2">Canlı Maç Yok</h3>
          <p className="text-sm text-zinc-400">Şu anda oynanan maç bulunmuyor.</p>
        </div>
      )}
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
      default:
        return { status: "—", color: "text-zinc-500" };
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
