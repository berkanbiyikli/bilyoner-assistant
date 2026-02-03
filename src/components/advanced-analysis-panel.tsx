'use client';

/**
 * Advanced Analysis Panel
 * Monte Carlo, Cluster Analysis ve Brier Score sonuçlarını gösterir
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Target, 
  Swords, 
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Dice1,
  Shield,
  Zap
} from 'lucide-react';
import {
  createTeamProfile,
  analyzeStyleMatchup,
  runMonteCarloSimulation,
  createSimStats,
  interpretSimulation,
  getConfidenceEmoji,
  STYLE_DESCRIPTIONS,
  type TeamProfile,
  type SimulationResult
} from '@/lib/analysis';

interface AdvancedAnalysisPanelProps {
  homeTeam: {
    id: number;
    name: string;
    goalsScored?: number;
    goalsConceded?: number;
    matchesPlayed?: number;
  };
  awayTeam: {
    id: number;
    name: string;
    goalsScored?: number;
    goalsConceded?: number;
    matchesPlayed?: number;
  };
}

// Stil renkleri
const STYLE_COLORS = {
  OFFENSIVE: 'bg-red-500/20 border-red-500/50 text-red-400',
  COUNTER: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
  DEFENSIVE: 'bg-green-500/20 border-green-500/50 text-green-400',
  CHAOTIC: 'bg-orange-500/20 border-orange-500/50 text-orange-400'
};

const STYLE_ICONS = {
  OFFENSIVE: Swords,
  COUNTER: Target,
  DEFENSIVE: Shield,
  CHAOTIC: Dice1
};

export function AdvancedAnalysisPanel({ homeTeam, awayTeam }: AdvancedAnalysisPanelProps) {
  // Analizi hesapla
  const analysis = useMemo(() => {
    // Varsayılan değerler yoksa hesaplama yapma
    if (!homeTeam.goalsScored || !awayTeam.goalsScored) {
      return null;
    }

    // Takım profilleri
    const homeProfile = createTeamProfile(homeTeam.id, homeTeam.name, {
      goalsScored: homeTeam.goalsScored,
      goalsConceded: homeTeam.goalsConceded || 0,
      matchesPlayed: homeTeam.matchesPlayed || 10
    });

    const awayProfile = createTeamProfile(awayTeam.id, awayTeam.name, {
      goalsScored: awayTeam.goalsScored,
      goalsConceded: awayTeam.goalsConceded || 0,
      matchesPlayed: awayTeam.matchesPlayed || 10
    });

    // Stil eşleşmesi
    const styleMatchup = analyzeStyleMatchup(homeProfile, awayProfile);

    // Monte Carlo simülasyonu
    const homeSimStats = createSimStats(
      homeTeam.goalsScored,
      homeTeam.goalsConceded || 0,
      homeTeam.matchesPlayed || 10,
      { isHome: true }
    );

    const awaySimStats = createSimStats(
      awayTeam.goalsScored,
      awayTeam.goalsConceded || 0,
      awayTeam.matchesPlayed || 10,
      { isHome: false }
    );

    const simulation = runMonteCarloSimulation(homeSimStats, awaySimStats, {
      iterations: 10000
    });

    const insights = interpretSimulation(simulation);

    return {
      homeProfile,
      awayProfile,
      styleMatchup,
      simulation,
      insights
    };
  }, [homeTeam, awayTeam]);

  if (!analysis) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6 text-center text-zinc-400">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Gelişmiş analiz için yeterli veri yok</p>
        </CardContent>
      </Card>
    );
  }

  const { homeProfile, awayProfile, styleMatchup, simulation, insights } = analysis;
  const HomeStyleIcon = STYLE_ICONS[homeProfile.style];
  const AwayStyleIcon = STYLE_ICONS[awayProfile.style];

  return (
    <div className="space-y-4">
      {/* Stil Eşleşmesi */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Swords className="h-5 w-5 text-purple-500" />
            Stil Eşleşmesi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Takım Stilleri */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-3 rounded-lg border ${STYLE_COLORS[homeProfile.style]}`}>
              <div className="flex items-center gap-2 mb-2">
                <HomeStyleIcon className="h-5 w-5" />
                <span className="font-medium">{homeTeam.name}</span>
              </div>
              <div className="text-lg font-bold">
                {STYLE_DESCRIPTIONS[homeProfile.style].emoji} {STYLE_DESCRIPTIONS[homeProfile.style].name}
              </div>
              <p className="text-xs opacity-75 mt-1">
                {STYLE_DESCRIPTIONS[homeProfile.style].description}
              </p>
              <Badge variant="outline" className="mt-2 text-xs">
                Güven: {(homeProfile.confidence * 100).toFixed(0)}%
              </Badge>
            </div>

            <div className={`p-3 rounded-lg border ${STYLE_COLORS[awayProfile.style]}`}>
              <div className="flex items-center gap-2 mb-2">
                <AwayStyleIcon className="h-5 w-5" />
                <span className="font-medium">{awayTeam.name}</span>
              </div>
              <div className="text-lg font-bold">
                {STYLE_DESCRIPTIONS[awayProfile.style].emoji} {STYLE_DESCRIPTIONS[awayProfile.style].name}
              </div>
              <p className="text-xs opacity-75 mt-1">
                {STYLE_DESCRIPTIONS[awayProfile.style].description}
              </p>
              <Badge variant="outline" className="mt-2 text-xs">
                Güven: {(awayProfile.confidence * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Eşleşme Analizi */}
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <p className="text-sm text-purple-300 mb-2">
              💡 {styleMatchup.reasoning}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {styleMatchup.prediction.bttsBoost > 0 && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  KG Var +{(styleMatchup.prediction.bttsBoost * 100).toFixed(0)}%
                </Badge>
              )}
              {styleMatchup.prediction.overBoost > 0 && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  Üst +{(styleMatchup.prediction.overBoost * 100).toFixed(0)}%
                </Badge>
              )}
              {styleMatchup.prediction.homeWinBoost > 0.05 && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  Ev +{(styleMatchup.prediction.homeWinBoost * 100).toFixed(0)}%
                </Badge>
              )}
              {styleMatchup.prediction.awayWinBoost > 0.05 && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  Dep +{(styleMatchup.prediction.awayWinBoost * 100).toFixed(0)}%
                </Badge>
              )}
              <Badge 
                className={
                  styleMatchup.prediction.chaosLevel >= 0.7 
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : styleMatchup.prediction.chaosLevel >= 0.4
                    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    : 'bg-green-500/20 text-green-400 border-green-500/30'
                }
              >
                Kaos: {(styleMatchup.prediction.chaosLevel * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monte Carlo Simülasyonu */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Monte Carlo Simülasyonu
            <Badge variant="outline" className="ml-auto text-xs">
              {simulation.totalSimulations.toLocaleString()} simülasyon
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Güven Seviyesi */}
          <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
            <span className="text-2xl">{getConfidenceEmoji(simulation.confidenceLevel)}</span>
            <div className="flex-1">
              <p className="font-medium">
                {simulation.confidenceLevel === 'high' && '✅ Yüksek Güven'}
                {simulation.confidenceLevel === 'medium' && '⚡ Orta Güven'}
                {simulation.confidenceLevel === 'low' && '⚠️ Düşük Güven'}
                {simulation.confidenceLevel === 'avoid' && '🚫 Uzak Dur!'}
              </p>
              <p className="text-xs text-zinc-400">
                Standart Sapma: σ = {simulation.stdDeviation} | Kaos: {(simulation.chaosIndex * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Maç Sonucu Olasılıkları */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-2xl font-bold text-green-400">
                {(simulation.homeWinProbability * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-zinc-400">{homeTeam.name}</p>
              <Progress value={simulation.homeWinProbability * 100} className="h-1 mt-2" />
            </div>
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-2xl font-bold text-zinc-300">
                {(simulation.drawProbability * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-zinc-400">Beraberlik</p>
              <Progress value={simulation.drawProbability * 100} className="h-1 mt-2" />
            </div>
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-400">
                {(simulation.awayWinProbability * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-zinc-400">{awayTeam.name}</p>
              <Progress value={simulation.awayWinProbability * 100} className="h-1 mt-2" />
            </div>
          </div>

          {/* Gol İstatistikleri */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-400">Üst 2.5</span>
                <span className="font-bold text-emerald-400">
                  {(simulation.over25Probability * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={simulation.over25Probability * 100} className="h-2" />
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-400">KG Var</span>
                <span className="font-bold text-amber-400">
                  {(simulation.bttsProbability * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={simulation.bttsProbability * 100} className="h-2" />
            </div>
          </div>

          {/* Ortalama Goller */}
          <div className="flex items-center justify-center gap-4 p-3 bg-zinc-800/50 rounded-lg">
            <div className="text-center">
              <p className="text-xl font-bold">{simulation.avgHomeGoals}</p>
              <p className="text-xs text-zinc-400">Ev Gol</p>
            </div>
            <div className="text-2xl text-zinc-600">-</div>
            <div className="text-center">
              <p className="text-xl font-bold">{simulation.avgAwayGoals}</p>
              <p className="text-xs text-zinc-400">Dep Gol</p>
            </div>
            <div className="mx-4 h-8 w-px bg-zinc-700" />
            <div className="text-center">
              <p className="text-xl font-bold text-yellow-400">{simulation.avgTotalGoals}</p>
              <p className="text-xs text-zinc-400">Toplam</p>
            </div>
          </div>

          {/* En Olası Skorlar */}
          <div>
            <p className="text-sm text-zinc-400 mb-2">En Olası Skorlar</p>
            <div className="flex flex-wrap gap-2">
              {simulation.topScores.map((score, i) => (
                <Badge 
                  key={score.score}
                  variant={i === 0 ? 'default' : 'secondary'}
                  className="font-mono"
                >
                  {score.score} ({(score.probability * 100).toFixed(1)}%)
                </Badge>
              ))}
            </div>
          </div>

          {/* AI Insights */}
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">AI Yorumları</p>
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-zinc-800/30 rounded text-sm">
                <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-zinc-300">{insight}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdvancedAnalysisPanel;
