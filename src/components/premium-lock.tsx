/**
 * Premium Lock Component
 * Overlays locked content with blur and upgrade CTA
 */

'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { TIER_CONFIG, type SubscriptionTier } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import { Lock, Crown, Sparkles } from 'lucide-react';

interface PremiumLockProps {
  /** Minimum tier required to view this content */
  requiredTier: 'pro' | 'elite';
  /** Content to render when user has access */
  children: React.ReactNode;
  /** Optional: show blurred preview instead of fully hidden */
  showPreview?: boolean;
  /** Optional: custom lock message */
  message?: string;
  /** Optional: compact mode for inline locks */
  compact?: boolean;
}

export function PremiumLock({ 
  requiredTier, 
  children, 
  showPreview = true, 
  message,
  compact = false 
}: PremiumLockProps) {
  const { user, tier, isPro, isElite } = useAuth();

  // Check access
  const hasAccess = requiredTier === 'pro' ? isPro : isElite;

  if (hasAccess) {
    return <>{children}</>;
  }

  const tierConfig = TIER_CONFIG[requiredTier];
  const defaultMessage = requiredTier === 'elite' 
    ? 'Bu ozellik Elite uyelerine ozeldir' 
    : 'Bu ozellik Pro uyelerine ozeldir';

  if (compact) {
    return (
      <div className="relative">
        {showPreview && (
          <div className="blur-sm pointer-events-none select-none opacity-50">
            {children}
          </div>
        )}
        <div className={cn(
          'flex items-center gap-2 p-2 rounded-lg border text-xs',
          tierConfig.bgColor, tierConfig.borderColor
        )}>
          <Lock className={cn('h-3 w-3', tierConfig.color)} />
          <span className="text-muted-foreground">{message || defaultMessage}</span>
          {!user ? (
            <Link href="/auth/login" className={cn('ml-auto font-semibold', tierConfig.color)}>
              Giris Yap
            </Link>
          ) : (
            <Link href="/pricing" className={cn('ml-auto font-semibold', tierConfig.color)}>
              Yuksel
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Blurred preview */}
      {showPreview && (
        <div className="blur-md pointer-events-none select-none opacity-40">
          {children}
        </div>
      )}
      
      {/* Lock overlay */}
      <div className={cn(
        'absolute inset-0 flex flex-col items-center justify-center p-6 text-center',
        showPreview ? 'bg-background/60 backdrop-blur-sm' : 'bg-card border border-border/50 rounded-2xl min-h-[200px]'
      )}>
        <div className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center mb-4',
          requiredTier === 'elite' 
            ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20' 
            : 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20'
        )}>
          {requiredTier === 'elite' 
            ? <Crown className="h-7 w-7 text-amber-500" />
            : <Sparkles className="h-7 w-7 text-blue-500" />
          }
        </div>
        
        <h3 className="font-bold text-base mb-1">
          {tierConfig.badge} Ozelligi
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
          {message || defaultMessage}
        </p>
        
        {!user ? (
          <div className="flex items-center gap-2">
            <Link href="/auth/login">
              <button className="px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold shadow-sm shadow-primary/20">
                Giris Yap
              </button>
            </Link>
            <Link href="/auth/register">
              <button className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted/50 transition-colors">
                Kayit Ol
              </button>
            </Link>
          </div>
        ) : (
          <Link href="/pricing">
            <button className={cn(
              'px-6 py-2.5 rounded-xl text-white text-xs font-semibold shadow-lg',
              requiredTier === 'elite' 
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20' 
                : 'gradient-primary shadow-primary/20'
            )}>
              {tierConfig.badge}&apos;ya Yuksel — {tierConfig.price} TL/ay
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Simple inline premium badge
 */
export function PremiumBadge({ tier }: { tier: 'pro' | 'elite' }) {
  const config = TIER_CONFIG[tier];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold',
      config.bgColor, config.color
    )}>
      <Lock className="h-2.5 w-2.5" />
      {config.badge}
    </span>
  );
}
