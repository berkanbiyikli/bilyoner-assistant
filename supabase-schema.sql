-- =============================================
-- Kupon Muhendisi - Supabase Database Schema
-- Bu SQL'i Supabase Dashboard > SQL Editor'de calistirin
-- =============================================

-- 1. Profiles tablosu (auth.users ile otomatik senkron)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'elite')),
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Favorites (kaydedilen maclar)
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  fixture_id INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL,
  match_date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, fixture_id)
);

-- 3. User Predictions (tahmin gecmisi)
CREATE TABLE IF NOT EXISTS public.user_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  fixture_id INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  prediction_type TEXT NOT NULL,
  pick TEXT NOT NULL,
  odds NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  confidence INTEGER NOT NULL DEFAULT 50,
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_predictions ENABLE ROW LEVEL SECURITY;

-- Profiles: Kullanici sadece kendi profilini gorebilir/guncelleyebilir
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Favorites: Kullanici sadece kendi favorilerini yonetebilir
CREATE POLICY "Users can view own favorites" ON public.user_favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" ON public.user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" ON public.user_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Predictions: Kullanici sadece kendi tahminlerini yonetebilir
CREATE POLICY "Users can view own predictions" ON public.user_predictions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own predictions" ON public.user_predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- Triggers
-- =============================================

-- Yeni kullanici kayit olunca otomatik profil olustur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at otomatik guncelleme
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 4. Bankroll Transactions (kasa hareketleri)
-- =============================================

CREATE TABLE IF NOT EXISTS public.bankroll_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'bet', 'win', 'loss', 'bonus')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  description TEXT,
  fixture_id INTEGER,
  prediction_id UUID REFERENCES public.user_predictions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Bankroll Settings (kasa ayarları)
CREATE TABLE IF NOT EXISTS public.bankroll_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  initial_balance NUMERIC(12,2) NOT NULL DEFAULT 1000,
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 1000,
  currency TEXT NOT NULL DEFAULT 'TRY',
  -- Risk Limits
  daily_loss_limit NUMERIC(12,2) DEFAULT 200,
  weekly_loss_limit NUMERIC(12,2) DEFAULT 500,
  max_bet_percentage NUMERIC(5,2) DEFAULT 5.00,
  max_single_bet NUMERIC(12,2) DEFAULT 500,
  kelly_fraction NUMERIC(4,2) DEFAULT 0.25,
  -- Streak tracking
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  worst_streak INTEGER NOT NULL DEFAULT 0,
  -- Stats
  total_bets INTEGER NOT NULL DEFAULT 0,
  total_won INTEGER NOT NULL DEFAULT 0,
  total_lost INTEGER NOT NULL DEFAULT 0,
  total_void INTEGER NOT NULL DEFAULT 0,
  total_staked NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_returns NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Daily Snapshots (günlük P&L snapshot)
CREATE TABLE IF NOT EXISTS public.bankroll_daily_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  opening_balance NUMERIC(12,2) NOT NULL,
  closing_balance NUMERIC(12,2) NOT NULL,
  total_staked NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_returns NUMERIC(12,2) NOT NULL DEFAULT 0,
  bets_placed INTEGER NOT NULL DEFAULT 0,
  bets_won INTEGER NOT NULL DEFAULT 0,
  bets_lost INTEGER NOT NULL DEFAULT 0,
  profit_loss NUMERIC(12,2) NOT NULL DEFAULT 0,
  roi NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- RLS for bankroll tables
ALTER TABLE public.bankroll_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bankroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bankroll_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Bankroll Transactions RLS
CREATE POLICY "Users can view own transactions" ON public.bankroll_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.bankroll_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Bankroll Settings RLS
CREATE POLICY "Users can view own settings" ON public.bankroll_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.bankroll_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.bankroll_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Daily Snapshots RLS
CREATE POLICY "Users can view own snapshots" ON public.bankroll_daily_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots" ON public.bankroll_daily_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own snapshots" ON public.bankroll_daily_snapshots
  FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_id ON public.user_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_predictions_result ON public.user_predictions(result);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_bankroll_transactions_user_id ON public.bankroll_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_transactions_created ON public.bankroll_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_user_date ON public.bankroll_daily_snapshots(user_id, date);
