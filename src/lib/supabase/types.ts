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
      bankroll_transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'deposit' | 'withdraw' | 'bet' | 'win' | 'loss' | 'bonus';
          amount: number;
          balance_after: number;
          description: string | null;
          fixture_id: number | null;
          prediction_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: 'deposit' | 'withdraw' | 'bet' | 'win' | 'loss' | 'bonus';
          amount: number;
          balance_after: number;
          description?: string | null;
          fixture_id?: number | null;
          prediction_id?: string | null;
        };
        Update: {};
      };
      bankroll_settings: {
        Row: {
          id: string;
          user_id: string;
          initial_balance: number;
          current_balance: number;
          currency: string;
          daily_loss_limit: number | null;
          weekly_loss_limit: number | null;
          max_bet_percentage: number;
          max_single_bet: number | null;
          kelly_fraction: number;
          current_streak: number;
          best_streak: number;
          worst_streak: number;
          total_bets: number;
          total_won: number;
          total_lost: number;
          total_void: number;
          total_staked: number;
          total_returns: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          initial_balance?: number;
          current_balance?: number;
          currency?: string;
          daily_loss_limit?: number | null;
          weekly_loss_limit?: number | null;
          max_bet_percentage?: number;
          max_single_bet?: number | null;
          kelly_fraction?: number;
        };
        Update: {
          initial_balance?: number;
          current_balance?: number;
          daily_loss_limit?: number | null;
          weekly_loss_limit?: number | null;
          max_bet_percentage?: number;
          max_single_bet?: number | null;
          kelly_fraction?: number;
          current_streak?: number;
          best_streak?: number;
          worst_streak?: number;
          total_bets?: number;
          total_won?: number;
          total_lost?: number;
          total_void?: number;
          total_staked?: number;
          total_returns?: number;
          updated_at?: string;
        };
      };
      bankroll_daily_snapshots: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          opening_balance: number;
          closing_balance: number;
          total_staked: number;
          total_returns: number;
          bets_placed: number;
          bets_won: number;
          bets_lost: number;
          profit_loss: number;
          roi: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          opening_balance: number;
          closing_balance: number;
          total_staked?: number;
          total_returns?: number;
          bets_placed?: number;
          bets_won?: number;
          bets_lost?: number;
          profit_loss?: number;
          roi?: number;
        };
        Update: {
          closing_balance?: number;
          total_staked?: number;
          total_returns?: number;
          bets_placed?: number;
          bets_won?: number;
          bets_lost?: number;
          profit_loss?: number;
          roi?: number;
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
export type BankrollTransaction = Database['public']['Tables']['bankroll_transactions']['Row'];
export type BankrollSettings = Database['public']['Tables']['bankroll_settings']['Row'];
export type BankrollDailySnapshot = Database['public']['Tables']['bankroll_daily_snapshots']['Row'];

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
