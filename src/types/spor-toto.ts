// ============================================
// Spor Toto Bülten Tip Tanımları
// ============================================

import type { League, Team, Goals } from "./api-football";

// ---- Temel Seçim Tipi ----
export type TotoSelection = "1" | "0" | "2"; // Ev sahibi / Beraberlik / Deplasman

// ---- Maç Durumu ----
export type TotoMatchStatus =
  | "scheduled"    // Henüz başlamadı
  | "live"         // Canlı
  | "halftime"     // Devre arası
  | "finished"     // Bitti
  | "postponed"    // Ertelendi
  | "cancelled";   // İptal

// ---- Form son 5 maç ----
export type FormResult = "W" | "D" | "L";

// ---- Bülten/Program ----
export interface TotoProgram {
  id: string;                    // "2024-W52" gibi
  name: string;                  // "52. Hafta Bülteni"
  week: number;                  // Hafta numarası
  season: string;                // "2024-2025"
  startDate: string;             // İlk maç tarihi
  endDate: string;               // Son maç tarihi
  deadline: string;              // Kupon kesim saati
  matches: TotoMatch[];          // Bültendeki maçlar
  status: "open" | "locked" | "settled"; // Bülten durumu
  totalMatches: number;
  createdAt: string;
}

// ---- Bültendeki Tek Maç ----
export interface TotoMatch {
  // Temel bilgiler
  id: string;                    // Unique ID
  bulletinOrder: number;         // Bültendeki sıra (1, 2, 3...)
  fixtureId: number;             // API-Football fixture ID
  mbs: number;                   // Minimum Bahis Sayısı (genelde 1-3)

  // Takım bilgileri
  homeTeam: TotoTeamInfo;
  awayTeam: TotoTeamInfo;

  // Lig bilgileri
  league: {
    id: number;
    name: string;
    country: string;
    flag: string;
    logo?: string;
  };

  // Maç saati & durumu
  kickoff: string;               // ISO date
  status: TotoMatchStatus;
  elapsed?: number;              // Dakika (canlıysa)
  score?: Goals;                 // Skor

  // Oranlar
  odds: TotoOdds;

  // Derinlemesine istatistikler
  stats: TotoMatchStats;

  // AI tahmin
  aiPrediction?: TotoAIPrediction;

  // Spor Toto özel: TR ligi banko mu, yabancı sürpriz adayı mı?
  totoTier: "tr_banko" | "foreign_surprise";

  // Sürpriz potansiyeli (yüksekse banko yapma!)
  surprise: TotoSurprise;

  // Motivasyon analizi (puan durumu bağlamı)
  motivation: TotoMotivation;

  // Sakat/cezalı oyuncular
  injuries: {
    home: TotoInjuryInfo[];
    away: TotoInjuryInfo[];
    homeCount: number;
    awayCount: number;
  };

  // Hakem detayı (varsa)
  refereeName?: string;

  // Maç sonucu (settle sonrası)
  result?: TotoSelection;        // Maç sonucu: 1, 0, 2
}

// ---- Sürpriz Skoru ----
export interface TotoSurprise {
  score: number;                 // 0-100, yüksek = sürpriz olasılığı yüksek
  level: "low" | "medium" | "high" | "extreme";
  reasons: string[];             // Neden sürpriz olabilir?
  upsetPick?: TotoSelection;     // Sürpriz tahmin (favorinin tersi)
  upsetOdds?: number;            // Sürprizin oranı
}

// ---- Motivasyon Bağlamı ----
export interface TotoMotivation {
  homeContext: TeamMotivationContext;
  awayContext: TeamMotivationContext;
  intensity: "low" | "medium" | "high"; // Maçın motivasyon yoğunluğu
  summary: string;               // Genel motivasyon özeti
}

export interface TeamMotivationContext {
  status: "title_race" | "european" | "midtable" | "relegation_battle" | "relegated_safe" | "unknown";
  label: string;                 // "Şampiyonluk yarışında", "Küme hattında" vs
  urgency: "critical" | "high" | "medium" | "low";
  pointsToTarget?: number;       // Hedefe puan farkı
  targetDescription?: string;    // "Avrupa kupalarına 2 puan", "Küme düşmeden 1 puan"
}

