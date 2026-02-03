/**
 * Injury Panel Component
 * Sakatlık/Ceza paneli
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, UserX, Activity } from 'lucide-react';

// Sakatlık verisi tipi
export interface InjuredPlayer {
  playerId: number;
  playerName: string;
  playerPhoto?: string;
  type: 'injury' | 'suspension' | 'doubtful';
  reason: string;
  expectedReturn?: string;
  isCritical: boolean; // Kritik oyuncu mu (ilk 11)
}

export interface TeamInjuries {
  teamId: number;
  teamName: string;
  injuries: InjuredPlayer[];
}

interface InjuryPanelProps {
  homeInjuries?: TeamInjuries;
  awayInjuries?: TeamInjuries;
  isLoading?: boolean;
  compact?: boolean;
}

export function InjuryPanel({
  homeInjuries,
  awayInjuries,
  isLoading,
  compact = false,
}: InjuryPanelProps) {
  if (isLoading) {
    return <InjuryPanelSkeleton compact={compact} />;
  }

  const hasHomeInjuries = homeInjuries && homeInjuries.injuries.length > 0;
  const hasAwayInjuries = awayInjuries && awayInjuries.injuries.length > 0;

  if (!hasHomeInjuries && !hasAwayInjuries) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 text-sm">
        <CheckCircle className="h-4 w-4" />
        <span>Her iki takımda da bilinen eksik oyuncu yok</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="font-medium text-sm">Eksik Oyuncular</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {hasHomeInjuries && (
            <div>
              <span className="text-muted-foreground">{homeInjuries.teamName}:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {homeInjuries.injuries.slice(0, 3).map((player) => (
                  <InjuryBadge key={player.playerId} player={player} size="sm" />
                ))}
                {homeInjuries.injuries.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{homeInjuries.injuries.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}
          {hasAwayInjuries && (
            <div>
              <span className="text-muted-foreground">{awayInjuries.teamName}:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {awayInjuries.injuries.slice(0, 3).map((player) => (
                  <InjuryBadge key={player.playerId} player={player} size="sm" />
                ))}
                {awayInjuries.injuries.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{awayInjuries.injuries.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-red-500" />
          Sakatlık & Ceza Durumu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Home Team */}
        {hasHomeInjuries && (
          <TeamInjuryList injuries={homeInjuries} side="home" />
        )}

        {/* Away Team */}
        {hasAwayInjuries && (
          <TeamInjuryList injuries={awayInjuries} side="away" />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Takım sakatlık listesi
 */
function TeamInjuryList({
  injuries,
  side,
}: {
  injuries: TeamInjuries;
  side: 'home' | 'away';
}) {
  const criticalCount = injuries.injuries.filter(p => p.isCritical).length;

  return (
    <div className={cn(
      "p-2 rounded-lg",
      side === 'home' ? 'bg-blue-500/10' : 'bg-red-500/10'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn(
          "font-medium text-sm",
          side === 'home' ? 'text-blue-600' : 'text-red-600'
        )}>
          {injuries.teamName}
        </span>
        {criticalCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {criticalCount} kritik eksik
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {injuries.injuries.map((player) => (
          <PlayerInjuryRow key={player.playerId} player={player} />
        ))}
      </div>
    </div>
  );
}

/**
 * Oyuncu sakatlık satırı
 */
function PlayerInjuryRow({ player }: { player: InjuredPlayer }) {
  return (
    <div className={cn(
      "flex items-center justify-between p-1.5 rounded text-sm",
      player.isCritical ? 'bg-red-500/10' : 'bg-muted/50'
    )}>
      <div className="flex items-center gap-2">
        <InjuryTypeIcon type={player.type} />
        <span className={cn(player.isCritical && 'font-medium')}>
          {player.playerName}
        </span>
        {player.isCritical && (
          <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
            Kritik
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate max-w-[100px]">{player.reason}</span>
        {player.expectedReturn && (
          <Badge variant="secondary" className="text-[10px]">
            Dönüş: {player.expectedReturn}
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * Sakatlık tipi ikonu
 */
function InjuryTypeIcon({ type }: { type: InjuredPlayer['type'] }) {
  switch (type) {
    case 'injury':
      return <span className="text-red-500">🩹</span>;
    case 'suspension':
      return <span className="text-yellow-500">🟨</span>;
    case 'doubtful':
      return <span className="text-orange-500">❓</span>;
    default:
      return <UserX className="h-4 w-4 text-muted-foreground" />;
  }
}

/**
 * Sakatlık badge'i
 */
function InjuryBadge({ 
  player, 
  size = 'md' 
}: { 
  player: InjuredPlayer; 
  size?: 'sm' | 'md';
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        player.isCritical ? 'border-red-500/50 text-red-600' : 'border-muted',
        size === 'sm' && 'text-[10px] h-5 px-1.5'
      )}
    >
      <InjuryTypeIcon type={player.type} />
      <span className="ml-1 truncate max-w-[60px]">
        {player.playerName.split(' ').pop()}
      </span>
    </Badge>
  );
}

/**
 * Skeleton
 */
function InjuryPanelSkeleton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="p-2 rounded-lg bg-muted/50">
        <Skeleton className="h-4 w-32 mb-2" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="p-2 rounded-lg bg-muted/30">
          <Skeleton className="h-4 w-24 mb-2" />
          <div className="space-y-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
