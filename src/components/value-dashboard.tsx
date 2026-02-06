'use client';

/**
 * Value Dashboard - Günün Fırsatları
 * Shows categorized matches: Bankolar, Value, Gollü, KG Var
 * With smart sorting and auto coupon generator
 */

import React from 'react';
import { 
  Trophy, 
  TrendingUp, 
  Goal, 
  Target,
  ArrowUpDown,
  Sparkles,
  Clock,
  ChevronRight,
  Zap,
  AlertCircle,
  Plus,
  Check,
  Activity,
  Dice1,
  Shield,
  Swords,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useScannerStore } from '@/lib/stores/scanner-store';
import { useCouponStore } from '@/lib/coupon/store';
import type { RiskCategory } from '@/lib/coupon/types';
import type { MatchAnalysis, SortType } from '@/lib/prediction/scanner';
import { STYLE_DESCRIPTIONS, getConfidenceEmoji } from '@/lib/analysis';
import Link from 'next/link';

// Stil renkleri
const STYLE_COLORS = {
  OFFENSIVE: 'text-red-500',
  COUNTER: 'text-blue-500',
  DEFENSIVE: 'text-green-500',
  CHAOTIC: 'text-orange-500'
};

// ============ MATCH CARD COMPONENT ============

interface ValueMatchCardProps {
  match: MatchAnalysis;
}

