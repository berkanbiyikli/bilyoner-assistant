/**
 * Confidence Bar
 * Güven yüzdesini renkli progress bar olarak gösteren bileşen
 * 0-50: Kırmızı (Riskli)
 * 51-75: Sarı (Düşünülebilir)
 * 76-100: Yeşil (Yüksek Güven)
 */

'use client';

import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ConfidenceBarProps {
  confidence: number;
  advice?: string | null;
  factors?: {
    form?: number;
    h2h?: number;
    stats?: number;
    standings?: number;
  };
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBar({
  confidence,
  advice,
  factors,
  size = 'md',
  showLabel = true,
  className,
}: ConfidenceBarProps) {
  // Renk belirleme
  const getColorClasses = (value: number) => {
    if (value >= 76) {
      return {
        bar: 'bg-green-500',
        text: 'text-green-600',
        bg: 'bg-green-500/10',
        label: 'Yüksek Güven',
      };
    } else if (value >= 51) {
      return {
        bar: 'bg-yellow-500',
        text: 'text-yellow-600',
        bg: 'bg-yellow-500/10',
        label: 'Düşünülebilir',
      };
    } else {
      return {
        bar: 'bg-red-500',
        text: 'text-red-600',
        bg: 'bg-red-500/10',
        label: 'Riskli',
      };
    }
  };

  const colors = getColorClasses(confidence);

  // Boyut ayarları
  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const content = (
    <div className={cn('flex flex-col gap-1', className)}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className={cn('font-medium', textSizeClasses[size], colors.text)}>
            %{confidence}
          </span>
          <span className={cn('text-muted-foreground', size === 'sm' ? 'text-[10px]' : 'text-xs')}>
            {colors.label}
          </span>
        </div>
      )}
      <div className={cn('relative w-full rounded-full overflow-hidden bg-muted', sizeClasses[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
          style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
        />
      </div>
    </div>
  );

  // Faktörler varsa tooltip göster
  if (factors || advice) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px]">
            <div className="space-y-2">
              {advice && (
                <div className="font-medium text-sm">{advice}</div>
              )}
              {factors && (
                <div className="space-y-1.5 pt-1 border-t">
                  <div className="text-xs text-muted-foreground">Güven Faktörleri</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {factors.form !== undefined && (
                      <div className="flex justify-between">
                        <span>Form:</span>
                        <span className="font-medium">{factors.form}%</span>
                      </div>
                    )}
                    {factors.h2h !== undefined && (
                      <div className="flex justify-between">
                        <span>H2H:</span>
                        <span className="font-medium">{factors.h2h}%</span>
                      </div>
                    )}
                    {factors.stats !== undefined && (
                      <div className="flex justify-between">
                        <span>İstatistik:</span>
                        <span className="font-medium">{factors.stats}%</span>
                      </div>
                    )}
                    {factors.standings !== undefined && (
                      <div className="flex justify-between">
                        <span>Puan Durumu:</span>
                        <span className="font-medium">{factors.standings}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

/**
 * Kompakt güven badge'i
 */
interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const getColorClasses = (value: number) => {
    if (value >= 76) return 'bg-green-500/10 text-green-600 border-green-500/30';
    if (value >= 51) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
    return 'bg-red-500/10 text-red-600 border-red-500/30';
  };

  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
      getColorClasses(confidence),
      className
    )}>
      %{confidence}
    </span>
  );
}
