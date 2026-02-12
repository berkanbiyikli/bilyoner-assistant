// ============================================
// Database Types (Supabase)
// ============================================

// ---- Row Types ----
type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_premium: boolean;
  bankroll: number;
  risk_level: "conservative" | "moderate" | "aggressive";
  created_at: string;
  updated_at: string;
}

type CouponRow = {
  id: string;
  user_id: string;
  items: CouponItemDB[];
  total_odds: number;
  stake: number;
  potential_win: number;
  status: "pending" | "won" | "lost" | "partial" | "void";
  category: "safe" | "balanced" | "risky" | "value" | "custom";
  created_at: string;
  settled_at: string | null;
}

type BankrollEntryRow = {
  id: string;
  user_id: string;
  type: "deposit" | "withdrawal" | "bet" | "win";
  amount: number;
  balance: number;
  coupon_id: string | null;
  note: string | null;
  created_at: string;
}

type PredictionRow = {
  id: string;
  fixture_id: number;
  home_team: string;
  away_team: string;
  league: string;
  kickoff: string;
  pick: string;
  odds: number;
  confidence: number;
  expected_value: number;
  is_value_bet: boolean;
  result: "won" | "lost" | "void" | "pending";
  analysis_summary: string;
  created_at: string;
}

type TweetRow = {
  id: string;
  tweet_id: string;
  type: "daily_picks" | "coupon" | "live_alert" | "result";
  content: string;
  coupon_id: string | null;
  created_at: string;
}

// ---- Database Type ----
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<ProfileRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      coupons: {
        Row: CouponRow;
        Insert: Omit<CouponRow, "id" | "created_at"> & { id?: string; status?: string; settled_at?: string | null };
        Update: Partial<Omit<CouponRow, "id" | "created_at">>;
        Relationships: [];
      };
      bankroll_entries: {
        Row: BankrollEntryRow;
        Insert: Omit<BankrollEntryRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<BankrollEntryRow, "id" | "created_at">>;
        Relationships: [];
      };
      predictions: {
        Row: PredictionRow;
        Insert: Omit<PredictionRow, "id" | "created_at" | "result"> & { id?: string; result?: string };
        Update: Partial<Omit<PredictionRow, "id" | "created_at">>;
        Relationships: [];
      };
      tweets: {
        Row: TweetRow;
        Insert: Omit<TweetRow, "id" | "created_at" | "coupon_id"> & { id?: string; coupon_id?: string | null };
        Update: Partial<Omit<TweetRow, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type CouponItemDB = {
  fixture_id: number;
  home_team: string;
  away_team: string;
  league: string;
  kickoff: string;
  pick: string;
  odds: number;
  confidence: number;
  result: "won" | "lost" | "void" | "pending";
  score: { home: number | null; away: number | null } | null;
}
