/**
 * Profile / Dashboard Page
 * User info, subscription tier, prediction history
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { TIER_CONFIG, type SubscriptionTier } from '@/lib/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { 
  User, Crown, Shield, Sparkles, TrendingUp, Target, 
  BarChart3, Calendar, Star, ArrowRight, Check, LogOut
} from 'lucide-react';

function TierCard({ 
  tierKey, 
  currentTier, 
  isActive 
}: { 
  tierKey: SubscriptionTier; 
  currentTier: SubscriptionTier;
  isActive: boolean;
}) {
  const config = TIER_CONFIG[tierKey];
  const isCurrent = tierKey === currentTier;
  
  return (
    <div className={cn(
      'relative p-4 rounded-2xl border-2 transition-all',
      isCurrent 
        ? `${config.borderColor} ${config.bgColor} shadow-lg` 
        : 'border-border/30 hover:border-border/60'
    )}>
      {isCurrent && (
        <span className={cn(
          'absolute -top-2.5 left-4 px-2 py-0.5 text-[10px] font-bold rounded-md text-white',
          tierKey === 'elite' ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
          tierKey === 'pro' ? 'bg-gradient-to-r from-blue-500 to-indigo-500' :
          'bg-muted-foreground'
        )}>
          Mevcut Plan
        </span>
      )}
      
      <div className="flex items-center gap-2 mb-3">
        {tierKey === 'elite' ? <Crown className="h-5 w-5 text-amber-500" /> :
         tierKey === 'pro' ? <Shield className="h-5 w-5 text-blue-500" /> :
         <Sparkles className="h-5 w-5 text-muted-foreground" />}
        <span className={cn('font-bold text-lg', config.color)}>{config.name}</span>
      </div>
      
      <p className="text-2xl font-extrabold mb-3">
        {config.price > 0 ? `${config.price} TL` : 'Ucretsiz'}
        {config.price > 0 && <span className="text-xs text-muted-foreground font-normal">/ay</span>}
      </p>
      
      <ul className="space-y-2 mb-4">
        {config.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <Check className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', config.color)} />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
      
      {!isCurrent && tierKey !== 'free' && (
        <button className={cn(
          'w-full py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm',
          tierKey === 'elite' 
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20' 
            : 'gradient-primary shadow-primary/20'
        )}>
          {tierKey === 'elite' ? 'Elite\'e Yuksel' : 'Pro\'ya Yuksel'}
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, profile, isLoading, tier, isPro, isElite, isSubscriptionActive, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const tierConfig = TIER_CONFIG[tier];
  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Kullanici';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Profile Header */}
      <div className="flex items-start gap-4">
        <div className={cn(
          'h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-bold border-2 shrink-0',
          tier === 'elite' ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-500/30' :
          tier === 'pro' ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white border-blue-500/30' :
          'bg-muted text-muted-foreground border-border'
        )}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={displayName} className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            displayName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold truncate">{displayName}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className={cn(
            'inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-xl text-xs font-bold',
            tierConfig.bgColor, tierConfig.color
          )}>
            {tier === 'elite' ? <Crown className="h-3.5 w-3.5" /> : 
             tier === 'pro' ? <Shield className="h-3.5 w-3.5" /> :
             <Sparkles className="h-3.5 w-3.5" />}
            {tierConfig.name} Uye
          </div>
        </div>
        <button 
          onClick={signOut}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/5 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Cikis</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Tahmin', value: '—', icon: Target, color: 'text-blue-500' },
          { label: 'Basari', value: '—', icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'Kupon', value: '—', icon: BarChart3, color: 'text-violet-500' },
          { label: 'Uyelik', value: tierConfig.name, icon: Star, color: tierConfig.color },
        ].map((stat) => (
          <Card key={stat.label} className="card-premium">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={cn('h-4 w-4', stat.color)} />
                <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <p className="text-xl font-extrabold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscription Plans */}
      <div>
        <h2 className="text-lg font-bold mb-4">Abonelik Planlari</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TierCard tierKey="free" currentTier={tier} isActive={isSubscriptionActive} />
          <TierCard tierKey="pro" currentTier={tier} isActive={isSubscriptionActive} />
          <TierCard tierKey="elite" currentTier={tier} isActive={isSubscriptionActive} />
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div>
        <h2 className="text-lg font-bold mb-4">Son Aktivite</h2>
        <Card className="card-premium">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-sm mb-1">Henuz aktivite yok</p>
            <p className="text-xs text-muted-foreground mb-4">
              Mac tahminleri ve kupon gecmisiniz burada gorunecek
            </p>
            <Link href="/">
              <Button variant="outline" size="sm" className="rounded-xl">
                <span className="flex items-center gap-2">
                  Maclara Git <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
