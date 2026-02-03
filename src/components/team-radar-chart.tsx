/**
 * Team Radar Chart
 * Recharts ile takım güç analizi görselleştirmesi
 */

'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PredictionFactors } from '@/lib/prediction/types';

interface TeamRadarChartProps {
  factors: PredictionFactors;
  homeTeam: string;
  awayTeam: string;
  compact?: boolean;
}

interface RadarDataPoint {
  metric: string;
  fullName: string;
  home: number;
  away: number;
}

export function TeamRadarChart({ 
  factors, 
  homeTeam, 
  awayTeam,
  compact = false 
}: TeamRadarChartProps) {
  // Radar chart için veri hazırla
  const data: RadarDataPoint[] = [
    {
      metric: 'Hücum',
      fullName: 'Hücum Gücü',
      home: factors.stats.homeAttack,
      away: factors.stats.awayAttack,
    },
    {
      metric: 'Savunma',
      fullName: 'Savunma Gücü',
      home: factors.stats.homeDefense,
      away: factors.stats.awayDefense,
    },
    {
      metric: 'Form',
      fullName: 'Son Form',
      home: factors.form.homeForm,
      away: factors.form.awayForm,
    },
    {
      metric: 'Ev/Dep',
      fullName: 'Ev/Deplasman Formu',
      home: factors.form.homeHomeForm,
      away: factors.form.awayAwayForm,
    },
    {
      metric: 'Motivasyon',
      fullName: 'Motivasyon',
      home: factors.motivation.homeMotivation,
      away: factors.motivation.awayMotivation,
    },
  ];

  // Lig pozisyonu bazlı güç (1. = 100, 20. = 5)
  if (factors.standings.homePosition && factors.standings.awayPosition) {
    const homePositionScore = Math.max(5, 100 - (factors.standings.homePosition - 1) * 5);
    const awayPositionScore = Math.max(5, 100 - (factors.standings.awayPosition - 1) * 5);
    
    data.push({
      metric: 'Sıralama',
      fullName: 'Lig Sıralaması',
      home: homePositionScore,
      away: awayPositionScore,
    });
  }

  // Ortalama hesapla
  const homeAvg = Math.round(data.reduce((sum, d) => sum + d.home, 0) / data.length);
  const awayAvg = Math.round(data.reduce((sum, d) => sum + d.away, 0) / data.length);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (active && payload && payload.length) {
      const dataPoint = data.find(d => d.metric === payload[0]?.payload?.metric);
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-2 text-sm">
          <p className="font-medium mb-1">{dataPoint?.fullName}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.dataKey === 'home' ? '#3b82f6' : '#ef4444' }}>
              {entry.dataKey === 'home' ? homeTeam : awayTeam}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (compact) {
    return (
      <div className="p-3 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">⚔️ Güç Analizi</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              {homeTeam.split(' ')[0]}: {homeAvg}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              {awayTeam.split(' ')[0]}: {awayAvg}
            </span>
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis 
                dataKey="metric" 
                tick={{ fontSize: 10, fill: 'currentColor' }}
              />
              <PolarRadiusAxis 
                angle={30} 
                domain={[0, 100]} 
                tick={{ fontSize: 8 }}
                tickCount={4}
              />
              <Radar
                name={homeTeam}
                dataKey="home"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              <Radar
                name={awayTeam}
                dataKey="away"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            ⚔️ Takım Güç Karşılaştırması
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="font-medium">{homeTeam}</span>
              <span className="text-muted-foreground">({homeAvg})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="font-medium">{awayTeam}</span>
              <span className="text-muted-foreground">({awayAvg})</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis 
                dataKey="metric" 
                tick={{ fontSize: 11, fill: 'currentColor' }}
              />
              <PolarRadiusAxis 
                angle={30} 
                domain={[0, 100]} 
                tick={{ fontSize: 9 }}
                tickCount={5}
              />
              <Radar
                name={homeTeam}
                dataKey="home"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Radar
                name={awayTeam}
                dataKey="away"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.25}
                strokeWidth={2}
              />
              <Legend 
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Detaylı karşılaştırma barları */}
        <div className="mt-4 space-y-2">
          {data.map((item) => (
            <div key={item.metric} className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{item.fullName}</span>
                <span>{item.home} - {item.away}</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div 
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(item.home / (item.home + item.away)) * 100}%` }}
                />
                <div 
                  className="bg-red-500 transition-all"
                  style={{ width: `${(item.away / (item.home + item.away)) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mini güç karşılaştırma barı
 */
export function PowerComparisonBar({ 
  homeValue, 
  awayValue,
  label,
  homeTeam,
  awayTeam,
}: { 
  homeValue: number; 
  awayValue: number;
  label: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const total = homeValue + awayValue;
  const homePercent = total > 0 ? (homeValue / total) * 100 : 50;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-blue-600 font-medium">{homeTeam.split(' ')[0]}: {homeValue}</span>
        <span className="text-muted-foreground">{label}</span>
        <span className="text-red-600 font-medium">{awayValue}: {awayTeam.split(' ')[0]}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        <div 
          className="bg-blue-500 transition-all"
          style={{ width: `${homePercent}%` }}
        />
        <div 
          className="bg-red-500 transition-all flex-1"
        />
      </div>
    </div>
  );
}
