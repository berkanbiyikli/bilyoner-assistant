// ============================================
// API-Football Type Definitions
// ============================================

export interface ApiResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string> | string[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

// ---- Teams ----
export interface Team {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface TeamInfo {
  team: Team;
  venue: Venue;
}

export interface Venue {
  id: number;
  name: string;
  address: string;
  city: string;
  capacity: number;
  surface: string;
  image: string;
}

// ---- League ----
export interface League {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string | null;
  season: number;
  round: string;
}

// ---- Fixture ----
export interface Fixture {
  id: number;
  referee: string | null;
  timezone: string;
  date: string;
  timestamp: number;
  periods: { first: number | null; second: number | null };
  venue: { id: number; name: string; city: string };
  status: FixtureStatus;
}

export interface FixtureStatus {
  long: string;
  short: string; // "NS" | "1H" | "HT" | "2H" | "FT" | "AET" | "PEN" etc.
  elapsed: number | null;
}

export interface Goals {
  home: number | null;
  away: number | null;
}

export interface Score {
  halftime: Goals;
  fulltime: Goals;
  extratime: Goals;
  penalty: Goals;
}

export interface FixtureResponse {
  fixture: Fixture;
  league: League;
  teams: { home: Team; away: Team };
  goals: Goals;
  score: Score;
  events?: FixtureEvent[]; // Canlı maçlarda gelen olaylar
}

// ---- Standings ----
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
  form: string;
  status: string;
  description: string | null;
  all: StandingStats;
  home: StandingStats;
  away: StandingStats;
  update: string;
}

export interface StandingStats {
  played: number;
  win: number;
  draw: number;
  lose: number;
  goals: { for: number; against: number };
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

// ---- Head to Head ----
export interface H2HResponse extends FixtureResponse {}

// ---- Statistics ----
export interface TeamStatistic {
  type: string;
  value: string | number | null;
}

export interface FixtureStatisticsResponse {
  team: Team;
  statistics: TeamStatistic[];
}

// ---- Predictions ----
export interface PredictionResponse {
  predictions: {
    winner: { id: number; name: string; comment: string };
    win_or_draw: boolean;
    under_over: string;
    goals: { home: string; away: string };
    advice: string;
    percent: { home: string; draw: string; away: string };
  };
  league: League;
  teams: {
    home: PredictionTeam;
    away: PredictionTeam;
  };
  comparison: Record<string, { home: string; away: string }>;
  h2h: FixtureResponse[];
}

export interface PredictionTeam {
  id: number;
  name: string;
  logo: string;
  last_5: {
    form: string;
    att: string;
    def: string;
    goals: { for: { total: number; average: string }; against: { total: number; average: string } };
  };
  league: {
    form: string;
    fixtures: Record<string, { home: number; away: number; total: number }>;
    goals: {
      for: { total: Record<string, number>; average: Record<string, string>; minute: Record<string, { total: number | null; percentage: string | null }> };
      against: { total: Record<string, number>; average: Record<string, string>; minute: Record<string, { total: number | null; percentage: string | null }> };
    };
    biggest: Record<string, unknown>;
    clean_sheet: Record<string, number>;
    failed_to_score: Record<string, number>;
    penalty: Record<string, unknown>;
    lineups: Array<{ formation: string; played: number }>;
    cards: Record<string, Record<string, { total: number | null; percentage: string | null }>>;
  };
}

// ---- Odds ----
export interface OddsResponse {
  league: League;
  fixture: { id: number; timezone: string; date: string; timestamp: number };
  update: string;
  bookmakers: Bookmaker[];
}

export interface Bookmaker {
  id: number;
  name: string;
  bets: Bet[];
}

export interface Bet {
  id: number;
  name: string;
  values: BetValue[];
}

export interface BetValue {
  value: string;
  odd: string;
}

// ---- Injuries ----
export interface InjuryResponse {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string;
    reason: string;
  };
  team: Team;
  fixture: { id: number; timezone: string; date: string; timestamp: number };
  league: League;
}

// ---- Lineups ----
export interface LineupResponse {
  team: Team;
  formation: string;
  startXI: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string } }>;
  substitutes: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>;
  coach: { id: number; name: string; photo: string };
}

// ---- Events ----
export interface FixtureEvent {
  time: { elapsed: number; extra: number | null };
  team: Team;
  player: { id: number; name: string };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments: string | null;
}
