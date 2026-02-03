'use client';

/**
 * Maç Kartı Bileşeni
 * Tek bir maçı gösteren kart
 */

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProcessedFixture } from '@/types/api-football';
import { ChevronRight } from 'lucide-react';
import { FavoriteButton } from '@/components/favorite-button';

interface MatchCardProps {
  fixture: ProcessedFixture;
  onClick?: () => void;
  selected?: boolean;
}

export function MatchCard({ fixture, onClick, selected }: MatchCardProps) {
  const { status, homeTeam, awayTeam, score, league, time } = fixture;

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        selected ? 'ring-2 ring-primary' : ''
      } ${status.isLive ? 'border-green-500 border-2' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Lig Bilgisi */}
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          {league.logo && (
            <Image 
              src={league.logo} 
              alt={league.name}
              width={16}
              height={16}
              className="object-contain"
            />
          )}
          <span className="truncate">{league.country} - {league.name}</span>
        </div>

        {/* Takımlar ve Skor */}
        <div className="space-y-2">
          {/* Ev Sahibi */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {homeTeam.logo && (
                <Image 
                  src={homeTeam.logo} 
                  alt={homeTeam.name}
                  width={24}
                  height={24}
                  className="object-contain flex-shrink-0"
                />
              )}
              <span className="font-medium truncate">{homeTeam.name}</span>
            </div>
            <span className="font-bold text-lg w-8 text-center">
              {score.home ?? '-'}
            </span>
          </div>

          {/* Deplasman */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {awayTeam.logo && (
                <Image 
                  src={awayTeam.logo} 
                  alt={awayTeam.name}
                  width={24}
                  height={24}
                  className="object-contain flex-shrink-0"
                />
              )}
              <span className="font-medium truncate">{awayTeam.name}</span>
            </div>
            <span className="font-bold text-lg w-8 text-center">
              {score.away ?? '-'}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <MatchStatusBadge status={status} />
          {status.isUpcoming && (
            <span className="text-sm font-medium">{time}</span>
          )}
          {status.isLive && status.elapsed && (
            <span className="text-sm text-green-600 font-medium animate-pulse">
              {status.elapsed}&apos;
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MatchStatusBadge({ status }: { status: ProcessedFixture['status'] }) {
  if (status.isLive) {
    return (
      <Badge variant="default" className="bg-green-600 animate-pulse">
        🔴 CANLI
      </Badge>
    );
  }

  if (status.isFinished) {
    return <Badge variant="secondary">Bitti</Badge>;
  }

  if (status.isUpcoming) {
    return <Badge variant="outline">Başlamadı</Badge>;
  }

  // Diğer durumlar (ertelendi, iptal, vs.)
  return <Badge variant="destructive">{status.code}</Badge>;
}

// Kompakt versiyon - liste görünümü için
export function MatchCardCompact({ fixture, onClick, selected }: MatchCardProps) {
  const { status, homeTeam, awayTeam, score, time } = fixture;

  const content = (
    <div 
      className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${
        status.isLive ? 'bg-green-50 dark:bg-green-950/30' : ''
      } ${selected ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
      onClick={onClick}
    >
      {/* Saat / Dakika */}
      <div className="w-16 text-center flex-shrink-0">
        {status.isLive ? (
          <div className="flex items-center justify-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-red-600 font-bold">
              {status.elapsed}&apos;
            </span>
          </div>
        ) : status.isFinished ? (
          <span className="text-muted-foreground text-xs font-medium bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">MS</span>
        ) : (
          <span className="font-semibold text-sm">{time}</span>
        )}
      </div>

      {/* Ev Sahibi */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {homeTeam.logo && (
          <Image 
            src={homeTeam.logo} 
            alt={homeTeam.name}
            width={24}
            height={24}
            className="object-contain flex-shrink-0"
          />
        )}
        <span className="truncate font-medium">{homeTeam.name}</span>
      </div>

      {/* Skor */}
      <div className={`font-bold text-center px-3 py-1 rounded-lg flex-shrink-0 min-w-[60px] ${
        status.isLive 
          ? 'bg-red-500 text-white' 
          : status.isFinished 
            ? 'bg-slate-200 dark:bg-slate-700' 
            : 'bg-slate-100 dark:bg-slate-800'
      }`}>
        <span className="text-lg">{score.home ?? '-'}</span>
        <span className="mx-1 opacity-50">:</span>
        <span className="text-lg">{score.away ?? '-'}</span>
      </div>

      {/* Deplasman */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="truncate font-medium text-right">{awayTeam.name}</span>
        {awayTeam.logo && (
          <Image 
            src={awayTeam.logo} 
            alt={awayTeam.name}
            width={24}
            height={24}
            className="object-contain flex-shrink-0"
          />
        )}
      </div>
      
      {/* Favori & Detay */}
      <FavoriteButton
        matchId={fixture.id}
        matchData={{
          id: fixture.id,
          homeTeam: homeTeam.name,
          awayTeam: awayTeam.name,
          date: new Date(fixture.timestamp * 1000).toLocaleDateString('tr-TR'),
          time: time,
          league: fixture.league.name,
        }}
        size="sm"
      />
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </div>
  );

  return (
    <Link href={`/match/${fixture.id}`} className="block">
      {content}
    </Link>
  );
}
