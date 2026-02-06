/**
 * Supabase Database Types
 * Profiles, subscriptions, user activity
 */

export type SubscriptionTier = 'free' | 'pro' | 'elite';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          subscription_tier: SubscriptionTier;
          subscription_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          subscription_tier?: SubscriptionTier;
          subscription_expires_at?: string | null;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          subscription_tier?: SubscriptionTier;
          subscription_expires_at?: string | null;
          updated_at?: string;
        };
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          fixture_id: number;
          home_team: string;
          away_team: string;
          league: string;
          match_date: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          fixture_id: number;
          home_team: string;
          away_team: string;
          league: string;
          match_date: string;
        };
        Update: {};
      };
      user_predictions: {
        Row: {
          id: string;
          user_id: string;
          fixture_id: number;
          home_team: string;
          away_team: string;
          prediction_type: string;
          pick: string;
          odds: number;
          confidence: number;
          result: 'pending' | 'won' | 'lost' | 'void';
          created_at: string;
        };
        Insert: {
          user_id: string;
          fixture_id: number;
          home_team: string;
          away_team: string;
          prediction_type: string;
          pick: string;
          odds: number;
          confidence: number;
          result?: 'pending' | 'won' | 'lost' | 'void';
        };
        Update: {
          result?: 'pending' | 'won' | 'lost' | 'void';
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      subscription_tier: SubscriptionTier;
      prediction_result: 'pending' | 'won' | 'lost' | 'void';
    };
  };
}

// Helper types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type UserFavorite = Database['public']['Tables']['user_favorites']['Row'];
export type UserPrediction = Database['public']['Tables']['user_predictions']['Row'];

// Subscription tier configs
export const TIER_CONFIG = {
  free: {
    name: 'Ucretsiz',
    dailyPredictions: 3,
    features: [
      'Gunluk 3 standart tahmin',
      'Canli skorlar',
      'Temel mac bilgileri',
    ],
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-border',
    badge: null,
    price: 0,
  },
  pro: {
    name: 'Pro',
    dailyPredictions: -1, // unlimited
    features: [
      'Sinirsiz Poisson tahminleri',
      'Tum filtreler ve analizler',
      'H2H detayli karsilastirma',
      'Hakem istatistikleri',
      'Value bet sinyalleri',
      'Reklamsiz deneyim',
    ],
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    badge: 'PRO',
    price: 99,
  },
  elite: {
    name: 'Elite',
    dailyPredictions: -1, // unlimited
    features: [
      'Pro paketteki her sey',
      'Anlik Value bahis uyarilari',
      'Banko listesi (en yuksek guven)',
      'Ozel Telegram/Discord grubu',
      'Kisisel basari raporu',
      'Oncelikli destek',
    ],
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    badge: 'ELITE',
    price: 249,
  },
} as const;
