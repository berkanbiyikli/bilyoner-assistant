/**
 * Backtesting Tipler
 * Geçmiş tahminlerin başarısını ölçme sistemi
 */

export interface PredictionRecord {
  id: string;
  fixtureId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueId: number;
  
  // Tahmin
  predictedResult: 'home' | 'away' | 'draw';
  predictedGoals?: { home: number; away: number };
  predictedBTTS?: boolean;
  predictedOver25?: boolean;
  confidence: number;
  modelUsed: string; // 'poisson' | 'ml' | 'ensemble'
  
  // Bahis önerisi
  market: string; // 'MS', '2.5 Üst', 'KG Var'
  pick: string;
  suggestedOdds: number;
  
  // Sonuç (maç bittikten sonra)
  actualResult?: 'home' | 'away' | 'draw';
  actualScore?: { home: number; away: number };
  isCorrect?: boolean;
  profitLoss?: number; // -100 (kayıp) veya +suggestedOdds*100 (kazanç)
  
  // Meta
  createdAt: number;
  settledAt?: number;
  status: 'pending' | 'won' | 'lost';
}

export interface BacktestMetrics {
  // Genel
  totalPredictions: number;
  settledPredictions: number;
  pendingPredictions: number;
  
  // Başarı oranları
  winRate: number; // %
  lossRate: number; // %
  
  // Karlılık
  totalStake: number; // Her maça 100 birim yatırım varsayımı
  totalReturn: number;
  netProfit: number;
  roi: number; // % (Return on Investment)
  yield: number; // % (Yield)
  
  // Model bazlı
  byModel: {
    [key: string]: {
      total: number;
      won: number;
      winRate: number;
      roi: number;
    };
  };
  
  // Pazar bazlı
  byMarket: {
    [key: string]: {
      total: number;
      won: number;
      winRate: number;
      roi: number;
    };
  };
  
  // Güven aralığı bazlı
  byConfidence: {
    '50-59': { total: number; won: number; winRate: number };
    '60-69': { total: number; won: number; winRate: number };
    '70-79': { total: number; won: number; winRate: number };
    '80-89': { total: number; won: number; winRate: number };
    '90-100': { total: number; won: number; winRate: number };
  };
  
  // Günlük performans
  last7Days: DailyPerformance[];
  last30Days: DailyPerformance[];
}

export interface DailyPerformance {
  date: string;
  total: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  netProfit: number;
  roi: number;
}

export interface BacktestSummary {
  period: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'all';
  metrics: BacktestMetrics;
  topPicks: PredictionRecord[];
  worstPicks: PredictionRecord[];
}
