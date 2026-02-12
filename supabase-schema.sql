-- ============================================
-- Bilyoner Assistant v2 - Database Schema
-- ============================================

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  bankroll NUMERIC(10,2) NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_level IN ('conservative', 'moderate', 'aggressive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Predictions
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL,
  kickoff TIMESTAMPTZ NOT NULL,
  pick TEXT NOT NULL,
  odds NUMERIC(5,2) NOT NULL,
  confidence INTEGER NOT NULL,
  expected_value NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_value_bet BOOLEAN NOT NULL DEFAULT FALSE,
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('won', 'lost', 'void', 'pending')),
  analysis_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predictions_fixture ON predictions(fixture_id);
CREATE INDEX idx_predictions_date ON predictions(kickoff);
CREATE INDEX idx_predictions_result ON predictions(result);

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  total_odds NUMERIC(10,2) NOT NULL DEFAULT 0,
  stake NUMERIC(10,2) NOT NULL DEFAULT 0,
  potential_win NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'partial', 'void')),
  category TEXT NOT NULL DEFAULT 'balanced' CHECK (category IN ('safe', 'balanced', 'risky', 'value', 'custom')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX idx_coupons_user ON coupons(user_id);
CREATE INDEX idx_coupons_status ON coupons(status);

-- Bankroll Entries
CREATE TABLE IF NOT EXISTS bankroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'bet', 'win')),
  amount NUMERIC(10,2) NOT NULL,
  balance NUMERIC(10,2) NOT NULL,
  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bankroll_user ON bankroll_entries(user_id);
CREATE INDEX idx_bankroll_date ON bankroll_entries(created_at);

-- Tweets
CREATE TABLE IF NOT EXISTS tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily_picks', 'coupon', 'live_alert', 'result', 'outcome_reply', 'value_alert', 'weekly_report', 'analytic')),
  content TEXT NOT NULL,
  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  fixture_id INTEGER,
  reply_to_tweet_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tweets_type ON tweets(type);

-- Validation Records (Backtest & Feedback Loop)
CREATE TABLE IF NOT EXISTS validation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL,
  kickoff TIMESTAMPTZ NOT NULL,
  pick TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  odds NUMERIC(5,2) NOT NULL,
  expected_value NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_value_bet BOOLEAN NOT NULL DEFAULT FALSE,
  sim_probability NUMERIC(5,1),
  sim_top_scoreline TEXT,
  actual_score TEXT,
  result TEXT NOT NULL CHECK (result IN ('won', 'lost', 'void', 'pending')),
  edge_at_open NUMERIC(5,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validation_fixture ON validation_records(fixture_id);
CREATE INDEX idx_validation_result ON validation_records(result);
CREATE INDEX idx_validation_date ON validation_records(kickoff);
CREATE INDEX idx_validation_confidence ON validation_records(confidence);
CREATE INDEX idx_validation_league ON validation_records(league);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_entries ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY profiles_select ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- Coupons: users can CRUD their own
CREATE POLICY coupons_select ON coupons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY coupons_insert ON coupons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY coupons_update ON coupons FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY coupons_delete ON coupons FOR DELETE USING (auth.uid() = user_id);

-- Bankroll: users can CRUD their own
CREATE POLICY bankroll_select ON bankroll_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY bankroll_insert ON bankroll_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Predictions: public read, server insert/update
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY predictions_select ON predictions FOR SELECT USING (true);
CREATE POLICY predictions_insert ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY predictions_update ON predictions FOR UPDATE USING (true);

-- Tweets: public read, server insert
ALTER TABLE tweets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tweets_select ON tweets FOR SELECT USING (true);
CREATE POLICY tweets_insert ON tweets FOR INSERT WITH CHECK (true);
CREATE POLICY tweets_update ON tweets FOR UPDATE USING (true);

-- Validation Records: public read, server insert/update
ALTER TABLE validation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY validation_select ON validation_records FOR SELECT USING (true);
CREATE POLICY validation_insert ON validation_records FOR INSERT WITH CHECK (true);
CREATE POLICY validation_update ON validation_records FOR UPDATE USING (true);
