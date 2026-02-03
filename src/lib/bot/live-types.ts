/**
 * Live Bot Types - Canlı Maç Takip Botu Tipleri
 */

// ============ CANLI MAÇ TİPLERİ ============

export interface LiveMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  league: string;
  leagueId: number;
  leagueLogo?: string;
  
  // Skor
  homeScore: number;
  awayScore: number;
  
  // Zaman
  minute: number;
  status: 'HT' | '1H' | '2H' | 'ET' | 'P' | 'LIVE';
  
  // İstatistikler
  stats: LiveMatchStats;
  
  // Son güncellenme
  lastUpdated: Date;
}

export interface LiveMatchStats {
  // Şutlar
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeShotsTotal: number;
  awayShotsTotal: number;
  
  // Top kontrolü
  homePossession: number;
  awayPossession: number;
  
  // Kornerler
  homeCorners: number;
  awayCorners: number;
  
  // Fauller ve Kartlar
  homeFouls: number;
  awayFouls: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  
  // Tehlikeli ataklar
  homeDangerousAttacks: number;
  awayDangerousAttacks: number;
}

// ============ FIRSAT TİPLERİ ============

export type OpportunityType = 
  | 'goal_imminent'       // Gol geliyor (şut baskısı + 0-0)
  | 'next_goal_home'      // Ev sahibi sonraki golü atar
  | 'next_goal_away'      // Deplasman sonraki golü atar
  | 'over_15'             // Maçta 1.5 üstü olur
  | 'over_25'             // Maçta 2.5 üstü olur
  | 'corner_over'         // Korner üstü
  | 'card_coming'         // Kart gelecek
  | 'btts_yes'            // Karşılıklı gol olur
  | 'comeback'            // Geri dönüş potansiyeli
  | 'momentum_shift';     // Momentum değişimi

export interface LiveOpportunity {
  id: string;
  fixtureId: number;
  match: {
    homeTeam: string;
    awayTeam: string;
    score: string;
    minute: number;
  };
  
  // Fırsat detayı
  type: OpportunityType;
  market: string;           // "Sonraki Gol: Ev Sahibi", "Üst 2.5" vb.
  pick: string;
  
  // Analiz
  confidence: number;       // 0-100
  reasoning: string;        // Neden bu fırsat?
  urgency: 'low' | 'medium' | 'high' | 'critical';
  
  // Odds tahmini
  estimatedOdds: number;
  value: number;            // Value yüzdesi
  
  // Zaman
  detectedAt: Date;
  expiresAt?: Date;         // Bazı fırsatlar zamana bağlı
  
  // Aksiyon
  action: 'notify' | 'bet' | 'skip';
  betPlaced?: boolean;
}

// ============ CANLI BOT DURUMU ============

export interface LiveBotState {
  isRunning: boolean;
  lastCheck: Date;
  
  // Takip edilen maçlar
  watchedMatches: Map<number, LiveMatch>;
  
  // Aktif fırsatlar
  opportunities: LiveOpportunity[];
  
  // Geçmiş fırsatlar (son 24 saat)
  opportunityHistory: LiveOpportunity[];
  
  // İstatistikler
  stats: {
    totalOpportunities: number;
    notified: number;
    betPlaced: number;
    successful: number;
    failed: number;
  };
}

// ============ CANLI BOT AYARLARI ============

export interface LiveBotConfig {
  // Genel
  enabled: boolean;
  checkInterval: number;        // ms (varsayılan: 60000)
  
  // Maç Filtreleme
  watchTopLeaguesOnly: boolean;
  minMinuteToWatch: number;     // Kaçıncı dakikadan izle (5)
  maxMinuteToWatch: number;     // Kaçıncı dakikaya kadar (85)
  
  // Fırsat Eşikleri
  minConfidence: number;        // Minimum güven (65)
  minValue: number;             // Minimum value (10%)
  
  // Otomatik Bahis
  autoBetEnabled: boolean;
  autoBetMinConfidence: number; // Otomatik bahis için (80)
  autoBetMaxStake: number;      // Maks stake (50 TL)
  maxActiveBets: number;        // Aynı anda maks canlı bahis (3)
  
  // Bildirimler
  tweetOpportunities: boolean;
  tweetMinConfidence: number;   // Tweet için min güven (75)
}

export const DEFAULT_LIVE_BOT_CONFIG: LiveBotConfig = {
  enabled: true,
  checkInterval: 60000,         // 1 dakika
  
  watchTopLeaguesOnly: true,
  minMinuteToWatch: 5,
  maxMinuteToWatch: 85,
  
  minConfidence: 65,
  minValue: 10,
  
  autoBetEnabled: false,        // Başlangıçta kapalı
  autoBetMinConfidence: 80,
  autoBetMaxStake: 50,
  maxActiveBets: 3,
  
  tweetOpportunities: true,
  tweetMinConfidence: 75,
};

// ============ CANLI BAHİS TİPLERİ ============

export interface LiveBet {
  id: string;
  opportunityId: string;
  fixtureId: number;
  
  // Maç bilgisi
  match: {
    homeTeam: string;
    awayTeam: string;
    scoreAtBet: string;
    minuteAtBet: number;
  };
  
  // Bahis detayı
  market: string;
  pick: string;
  odds: number;
  stake: number;
  
  // Durum
  status: 'pending' | 'won' | 'lost' | 'void';
  placedAt: Date;
  settledAt?: Date;
  
  // Sonuç
  result?: {
    finalScore: string;
    won: boolean;
    payout: number;
  };
}

// ============ TWEET TİPLERİ ============

export interface LiveTweetData {
  type: 'opportunity' | 'bet_placed' | 'bet_result';
  opportunity?: LiveOpportunity;
  bet?: LiveBet;
}
