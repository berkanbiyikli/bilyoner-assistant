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

// ============ GERÇEK BAHİS PAZARLARI ============

// Canlı bahis için kullanılabilecek gerçek pazarlar
export type LiveMarket = 
  | 'next_goal'           // Sonraki Gol (Ev/Dep/Gol Yok)
  | 'match_result'        // Maç Sonucu (1/X/2)
  | 'double_chance'       // Çifte Şans (1X/X2/12)
  | 'over_under_15'       // 1.5 Üst/Alt
  | 'over_under_25'       // 2.5 Üst/Alt
  | 'over_under_35'       // 3.5 Üst/Alt
  | 'btts'                // Karşılıklı Gol (Var/Yok)
  | 'home_over_05'        // Ev Sahibi 0.5 Üstü
  | 'away_over_05'        // Deplasman 0.5 Üstü
  | 'corner_over'         // Korner Üstü (7.5/8.5/9.5)
  | 'card_over';          // Kart Üstü (3.5/4.5)

// Fırsat tipleri - analiz için (pazar değil)
export type OpportunityType = 
  | 'goal_pressure'       // Gol baskısı var (şut + top kontrolü)
  | 'home_momentum'       // Ev sahibi baskın
  | 'away_momentum'       // Deplasman baskın
  | 'high_tempo'          // Yüksek tempo (gol gelir)
  | 'low_scoring'         // Düşük tempolu maç
  | 'card_risk'           // Kart riski yüksek
  | 'corner_fest';        // Korner festivali

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
  market: LiveMarket;
  pick: string;
  odds: number;
  stake: number;
  
  // Durum
  status: 'pending' | 'won' | 'lost' | 'void';
  placedAt: Date;
  settledAt?: Date;
  
  // Katlama bilgisi
  chainId?: string;        // Hangi katlama zincirine ait
  chainStep?: number;      // Zincirdeki kaçıncı adım (1, 2, 3...)
  
  // Sonuç
  result?: {
    finalScore: string;
    won: boolean;
    payout: number;
  };
}

// ============ KATLAMA (SNOWBALL) SİSTEMİ ============

export interface SnowballChain {
  id: string;
  
  // Başlangıç
  initialStake: number;     // Başlangıç kasası (örn: 100 TL)
  currentStake: number;     // Şu anki kasa
  targetMultiplier: number; // Hedef çarpan (örn: 5x = 500 TL)
  
  // Durum
  status: 'active' | 'won' | 'lost';
  currentStep: number;      // Şu anki adım
  maxSteps: number;         // Max adım sayısı (örn: 5)
  
  // Bahisler
  bets: LiveBet[];
  
  // İstatistik
  startedAt: Date;
  endedAt?: Date;
  
  // Sonuç
  finalPayout?: number;
  profit?: number;
}

// Varsayılan katlama ayarları
export const DEFAULT_SNOWBALL_CONFIG = {
  initialStake: 100,        // 100 TL ile başla
  targetMultiplier: 5,      // 5x hedef (500 TL)
  maxSteps: 5,              // Max 5 bahis
  minOdds: 1.40,            // Min oran
  maxOdds: 2.00,            // Max oran (çok riskli olmasın)
  minConfidence: 70,        // Min güven
};

// ============ TWEET TİPLERİ ============

export interface LiveTweetData {
  type: 'opportunity' | 'bet_placed' | 'bet_result' | 'chain_started' | 'chain_update' | 'chain_finished';
  opportunity?: LiveOpportunity;
  bet?: LiveBet;
  chain?: SnowballChain;
}
