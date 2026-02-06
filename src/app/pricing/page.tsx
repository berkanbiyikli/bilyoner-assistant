/**
 * Pricing Page
 * Subscription tier comparison and upgrade
 */

'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { TIER_CONFIG, type SubscriptionTier } from '@/lib/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Crown, Shield, Sparkles, Check, Zap, ArrowRight } from 'lucide-react';

const TIERS: SubscriptionTier[] = ['free', 'pro', 'elite'];

export default function PricingPage() {
  const { user, tier } = useAuth();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-primary shadow-lg shadow-primary/25 mb-2">
          <Crown className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Olasiliklari <span className="gradient-text">Lehinize</span> Cevirin
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Duygularla degil, veriyle oynamanin zamani. 
          Planini sec, analitik ustunluge basi.
        </p>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {TIERS.map((tierKey) => {
          const config = TIER_CONFIG[tierKey];
          const isCurrent = tierKey === tier;
          const isPopular = tierKey === 'pro';
          const Icon = tierKey === 'elite' ? Crown : tierKey === 'pro' ? Shield : Sparkles;

          return (
            <Card key={tierKey} className={cn(
              'relative overflow-hidden transition-all',
              isPopular && 'border-primary/50 shadow-xl shadow-primary/10 scale-[1.02]',
              isCurrent && 'ring-2 ring-primary'
            )}>
              {isPopular && (
                <div className="absolute top-0 left-0 right-0 h-1 gradient-primary" />
              )}
              {isPopular && (
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg gradient-primary text-white text-[10px] font-bold">
                  POPULER
                </div>
              )}
              
              <CardContent className="p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      tierKey === 'elite' ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20' :
                      tierKey === 'pro' ? 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20' :
                      'bg-muted'
                    )}>
                      <Icon className={cn('h-5 w-5', config.color)} />
                    </div>
                    <span className={cn('text-xl font-bold', config.color)}>{config.name}</span>
                  </div>
                  
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">
                      {config.price > 0 ? config.price : 0}
                    </span>
                    <span className="text-lg font-bold text-muted-foreground">
                      {config.price > 0 ? 'TL' : ''}
                    </span>
                    {config.price > 0 && (
                      <span className="text-sm text-muted-foreground">/ay</span>
                    )}
                  </div>
                </div>

                <ul className="space-y-3">
                  {config.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Check className={cn('h-4 w-4 shrink-0 mt-0.5', config.color)} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button 
                    disabled
                    className="w-full py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground cursor-not-allowed"
                  >
                    Mevcut Planin
                  </button>
                ) : tierKey === 'free' ? (
                  <div className="h-12" /> 
                ) : !user ? (
                  <Link href="/auth/register" className="block">
                    <button className={cn(
                      'w-full py-3 rounded-xl text-sm font-semibold text-white shadow-lg flex items-center justify-center gap-2',
                      tierKey === 'elite' 
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20' 
                        : 'gradient-primary shadow-primary/20'
                    )}>
                      Basla <ArrowRight className="h-4 w-4" />
                    </button>
                  </Link>
                ) : (
                  <button className={cn(
                    'w-full py-3 rounded-xl text-sm font-semibold text-white shadow-lg flex items-center justify-center gap-2',
                    tierKey === 'elite' 
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20' 
                      : 'gradient-primary shadow-primary/20'
                  )}>
                    Yuksel <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Trust Section */}
      <div className="text-center space-y-4 pt-8">
        <h2 className="text-lg font-bold">Neden Kupon Muhendisi?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            { icon: Zap, title: 'Veri Odakli', desc: 'Poisson, Monte Carlo ve AI modelleri ile analiz' },
            { icon: Shield, title: 'Seffaf Basari', desc: 'Tum tahmin gecmisi halka acik, manipulasyon yok' },
            { icon: Crown, title: 'Zaman Kazanci', desc: 'Saatlerce analiz yerine 30 saniyede akilli tahmin' },
          ].map((item) => (
            <div key={item.title} className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 mb-1">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
