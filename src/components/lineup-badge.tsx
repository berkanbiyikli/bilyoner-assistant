/**
 * Lineup Badge
 * Kadro durumunu gösteren rozet
 * ✅ Yeşil: Kadro açıklandı
 * ⏳ Turuncu: Kadro bekleniyor
 */

'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CheckCircle, Clock } from 'lucide-react';

interface LineupBadgeProps {
  available: boolean;
  className?: string;
  showText?: boolean;
}

export function LineupBadge({ available, className, showText = false }: LineupBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
              available
                ? 'bg-green-500/10 text-green-600'
                : 'bg-orange-500/10 text-orange-600',
              className
            )}
          >
            {available ? (
              <>
                <CheckCircle className="h-3 w-3" />
                {showText && <span>Kadro Açıklandı</span>}
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                {showText && <span>Kadro Bekleniyor</span>}
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          {available
            ? '✅ Kadro açıklandı - Analiz daha güvenilir'
            : '⏳ Kadro henüz açıklanmadı'
          }
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