// ---- Sakat Oyuncu ----
export interface TotoInjuryInfo {
  name: string;
  reason: string;                // "Knee Injury", "Suspended" vs
  type: string;                  // "Missing Fixture", "Questionable"
  importance: "key" | "regular" | "rotation"; // Tahmini önem
}

// ---- Takım Detay Bilgisi ----
export interface TotoTeamInfo {
  id: number;
  name: string;
  shortName: string;             // Kısa isim (3-4 karakter)
  logo?: string;

  // Form
  form: FormResult[];            // Son 5 maç [W, D, L, W, W]
  formPoints: number;            // Son 5 maç puan (W=3, D=1, L=0) / 15 * 100
  lastMatches: TotoRecentMatch[];

  // Lig sıralaması
  position: number;              // Lig sırası
  points: number;                // Toplam puan
  played: number;                // Oynanan maç
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;

  // Ev/Deplasman istatistikleri
  homeRecord?: TeamRecord;
  awayRecord?: TeamRecord;

  // Gol istatistikleri
  avgGoalsScored: number;        // Maç başı atılan gol ort.
  avgGoalsConceded: number;      // Maç başı yenilen gol ort.
  cleanSheetPct: number;         // Gol yememe yüzdesi %
  failedToScorePct: number;      // Gol atamama yüzdesi %
  bttsRate: number;              // KG Var oranı %

  // Gol dağılımı (zamansal)
  goalsByPeriod: {
    "0-15": number;
    "16-30": number;
    "31-45": number;
    "46-60": number;
    "61-75": number;
    "76-90": number;
  };

  // Seri bilgisi
  streak: {
    wins: number;                // Galibiyet serisi
    draws: number;               // Beraberlik serisi
    losses: number;              // Yenilgi serisi
    unbeaten: number;            // Yenilmezlik serisi
    scoreless: number;           // Gol atamama serisi
    cleanSheets: number;         // Gol yememe serisi
  };
}

// ---- Ev/Deplasman Sicil ----
export interface TeamRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  avgGoals: number;              // Maç başı atılan gol
  avgConceded: number;           // Maç başı yenilen gol
  winRate: number;               // Kazanma oranı %
  points: number;
}

// ---- Son Maç ----
export interface TotoRecentMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string;                 // "2-1"
  result: FormResult;            // W/D/L (bu takım açısından)
  isHome: boolean;
  leagueName: string;
}

// ---- Oranlar ----
export interface TotoOdds {
  home: number;                  // MS 1
  draw: number;                  // MS 0
  away: number;                  // MS 2

  // Ek marketler
  over15?: number;
  under15?: number;
  over25?: number;
  under25?: number;
  over35?: number;
  under35?: number;
  bttsYes?: number;
  bttsNo?: number;

  // İlk yarı oranları
  htHome?: number;
  htDraw?: number;
  htAway?: number;

  // Oran değişim bilgisi
  openingOdds?: {
    home: number;
    draw: number;
    away: number;
  };
  oddsMovement?: "home_up" | "home_down" | "draw_up" | "away_up" | "away_down" | "stable";

  bookmaker?: string;
}

// ---- Maç İstatistikleri ----
export interface TotoMatchStats {
  // H2H (Karşılaşma geçmişi)
  h2h: TotoH2H;

  // Gol istatistikleri
  goalStats: {
    avgTotalGoals: number;       // İki takımın maç başı toplam gol ort.
    over15Pct: number;           // 1.5 üst oranı %
    over25Pct: number;           // 2.5 üst oranı %
    over35Pct: number;           // 3.5 üst oranı %
    bttsPct: number;             // KG Var oranı %
    homeScoredPct: number;       // Ev sahibi gol atar %
    awayScoredPct: number;       // Deplasman gol atar %
  };

  // Güç karşılaştırması
  powerComparison: {
    homeAttack: number;          // 0-100
    homeDefense: number;         // 0-100
    awayAttack: number;          // 0-100
    awayDefense: number;         // 0-100
    homePossession?: number;     // Ortalama top hakimiyeti %
    awayPossession?: number;
  };

