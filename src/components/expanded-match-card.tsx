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
import { ChevronDown, ChevronUp, TrendingUp, Target, Zap, AlertTriangle, BarChart3, DollarSign, Plus, Check, ArrowUp, ArrowDown, ShieldAlert, Brain } from 'lucide-react';
import { cn, formatTurkeyDate, formatTurkeyTime } from '@/lib/utils';
import { useCouponStore } from '@/lib/coupon/store';
import { useBankrollStore, calculateKelly } from '@/lib/bankroll';
import type { RiskCategory } from '@/lib/coupon/types';

interface BetSuggestionCardProps {
  suggestion: BetSuggestion;
  fixture: DailyMatchFixture;
}

function BetSuggestionCard({ suggestion, fixture }: BetSuggestionCardProps) {
  const { addSelection, isInCoupon } = useCouponStore();
  const { currentBalance } = useBankrollStore();
  const inCoupon = isInCoupon(fixture.id, suggestion.market);
  
  // Kelly hesabı
  const kellyAmount = currentBalance > 0 ? (() => {
    const kelly = calculateKelly({
      odds: suggestion.odds,
      probability: suggestion.confidence / 100,
      bankroll: currentBalance,
      kellyFraction: 0.25,
      maxBetPercentage: 10,
      maxSingleBet: null,
    });
    return kelly.suggestedAmount > 0 ? kelly.suggestedAmount : null;
  })() : null;
  
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
      'flex items-center gap-2 p-2.5 rounded-xl text-sm transition-all group relative overflow-hidden',
      inCoupon 
        ? 'bg-primary/10 border border-primary/30 shadow-sm shadow-primary/10' 
        : 'bg-muted/20 border border-transparent hover:border-primary/20 hover:bg-primary/5'
    )}>
      {inCoupon && <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />}
      <span className={cn(
        'text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 relative',
        inCoupon ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        {getTypeIcon(suggestion.type)}
      </span>
      <div className="flex-1 min-w-0 relative">
        <span className="font-semibold text-xs">{suggestion.market}: {suggestion.pick}</span>
        {kellyAmount && (
          <span className="ml-1.5 text-[9px] font-medium text-primary/60" title="Kelly önerisi">
            ₺{kellyAmount >= 1000 ? `${(kellyAmount/1000).toFixed(1)}K` : Math.round(kellyAmount)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 relative">
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
          suggestion.confidence >= 70 ? 'text-emerald-500 bg-emerald-500/15' :
          suggestion.confidence >= 50 ? 'text-amber-500 bg-amber-500/15' :
          'text-red-400 bg-red-500/15'
        )}>
          %{suggestion.confidence}
        </span>
        <span className="text-xs font-mono font-bold text-primary/70 flex items-center gap-0.5" title={suggestion.oddsSource === 'real' ? `Gerçek oran (${suggestion.bookmaker || '1xBet'})` : 'Model tahmini oran'}>
          {suggestion.odds.toFixed(2)}
          {suggestion.oddsSource === 'real' && <span className="ml-0.5 text-[8px] text-emerald-500 font-semibold">✓</span>}
          {suggestion.value === 'high' && <ArrowUp className="h-2.5 w-2.5 text-emerald-500" />}
          {suggestion.value === 'low' && <ArrowDown className="h-2.5 w-2.5 text-red-400" />}
        </span>
        <button
          onClick={handleAddToCoupon}
          disabled={inCoupon}
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded-lg transition-all',
            inCoupon 
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30' 
              : 'bg-muted/50 hover:bg-primary hover:text-primary-foreground hover:shadow-sm hover:shadow-primary/30 opacity-0 group-hover:opacity-100'
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
      'card-premium transition-all duration-300 overflow-hidden !py-0 !gap-0',
      status.isLive && 'match-live',
      isExpanded ? 'shadow-lg shadow-primary/5' : ''
    )}>
      {/* League Bar */}
      <div className="flex items-center justify-between px-3.5 pt-2.5 pb-0">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {league.logo && (
            <Image src={league.logo} alt={league.name} width={14} height={14} className="object-contain" />
          )}
          <span className="font-medium truncate">{league.country} - {league.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {referee?.name && (
            <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              {referee.name}
            </span>
          )}
        </div>
      </div>

      {/* Header */}
      <div 
        className={cn(
          'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-all hover:bg-primary/3',
          status.isLive && 'bg-gradient-to-r from-red-500/8 to-transparent'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Time */}
        <div className="w-14 shrink-0 text-center">
          {status.isLive ? (
            <span className="inline-flex items-center gap-1.5 text-red-500 text-xs font-bold bg-red-500/10 px-2 py-1 rounded-lg">
              <span className="live-dot" />
              {status.elapsed}&apos;
            </span>
          ) : status.isFinished ? (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg">MS</span>
          ) : (
            <span className="text-sm font-semibold bg-primary/5 text-primary px-2 py-1 rounded-lg">{time}</span>
          )}
        </div>

        {/* Teams & Score */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            {homeTeam.logo && (
              <Image src={homeTeam.logo} alt={homeTeam.name} width={18} height={18} className="object-contain shrink-0" />
            )}
            <span className="text-sm font-medium truncate flex-1">{homeTeam.name}</span>
            <span className={cn('font-bold text-sm w-6 text-right tabular-nums', status.isLive ? 'text-red-500 score-glow' : 'text-foreground')}>
              {score.home ?? '-'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {awayTeam.logo && (
              <Image src={awayTeam.logo} alt={awayTeam.name} width={20} height={20} className="object-contain shrink-0" />
            )}
            <span className="text-sm font-medium truncate flex-1">{awayTeam.name}</span>
            <span className={cn('font-bold text-sm w-6 text-right tabular-nums', status.isLive ? 'text-red-500 score-glow' : 'text-foreground')}>
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
            'h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-180 text-primary'
          )}>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="pt-0 pb-3 px-3.5 space-y-3 border-t border-border/40">
          {/* Action bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {detail?.data?.lineupsAvailable !== undefined && (
                <LineupBadge available={detail.data.lineupsAvailable} />
              )}
              {fixture.date && (
                <span className="text-[10px] bg-muted/40 px-2 py-0.5 rounded-md">{fixture.date}</span>
              )}
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
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/15">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                        <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="font-semibold text-xs">Tahmin</span>
                    </div>
                    {detail.data.prediction.winner && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">{detail.data.prediction.winner}</span>
                    )}
                  </div>
                  <ConfidenceBar confidence={detail.data.prediction.confidence} advice={detail.data.prediction.advice} size="sm" />
                  {detail.data.prediction.goalsAdvice && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{detail.data.prediction.goalsAdvice}</p>
                  )}
                  {/* AI Reasoning */}
                  {(detail.data.prediction.advice || detail.data.formComparison) && (
                    <div className="mt-2 flex items-start gap-1.5 p-2 rounded-lg bg-background/50 border border-primary/10">
                      <Brain className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {(() => {
                          const parts: string[] = [];
                          if (detail.data.prediction.winner) {
                            parts.push(detail.data.prediction.winner + ' favori gosteriliyor.');
                          }
                          if (detail.data.formComparison?.homeLast5 && detail.data.formComparison?.awayLast5) {
                            const hw = detail.data.formComparison.homeLast5.filter(r => r.toUpperCase() === 'W').length;
                            const aw = detail.data.formComparison.awayLast5.filter(r => r.toUpperCase() === 'W').length;
                            if (hw > aw) parts.push('Ev sahibi son 5 macta daha basarili.');
                            else if (aw > hw) parts.push('Deplasman takimi son 5 macta daha formda.');
                            else parts.push('Her iki takim da benzer formda.');
                          }
                          if (detail.data.prediction.goalsAdvice) {
                            parts.push('Gol beklentisi: ' + detail.data.prediction.goalsAdvice + '.');
                          }
                          return parts.join(' ') || detail.data.prediction.advice || 'Analiz verisi isleniyor...';
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Form */}
              {detail.data.formComparison && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/10">
                    <p className="text-[10px] font-semibold text-blue-500 mb-1.5">Ev Form</p>
                    <div className="flex gap-1">{detail.data.formComparison.homeLast5.map((r, i) => <FormBadge key={i} result={r} />)}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/10">
                    <p className="text-[10px] font-semibold text-rose-500 mb-1.5">Dep Form</p>
                    <div className="flex gap-1">{detail.data.formComparison.awayLast5.map((r, i) => <FormBadge key={i} result={r} />)}</div>
                  </div>
                </div>
              )}

              {/* H2H */}
              {detail.data.h2hSummary && (
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/8 to-purple-500/8 border border-blue-500/10">
                  <p className="text-[10px] font-semibold text-blue-400 mb-2">Karsilasma ({detail.data.h2hSummary.totalMatches} mac)</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-1.5 rounded-lg bg-blue-500/10">
                      <span className="font-bold text-base text-blue-500">{detail.data.h2hSummary.homeWins}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{homeTeam.name.split(' ')[0]}</p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-muted/30">
                      <span className="font-bold text-base">{detail.data.h2hSummary.draws}</span>
                      <p className="text-[10px] text-muted-foreground">Berabere</p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-red-500/10">
                      <span className="font-bold text-base text-red-500">{detail.data.h2hSummary.awayWins}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{awayTeam.name.split(' ')[0]}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Referee */}
              {detail.data.refereeStats && <RefereeStatsCard referee={detail.data.refereeStats} variant="compact" />}

              {/* Poisson */}
              {detail.data.poissonAnalysis && (
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/8 border border-indigo-500/15">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                        <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                      </div>
                      <span className="font-semibold text-xs">Poisson</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-semibold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">Dogruluk ~%72</span>
                      {detail.data.apiValidation && (
                        <APIValidationBadge label={detail.data.apiValidation.label} deviation={detail.data.apiValidation.deviation} message={detail.data.apiValidation.message} />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2.5">
                    <div className="text-center p-2 rounded-xl bg-blue-500/15 border border-blue-500/10">
                      <span className="text-sm font-bold text-blue-500">{detail.data.poissonAnalysis.expectedHomeGoals?.toFixed(2) ?? '-'}</span>
                      <p className="text-[9px] font-medium text-blue-400/70">Ev xG</p>
                    </div>
                    <div className="text-center p-2 rounded-xl bg-gradient-to-b from-purple-500/15 to-violet-500/15 border border-purple-500/10">
                      <span className="text-sm font-bold text-purple-500 dark:text-purple-400">{detail.data.poissonAnalysis.mostLikelyScore}</span>
                      <p className="text-[9px] font-medium text-purple-400/70">Skor</p>
                    </div>
                    <div className="text-center p-2 rounded-xl bg-red-500/15 border border-red-500/10">
                      <span className="text-sm font-bold text-red-500 dark:text-red-400">{detail.data.poissonAnalysis.expectedAwayGoals?.toFixed(2) ?? '-'}</span>
                      <p className="text-[9px] font-medium text-red-400/70">Dep xG</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                    <div className="text-center p-1.5 rounded-lg bg-muted/40 border border-border/20">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.homeWin?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground font-medium">1</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/40 border border-border/20">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.draw?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground font-medium">X</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/40 border border-border/20">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.awayWin?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground font-medium">2</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/40 border border-border/20">
                      <span className="font-bold">{detail.data.poissonAnalysis.probabilities?.over25?.toFixed(0) ?? '-'}%</span>
                      <p className="text-muted-foreground font-medium">U2.5</p>
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
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/8 border border-emerald-500/15">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <span className="font-semibold text-xs">Value Bahisler</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/15 px-2 py-0.5 rounded-lg">{detail.data.valueBets.count} Value</span>
                  </div>
                  <div className="space-y-1">
                    {detail.data.valueBets.bets?.slice(0, 3).map((bet: {
                      market: string; pick: string; value: number; edge: number;
                      fairOdds: number; kellyStake: number; recommendation: string;
                    }, idx: number) => (
                      <div key={idx} className={cn(
                        'flex items-center justify-between p-2 rounded-lg text-xs border',
                        bet.recommendation === 'strong_bet' ? 'bg-emerald-500/10 border-emerald-500/15' :
                        bet.recommendation === 'bet' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-amber-500/5 border-amber-500/10'
                      )}>
                        <span className="truncate"><span className="font-semibold">{bet.market}</span> - {bet.pick}</span>
                        <span className="text-emerald-500 font-bold shrink-0 ml-2">+{bet.value?.toFixed(0) ?? 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bet Suggestions */}
              {detail.data.betSuggestions && detail.data.betSuggestions.length > 0 && (
                <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/8 border border-violet-500/15">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
                      <Zap className="h-3.5 w-3.5 text-violet-500" />
                    </div>
                    <span className="font-semibold text-xs">Oneriler</span>
                    <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">(kupona ekle)</span>
                  </div>
                  <div className="space-y-1">
                    {detail.data.betSuggestions.slice(0, 6).map((suggestion: BetSuggestion, idx: number) => (
                      <BetSuggestionCard key={idx} suggestion={suggestion} fixture={fixture} />
                    ))}
                  </div>
                </div>
              )}

              {/* Öneriler boşsa bilgi mesajı */}
              {detail.data && !detailLoading && (!detail.data.betSuggestions || detail.data.betSuggestions.length === 0) && (
                <div className="p-3 rounded-xl bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">Öneriler yükleniyor veya bu maç için yeterli veri yok. Daha sonra tekrar deneyin.</span>
                  </div>
                </div>
              )}

              {/* Team Stats */}
              {detail.data.teamStats && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/15">
                    <p className="font-semibold mb-1.5 text-[11px] text-blue-500">{homeTeam.name.split(' ')[0]}</p>
                    <div className="space-y-0.5 text-muted-foreground text-[11px]">
                      <p>Gol: {typeof detail.data.teamStats.homeGoalsScored === 'number' ? detail.data.teamStats.homeGoalsScored.toFixed(2) : detail.data.teamStats.homeGoalsScored}/mac</p>
                      <p>CS: {detail.data.teamStats.homeCleanSheetRate?.toFixed(0) ?? detail.data.teamStats.homeCleanSheets}%</p>
                      <p>KG: {detail.data.teamStats.homeBttsRate?.toFixed(0) ?? '-'}%</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/15">
                    <p className="font-semibold mb-1.5 text-[11px] text-red-500">{awayTeam.name.split(' ')[0]}</p>
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
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/8 border border-amber-500/15">
                  <p className="font-semibold text-xs mb-2 text-amber-500">Kart Riski Yuksek</p>
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
      'w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-bold shadow-sm',
      result.toUpperCase() === 'W' ? 'bg-emerald-500 text-white shadow-emerald-500/30' :
      result.toUpperCase() === 'D' ? 'bg-gray-400 text-white shadow-gray-400/20' :
      result.toUpperCase() === 'L' ? 'bg-red-500 text-white shadow-red-500/30' :
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
