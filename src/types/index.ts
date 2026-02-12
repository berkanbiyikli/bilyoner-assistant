// ============================================
// App-level Type Definitions
// ============================================

import type { FixtureResponse, League, Team, Goals } from "./api-football";

// ---- Prediction ----
export type PickType =
  | "1"
  | "X"
  | "2"
  | "1X"
  | "X2"
  | "12"
  | "Over 2.5"
  | "Under 2.5"
  | "Over 1.5"
  | "Under 1.5"
  | "Over 3.5"
  | "Under 3.5"
  | "BTTS Yes"
  | "BTTS No"
  | "1 & Over 1.5"
  | "2 & Over 1.5"
  | "HT Over 0.5"
  | "HT Under 0.5"
  | "Over 8.5 Corners"
  | "Under 8.5 Corners"
  | "Over 3.5 Cards"
  | "Under 3.5 Cards";

export interface MatchPrediction {
  fixtureId: number;
  fixture: FixtureResponse;
  league: League;
  homeTeam: Team;
  awayTeam: Team;
  kickoff: string;
  picks: Pick[];
  analysis: MatchAnalysis;
  odds?: MatchOdds;
  isLive: boolean;
  insights?: MatchInsights; // Derinlemesine bilgiler
}

export interface Pick {
  type: PickType;
  confidence: number; // 0-100
  odds: number;
  reasoning: string;
  expectedValue: number; // Kelly EV
  isValueBet: boolean;
  simProbability?: number; // Monte Carlo simülasyondan gelen olasılık %
}

export interface MonteCarloResult {
  simHomeWinProb: number;   // %
  simDrawProb: number;      // %
  simAwayWinProb: number;   // %
  simOver15Prob: number;    // %
  simOver25Prob: number;    // %
  simOver35Prob: number;    // %
  simBttsProb: number;      // %
  topScorelines: { score: string; probability: number }[]; // En olası 5 skor
  simRuns: number;          // Simülasyon sayısı (10000)
}

export interface RefereeProfile {
  name: string;
  avgCardsPerMatch: number;
  cardTendency: "strict" | "moderate" | "lenient";
}

export interface MatchAnalysis {
  homeForm: number; // 0-100 (gerçek kazanma olasılığı %)
  awayForm: number;
  drawProb?: number; // 0-100 beraberlik olasılığı %
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  h2hAdvantage: "home" | "away" | "neutral";
  h2hGoalAvg?: number; // H2H maç başına gol ortalaması
  homeAdvantage: number;
  injuryImpact: { home: number; away: number };
  summary: string;
  // xG verileri
  homeXg?: number; // Son maçlar xG ortalaması
  awayXg?: number;
  xgDelta?: number; // xG - gerçek gol farkı (pozitif = şanssız)
  // Gol zamanlaması
  goalTiming?: GoalTimingData;
  // Korner/Kart verileri
  cornerData?: CornerCardData;
  cardData?: CornerCardData;
  // Maç benzerliği
  similarity?: MatchSimilarity;
  // Kilit eksikler
  keyMissingPlayers?: KeyMissingPlayer[];
  // Monte Carlo simülasyon
  simulation?: MonteCarloResult;
  // Hakem bilgisi
  referee?: string;
  refereeProfile?: RefereeProfile;
}

export interface GoalTimingData {
  home: {
    first15: number;   // 0-15 dk gol yüzdesi
    first45: number;   // 0-45 dk (ilk yarı)
    last30: number;    // 60-90 dk (son yarım saat)
    last15: number;    // 76-90+ dk gol yüzdesi
  };
  away: {
    first15: number;
    first45: number;
    last30: number;
    last15: number;
  };
  lateGoalProb: number; // 75+ dk'da gol olma olasılığı %
  firstHalfGoalProb: number; // İlk yarıda gol olma olasılığı %
}

export interface CornerCardData {
  homeAvg: number;     // Ev sahibi maç başı ortalama
  awayAvg: number;     // Deplasman maç başı ortalama
  totalAvg: number;    // Toplam maç başı ortalama
  overProb: number;    // Üst olma olasılığı (8.5 korner / 3.5 kart)
}

export interface MatchSimilarity {
  similarMatch: string;      // "Atletico Madrid 1-0 Barcelona"
  similarityScore: number;   // 0-100
  result: string;            // "Alt 2.5, BTTS Yok"
  features: string[];        // Benzerlik nedenleri
}

export interface KeyMissingPlayer {
  name: string;
  team: "home" | "away";
  position: string; // "GK" | "DEF" | "MID" | "FWD"
  reason: string;   // "Sakatlık" | "Ceza" | "Belirsiz"
  impactLevel: "critical" | "high" | "medium"; // Etki ağırlığı
}

export interface MatchInsights {
  xgHome: number;
  xgAway: number;
  lateGoalProb: number;        // 75+ dk gol olma olasılığı %
  firstHalfGoalProb: number;   // İlk yarıda gol olma olasılığı %
  cornerAvg: number;           // Maç başı toplam korner ortalaması
  cardAvg: number;             // Maç başı toplam kart ortalaması
  keyMissingCount: number;     // Eksik oyuncu sayısı
  notes: string[];             // Derinlemesine notlar
  simTopScoreline?: string;    // "2-1 (%14.3)"
  simEdgeNote?: string;        // "Üst 2.5 piyasadan %12 fazla"
}

export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
  over15: number;
  under15: number;
  over35: number;
  under35: number;
  cornerOver85?: number;
  cornerUnder85?: number;
  cardOver35?: number;
  cardUnder35?: number;
  bookmaker: string;
}

// ---- Coupon ----
export type CouponStatus = "pending" | "won" | "lost" | "partial" | "void";

export interface CouponItem {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  pick: PickType;
  odds: number;
  confidence: number;
  result?: "won" | "lost" | "void" | "pending";
  score?: Goals;
}

export interface Coupon {
  id: string;
  createdAt: string;
  items: CouponItem[];
  totalOdds: number;
  stake: number;
  potentialWin: number;
  status: CouponStatus;
  category: CouponCategory;
}

export type CouponCategory = "safe" | "balanced" | "risky" | "value" | "custom";

// ---- Bankroll ----
export interface BankrollEntry {
  id: string;
  date: string;
  type: "deposit" | "withdrawal" | "bet" | "win";
  amount: number;
  balance: number;
  couponId?: string;
  note?: string;
}

export interface BankrollStats {
  totalDeposit: number;
  totalWithdrawal: number;
  totalBets: number;
  totalWins: number;
  currentBalance: number;
  roi: number;
  winRate: number;
  streak: { current: number; type: "win" | "loss"; best: number };
}

// ---- User ----
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isPremium: boolean;
  bankroll: number;
  riskLevel: "conservative" | "moderate" | "aggressive";
  createdAt: string;
}

// ---- Live Score ----
export interface LiveMatch {
  fixtureId: number;
  homeTeam: Team;
  awayTeam: Team;
  league: League;
  score: Goals;
  status: string;
  elapsed: number | null;
  events: LiveEvent[];
}

export interface LiveEvent {
  minute: number;
  type: "goal" | "card" | "substitution" | "var";
  team: "home" | "away";
  player: string;
  detail: string;
}

// ---- Value Bet ----
export interface ValueBet {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  market: string;
  pick: string;
  bookmakerOdds: number;
  fairOdds: number;
  edge: number; // percentage edge
  confidence: number;
  kellyStake: number; // as percentage of bankroll
}
