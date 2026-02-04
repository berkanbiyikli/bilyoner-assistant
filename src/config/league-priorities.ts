/**
 * Lig Öncelik Sıralaması
 * Büyük ve popüler ligler önce gösterilir
 */

// =====================================
// 🏠 Dinamik Ev Avantajı Katsayıları
// =====================================

/**
 * Lig bazlı ev avantajı çarpanları (Expert Values)
 * Değer aralığı: 1.0 (nötr) - 1.40 (çok yüksek ev avantajı)
 * 
 * Kaynaklar:
 * - Türkiye: Yüksek taraftar baskısı, seyahat zorlukları
 * - Bundesliga: Düşük (away takımlar dirençli)
 * - Champions League: Nötre yakın (kaliteli takımlar)
 */
export const LEAGUE_HOME_ADVANTAGE: Record<number, number> = {
  // 🇹🇷 Türkiye (Yüksek ev avantajı)
  203: 1.28,  // Süper Lig
  204: 1.25,  // TFF 1. Lig
  206: 1.22,  // Türkiye Kupası
  
  // 🏆 Avrupa Büyük 5
  39: 1.15,   // Premier League
  140: 1.18,  // La Liga
  135: 1.20,  // Serie A
  78: 1.12,   // Bundesliga (en düşük)
  61: 1.14,   // Ligue 1
  
  // 🇪🇺 UEFA Turnuvaları (Nötre yakın)
  2: 1.08,    // Champions League
  3: 1.10,    // Europa League
  848: 1.10,  // Conference League
  
  // 🌍 Diğer Avrupa Ligleri
  94: 1.16,   // Primeira Liga (Portekiz)
  88: 1.14,   // Eredivisie (Hollanda)
  144: 1.15,  // Jupiler Pro League (Belçika)
  179: 1.18,  // Scottish Premiership
  197: 1.22,  // Super League (Yunanistan)
  
  // 🌎 Güney Amerika (Yüksek ev avantajı)
  71: 1.30,   // Serie A (Brezilya)
  128: 1.32,  // Liga Profesional (Arjantin)
  
  // 🇸🇦 Suudi Arabistan
  307: 1.20,  // Saudi Pro League
};

/** Varsayılan ev avantajı (listeye dahil olmayanlar için) */
export const DEFAULT_HOME_ADVANTAGE = 1.15;

/** Sezon başı güvenlik eşiği - minimum hafta sayısı */
export const MIN_WEEKS_FOR_DYNAMIC = 5;

/** Expert ağırlığı - sezon başında %80, sonra %50 */
export const EXPERT_WEIGHT_EARLY_SEASON = 0.8;
export const EXPERT_WEIGHT_NORMAL = 0.5;

// =====================================
// 📊 Lig Öncelik Puanları
// =====================================

