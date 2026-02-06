/**
 * Surprise Radar Types
 * Sürpriz odaklı maç analizi tipleri
 */

// ============ ODDS MOVEMENT ============

export interface OddsSnapshot {
  fixtureId: number;
  bookmaker: string;
  timestamp: number;
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
}

export interface OddsMovement {
  fixtureId: number;
  market: string;
  openingOdds: number;
  currentOdds: number;
  change: number;           // Yüzde değişim
  direction: 'up' | 'down' | 'stable';
  impliedProbShift: number; // Implied probability farkı
  isAnomaly: boolean;       // %10+ hareket
  isSuspicious: boolean;    // Favori oranı yükseldi (sinyal)
  signal: string;           // İnsan okunur sinyal açıklaması
}

// ============ ANTI-PUBLIC ============

export interface AntiPublicSignal {
  fixtureId: number;
  publicSide: 'home' | 'draw' | 'away';
  publicConfidence: number;   // Kamu tarafı güveni (0-100)
  modelSide: 'home' | 'draw' | 'away';
  modelConfidence: number;    // Model tarafı güveni (0-100)
  isContrarian: boolean;      // Model kalabalığa karşı mı?
  contraryEdge: number;       // Value farkı
  reason: string;             // Neden sürpriz?
}

// ============ EXACT SCORE ============

export interface ExactScorePrediction {
  score: string;              // "2-1"
  probability: number;        // 0-1 arası
  percentDisplay: string;     // "%12.3"
  odds: number;               // Tahmini bahis oranı
  isUpset: boolean;           // Sürpriz skor mu?
}

export interface ScorePredictionSet {
  fixtureId: number;
  poissonScores: ExactScorePrediction[];   // Top 3 Poisson
  monteCarloScores: ExactScorePrediction[]; // Top 3 Monte Carlo
  consensusScore: ExactScorePrediction;     // En yüksek ihtimalli
  surpriseScore: ExactScorePrediction | null; // Sürpriz skor (düşük favori, yüksek value)
}

// ============ SURPRISE CLASSIFICATION ============

export type SurpriseCategory = 
  | 'odds_anomaly'     // Oran hareketinden tespit
  | 'anti_public'      // Kamu karşıtı sinyal
  | 'chaos_match'      // Yüksek kaos/belirsizlik
  | 'value_bomb'       // Çok yüksek value (>30%)
  | 'score_hunter'     // Sürpriz skor potansiyeli
  | 'trap_match';      // Tuzak maç (herkes bir taraf diyor ama...)

export type SurpriseLevel = 'low' | 'medium' | 'high' | 'extreme';

export type ListCategory = 'gold' | 'silver' | 'red';

// ============ SURPRISE MATCH ============

export interface SurpriseMatch {
  // Temel bilgiler
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueName: string;
  leagueId: number;
  kickoff: string;
  
  // Sürpriz skorları
  surpriseScore: number;      // 0-100 kompozit sürpriz skoru
  surpriseLevel: SurpriseLevel;
  categories: SurpriseCategory[];
  listCategory: ListCategory;  // Altın/Gümüş/Kırmızı liste
  
  // Sürpriz sinyalleri
  oddsMovements: OddsMovement[];
  antiPublicSignal: AntiPublicSignal | null;
  scorePredictions: ScorePredictionSet;
  
  // Mevcut analiz verisi
  chaosIndex: number;         // Monte Carlo kaos
  valueEdge: number;          // Value yüzdesi
  modelConfidence: number;    // Model güveni
  apiDeviation: number;       // Model-API sapması
  
  // Tahmin
  surprisePick: SurprisePick;
  
  // Twitter viral içerik
  tweetHook: string;          // Dikkat çekici kısa başlık
  detailReason: string;       // Neden sürpriz? (Detaylı)
  dataPoints: string[];       // İstatistik noktaları
}

export interface SurprisePick {
  market: string;             // "MS 2", "2.5 Üst", "KG Var"
  pick: string;               // Kısa etiket
  odds: number;
  modelProbability: number;
  valuePct: number;           // Value yüzdesi
  confidence: number;         // 0-100
  reasoning: string[];        // Kısa sebepler listesi
}

// ============ SERIES CONCEPTS ============

export type SeriesType = 
  | 'kasa_kapatan'           // Haftada 1x, oran ≥ 5.00, güçlü data
  | 'ai_vs_insan'            // Popüler maç, yapay zeka vs kamuoyu
  | 'gece_yarisi_op'         // Gece maçları, egzotik ligler
  | 'tuzak_alarm'            // Uzak durulması gereken maçlar
  | 'sinyal_yakalandi';      // Oran anomalisi tespit

export interface SeriesContent {
  type: SeriesType;
  title: string;
  emoji: string;
  match: SurpriseMatch;
  tweetThread: string[];
  imageData?: {
    headline: string;
    subtext: string;
    stats: string[];
    prediction: string;
    odds: string;
  };
}

// ============ RADAR SUMMARY ============

export interface SurpriseRadarSummary {
  date: string;
  totalMatches: number;
  surpriseMatches: SurpriseMatch[];
  goldList: SurpriseMatch[];     // Oyna: Güçlü sürpriz sinyali
  silverList: SurpriseMatch[];   // İzle: İlginç sinyal, daha dikkatli ol
  redList: SurpriseMatch[];      // Uzak dur: Tuzak maç
  topSurprise: SurpriseMatch | null;
  seriesContent: SeriesContent[];
  stats: {
    avgSurpriseScore: number;
    anomalyCount: number;
    antiPublicCount: number;
    highChaosCount: number;
  };
}
