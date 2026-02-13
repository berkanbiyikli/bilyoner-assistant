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
  | "1/1"    // İY 1 - MS 1
  | "1/X"    // İY 1 - MS X
  | "1/2"    // İY 1 - MS 2
  | "X/1"    // İY X - MS 1
  | "X/X"    // İY X - MS X
  | "X/2"    // İY X - MS 2
  | "2/1"    // İY 2 - MS 1
  | "2/X"    // İY 2 - MS X
  | "2/2"    // İY 2 - MS 2
  | "Over 8.5 Corners"
  | "Under 8.5 Corners"
  | "Over 3.5 Cards"
  | "Under 3.5 Cards"
  | `CS ${string}`; // Exact Score: "CS 3-2", "CS 4-1" etc.

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
  allScorelines: { score: string; probability: number }[]; // Tüm skorlar (>0.5%)
  simRuns: number;          // Simülasyon sayısı (10000)
}

export interface RefereeProfile {
  name: string;
  avgCardsPerMatch: number;
  cardTendency: "strict" | "moderate" | "lenient";
  tempoImpact?: "high-tempo" | "neutral" | "low-tempo"; // Düdük sıklığına göre tempo etkisi
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
  // İY/MS oranları (Half Time / Full Time)
  htft?: Record<string, number>; // { "1/1": 2.5, "1/X": 15.0, "X/2": 6.5, ... }
  exactScoreOdds?: Record<string, number>; // { "2-1": 8.0, "3-3": 51.0, ... }
  bookmaker: string;
  /** Gerçek bahisçi verisinden gelen pazarlar. Bu set'te olmayan pazar fallback oran kullanıyor */
  realMarkets: Set<string>;
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

export type CouponCategory = "safe" | "balanced" | "risky" | "value" | "crazy" | "custom";

// ---- Crazy Pick (Black Swan) ----
export interface CrazyPick {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueId: number;
  kickoff: string;
  score: string;             // "3-2", "4-1", etc.
  simProbability: number;    // Monte Carlo %
  impliedProbability: number; // 1/odds * vigCorrection
  edge: number;              // % edge over market
  bookmakerOdds: number;
  volatilityScore: number;   // 0-100
  chaosFactors: string[];    // ["Yüksek atak", "xG verimsiz", ...]
  totalGoals: number;        // Toplam skor (filtreleme için)
}

export interface CrazyPickResult {
  match: {
    fixtureId: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId: number;
    kickoff: string;
    volatilityScore: number;
    chaosFactors: string[];
  };
  picks: CrazyPick[];        // 3-5 skor varyasyonu
  bestEdge: number;
  avgEdge: number;
  stake: number;             // 50 TL sabit
}

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

// ---- Validation & Backtest ----
export interface ValidationRecord {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  pick: string;
  confidence: number;
  odds: number;
  expectedValue: number;
  isValueBet: boolean;
  simProbability?: number;
  simTopScoreline?: string;       // "2-1"
  actualScore?: string;            // "2-1"
  result: "won" | "lost" | "void" | "pending";
  edgeAtOpen?: number;             // Edge % at prediction time
  createdAt: string;
}

export interface ValidationStats {
  totalPredictions: number;
  won: number;
  lost: number;
  winRate: number;                 // %
  roi: number;                     // %
  avgConfidence: number;           // %
  avgOdds: number;

  // Confidence band analysis
  byConfidenceBand: {
    band: string;                  // "50-60", "60-70", "70-80", "80+"
    total: number;
    won: number;
    winRate: number;
    roi: number;
  }[];

  // Market type analysis
  byMarket: {
    market: string;                // "1", "X", "2", "Over 2.5", etc.
    total: number;
    won: number;
    winRate: number;
    roi: number;
  }[];

  // Simulation accuracy
  simAccuracy: {
    scorelineHitRate: number;      // Top 5 skor tutma oranı %
    top1HitRate: number;           // En olası skor tutma oranı %
    simEdgeROI: number;            // Edge > 10% olan maçların ROI'si
    avgSimConfidence: number;      // Sim ile pick'lerin avg confidence
  };

  // Value bet performance
  valueBetStats: {
    total: number;
    won: number;
    winRate: number;
    roi: number;
    avgEdge: number;
  };

  // Trend (son 7/30 gün)
  recentTrend: {
    last7Days: { won: number; lost: number; roi: number };
    last30Days: { won: number; lost: number; roi: number };
  };
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

// ---- Calibration (Self-Learning) ----
export interface CalibrationData {
  heuristicWeight: number;      // 0.0 – 1.0 (default 0.4)
  simWeight: number;             // 0.0 – 1.0 (default 0.6)
  calibrationError: number;      // MAE: ortalama mutlak hata (confidence vs actual)
  sampleSize: number;            // Kaç kayıttan hesaplandı
  bandErrors: {
    band: string;
    predictedWinRate: number;    // Ortalama confidence %
    actualWinRate: number;       // Gerçekleşen kazanma %
    error: number;               // |predicted - actual|
    improvement: string;         // "↑ arttır" | "↓ azalt" | "✓ iyi"
  }[];
  lastUpdated: string;
}