// Lig ID'leri ve öncelik puanları (yüksek = daha önemli)
export const LEAGUE_PRIORITIES: Record<number, number> = {
  // 🏆 Avrupa Büyük 5
  39: 100,   // Premier League (İngiltere)
  140: 99,   // La Liga (İspanya)
  135: 98,   // Serie A (İtalya)
  78: 97,    // Bundesliga (Almanya)
  61: 96,    // Ligue 1 (Fransa)
  
  // 🇹🇷 Türkiye
  203: 95,   // Süper Lig
  204: 70,   // 1. Lig (TFF 1. Lig)
  206: 85,   // Türkiye Kupası
  
  // 🏆 UEFA Turnuvaları
  2: 94,     // UEFA Champions League
  3: 93,     // UEFA Europa League
  848: 92,   // UEFA Europa Conference League
  
  // 🌍 Diğer Önemli Ligler
  94: 85,    // Primeira Liga (Portekiz)
  88: 84,    // Eredivisie (Hollanda)
  144: 83,   // Jupiler Pro League (Belçika)
  
  // 🇧🇷 Güney Amerika
  71: 80,    // Serie A (Brezilya)
  128: 79,   // Liga Profesional (Arjantin)
  
  // 🏴󠁧󠁢󠁳󠁣󠁴󠁿 İngiltere Alt Ligler
  40: 75,    // Championship
  41: 65,    // League One
  42: 60,    // League Two
  
  // 🏆 Lig Kupaları (Yüksek Öncelik - Güzel Maçlar!)
  45: 91,    // FA Cup (İngiltere)
  48: 90,    // EFL Cup / League Cup / Carabao Cup (İngiltere)
  143: 89,   // Copa del Rey (İspanya)
  137: 88,   // Coppa Italia (İtalya)
  81: 87,    // DFB Pokal (Almanya)
  66: 86,    // Coupe de France (Fransa)
  
  // 🇪🇸 İspanya Alt Ligler
  141: 74,   // La Liga 2
  
  // 🇮🇹 İtalya Alt Ligler
  136: 73,   // Serie B
  
  // 🇩🇪 Almanya Alt Ligler
  79: 72,    // 2. Bundesliga
  
  // 🇫🇷 Fransa Alt Ligler
  62: 71,    // Ligue 2
  
  // 🌍 Diğer Avrupa
  179: 50,   // Scottish Premiership
  197: 49,   // Superliga (Yunanistan)
  218: 48,   // Allsvenskan (İsveç)
  103: 47,   // Eliteserien (Norveç)
  119: 46,   // Superligaen (Danimarka)
  207: 45,   // Super League (İsviçre)
  235: 44,   // Premier Liga (Rusya - askıya alındı ama olabilir)
  106: 43,   // Ekstraklasa (Polonya)
  
  // 🇺🇸 Amerika
  253: 42,   // MLS
  262: 41,   // Liga MX (Meksika)
  
  // 🌏 Asya
  169: 35,   // J1 League (Japonya)
  292: 34,   // K League 1 (Güney Kore)
  307: 33,   // Saudi Pro League
  
  // 🏆 Uluslararası
  1: 90,     // World Cup
  4: 89,     // Euro Championship
  9: 88,     // Copa America
  6: 87,     // Africa Cup of Nations
};

// Varsayılan öncelik (listeye dahil olmayanlar için)
export const DEFAULT_PRIORITY = 10;

/**
 * Lig ID'sine göre öncelik puanını döndür
 */
export function getLeaguePriority(leagueId: number): number {
  return LEAGUE_PRIORITIES[leagueId] ?? DEFAULT_PRIORITY;
}

/**
 * İki ligi önceliğe göre karşılaştır (sort için)
 */
export function compareLeaguesByPriority(leagueIdA: number, leagueIdB: number): number {
  return getLeaguePriority(leagueIdB) - getLeaguePriority(leagueIdA);
}

// Lig kategorileri (UI için)
export const LEAGUE_CATEGORIES = {
  TOP_5: [39, 140, 135, 78, 61],
  TURKEY: [203, 204, 206],
  UEFA: [2, 3, 848],
  CUPS: [45, 48, 143, 137, 81, 66],  // 🏆 Lig Kupaları
  INTERNATIONAL: [1, 4, 9, 6],
} as const;

/**
 * Top 20 Ligler - Günlük Maçlar Paneli için
 * Bilyoner'de bahis yapılabilen en popüler 20 lig
 */
