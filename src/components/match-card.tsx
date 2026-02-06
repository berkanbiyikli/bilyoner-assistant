'use client';

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
    <div 
      className={cn(
        'card-premium rounded-xl cursor-pointer group',
        selected && 'ring-2 ring-primary',
        status.isLive && 'match-live'
      )}
      onClick={onClick}
    >
      <div className="p-4">
        {/* League bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {league.logo && (
              <Image src={league.logo} alt={league.name} width={16} height={16} className="object-contain" />
            )}
            <span className="font-medium truncate">{league.country} - {league.name}</span>
          </div>
          <MatchStatusBadge status={status} />
        </div>

        {/* Teams & Score - Centered layout */}
        <div className="flex items-center justify-between gap-3">
          {/* Home */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              {homeTeam.logo && (
                <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 group-hover:bg-muted transition-colors">
                  <Image src={homeTeam.logo} alt={homeTeam.name} width={28} height={28} className="object-contain" />
                </div>
              )}
              <span className="font-bold text-sm truncate">{homeTeam.name}</span>
            </div>
          </div>

          {/* Score */}
          <div className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl shrink-0',
            status.isLive 
              ? 'bg-red-500/10 border border-red-500/20' 
              : status.isFinished 
                ? 'bg-muted/50' 
                : 'bg-primary/5 border border-primary/10'
          )}>
            <span className={cn(
              'text-2xl font-black tabular-nums',
              status.isLive && 'text-red-500 score-glow'
            )}>
              {score.home ?? '-'}
            </span>
            <span className="text-muted-foreground font-light">:</span>
            <span className={cn(
              'text-2xl font-black tabular-nums',
              status.isLive && 'text-red-500 score-glow'
            )}>
              {score.away ?? '-'}
            </span>
          </div>

          {/* Away */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 justify-end">
              <span className="font-bold text-sm truncate text-right">{awayTeam.name}</span>
              {awayTeam.logo && (
                <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 group-hover:bg-muted transition-colors">
                  <Image src={awayTeam.logo} alt={awayTeam.name} width={28} height={28} className="object-contain" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
          {status.isUpcoming && (
            <span className="text-xs font-bold text-primary">{time}</span>
          )}
          {status.isLive && status.elapsed && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-500">
              <span className="live-dot" />
              {status.elapsed}&apos;
            </span>
          )}
          {status.isFinished && (
            <span className="text-xs font-medium text-muted-foreground">Bitti</span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: ProcessedFixture['status'] }) {
  if (status.isLive) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
        <span className="live-dot !w-[6px] !h-[6px]" />
        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Canli</span>
      </span>
    );
  }
  if (status.isFinished) {
    return <Badge variant="secondary" className="text-[10px] font-semibold rounded-lg">Bitti</Badge>;
  }
  if (status.isUpcoming) {
    return <Badge variant="outline" className="text-[10px] font-semibold rounded-lg border-primary/20 text-primary">Baslamadi</Badge>;
  }
  return <Badge variant="destructive" className="text-[10px] rounded-lg">{status.code}</Badge>;
}

export function MatchCardCompact({ fixture, onClick, selected }: MatchCardProps) {
  const { status, homeTeam, awayTeam, score, time } = fixture;

  const content = (
    <div 
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-all rounded-xl hover:bg-muted/50 group',
        status.isLive && 'bg-red-500/5 hover:bg-red-500/10',
        selected && 'bg-primary/5 ring-1 ring-primary/20'
      )}
      onClick={onClick}
    >
      {/* Time / Minute */}
      <div className="w-14 text-center shrink-0">
        {status.isLive ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="live-dot !w-[5px] !h-[5px]" />
            <span className="text-xs text-red-500 font-black">{status.elapsed}&apos;</span>
          </div>
        ) : status.isFinished ? (
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">MS</span>
        ) : (
          <span className="text-xs font-black text-primary">{time}</span>
        )}
      </div>

      {/* Home */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {homeTeam.logo && (
          <Image src={homeTeam.logo} alt={homeTeam.name} width={22} height={22} className="object-contain shrink-0" />
        )}
        <span className="truncate text-sm font-semibold">{homeTeam.name}</span>
      </div>

      {/* Score */}
      <div className={cn(
        'font-black text-center px-3 py-1 rounded-lg shrink-0 min-w-[52px] text-sm tabular-nums',
        status.isLive ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' : status.isFinished ? 'bg-muted' : 'bg-primary/10 text-primary'
      )}>
        {score.home ?? '-'} : {score.away ?? '-'}
      </div>

      {/* Away */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="truncate text-sm font-semibold text-right">{awayTeam.name}</span>
        {awayTeam.logo && (
          <Image src={awayTeam.logo} alt={awayTeam.name} width={22} height={22} className="object-contain shrink-0" />
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
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </div>
  );

  return (
    <Link href={`/match/${fixture.id}`} className="block">
      {content}
    </Link>
  );
}
