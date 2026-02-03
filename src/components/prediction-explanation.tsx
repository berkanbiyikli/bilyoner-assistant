/**
 * Prediction Explanation Component
 * AI gerekçelendirme paneli
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PredictionFactors } from '@/lib/prediction/types';
import type { BetSuggestion } from '@/types/api-football';
import { 
  generatePredictionExplanation, 
  generateBetExplanation,
  generateQuickSummary 
} from '@/lib/prediction/explanation-templates';
import { Lightbulb, TrendingUp, Brain, ChevronRight } from 'lucide-react';

interface PredictionExplanationProps {
  factors: PredictionFactors;
  homeTeam: string;
  awayTeam: string;
  suggestion?: BetSuggestion;
  variant?: 'full' | 'compact' | 'inline';
}

export function PredictionExplanation({
  factors,
  homeTeam,
  awayTeam,
  suggestion,
  variant = 'full',
}: PredictionExplanationProps) {
  const explanations = generatePredictionExplanation(factors, homeTeam, awayTeam, suggestion);
  const quickSummary = generateQuickSummary(factors, homeTeam, awayTeam);

  if (variant === 'inline') {
    return (
      <span className="text-xs text-muted-foreground">
        💡 {quickSummary}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
        <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-medium text-amber-700 dark:text-amber-400">Analiz: </span>
          <span className="text-muted-foreground">{explanations[0]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="h-4 w-4 text-amber-600" />
        <span className="font-semibold text-sm">AI Analiz</span>
        <Badge variant="outline" className="text-xs ml-auto">
          {quickSummary}
        </Badge>
      </div>

      <div className="space-y-2">
        {explanations.map((explanation, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <ChevronRight className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{explanation}</span>
          </div>
        ))}
      </div>

      {/* Faktör özeti */}
      <div className="mt-3 pt-3 border-t border-amber-500/20">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <FactorBadge 
            label="Form" 
            value={Math.round((factors.form.homeForm + factors.form.awayForm) / 2)}
            trend={factors.form.formDifference > 0 ? 'home' : factors.form.formDifference < 0 ? 'away' : 'neutral'}
          />
          <FactorBadge 
            label="H2H" 
            value={factors.h2h.totalMatches}
            suffix=" maç"
          />
          <FactorBadge 
            label="Gol Ort" 
            value={factors.h2h.avgGoals}
            decimal
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Tek bir bahis önerisi için açıklama
 */
export function BetExplanation({
  suggestion,
  factors,
  homeTeam,
  awayTeam,
}: {
  suggestion: BetSuggestion;
  factors: PredictionFactors;
  homeTeam: string;
  awayTeam: string;
}) {
  const explanation = generateBetExplanation(suggestion, factors, homeTeam, awayTeam);

  return (
    <div className="flex items-start gap-1.5 mt-1">
      <Lightbulb className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
      <span className="text-xs text-muted-foreground leading-relaxed">
        {explanation}
      </span>
    </div>
  );
}

/**
 * Faktör badge komponenti
 */
function FactorBadge({
  label,
  value,
  suffix = '',
  decimal = false,
  trend,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimal?: boolean;
  trend?: 'home' | 'away' | 'neutral';
}) {
  const displayValue = decimal ? value.toFixed(1) : value;
  
  return (
    <div className="flex flex-col items-center p-1.5 rounded bg-background/50">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        "font-medium",
        trend === 'home' && 'text-blue-600',
        trend === 'away' && 'text-red-600'
      )}>
        {displayValue}{suffix}
        {trend && trend !== 'neutral' && (
          <TrendingUp className={cn(
            "inline h-3 w-3 ml-0.5",
            trend === 'away' && 'rotate-180'
          )} />
        )}
      </span>
    </div>
  );
}

/**
 * Maç kartı için kısa özet
 */
export function QuickPredictionSummary({
  factors,
  homeTeam,
  awayTeam,
}: {
  factors: PredictionFactors;
  homeTeam: string;
  awayTeam: string;
}) {
  const summary = generateQuickSummary(factors, homeTeam, awayTeam);
  
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <Lightbulb className="h-3 w-3 text-amber-500" />
      {summary}
    </Badge>
  );
}
