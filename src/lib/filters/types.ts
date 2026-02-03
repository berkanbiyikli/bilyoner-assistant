/**
 * Gelişmiş Filtreler - Types
 * Odds range, league selection, value threshold filtreleri
 */

export interface FilterState {
  // Oran Filtreleri
  odds: {
    minOdds: number;
    maxOdds: number;
    enabled: boolean;
  };
  
  // Value Threshold
  value: {
    minValue: number; // Minimum expected value yüzdesi
    enabled: boolean;
  };
  
  // Confidence
  confidence: {
    minConfidence: number; // Minimum güven skoru 0-100
    enabled: boolean;
  };
  
  // Lig Filtreleri
  leagues: {
    selectedLeagueIds: number[];
    enabled: boolean;
  };
  
  // Maç Durumu
  matchStatus: {
    showLive: boolean;
    showUpcoming: boolean;
    showFinished: boolean;
  };
  
  // Bahis Tipi
  betTypes: {
    selectedTypes: string[]; // 'home', 'draw', 'away', 'over25', 'under25', 'btts', etc.
    enabled: boolean;
  };
  
  // Saat Aralığı
  timeRange: {
    startHour: number; // 0-23
    endHour: number; // 0-23
    enabled: boolean;
  };
  
  // Sadece Bilyoner Ligleri
  bilyonerOnly: boolean;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  odds: {
    minOdds: 1.2,
    maxOdds: 10,
    enabled: false,
  },
  value: {
    minValue: 5, // %5
    enabled: false,
  },
  confidence: {
    minConfidence: 60, // %60
    enabled: false,
  },
  leagues: {
    selectedLeagueIds: [],
    enabled: false,
  },
  matchStatus: {
    showLive: true,
    showUpcoming: true,
    showFinished: false,
  },
  betTypes: {
    selectedTypes: [],
    enabled: false,
  },
  timeRange: {
    startHour: 0,
    endHour: 23,
    enabled: false,
  },
  bilyonerOnly: true, // Varsayılan olarak sadece Bilyoner ligleri
};

// Bahis türleri
export const BET_TYPES = [
  { id: 'home', label: 'MS 1', desc: 'Ev Sahibi Kazanır' },
  { id: 'draw', label: 'MS X', desc: 'Beraberlik' },
  { id: 'away', label: 'MS 2', desc: 'Deplasman Kazanır' },
  { id: 'over25', label: 'Üst 2.5', desc: '2.5 Gol Üstü' },
  { id: 'under25', label: 'Alt 2.5', desc: '2.5 Gol Altı' },
  { id: 'btts', label: 'KG Var', desc: 'Karşılıklı Gol' },
  { id: 'noboth', label: 'KG Yok', desc: 'Tek Taraf Gol' },
  { id: 'over15', label: 'Üst 1.5', desc: '1.5 Gol Üstü' },
  { id: 'under35', label: 'Alt 3.5', desc: '3.5 Gol Altı' },
] as const;

export type BetTypeId = typeof BET_TYPES[number]['id'];
