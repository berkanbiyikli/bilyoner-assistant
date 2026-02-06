/**
 * Auth Button - Navbar login/profile button
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { TIER_CONFIG } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import { 
  LogIn, User, LogOut, Crown, Settings, ChevronDown, 
  Sparkles, Shield
} from 'lucide-react';

export function AuthButton() {
  const { user, profile, isLoading, tier, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="h-8 w-8 rounded-xl bg-muted animate-pulse" />
    );
  }

  if (!user) {
    return (
      <Link href="/auth/login">
        <button className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl gradient-primary text-white text-xs font-semibold shadow-sm shadow-primary/20 hover:opacity-90 transition-opacity">
          <LogIn className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Giris Yap</span>
        </button>
      </Link>
    );
  }

  const tierConfig = TIER_CONFIG[tier];
  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Kullanici';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pr-2 rounded-xl hover:bg-muted/50 transition-colors"
      >
        {/* Avatar */}
        <div className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold border',
          tier === 'elite' ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-500/30' :
          tier === 'pro' ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white border-blue-500/30' :
          'bg-muted text-muted-foreground border-border'
        )}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={displayName} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            initials
          )}
        </div>
        
        {/* Tier badge - desktop only */}
        {tier !== 'free' && (
          <span className={cn(
            'hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-md',
            tierConfig.bgColor, tierConfig.color
          )}>
            {tierConfig.badge}
          </span>
        )}
        
        <ChevronDown className={cn(
          'h-3 w-3 text-muted-foreground transition-transform hidden sm:block',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-border/50 bg-card shadow-xl shadow-black/10 overflow-hidden z-50">
          {/* User info */}
          <div className="p-4 border-b border-border/50">
            <p className="font-semibold text-sm truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <div className={cn(
              'inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-lg text-[10px] font-bold',
              tierConfig.bgColor, tierConfig.color
            )}>
              {tier === 'elite' ? <Crown className="h-3 w-3" /> : 
               tier === 'pro' ? <Shield className="h-3 w-3" /> :
               <Sparkles className="h-3 w-3" />}
              {tierConfig.name} Uye
            </div>
          </div>

          {/* Menu */}
          <div className="p-1.5">
            <Link href="/profile" onClick={() => setIsOpen(false)}>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 text-sm transition-colors">
                <User className="h-4 w-4 text-muted-foreground" />
                Profilim
              </button>
            </Link>
            
            {tier === 'free' && (
              <Link href="/pricing" onClick={() => setIsOpen(false)}>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/5 text-sm transition-colors text-primary font-medium">
                  <Crown className="h-4 w-4" />
                  Pro&apos;ya Yuksel
                </button>
              </Link>
            )}
            
            <button 
              onClick={async () => { await signOut(); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/5 text-sm text-red-500 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cikis Yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
