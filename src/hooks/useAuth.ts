/**
 * useAuth Hook
 * Client-side auth state management
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile, SubscriptionTier } from '@/lib/supabase/types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  tier: SubscriptionTier;
  isPro: boolean;
  isElite: boolean;
  isSubscriptionActive: boolean;
  isConfigured: boolean;
}

export function useAuth(): AuthState & {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data as Profile);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // Get initial session
    const getSession = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      }
      setIsLoading(false);
    };
    
    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          await fetchProfile(currentUser.id);
        } else {
          setProfile(null);
        }
        
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = async () => {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const tier: SubscriptionTier = profile?.subscription_tier ?? 'free';
  
  // Check if subscription is still active
  const isSubscriptionActive = !profile?.subscription_expires_at || 
    new Date(profile.subscription_expires_at) > new Date();

  const effectiveTier = isSubscriptionActive ? tier : 'free';

  return {
    user,
    profile,
    isLoading,
    tier: effectiveTier,
    isPro: effectiveTier === 'pro' || effectiveTier === 'elite',
    isElite: effectiveTier === 'elite',
    isSubscriptionActive,
    isConfigured: isSupabaseConfigured,
    signOut,
    refreshProfile,
  };
}