  // Toplam olasılık dağılımı
  probabilities: {
    homeWin: number;             // %
    draw: number;                // %
    awayWin: number;             // %
    over25: number;              // %
    btts: number;                // %
  };

  // Önemli notlar
  keyFactors: TotoKeyFactor[];

  // Korner/Kart
  corners?: {
    homeAvg: number;
    awayAvg: number;
    totalAvg: number;
  };
  cards?: {
    homeAvg: number;
    awayAvg: number;
    totalAvg: number;
  };

  // Hakem
  referee?: {
    name: string;
    avgCards: number;
    avgFouls: number;
    tendency: "strict" | "moderate" | "lenient";
  };
}

// ---- H2H ----
export interface TotoH2H {
  totalMatches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoals: number;
  recentMatches: TotoH2HMatch[];
}

export interface TotoH2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  winner: "home" | "draw" | "away";
}

// ---- Önemli Faktörler ----
export interface TotoKeyFactor {
  type: "positive" | "negative" | "neutral" | "warning";
  icon: string;                  // Lucide icon name
  title: string;
  description: string;
  impactLevel: "high" | "medium" | "low";
  affectsTeam?: "home" | "away" | "both";
}

// ---- AI Tahmin ----
export interface TotoAIPrediction {
  recommendation: TotoSelection; // Önerilen seçim
  confidence: number;            // 0-100
  reasoning: string;             // Açıklama
  riskLevel: "low" | "medium" | "high";
  alternativePick?: TotoSelection;
  alternativeReason?: string;
  // Skor tahmini
  predictedScore?: string;       // "2-1"
  topScores?: { score: string; probability: number }[];
}

// ---- Kullanıcı Kuponu ----
export interface TotoUserCoupon {
  id: string;
  programId: string;
  programName: string;
  createdAt: string;
  updatedAt: string;
  columns: TotoColumn[];         // Birden fazla kolon
  status: "active" | "settled" | "cancelled";
  stake: number;                 // Yatırılan tutar
  potentialWin?: number;
  result?: {
    correctCount: number;
    totalMatches: number;
    won: boolean;
    prize?: number;
  };
}

// ---- Kolon (Bir seçim seti) ----
export interface TotoColumn {
  id: string;
  label: string;                 // "Kolon 1", "Sistem 2/3"
  selections: Record<string, TotoSelection[]>; // matchId -> ["1"], ["1", "0"], etc.
  type: "single" | "system";     // Tek kolon veya sistem
  systemSize?: number;           // Sistem kuponda kaç maç banko değil
  totalCombinations: number;     // Toplam kombinasyon sayısı
  costPerColumn: number;         // Kolon başı maliyet
  totalCost: number;             // Toplam maliyet
}

// ---- Bülten Özet İstatistikleri ----
export interface TotoBulletinSummary {
  totalMatches: number;
  matchesByLeague: { league: string; count: number; flag: string }[];
  averageOdds: { home: number; draw: number; away: number };

  // Dağılım analizi
  distribution: {
    strongHome: number;          // Ev sahibi %60+ favori
    balanced: number;            // Dengeli maçlar
    strongAway: number;          // Deplasman %60+ favori
  };

  // AI genel değerlendirme
  aiSummary: string;
  difficulty: "easy" | "medium" | "hard" | "very_hard";
  expectedCorrect: number;       // Beklenen doğru tahmin sayısı

  // Popular picks
  popularPicks: { matchId: string; pick: TotoSelection; reason: string }[];

  // ---- Spor Toto özel kupon stratejisi ----
  // Banko adayları (yüksek güven, düşük sürpriz)
  bankoCandidates: { matchId: string; pick: TotoSelection; confidence: number; reason: string }[];

  // Sürpriz alarmı (banko görünüp sürpriz çıkabilecek)
  surpriseAlerts: { matchId: string; favoritePick: TotoSelection; upsetPick: TotoSelection; reason: string; surpriseScore: number }[];

  // Çoklu seçim önerileri (1X, X2, 12)
  doubleChanceCandidates: { matchId: string; picks: TotoSelection[]; reason: string }[];

  // TR vs Yabancı dağılımı
  tierBreakdown: {
    trBanko: number;
    foreignSurprise: number;
  };
}
