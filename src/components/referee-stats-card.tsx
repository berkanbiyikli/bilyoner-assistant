/**
 * Referee Stats Card
 * Hakem istatistiklerini kompakt formatta gösteren kart
 */

'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Referee } from '@/types/api-football';

interface RefereeStatsCardProps {
  referee: Referee;
  variant?: 'compact' | 'full';
}

export function RefereeStatsCard({ referee, variant = 'compact' }: RefereeStatsCardProps) {
  const { averages, insights, appearance, name } = referee;

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs cursor-help">
              <span className="text-muted-foreground">👨‍⚖️</span>
              <span className="font-medium truncate max-w-[100px]">{name}</span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="h-5 px-1 text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                  🟨 {averages.yellow_per_match}
                </Badge>
                {averages.pens_per_match >= 0.2 && (
                  <Badge variant="outline" className="h-5 px-1 text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
                    ⚽ {averages.pens_per_match}
                  </Badge>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[280px]">
            <div className="space-y-2">
              <div className="font-semibold">{name}</div>
              <div className="text-xs text-muted-foreground">
                {appearance} maç yönetti
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-1.5 rounded bg-yellow-500/10">
                  <div className="text-lg font-bold text-yellow-600">🟨 {averages.yellow_per_match}</div>
                  <div className="text-[10px] text-muted-foreground">Sarı/Maç</div>
                </div>
                <div className="p-1.5 rounded bg-red-500/10">
                  <div className="text-lg font-bold text-red-600">🟥 {averages.red_per_match}</div>
                  <div className="text-[10px] text-muted-foreground">Kırmızı/Maç</div>
                </div>
                <div className="p-1.5 rounded bg-blue-500/10">
                  <div className="text-lg font-bold text-blue-600">⚽ {averages.pens_per_match}</div>
                  <div className="text-[10px] text-muted-foreground">Penaltı/Maç</div>
                </div>
              </div>
              {insights && insights.length > 0 && (
                <div className="pt-2 border-t space-y-1">
                  {insights.map((insight, i) => (
                    <div key={i} className="text-xs">{insight}</div>
                  ))}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full variant
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">👨‍⚖️</span>
          <div>
            <div className="font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">{appearance} maç yönetti</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
          <div className="text-2xl font-bold text-yellow-600">🟨</div>
          <div className="text-lg font-bold">{averages.yellow_per_match}</div>
          <div className="text-xs text-muted-foreground">Sarı/Maç</div>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 text-center">
          <div className="text-2xl font-bold text-red-600">🟥</div>
          <div className="text-lg font-bold">{averages.red_per_match}</div>
          <div className="text-xs text-muted-foreground">Kırmızı/Maç</div>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 text-center">
          <div className="text-2xl font-bold text-blue-600">⚽</div>
          <div className="text-lg font-bold">{averages.pens_per_match}</div>
          <div className="text-xs text-muted-foreground">Penaltı/Maç</div>
        </div>
      </div>

      {insights && insights.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground">Öngörüler</div>
          {insights.map((insight, i) => (
            <div key={i} className="text-sm p-2 rounded bg-muted/50">
              {insight}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton version
 */
export function RefereeStatsSkeleton() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-4 h-4 rounded bg-muted animate-pulse" />
      <div className="w-16 h-4 rounded bg-muted animate-pulse" />
      <div className="w-12 h-5 rounded bg-muted animate-pulse" />
    </div>
  );
}
