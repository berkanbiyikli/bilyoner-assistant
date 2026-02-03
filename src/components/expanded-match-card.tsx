/**
 * Expanded Match Card
 * Genişletilebilir maç kartı - tıklandığında detaylar gösterilir
 * Canlı maçlarda pulse animasyonu ve otomatik açık başlar
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge, ConfidenceBar } from '@/components/confidence-bar';
import { RefereeStatsCard, RefereeStatsSkeleton } from '@/components/referee-stats-card';
import { LineupBadge } from '@/components/lineup-badge';
import { FavoriteButton } from '@/components/favorite-button';
import { useMatchDetail } from '@/hooks/useDailyMatches';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import { ChevronDown, ChevronUp, TrendingUp, Target, Zap, AlertTriangle, BarChart3, DollarSign, Plus, Check } from 'lucide-react';
import { cn, formatTurkeyDate, formatTurkeyTime } from '@/lib/utils';
import { useCouponStore } from '@/lib/coupon/store';
import type { RiskCategory } from '@/lib/coupon/types';

// Bahis öneri kartı bileşeni - Kupona ekleme özellikli
interface BetSuggestionCardProps {
  suggestion: BetSuggestion;
  fixture: DailyMatchFixture;
}

function BetSuggestionCard({ suggestion, fixture }: BetSuggestionCardProps) {
  const { addSelection, isInCoupon } = useCouponStore();
  const inCoupon = isInCoupon(fixture.id, suggestion.market);
  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'goals': return '⚽';
      case 'cards': return '🟨';
      case 'btts': return '🥅';
      case 'result': return '🏆';
      case 'htft': return '⏱️';
      default: return '📊';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-green-500 bg-green-500/10 border-green-500/30';
    if (confidence >= 50) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    return 'text-red-500 bg-red-500/10 border-red-500/30';
  };

  const getValueColor = (value?: string) => {
    if (value === 'high') return 'bg-green-500 text-white';
    if (value === 'medium') return 'bg-yellow-500 text-black';
    return 'bg-gray-500 text-white';
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
      'flex items-center justify-between p-2 rounded-md border text-sm group',
      getConfidenceColor(suggestion.confidence),
      inCoupon && 'ring-2 ring-primary'
    )}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span>{getTypeIcon(suggestion.type)}</span>
        <div className="min-w-0">
          <div className="font-medium truncate">{suggestion.market}: {suggestion.pick}</div>
          <div className="text-xs opacity-75 truncate">{suggestion.reasoning}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge className={cn('text-xs', getValueColor(suggestion.value))}>
          {suggestion.value === 'high' ? '🔥' : suggestion.value === 'medium' ? '⭐' : '•'}
        </Badge>
        <span className="font-bold">%{suggestion.confidence}</span>
        <span className="font-mono text-xs bg-background/50 px-1.5 py-0.5 rounded">
          {suggestion.odds.toFixed(2)}
        </span>
        <Button
          size="sm"
          variant={inCoupon ? "default" : "outline"}
          className={cn(
            "h-7 w-7 p-0",
            inCoupon ? "bg-primary" : "opacity-0 group-hover:opacity-100 transition-opacity"
          )}
          onClick={handleAddToCoupon}
          disabled={inCoupon}
        >
          {inCoupon ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </Button>
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
  
  // Canlı maçlar otomatik açık başlar
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? status.isLive);
  
  // On-demand detail fetch (leagueId ile sezon istatistikleri de gelir)
  const { data: detail, isLoading: detailLoading } = useMatchDetail(
    fixture.id,
    homeTeam.id,
    awayTeam.id,
    league.id,
    referee?.name,
    isExpanded
  );

  // Canlı maç durumu değişirse güncelle
  useEffect(() => {
    if (status.isLive && !isExpanded) {
      setIsExpanded(true);
    }
  }, [status.isLive, isExpanded]);

  return (
    <Card 
      className={cn(
        'transition-all duration-200',
        status.isLive && 'ring-2 ring-green-500 animate-pulse-border',
        isExpanded && 'shadow-lg'
      )}
    >
      {/* Header - Her zaman görünür */}
      <div 
        className={cn(
          'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors',
          status.isLive && 'bg-green-50 dark:bg-green-950/20'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Saat / Canlı Badge */}
        <div className="w-14 flex-shrink-0 text-center">
          {status.isLive ? (
            <div className="flex flex-col items-center">
              <Badge className="bg-red-600 text-white animate-pulse text-xs">
                {status.elapsed}&apos;
              </Badge>
            </div>
          ) : status.isFinished ? (
            <Badge variant="secondary" className="text-xs">MS</Badge>
          ) : (
            <span className="font-medium text-sm">{time}</span>
          )}
        </div>

        {/* Takımlar ve Skor */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {homeTeam.logo && (
              <Image 
                src={homeTeam.logo} 
                alt={homeTeam.name}
                width={20}
                height={20}
                className="object-contain flex-shrink-0"
              />
            )}
            <span className="font-medium text-sm truncate flex-1">{homeTeam.name}</span>
            <span className={cn(
              'font-bold w-6 text-center',
              status.isLive && 'text-green-600'
            )}>
              {score.home ?? '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {awayTeam.logo && (
              <Image 
                src={awayTeam.logo} 
                alt={awayTeam.name}
                width={20}
                height={20}
                className="object-contain flex-shrink-0"
              />
            )}
            <span className="font-medium text-sm truncate flex-1">{awayTeam.name}</span>
            <span className={cn(
              'font-bold w-6 text-center',
              status.isLive && 'text-green-600'
            )}>
              {score.away ?? '-'}
            </span>
          </div>
        </div>

        {/* Quick Info Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tahmin Confidence (varsa) */}
          {fixture.prediction?.confidence && (
            <ConfidenceBadge confidence={fixture.prediction.confidence} />
          )}
          
          {/* Expand/Collapse Icon */}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3 border-t">
          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {detail?.data?.lineupsAvailable !== undefined && (
                <LineupBadge available={detail.data.lineupsAvailable} />
              )}
              {referee?.name && (
                <span className="text-xs text-muted-foreground">
                  👨‍⚖️ {referee.name}
                </span>
              )}
            </div>
            <FavoriteButton 
              matchId={fixture.id}
              matchData={{
                id: fixture.id,
                homeTeam: homeTeam.name,
                awayTeam: awayTeam.name,
                league: league.name,
                date: fixture.date,
                time: time,
              }}
            />
          </div>

          {/* Loading State */}
          {detailLoading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {/* Detail Content */}
          {detail?.data && !detailLoading && (
            <div className="space-y-3">
              {/* Tahmin ve Güven */}
              {detail.data.prediction && (
                <div className="p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Tahmin</span>
                    </div>
                    {detail.data.prediction.winner && (
                      <Badge variant="outline">{detail.data.prediction.winner}</Badge>
                    )}
                  </div>
                  <ConfidenceBar 
                    confidence={detail.data.prediction.confidence}
                    advice={detail.data.prediction.advice}
                    size="sm"
                  />
                  {detail.data.prediction.goalsAdvice && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Gol: {detail.data.prediction.goalsAdvice}
                    </div>
                  )}
                </div>
              )}

              {/* Form Karşılaştırma */}
              {detail.data.formComparison && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Ev Sahibi Form</div>
                    <div className="flex gap-0.5">
                      {detail.data.formComparison.homeLast5.map((result, i) => (
                        <FormBadge key={i} result={result} />
                      ))}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Deplasman Form</div>
                    <div className="flex gap-0.5">
                      {detail.data.formComparison.awayLast5.map((result, i) => (
                        <FormBadge key={i} result={result} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* H2H Özeti */}
              {detail.data.h2hSummary && (
                <div className="p-2 rounded-lg bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-2">Karşılıklı ({detail.data.h2hSummary.totalMatches} maç)</div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <div className="font-bold text-blue-600">{detail.data.h2hSummary.homeWins}</div>
                      <div className="text-xs text-muted-foreground">{homeTeam.name.split(' ')[0]}</div>
                    </div>
                    <div>
                      <div className="font-bold text-gray-600">{detail.data.h2hSummary.draws}</div>
                      <div className="text-xs text-muted-foreground">Berabere</div>
                    </div>
                    <div>
                      <div className="font-bold text-red-600">{detail.data.h2hSummary.awayWins}</div>
                      <div className="text-xs text-muted-foreground">{awayTeam.name.split(' ')[0]}</div>
                    </div>
                  </div>
                  {detail.data.h2hSummary.lastMatch && (
                    <div className="mt-2 text-xs text-muted-foreground text-center">
                      Son: {detail.data.h2hSummary.lastMatch}
                    </div>
                  )}
                </div>
              )}

              {/* Hakem İstatistikleri */}
              {detail.data.refereeStats && (
                <RefereeStatsCard referee={detail.data.refereeStats} variant="compact" />
              )}

              {/* 📊 POISSON TAHMİNİ - YENİ */}
              {detail.data.poissonAnalysis && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold text-sm">Poisson Analizi (Bilimsel Tahmin)</span>
                  </div>
                  
                  {/* xG ve En Olası Skor */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-2 rounded bg-blue-500/10">
                      <div className="text-lg font-bold text-blue-600">
                        {detail.data.poissonAnalysis.expectedHomeGoals?.toFixed(2) ?? '-'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Ev xG</div>
                    </div>
                    <div className="text-center p-2 rounded bg-purple-500/10">
                      <div className="text-lg font-bold text-purple-600">
                        {detail.data.poissonAnalysis.mostLikelyScore}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Tahmini Skor</div>
                    </div>
                    <div className="text-center p-2 rounded bg-red-500/10">
                      <div className="text-lg font-bold text-red-600">
                        {detail.data.poissonAnalysis.expectedAwayGoals?.toFixed(2) ?? '-'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Dep xG</div>
                    </div>
                  </div>

                  {/* Olasılıklar */}
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div className="text-center p-1 rounded bg-muted/50">
                      <div className="font-bold">{detail.data.poissonAnalysis.probabilities?.homeWin?.toFixed(0) ?? '-'}%</div>
                      <div className="text-muted-foreground">1</div>
                    </div>
                    <div className="text-center p-1 rounded bg-muted/50">
                      <div className="font-bold">{detail.data.poissonAnalysis.probabilities?.draw?.toFixed(0) ?? '-'}%</div>
                      <div className="text-muted-foreground">X</div>
                    </div>
                    <div className="text-center p-1 rounded bg-muted/50">
                      <div className="font-bold">{detail.data.poissonAnalysis.probabilities?.awayWin?.toFixed(0) ?? '-'}%</div>
                      <div className="text-muted-foreground">2</div>
                    </div>
                    <div className="text-center p-1 rounded bg-muted/50">
                      <div className="font-bold">{detail.data.poissonAnalysis.probabilities?.over25?.toFixed(0) ?? '-'}%</div>
                      <div className="text-muted-foreground">Ü2.5</div>
                    </div>
                  </div>

                  {/* Top 3 Skor */}
                  {detail.data.poissonAnalysis.topScores && detail.data.poissonAnalysis.topScores.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground">Olası Skorlar:</span>
                      {detail.data.poissonAnalysis.topScores.slice(0, 3).map((s: { score: string; probability: number }, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px] py-0">
                          {s.score} (%{s.probability?.toFixed(0) ?? '-'})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 💰 VALUE BET ANALİZİ - YENİ */}
              {detail.data.valueBets && detail.data.valueBets.count > 0 && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span className="font-semibold text-sm">Value Bahisler</span>
                    </div>
                    <Badge className="bg-green-500 text-white text-[10px]">
                      {detail.data.valueBets.count} Value
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {detail.data.valueBets.bets?.slice(0, 3).map((bet: {
                      market: string;
                      pick: string;
                      value: number;
                      edge: number;
                      fairOdds: number;
                      kellyStake: number;
                      recommendation: string;
                    }, idx: number) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex items-center justify-between p-2 rounded text-xs",
                          bet.recommendation === 'strong_bet' && "bg-green-500/20 border border-green-500/40",
                          bet.recommendation === 'bet' && "bg-green-500/10 border border-green-500/20",
                          bet.recommendation === 'consider' && "bg-yellow-500/10 border border-yellow-500/20",
                        )}
                      >
                        <div>
                          <span className="font-medium">{bet.market}</span>
                          <span className="text-muted-foreground"> - {bet.pick}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 font-bold">+{bet.value?.toFixed(0) ?? 0}%</span>
                          <span className="text-muted-foreground text-[10px]">
                            Kelly: {bet.kellyStake?.toFixed(1) ?? 0}%
                          </span>
                          {bet.recommendation === 'strong_bet' && <span>🔥</span>}
                          {bet.recommendation === 'bet' && <span>✅</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 🎯 BAHİS ÖNERİLERİ */}
              {detail.data.betSuggestions && detail.data.betSuggestions.length > 0 && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    <span className="font-semibold text-sm">Bahis Önerileri</span>
                    <span className="text-xs text-muted-foreground">(tıklayarak kupona ekle)</span>
                  </div>
                  <div className="space-y-2">
                    {detail.data.betSuggestions.slice(0, 6).map((suggestion: BetSuggestion, idx: number) => (
                      <BetSuggestionCard key={idx} suggestion={suggestion} fixture={fixture} />
                    ))}
                  </div>
                </div>
              )}

              {/* Takım Gol İstatistikleri - Ağırlıklı Ortalama */}
              {detail.data.teamStats && (
                <div className="space-y-2">
                  {/* Ağırlık Bilgisi */}
                  {detail.data.teamStats.weights && (
                    <div className="text-[10px] text-muted-foreground text-center">
                      📊 Sezon %{Math.round(detail.data.teamStats.weights.SEASON * 100)} + Form %{Math.round(detail.data.teamStats.weights.FORM * 100)} ağırlıklı
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <div className="font-medium mb-1">{homeTeam.name.split(' ')[0]}</div>
                      <div className="space-y-0.5 text-muted-foreground">
                        <div>⚽ Gol ort: {typeof detail.data.teamStats.homeGoalsScored === 'number' ? detail.data.teamStats.homeGoalsScored.toFixed(2) : detail.data.teamStats.homeGoalsScored}/maç</div>
                        <div>🛡️ CS: {detail.data.teamStats.homeCleanSheetRate?.toFixed(0) ?? detail.data.teamStats.homeCleanSheets}%</div>
                        <div>🥅 KG: {detail.data.teamStats.homeBttsRate?.toFixed(0) ?? '-'}%</div>
                        <div>🟨 Kart: {typeof detail.data.teamStats.homeAvgCards === 'number' ? detail.data.teamStats.homeAvgCards.toFixed(1) : detail.data.teamStats.homeAvgCards}/maç</div>
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <div className="font-medium mb-1">{awayTeam.name.split(' ')[0]}</div>
                      <div className="space-y-0.5 text-muted-foreground">
                        <div>⚽ Gol ort: {typeof detail.data.teamStats.awayGoalsScored === 'number' ? detail.data.teamStats.awayGoalsScored.toFixed(2) : detail.data.teamStats.awayGoalsScored}/maç</div>
                        <div>🛡️ CS: {detail.data.teamStats.awayCleanSheetRate?.toFixed(0) ?? detail.data.teamStats.awayCleanSheets}%</div>
                        <div>🥅 KG: {detail.data.teamStats.awayBttsRate?.toFixed(0) ?? '-'}%</div>
                        <div>🟨 Kart: {typeof detail.data.teamStats.awayAvgCards === 'number' ? detail.data.teamStats.awayAvgCards.toFixed(1) : detail.data.teamStats.awayAvgCards}/maç</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 🟨 OYUNCU KART RİSKLERİ */}
              {detail.data.playerCards && (detail.data.playerCards.home.length > 0 || detail.data.playerCards.away.length > 0) && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🟨</span>
                    <span className="font-semibold text-sm">Kart Riski Yüksek Oyuncular</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Ev Sahibi */}
                    <div className="space-y-1">
                      <div className="font-medium text-blue-500">{homeTeam.name.split(' ')[0]}</div>
                      {detail.data.playerCards.home.slice(0, 3).map((player, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1 rounded bg-muted/50">
                          <span className="truncate">{player.playerName.split(' ').pop()}</span>
                          <span className="flex items-center gap-1 text-yellow-600 font-medium">
                            {player.totalCards}🟨
                            <span className="text-muted-foreground">({Math.round(player.cardRate * 100)}%)</span>
                          </span>
                        </div>
                      ))}
                      {detail.data.playerCards.home.length === 0 && (
                        <div className="text-muted-foreground italic">Veri yok</div>
                      )}
                    </div>
                    {/* Deplasman */}
                    <div className="space-y-1">
                      <div className="font-medium text-red-500">{awayTeam.name.split(' ')[0]}</div>
                      {detail.data.playerCards.away.slice(0, 3).map((player, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1 rounded bg-muted/50">
                          <span className="truncate">{player.playerName.split(' ').pop()}</span>
                          <span className="flex items-center gap-1 text-yellow-600 font-medium">
                            {player.totalCards}🟨
                            <span className="text-muted-foreground">({Math.round(player.cardRate * 100)}%)</span>
                          </span>
                        </div>
                      ))}
                      {detail.data.playerCards.away.length === 0 && (
                        <div className="text-muted-foreground italic">Veri yok</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hakem bilgisi yükleniyorsa */}
          {detailLoading && referee?.name && (
            <RefereeStatsSkeleton />
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Form Badge (W/D/L)
 */
function FormBadge({ result }: { result: string }) {
  const getFormColor = (r: string) => {
    switch (r.toUpperCase()) {
      case 'W': return 'bg-green-500 text-white';
      case 'D': return 'bg-gray-400 text-white';
      case 'L': return 'bg-red-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <span className={cn(
      'w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold',
      getFormColor(result)
    )}>
      {result.toUpperCase()}
    </span>
  );
}

/**
 * Skeleton version
 */
export function ExpandedMatchCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="w-14 h-6" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="w-10 h-6" />
      </div>
    </Card>
  );
}

// CSS for pulse border animation (add to globals.css)
// @keyframes pulse-border {
//   0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
//   50% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
// }
// .animate-pulse-border { animation: pulse-border 2s infinite; }
