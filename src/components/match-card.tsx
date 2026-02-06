'use client';

/**
 * Match Card - Clean minimal design
 */

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProcessedFixture } from '@/types/api-football';
import { ChevronRight } from 'lucide-react';
import { FavoriteButton } from '@/components/favorite-button';
import { formatTurkeyDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface MatchCardProps {
  fixture: ProcessedFixture;
  onClick?: () => void;
  selected?: boolean;
}

export function MatchCard({ fixture, onClick, selected }: MatchCardProps) {
  const { status, homeTeam, awayTeam, score, league, time } = fixture;

  return (
    <Card 
      className={cn(
        'cursor-pointer transition-all duration-200 hover:bg-muted/50 border-border/60',
        selected && 'ring-2 ring-primary',
        status.isLive && 'border-l-2 border-l-red-500'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4">
        {/* League */}
        <div className="flex items-center gap-1.5 mb-2.5 text-[11px] text-muted-foreground">
          {league.logo && (
            <Image 
              src={league.logo} 
              alt={league.name}
              width={14}
              height={14}
              className="object-contain"
            />
          )}
          <span className="truncate">{league.country} - {league.name}</span>
        </div>

        {/* Teams & Score */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {homeTeam.logo && (
                <Image src={homeTeam.logo} alt={homeTeam.name} width={20} height={20} className="object-contain shrink-0" />
              )}
              <span className="font-medium text-sm truncate">{homeTeam.name}</span>
            </div>
            <span className="font-bold text-base w-6 text-center tabular-nums">{score.home ?? '-'}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {awayTeam.logo && (
                <Image src={awayTeam.logo} alt={awayTeam.name} width={20} height={20} className="object-contain shrink-0" />
              )}
              <span className="font-medium text-sm truncate">{awayTeam.name}</span>
            </div>
            <span className="font-bold text-base w-6 text-center tabular-nums">{score.away ?? '-'}</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/50">
          <MatchStatusBadge status={status} />
          {status.isUpcoming && <span className="text-xs font-medium text-muted-foreground">{time}</span>}
          {status.isLive && status.elapsed && (
            <span className="text-xs text-red-500 font-semibold animate-pulse-live">{status.elapsed}&apos;</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MatchStatusBadge({ status }: { status: ProcessedFixture['status'] }) {
  if (status.isLive) {
    return (
      <Badge className="bg-red-500/10 text-red-500 border-0 text-[10px] font-semibold px-1.5 py-0.5">
        CANLI
      </Badge>
    );
  }
  if (status.isFinished) {
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Bitti</Badge>;
  }
  if (status.isUpcoming) {
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-border/50">Baslamadi</Badge>;
  }
  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">{status.code}</Badge>;
}

export function MatchCardCompact({ fixture, onClick, selected }: MatchCardProps) {
  const { status, homeTeam, awayTeam, score, time } = fixture;

  const content = (
    <div 
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50',
        status.isLive && 'bg-red-500/5',
        selected && 'bg-primary/5'
      )}
      onClick={onClick}
    >
      {/* Time / Minute */}
      <div className="w-12 text-center shrink-0">
        {status.isLive ? (
          <div className="flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-500 font-bold">{status.elapsed}&apos;</span>
          </div>
        ) : status.isFinished ? (
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">MS</span>
        ) : (
          <span className="text-xs font-semibold">{time}</span>
        )}
      </div>

      {/* Home */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {homeTeam.logo && (
          <Image src={homeTeam.logo} alt={homeTeam.name} width={20} height={20} className="object-contain shrink-0" />
        )}
        <span className="truncate text-sm font-medium">{homeTeam.name}</span>
      </div>

      {/* Score */}
      <div className={cn(
        'font-bold text-center px-2 py-0.5 rounded-md shrink-0 min-w-[48px] text-sm tabular-nums',
        status.isLive ? 'bg-red-500 text-white' : status.isFinished ? 'bg-muted' : 'bg-muted/50'
      )}>
        {score.home ?? '-'} : {score.away ?? '-'}
      </div>

      {/* Away */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className="truncate text-sm font-medium text-right">{awayTeam.name}</span>
        {awayTeam.logo && (
          <Image src={awayTeam.logo} alt={awayTeam.name} width={20} height={20} className="object-contain shrink-0" />
        )}
      </div>
      
      <FavoriteButton
        matchId={fixture.id}
        matchData={{
          id: fixture.id,
          homeTeam: homeTeam.name,
          awayTeam: awayTeam.name,
          date: formatTurkeyDate(fixture.timestamp * 1000),
          time: time,
          league: fixture.league.name,
        }}
        size="sm"
      />
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </div>
  );

  return (
    <Link href={`/match/${fixture.id}`} className="block">
      {content}
    </Link>
  );
}
