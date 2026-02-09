/**
 * API-Football v3 Type Definitions
 */

// API Response Wrapper
export interface ApiResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string> | string[];
  results: number;
  paging: {
    current: number;
    total: number;
  };
  response: T;
}

// Rate Limit Info
export interface RateLimitInfo {
  requestsLimit: number;
  requestsRemaining: number;
  minuteLimit: number;
  minuteRemaining: number;
}

// League
export interface League {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string | null;
  season: number;
  round?: string;
}

// Team
export interface Team {
  id: number;
  name: string;
  logo: string;
  winner?: boolean | null;
}

// Fixture Status
export interface FixtureStatus {
  long: string;
  short: string; // 'NS' | 'LIVE' | '1H' | 'HT' | '2H' | 'ET' | 'P' | 'FT' | 'AET' | 'PEN' | 'BT' | 'SUSP' | 'INT' | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO'
  elapsed: number | null;
}

// Fixture
export interface Fixture {
  id: number;
  referee: string | null;
  timezone: string;
  date: string;
  timestamp: number;
  periods: {
    first: number | null;
    second: number | null;
  };
  venue: {
    id: number | null;
    name: string | null;
    city: string | null;
  };
  status: FixtureStatus;
}

// Goals
export interface Goals {
  home: number | null;
  away: number | null;
}

// Score
export interface Score {
  halftime: Goals;
  fulltime: Goals;
  extratime: Goals;
  penalty: Goals;
}

// Full Fixture Response
export interface FixtureResponse {
  fixture: Fixture;
  league: League;
  teams: {
    home: Team;
    away: Team;
  };
  goals: Goals;
  score: Score;
}

// Match Statistics
export interface StatisticItem {
  type: string;
  value: number | string | null;
}

export interface TeamStatistics {
  team: Team;
  statistics: StatisticItem[];
}

export interface FixtureStatisticsResponse {
  team: Team;
  statistics: StatisticItem[];
}

// Match Events (Goals, Cards, etc.)
export interface MatchEvent {
  time: {
    elapsed: number;
    extra: number | null;
  };
  team: Team;
  player: {
    id: number | null;
    name: string | null;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  type: 'Goal' | 'Card' | 'subst' | 'Var';
  detail: string;
  comments: string | null;
}

// Head to Head
export interface H2HResponse {
  fixture: Fixture;
  league: League;
  teams: {
    home: Team;
    away: Team;
  };
  goals: Goals;
  score: Score;
}

// API Predictions
export interface PredictionResponse {
  predictions: {
    winner: {
      id: number | null;
      name: string | null;
      comment: string | null;
    };
    win_or_draw: boolean;
    under_over: string | null;
    goals: {
      home: string;
      away: string;
    };
    advice: string | null;
    percent: {
      home: string;
      draw: string;
      away: string;
    };
  };
  league: League;
  teams: {
    home: TeamPredictionInfo;
    away: TeamPredictionInfo;
  };
  comparison: {
    form: { home: string; away: string };
    att: { home: string; away: string };
    def: { home: string; away: string };
    poisson_distribution: { home: string; away: string };
    h2h: { home: string; away: string };
    goals: { home: string; away: string };
    total: { home: string; away: string };
  };
  h2h: H2HResponse[];
}

export interface TeamPredictionInfo {
  id: number;
  name: string;
  logo: string;
  last_5: {
    form: string;
    att: string;
    def: string;
    goals: {
      for: { total: number; average: string };
      against: { total: number; average: string };
    };
  };
  league: {
    form: string;
    fixtures: {
      played: { home: number; away: number; total: number };
      wins: { home: number; away: number; total: number };
      draws: { home: number; away: number; total: number };
      loses: { home: number; away: number; total: number };
    };
    goals: {
      for: { total: { home: number; away: number; total: number }; average: { home: string; away: string; total: string } };
      against: { total: { home: number; away: number; total: number }; average: { home: string; away: string; total: string } };
    };
    clean_sheet: { home: number; away: number; total: number };
    failed_to_score: { home: number; away: number; total: number };
  };
}

// Odds
export interface OddsValue {
  value: string;
  odd: string;
}

export interface OddsBet {
  id: number;
  name: string;
  values: OddsValue[];
}

export interface OddsBookmaker {
  id: number;
  name: string;
  bets: OddsBet[];
}

export interface OddsResponse {
  league: League;
  fixture: {
    id: number;
    timezone: string;
    date: string;
    timestamp: number;
  };
  update: string;
  bookmakers: OddsBookmaker[];
}

// Standings
export interface StandingTeam {
  id: number;
  name: string;
  logo: string;
}

export interface StandingEntry {
  rank: number;
  team: StandingTeam;
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null;
  status: string;
  description: string | null;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  home: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  away: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
}

export interface StandingsResponse {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    standings: StandingEntry[][];
  };
}