export const TOP_20_LEAGUES = [
  // 🏆 Avrupa Büyük 5
  { id: 39, name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 140, name: 'La Liga', country: 'Spain', flag: '🇪🇸' },
  { id: 135, name: 'Serie A', country: 'Italy', flag: '🇮🇹' },
  { id: 78, name: 'Bundesliga', country: 'Germany', flag: '🇩🇪' },
  { id: 61, name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
  
  // 🇹🇷 Türkiye
  { id: 203, name: 'Süper Lig', country: 'Turkey', flag: '🇹🇷' },
  { id: 204, name: 'TFF 1. Lig', country: 'Turkey', flag: '🇹🇷' },
  { id: 206, name: 'Türkiye Kupası', country: 'Turkey', flag: '🇹🇷' },
  
  // 🌍 Diğer Önemli Avrupa Ligleri
  { id: 94, name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹' },
  { id: 88, name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱' },
  { id: 144, name: 'Jupiler Pro League', country: 'Belgium', flag: '🇧🇪' },
  { id: 179, name: 'Scottish Premiership', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { id: 197, name: 'Super League', country: 'Greece', flag: '🇬🇷' },
  { id: 207, name: 'Super League', country: 'Switzerland', flag: '🇨🇭' },
  { id: 218, name: 'Allsvenskan', country: 'Sweden', flag: '🇸🇪' },
  { id: 119, name: 'Superligaen', country: 'Denmark', flag: '🇩🇰' },
  { id: 103, name: 'Eliteserien', country: 'Norway', flag: '🇳🇴' },
  { id: 106, name: 'Ekstraklasa', country: 'Poland', flag: '🇵🇱' },
  
  // � Lig Kupaları
  { id: 45, name: 'FA Cup', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 48, name: 'EFL Cup', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 143, name: 'Copa del Rey', country: 'Spain', flag: '🇪🇸' },
  { id: 137, name: 'Coppa Italia', country: 'Italy', flag: '🇮🇹' },
  { id: 81, name: 'DFB Pokal', country: 'Germany', flag: '🇩🇪' },
  { id: 66, name: 'Coupe de France', country: 'France', flag: '🇫🇷' },
  
  // �🌏 Diğer Kıtalar
  { id: 307, name: 'Saudi Pro League', country: 'Saudi Arabia', flag: '🇸🇦' },
  { id: 71, name: 'Serie A', country: 'Brazil', flag: '🇧🇷' },
  { id: 128, name: 'Liga Profesional', country: 'Argentina', flag: '🇦🇷' },
] as const;

// Top 20 Lig ID'leri (hızlı erişim için)
export const TOP_20_LEAGUE_IDS: number[] = TOP_20_LEAGUES.map(l => l.id);

/**
 * Top 20 Lig mi kontrol et
 */
export function isTop20League(leagueId: number): boolean {
  return TOP_20_LEAGUE_IDS.includes(leagueId);
}

/**
 * Bilyoner'de olan ligler (kupon önerileri için)
 * Sadece bu liglerden öneri yapılacak
 */
export const BILYONER_LEAGUES: number[] = [
  // Büyük 5 Avrupa Ligi
  39,   // Premier League (İngiltere)
  140,  // La Liga (İspanya)
  135,  // Serie A (İtalya)
  78,   // Bundesliga (Almanya)
  61,   // Ligue 1 (Fransa)
  
  // Türkiye
  203,  // Süper Lig
  204,  // TFF 1. Lig
  206,  // Türkiye Kupası
  
  // UEFA Turnuvaları
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  848,  // UEFA Europa Conference League
  
  // İngiltere Alt Ligler
  40,   // Championship
  45,   // FA Cup
  48,   // League Cup (Carabao Cup)
  
  // İspanya
  141,  // La Liga 2
  143,  // Copa del Rey
  
  // İtalya
  136,  // Serie B
  137,  // Coppa Italia
  
  // Almanya
  79,   // 2. Bundesliga
  81,   // DFB Pokal
  
  // Fransa
  62,   // Ligue 2
  66,   // Coupe de France
  
  // Diğer Popüler Avrupa Ligleri
  94,   // Primeira Liga (Portekiz)
  88,   // Eredivisie (Hollanda)
  144,  // Jupiler Pro League (Belçika)
  179,  // Scottish Premiership
  
  // Güney Amerika
  71,   // Serie A (Brezilya)
  128,  // Liga Profesional (Arjantin)
  
  // Uluslararası
  1,    // World Cup
  4,    // Euro Championship
  5,    // UEFA Nations League
];

/**
 * Lig Bilyoner'de var mı kontrol et
 */
export function isLeagueInBilyoner(leagueId: number): boolean {
  return BILYONER_LEAGUES.includes(leagueId);
}

/**
 * Lig kategorisini belirle
 */
export function getLeagueCategory(leagueId: number): string {
  if (LEAGUE_CATEGORIES.TOP_5.includes(leagueId as never)) return 'top5';
  if (LEAGUE_CATEGORIES.TURKEY.includes(leagueId as never)) return 'turkey';
  if (LEAGUE_CATEGORIES.UEFA.includes(leagueId as never)) return 'uefa';
  if (LEAGUE_CATEGORIES.CUPS.includes(leagueId as never)) return 'cups';
  if (LEAGUE_CATEGORIES.INTERNATIONAL.includes(leagueId as never)) return 'international';
  return 'other';
}
