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
  | "HT Under 0.5";

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
}

export interface Pick {
  type: PickType;
  confidence: number; // 0-100
  odds: number;
  reasoning: string;
  expectedValue: number; // Kelly EV
  isValueBet: boolean;
}

export interface MatchAnalysis {
  homeForm: number; // 0-100
  awayForm: number;
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  h2hAdvantage: "home" | "away" | "neutral";
  homeAdvantage: number;
  injuryImpact: { home: number; away: number };
  summary: string;
}

export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
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