// Processed Types for Frontend
export interface ProcessedFixture {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  status: {
    code: string;
    elapsed: number | null;
    isLive: boolean;
    isFinished: boolean;
    isUpcoming: boolean;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
  };
  homeTeam: {
    id: number;
    name: string;
    logo: string;
  };
  awayTeam: {
    id: number;
    name: string;
    logo: string;
  };
  score: {
    home: number | null;
    away: number | null;
    halftimeHome: number | null;
    halftimeAway: number | null;
  };
  venue: string | null;
  referee?: {
    id: number | null;
    name: string;
  };
}

// Hakem İstatistikleri
export interface Referee {
  id: number;
  name: string;
  nationality: string;
  appearance: number; // Toplam yönettiği maç
  yellow_cards: number;
  red_cards: number;
  penalties: number;
  averages: {
    yellow_per_match: number;
    red_per_match: number;
    pens_per_match: number;
  };
  insights?: string[]; // Öngörü metinleri ("Son 5 maçta deplasmana 3 penaltı verdi" gibi)
}

// Genişletilmiş Fixture (Günlük Maçlar için)
export interface DailyMatchFixture extends ProcessedFixture {
  referee?: {
    id: number | null;
    name: string;
  };
  refereeStats?: Referee;
  lineupsAvailable?: boolean;
  prediction?: {
    winner: string | null;
    confidence: number;
    advice: string | null;
    goalsAdvice?: string;
    // Faz 2: API Ensemble Validation
    apiValidation?: {
      label: 'high' | 'medium' | 'risky' | 'avoid';
      deviation: number;
      message: string;
    };
  };
  formComparison?: {
    home: string;
    away: string;
    homeLast5: string[];
    awayLast5: string[];
  };
  h2hSummary?: {
    totalMatches: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    lastMatch?: string;
  };
  // Gelişmiş Bahis Önerileri
  betSuggestions?: BetSuggestion[];
  teamStats?: {
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
    homeCleanSheets: number;
    awayCleanSheets: number;
    homeBothTeamsScored: number;
    awayBothTeamsScored: number;
    homeAvgCards: number;
    awayAvgCards: number;
  };
}

// Bahis Önerisi
export interface BetSuggestion {
  type: 'result' | 'goals' | 'cards' | 'corners' | 'btts' | 'htft';
  market: string;           // "Maç Sonucu", "Alt/Üst 2.5 Gol", "Kart Toplamı", "İY/MS" vb.
  pick: string;             // "Ev Sahibi", "Üst 2.5", "3+ Kart", "1/1" vb.
  confidence: number;       // 0-100
  odds: number;             // Bahis oranı
  reasoning: string;        // Neden bu öneriyi yapıyoruz
  value?: 'low' | 'medium' | 'high'; // Value bet değerlendirmesi
  oddsSource?: 'real' | 'calculated'; // Oran kaynağı (gerçek bookmaker vs hesaplanmış)
  bookmaker?: string;       // Gerçek oran kaynağı (ör. "1xBet")
}

// İç kullanım için oran olmadan öneri (oran sonra ekleniyor)
export type BetSuggestionInput = Omit<BetSuggestion, 'odds'>;

export interface ProcessedStatistics {
  fixtureId: number;
  home: {
    shotsOnGoal: number;
    shotsOffGoal: number;
    totalShots: number;
    possession: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
    corners: number;
    offsides: number;
    saves: number;
    passAccuracy: number;
    expectedGoals: number | null;
  };
  away: {
    shotsOnGoal: number;
    shotsOffGoal: number;
    totalShots: number;
    possession: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
    corners: number;
    offsides: number;
    saves: number;
    passAccuracy: number;
    expectedGoals: number | null;
  };
}
