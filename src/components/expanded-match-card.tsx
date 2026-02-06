/**
 * Expanded Match Card - Clean accordion-style match card
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge, ConfidenceBar, CombinedConfidenceBadge, APIValidationBadge } from '@/components/confidence-bar';
import { RefereeStatsCard, RefereeStatsSkeleton } from '@/components/referee-stats-card';
import { LineupBadge } from '@/components/lineup-badge';
import { FavoriteButton } from '@/components/favorite-button';
import { useMatchDetail } from '@/hooks/useDailyMatches';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { ChevronDown, ChevronUp, TrendingUp, Target, Zap, AlertTriangle, BarChart3, DollarSign, Plus, Check } from 'lucide-react';
import { cn, formatTurkeyDate, formatTurkeyTime } from '@/lib/utils';
import { useCouponStore } from '@/lib/coupon/store';
import type { RiskCategory } from '@/lib/coupon/types';

interface BetSuggestionCardProps {
  suggestion: BetSuggestion;
  fixture: DailyMatchFixture;
}

function BetSuggestionCard({ suggestion, fixture }: BetSuggestionCardProps) {
  const { addSelection, isInCoupon } = useCouponStore();
  const inCoupon = isInCoupon(fixture.id, suggestion.market);
  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'goals': return 'G';
      case 'cards': return 'K';
      case 'btts': return 'KG';
      case 'result': return 'MS';
      case 'htft': return 'IY';
      default: return '#';
    }
  };

  const getRiskCategory = (confidence: number, value?: string): RiskCategory => {
    if (confidence >= 70 && value === 'high') return 'banko';
    if (value === 'high' || value === 'medium') return 'value';
    return 'surprise';
  };

  const handleAddToCoupon = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inCoupon) return;
    addSelection({
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      league: fixture.league.name,
      date: formatTurkeyDate(fixture.timestamp * 1000),
      time: formatTurkeyTime(fixture.timestamp * 1000),
      market: suggestion.market,
      pick: suggestion.pick,
      odds: suggestion.odds,
      confidence: suggestion.confidence,
      category: getRiskCategory(suggestion.confidence, suggestion.value)
    });
  };

  return (
    <div className={cn(
      'flex items-center gap-2 p-2 rounded-lg text-sm transition-all group',
      inCoupon 
        ? 'bg-primary/10 border border-primary/20' 
        : 'bg-muted/30 border border-transparent hover:border-border/50'
    )}>
      <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
        {getTypeIcon(suggestion.type)}
      </span>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-xs">{suggestion.market}: {suggestion.pick}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn(
          'text-[10px] font-bold px-1 py-0.5 rounded',
          suggestion.confidence >= 70 ? 'text-green-600 bg-green-500/10' :
          suggestion.confidence >= 50 ? 'text-yellow-600 bg-yellow-500/10' :
          'text-red-500 bg-red-500/10'
        )}>
          %{suggestion.confidence}
        </span>
        <span className="text-xs font-mono text-muted-foreground">{suggestion.odds.toFixed(2)}</span>
        <button
          onClick={handleAddToCoupon}
          disabled={inCoupon}
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded-md transition-all',
            inCoupon 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted hover:bg-primary hover:text-primary-foreground opacity-0 group-hover:opacity-100'
          )}
        >
          {inCoupon ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

interface ExpandedMatchCardProps {
  fixture: DailyMatchFixture;
  defaultExpanded?: boolean;
}

export function ExpandedMatchCard({ fixture, defaultExpanded }: ExpandedMatchCardProps) {
  const { status, homeTeam, awayTeam, score, time, referee, league } = fixture;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? status.isLive);
  
  const { data: detail, isLoading: detailLoading } = useMatchDetail(
    fixture.id, homeTeam.id, awayTeam.id, league.id, referee?.name, isExpanded
  );

  useEffect(() => {
    if (status.isLive && !isExpanded) setIsExpanded(true);
  }, [status.isLive, isExpanded]);

  return (
    <Card className={cn(
      'transition-all duration-200 overflow-hidden',
      status.isLive && 'border-l-2 border-l-red-500',
      isExpanded ? 'shadow-md' : 'hover:shadow-sm'
    )}>
      {/* Header */}
      <div 
        className={cn(
          'flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/30',
          status.isLive && 'bg-red-500/5'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Time */}
        <div className="w-12 shrink-0 text-center">
          {status.isLive ? (
            <span className="inline-flex items-center gap-1 text-red-500 text-xs font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {status.elapsed}&apos;
            </span>
          ) : status.isFinished ? (
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">MS</span>
          ) : (
            <span className="text-sm font-medium">{time}</span>
          )}
        </div>

        {/* Teams & Score */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            {homeTeam.logo && (
              <Image src={homeTeam.logo} alt={homeTeam.name} width={18} height={18} className="object-contain shrink-0" />
            )}
            <span className="text-sm font-medium truncate flex-1">{homeTeam.name}</span>
            <span className={cn('font-bold text-sm w-5 text-right tabular-nums', status.isLive && 'text-red-500')}>
              {score.home ?? '-'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {awayTeam.logo && (
              <Image src={awayTeam.logo} alt={awayTeam.name} width={18} height={18} className="object-contain shrink-0" />
            )}
            <span className="text-sm font-medium truncate flex-1">{awayTeam.name}</span>
            <span className={cn('font-bold text-sm w-5 text-right tabular-nums', status.isLive && 'text-red-500')}>
              {score.away ?? '-'}
            </span>
          </div>
        </div>

        {/* Confidence + Expand */}
        <div className="flex items-center gap-1.5 shrink-0">
          {fixture.prediction?.confidence && (
            <CombinedConfidenceBadge 
              confidence={fixture.prediction.confidence}
              apiValidation={fixture.prediction.apiValidation}
            />
          )}
          <div className={cn(
            'h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="pt-0 pb-3 px-3 space-y-2.5 border-t border-border/40">
          {/* Action bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {detail?.data?.lineupsAvailable !== undefined && (
                <LineupBadge available={detail.data.lineupsAvailable} />
              )}
              {referee?.name && <span>Hakem: {referee.name}</span>}
            </div>
            <FavoriteButton 
              matchId={fixture.id}
              matchData={{
                id: fixture.id, homeTeam: homeTeam.name, awayTeam: awayTeam.name,
                league: league.name, date: fixture.date, time
              }}
            />
          </div>

          {detailLoading && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          )}

          {detail?.data && !detailLoading && (
            <div className="space-y-2.5">
              {/* Prediction */}
              {detail.data.prediction && (
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium text-xs">Tahmin</span>
                    </div>
                    {detail.data.prediction.winner && (
                      <span className="text-xs font-medium text-primary">{detail.data.prediction.winner}</span>
                    )}
                  </div>
                  <ConfidenceBar confidence={detail.data.prediction.confidence} advice={detail.data.prediction.advice} size="sm" />
                  {detail.data.prediction.goalsAdvice && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{detail.data.prediction.goalsAdvice}</p>
                  )}
                </div>
              )}

              {/* Form */}
              {detail.data.formComparison && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                    <p className="text-[10px] text-muted-foreground mb-1">Ev Form</p>
                    <div className="flex gap-0.5">{detail.data.formComparison.homeLast5.map((r, i) => <FormBadge key={i} result={r} />)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                    <p className="text-[10px] text-muted-foreground mb-1">Dep Form</p>
                    <div className="flex gap-0.5">{detail.data.formComparison.awayLast5.map((r, i) => <FormBadge key={i} result={r} />)}</div>
                  </div>
                </div>
              )}

              {/* H2H */}
              {detail.data.h2hSummary && (
                <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
                  <p className="text-[10px] text-muted-foreground mb-1.5">Karsilasma ({detail.data.h2hSummary.totalMatches} mac)</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <span className="font-bold text-sm text-blue-500">{detail.data.h2hSummary.homeWins}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{homeTeam.name.split(' ')[0]}</p>
                    </div>
                    <div>
                      <span className="font-bold text-sm">{detail.data.h2hSummary.draws}</span>
                      <p className="text-[10px] text-muted-foreground">Berabere</p>
                    </div>
                    <div>
                      <span className="font-bold text-sm text-red-500">{detail.data.h2hSummary.awayWins}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{awayTeam.name.split(' ')[0]}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Referee */}
              {detail.data.refereeStats && <RefereeStatsCard referee={detail.data.refereeStats} variant="compact" />}

              {/* Poisson */}
              {detail.data.poissonAnalysis && (
                <div className="p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="font-medium text-xs">Poisson</span>
                    </div>
                    {detail.data.apiValidation && (
                      <APIValidationBadge label={detail.data.apiValidation.label} deviation={detail.data.apiValidation.deviation} message={detail.data.apiValidation.message} />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <div className="text-center p-1.5 rounded-md bg-blue-500/10">
                      <span className="text-sm font-bold text-blue-600">{detail.data.poissonAnalysis.expectedHomeGoals?.toFixed(2) ?? '-'}</span>
                      <p className="text-[9px] text-muted-foreground">Ev xG</p>
                    </div>
                    <div className="text-center p-1.5 rounded-md bg-purple-500/10">
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{detail.data.poissonAnalysis.mostLikelyScore}</span>
                      <p className="text-[9px] text-muted-foreground">Skor</p>
                    </div>
                    <div className="text-center p-1.5 rounded-md bg-red-500/10">
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">{detail.data.poissonAnalysis.expectedAwayGoals?.toFixed(2) ?? '-'}</span>
                      <p className="text-[9px] text-muted-foreground">Dep xG</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div className="text-center p-1 rounded bg-muted/40">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.homeWin?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground">1</p>
                    </div>
                    <div className="text-center p-1 rounded bg-muted/40">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.draw?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground">X</p>
                    </div>
                    <div className="text-center p-1 rounded bg-muted/40">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.awayWin?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground">2</p>
                    </div>
                    <div className="text-center p-1 rounded bg-muted/40">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.over25?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground">U2.5</p>
                    </div>
                  </div>
                  {detail.data.poissonAnalysis.topScores && detail.data.poissonAnalysis.topScores.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>Olasi:</span>
                      {detail.data.poissonAnalysis.topScores.slice(0, 3).map((s: { score: string; probability: number }, i: number) => (
                        <span key={i} className="bg-muted px-1 py-0.5 rounded text-foreground font-medium">{s.score} %{s.probability?.toFixed(0) ?? '-'}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Value Bets */}
              {detail.data.valueBets && detail.data.valueBets.count > 0 && (
                <div className="p-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-green-500" />
                      <span className="font-medium text-xs">Value Bahisler</span>
                    </div>
                    <span className="text-[10px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">{detail.data.valueBets.count} Value</span>
                  </div>
                  <div className="space-y-1">
                    {detail.data.valueBets.bets?.slice(0, 3).map((bet: {
                      market: string; pick: string; value: number; edge: number;
                      fairOdds: number; kellyStake: number; recommendation: string;
                    }, idx: number) => (
                      <div key={idx} className={cn(
                        'flex items-center justify-between p-1.5 rounded text-xs',
                        bet.recommendation === 'strong_bet' ? 'bg-green-500/10' :
                        bet.recommendation === 'bet' ? 'bg-green-500/5' : 'bg-yellow-500/5'
                      )}>
                        <span className="truncate"><span className="font-medium">{bet.market}</span> - {bet.pick}</span>
                        <span className="text-green-600 font-bold shrink-0 ml-2">+{bet.value?.toFixed(0) ?? 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bet Suggestions */}
              {detail.data.betSuggestions && detail.data.betSuggestions.length > 0 && (
                <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-purple-500" />
                    <span className="font-medium text-xs">Oneriler</span>
                    <span className="text-[10px] text-muted-foreground">(kupona ekle)</span>
                  </div>
                  <div className="space-y-1">
                    {detail.data.betSuggestions.slice(0, 6).map((suggestion: BetSuggestion, idx: number) => (
                      <BetSuggestionCard key={idx} suggestion={suggestion} fixture={fixture} />
                    ))}
                  </div>
                </div>
              )}

              {/* Team Stats */}
              {detail.data.teamStats && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <p className="font-medium mb-1 text-[11px]">{homeTeam.name.split(' ')[0]}</p>
                    <div className="space-y-0.5 text-muted-foreground text-[11px]">
                      <p>Gol: {typeof detail.data.teamStats.homeGoalsScored === 'number' ? detail.data.teamStats.homeGoalsScored.toFixed(2) : detail.data.teamStats.homeGoalsScored}/mac</p>
                      <p>CS: {detail.data.teamStats.homeCleanSheetRate?.toFixed(0) ?? detail.data.teamStats.homeCleanSheets}%</p>
                      <p>KG: {detail.data.teamStats.homeBttsRate?.toFixed(0) ?? '-'}%</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                    <p className="font-medium mb-1 text-[11px]">{awayTeam.name.split(' ')[0]}</p>
                    <div className="space-y-0.5 text-muted-foreground text-[11px]">
                      <p>Gol: {typeof detail.data.teamStats.awayGoalsScored === 'number' ? detail.data.teamStats.awayGoalsScored.toFixed(2) : detail.data.teamStats.awayGoalsScored}/mac</p>
                      <p>CS: {detail.data.teamStats.awayCleanSheetRate?.toFixed(0) ?? detail.data.teamStats.awayCleanSheets}%</p>
                      <p>KG: {detail.data.teamStats.awayBttsRate?.toFixed(0) ?? '-'}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Player Cards */}
              {detail.data.playerCards && (detail.data.playerCards.home.length > 0 || detail.data.playerCards.away.length > 0) && (
                <div className="p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
                  <p className="font-medium text-xs mb-1.5">Kart Riski Yuksek</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="space-y-0.5">
                      {detail.data.playerCards.home.slice(0, 3).map((player, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="truncate">{player.playerName.split(' ').pop()}</span>
                          <span className="text-yellow-600 font-medium shrink-0">{player.totalCards} ({Math.round(player.cardRate * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-0.5">
                      {detail.data.playerCards.away.slice(0, 3).map((player, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="truncate">{player.playerName.split(' ').pop()}</span>
                          <span className="text-yellow-600 font-medium shrink-0">{player.totalCards} ({Math.round(player.cardRate * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {detailLoading && referee?.name && <RefereeStatsSkeleton />}
        </CardContent>
      )}
    </Card>
  );
}

function FormBadge({ result }: { result: string }) {
  return (
    <span className={cn(
      'w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold',
      result.toUpperCase() === 'W' ? 'bg-green-500 text-white' :
      result.toUpperCase() === 'D' ? 'bg-gray-400 text-white' :
      result.toUpperCase() === 'L' ? 'bg-red-500 text-white' :
      'bg-muted text-muted-foreground'
    )}>
      {result.toUpperCase()}
    </span>
  );
}

export function ExpandedMatchCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="w-12 h-5 rounded" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </div>
        <Skeleton className="w-8 h-5 rounded" />
      </div>
    </Card>
  );
}