function ValueMatchCard({ match }: ValueMatchCardProps) {
  const { addSelection, isInCoupon } = useCouponStore();
  
  const kickoffTime = new Date(match.kickoff).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const bestBet = match.valueBets[0];
  
  // Kupona ekleme handler'ı
  const handleAddToCoupon = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!bestBet) return;
    
    // Risk kategorisini belirle
    const getRiskCategory = (): RiskCategory => {
      if (match.isBanko && match.confidenceScore >= 70) return 'banko';
      if (match.isValue) return 'value';
      return 'surprise';
    };
    
    const kickoffDate = new Date(match.kickoff);
    
    addSelection({
      fixtureId: match.fixtureId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      date: kickoffDate.toLocaleDateString('tr-TR'),
      time: kickoffTime,
      market: bestBet.market,
      pick: bestBet.market,
      odds: bestBet.bookmakerOdds,
      confidence: match.confidenceScore,
      category: getRiskCategory(),
    });
  };
  
  const inCoupon = bestBet ? isInCoupon(match.fixtureId, bestBet.market) : false;
  
  return (
    <Link href={`/match/${match.fixtureId}`}>
      <Card className={`hover:bg-accent/50 transition-all duration-300 cursor-pointer border-l-4 border-l-primary/50 group rounded-2xl border-border/50 hover:shadow-md ${inCoupon ? 'ring-2 ring-primary/50' : ''}`}>
        <CardContent className="p-4">
          {/* Header: Time & League */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{kickoffTime}</span>
              <span>•</span>
              <span className="truncate max-w-[150px]">{match.league}</span>
            </div>
            <div className="flex gap-1 items-center">
              {match.isBanko && (
                <Badge variant="default" className="bg-green-600 text-xs rounded-lg">
                  <Trophy className="h-3 w-3 mr-1" />
                  Banko
                </Badge>
              )}
              {match.isValue && !match.isBanko && (
                <Badge variant="secondary" className="text-xs rounded-lg">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Value
                </Badge>
              )}
              {/* Kupona Ekle Butonu */}
              {bestBet && (
                <Button
                  variant={inCoupon ? "default" : "outline"}
                  size="sm"
                  className="h-6 w-6 p-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleAddToCoupon}
                >
                  {inCoupon ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                </Button>
              )}
            </div>
          </div>
          
          {/* Teams */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <p className="font-medium text-sm">{match.homeTeam}</p>
              <p className="font-medium text-sm text-muted-foreground">{match.awayTeam}</p>
            </div>
            
            {/* Best Bet */}
            {bestBet && (
              <div className="text-right">
                <Badge variant="outline" className="font-mono mb-1">
                  {bestBet.market} @ {bestBet.bookmakerOdds.toFixed(2)}
                </Badge>
                <p className="text-xs text-green-600 font-medium">
                  +{bestBet.value.toFixed(0)}% value
                </p>
              </div>
            )}
          </div>
          
          {/* AI Summary */}
          <div className="flex items-start gap-2 p-2.5 bg-muted/30 rounded-xl border border-border/20">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {match.aiSummary}
            </p>
          </div>
          
          {/* Style Analysis & Monte Carlo */}
          {(match.styleAnalysis || match.monteCarloResult) && (
            <div className="mt-2 p-2.5 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20">
              <div className="flex items-center justify-between">
                {/* Stil Eşleşmesi */}
                {match.styleAnalysis && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={STYLE_COLORS[match.styleAnalysis.homeProfile.style]}>
                      {STYLE_DESCRIPTIONS[match.styleAnalysis.homeProfile.style].emoji}
                    </span>
                    <span className="text-muted-foreground">vs</span>
                    <span className={STYLE_COLORS[match.styleAnalysis.awayProfile.style]}>
                      {STYLE_DESCRIPTIONS[match.styleAnalysis.awayProfile.style].emoji}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {STYLE_DESCRIPTIONS[match.styleAnalysis.homeProfile.style].name} vs {STYLE_DESCRIPTIONS[match.styleAnalysis.awayProfile.style].name}
                    </span>
                  </div>
                )}
                
                {/* Monte Carlo Sonucu */}
                {match.monteCarloResult && (
                  <div className="flex items-center gap-2 text-xs">
                    <Activity className="h-3 w-3 text-purple-500" />
                    <span className="text-muted-foreground">
                      {getConfidenceEmoji(match.monteCarloResult.confidenceLevel)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      σ={match.monteCarloResult.stdDeviation.toFixed(2)}
                    </span>
                    {match.monteCarloResult.topScores[0] && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {match.monteCarloResult.topScores[0].score}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              
              {/* Risk Uyarısı */}
              {match.riskWarning && (
                <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {match.riskWarning}
                </p>
              )}
            </div>
          )}
          
          {/* Stats Bar */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                Güven: <span className="text-foreground font-medium">{match.confidenceScore.toFixed(0)}%</span>
              </span>
              <span className="text-muted-foreground">
                Ü2.5: <span className="text-foreground font-medium">{(match.goalProbability * 100).toFixed(0)}%</span>
              </span>
              <span className="text-muted-foreground">
                KG: <span className="text-foreground font-medium">{(match.bttsProb * 100).toFixed(0)}%</span>
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============ SORT SELECTOR ============

interface SortSelectorProps {
  value: SortType;
  onChange: (value: SortType) => void;
}

function SortSelector({ value, onChange }: SortSelectorProps) {
  const options: { value: SortType; label: string }[] = [
    { value: 'confidence', label: 'Güven' },
    { value: 'value', label: 'Value' },
    { value: 'goals', label: 'Gol' },
    { value: 'btts', label: 'KG' },
    { value: 'kickoff', label: 'Saat' }
  ];
  
  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
      <div className="flex gap-1">
        {options.map(opt => (
          <Button
            key={opt.value}
            variant={value === opt.value ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2 text-xs rounded-lg"
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ============ COUPON PREVIEW ============

function CouponPreview() {
  const coupon = useScannerStore(state => state.coupon);
  const generateNewCoupon = useScannerStore(state => state.generateNewCoupon);
  const clearCoupon = useScannerStore(state => state.clearCoupon);
  
  if (!coupon || coupon.matches.length === 0) {
    return (
      <Card className="border-dashed rounded-2xl border-border/50">
        <CardContent className="p-4 text-center">
          <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Otomatik kupon oluştur
          </p>
          <Button onClick={generateNewCoupon} size="sm" className="rounded-xl">
            <Sparkles className="h-4 w-4 mr-2" />
            Kupon Oluştur
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-primary/50 rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Akıllı Kupon
          </span>
          <Badge variant={coupon.riskLevel === 'low' ? 'secondary' : coupon.riskLevel === 'high' ? 'destructive' : 'default'}>
            {coupon.riskLevel === 'low' ? 'Düşük Risk' : coupon.riskLevel === 'high' ? 'Yüksek Risk' : 'Orta Risk'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2 mb-3">
          {coupon.matches.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate max-w-[180px]">
                {m.homeTeam} - {m.awayTeam}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {m.selection}
                </Badge>
                <span className="font-medium">{m.odds.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Toplam Oran</p>
            <p className="font-bold text-lg">{coupon.totalOdds.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Beklenen Değer</p>
            <p className={`font-bold text-lg ${coupon.expectedValue > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {coupon.expectedValue > 0 ? '+' : ''}{coupon.expectedValue.toFixed(1)}%
            </p>
          </div>
        </div>
        
        {coupon.suggestedStake > 0 && (
          <div className="mt-3 p-2.5 bg-muted/30 rounded-xl border border-border/20">
            <p className="text-xs text-muted-foreground">
              Önerilen Bahis: <span className="font-medium text-foreground">{coupon.suggestedStake} ₺</span>
            </p>
          </div>
        )}
        
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={clearCoupon}>
            Temizle
          </Button>
          <Button size="sm" className="flex-1 rounded-xl" onClick={generateNewCoupon}>
            Yenile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ MAIN DASHBOARD ============

export function ValueDashboard() {
  const result = useScannerStore(state => state.result);
  const isScanning = useScannerStore(state => state.isScanning);
  const activeTab = useScannerStore(state => state.activeTab);
  const sortBy = useScannerStore(state => state.sortBy);
  const setActiveTab = useScannerStore(state => state.setActiveTab);
  const setSortBy = useScannerStore(state => state.setSortBy);
  const getSortedMatches = useScannerStore(state => state.getSortedMatches);
  
  // Get sorted matches based on active tab
  const matches = getSortedMatches();
  
  if (isScanning) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 animate-pulse" />
            Maçlar Taranıyor...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!result) {
    return (
      <Card className="border-dashed rounded-2xl border-border/50">
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Henüz tarama yapılmadı. Maçlar yüklendiğinde otomatik taranacak.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const tabCounts = {
    banko: result.banko.length,
    value: result.value.length,
    highScoring: result.highScoring.length,
    btts: result.btts.length,
    all: result.all.length
  };
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Target className="h-5 w-5 text-primary" />
            </div>
            Günün Fırsatları
          </h2>
          <p className="text-sm text-muted-foreground">
            {result.totalMatches} maç tarandı • {new Date(result.scannedAt).toLocaleTimeString('tr-TR')}
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <Tabs 
            value={activeTab} 
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          >
            <TabsList className="grid w-full grid-cols-5 rounded-xl">
              <TabsTrigger value="banko" className="text-xs rounded-lg">
                <Trophy className="h-3 w-3 mr-1" />
                Banko ({tabCounts.banko})
              </TabsTrigger>
              <TabsTrigger value="value" className="text-xs rounded-lg">
                <TrendingUp className="h-3 w-3 mr-1" />
                Value ({tabCounts.value})
              </TabsTrigger>
              <TabsTrigger value="highScoring" className="text-xs rounded-lg">
                <Goal className="h-3 w-3 mr-1" />
                Gollü ({tabCounts.highScoring})
              </TabsTrigger>
              <TabsTrigger value="btts" className="text-xs rounded-lg">
                <Target className="h-3 w-3 mr-1" />
                KG ({tabCounts.btts})
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs rounded-lg">
                Tümü ({tabCounts.all})
              </TabsTrigger>
            </TabsList>
            
            {/* Sort Selector */}
            <div className="my-3">
              <SortSelector value={sortBy} onChange={setSortBy} />
            </div>
            
            {/* Match List */}
            <TabsContent value={activeTab} className="mt-0">
              <ScrollArea className="h-[600px]">
                {matches.length === 0 ? (
                  <Card className="border-dashed rounded-2xl border-border/50">
                    <CardContent className="p-8 text-center">
                      <p className="text-muted-foreground">
                        Bu kategoride maç bulunamadı.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3 pr-4">
                    {matches.map(match => (
                      <ValueMatchCard key={match.fixtureId} match={match} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Sidebar: Coupon Generator */}
        <div className="space-y-4">
          <CouponPreview />
          
          {/* Quick Stats */}
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Hızlı İstatistik</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ortalama Value</span>
                <span className="font-medium">
                  {result.value.length > 0 
                    ? `+${(result.value.reduce((s, m) => s + m.valueScore, 0) / result.value.length).toFixed(1)}%`
                    : '-'
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ortalama Güven</span>
                <span className="font-medium">
                  {result.all.length > 0 
                    ? `${(result.all.reduce((s, m) => s + m.confidenceScore, 0) / result.all.length).toFixed(0)}%`
                    : '-'
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gollü Maç Oranı</span>
                <span className="font-medium">
                  {result.all.length > 0 
                    ? `${((result.highScoring.length / result.all.length) * 100).toFixed(0)}%`
                    : '-'
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ValueDashboard;
