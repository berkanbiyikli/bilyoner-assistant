// ============================================
// Desteklenen Lig Tanımları
// ============================================

export type VolatilityLevel = "high" | "medium" | "low";

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  flag: string;
  priority: number; // 1 = en yüksek
  volatility: VolatilityLevel; // Kaos potansiyeli
}

export const LEAGUES: LeagueConfig[] = [
  // Türkiye
  { id: 203, name: "Süper Lig", country: "Turkey", flag: "🇹🇷", priority: 1, volatility: "medium" },
  { id: 204, name: "1. Lig", country: "Turkey", flag: "🇹🇷", priority: 3, volatility: "high" },
  { id: 552, name: "TFF 2. Lig", country: "Turkey", flag: "🇹🇷", priority: 4, volatility: "high" },
  { id: 553, name: "TFF 3. Lig", country: "Turkey", flag: "🇹🇷", priority: 5, volatility: "high" },

  // İngiltere
  { id: 39, name: "Premier League", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 1, volatility: "low" },
  { id: 40, name: "Championship", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 3, volatility: "high" },
  { id: 41, name: "League One", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 4, volatility: "high" },
  { id: 42, name: "League Two", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 4, volatility: "high" },
  { id: 43, name: "National League", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 5, volatility: "high" },

  // İspanya
  { id: 140, name: "La Liga", country: "Spain", flag: "🇪🇸", priority: 1, volatility: "low" },
  { id: 141, name: "La Liga 2", country: "Spain", flag: "🇪🇸", priority: 3, volatility: "high" },

  // İtalya
  { id: 135, name: "Serie A", country: "Italy", flag: "🇮🇹", priority: 1, volatility: "low" },
  { id: 136, name: "Serie B", country: "Italy", flag: "🇮🇹", priority: 3, volatility: "high" },
  { id: 138, name: "Serie C - Girone A", country: "Italy", flag: "🇮🇹", priority: 4, volatility: "high" },
  { id: 942, name: "Serie C - Girone B", country: "Italy", flag: "🇮🇹", priority: 4, volatility: "high" },
  { id: 943, name: "Serie C - Girone C", country: "Italy", flag: "🇮🇹", priority: 4, volatility: "high" },

  // Almanya
  { id: 78, name: "Bundesliga", country: "Germany", flag: "🇩🇪", priority: 1, volatility: "medium" },
  { id: 79, name: "2. Bundesliga", country: "Germany", flag: "🇩🇪", priority: 3, volatility: "high" },
  { id: 80, name: "3. Liga", country: "Germany", flag: "🇩🇪", priority: 4, volatility: "high" },
  { id: 81, name: "Regionalliga West", country: "Germany", flag: "🇩🇪", priority: 5, volatility: "high" },
  { id: 82, name: "Regionalliga Nordost", country: "Germany", flag: "🇩🇪", priority: 5, volatility: "high" },
  { id: 83, name: "Regionalliga Nord", country: "Germany", flag: "🇩🇪", priority: 5, volatility: "high" },
  { id: 84, name: "Regionalliga Südwest", country: "Germany", flag: "🇩🇪", priority: 5, volatility: "high" },
  { id: 85, name: "Regionalliga Bayern", country: "Germany", flag: "🇩🇪", priority: 5, volatility: "high" },

  // Fransa
  { id: 61, name: "Ligue 1", country: "France", flag: "🇫🇷", priority: 2, volatility: "low" },
  { id: 62, name: "Ligue 2", country: "France", flag: "🇫🇷", priority: 3, volatility: "high" },

  // Portekiz
  { id: 94, name: "Primeira Liga", country: "Portugal", flag: "🇵🇹", priority: 2, volatility: "medium" },
  { id: 95, name: "Liga Portugal 2", country: "Portugal", flag: "🇵🇹", priority: 4, volatility: "high" },

  // Hollanda
  { id: 88, name: "Eredivisie", country: "Netherlands", flag: "🇳🇱", priority: 2, volatility: "medium" },
  { id: 89, name: "Eerste Divisie", country: "Netherlands", flag: "🇳🇱", priority: 4, volatility: "high" },

  // Belçika
  { id: 144, name: "Jupiler Pro League", country: "Belgium", flag: "🇧🇪", priority: 3, volatility: "medium" },

  // İskoçya
  { id: 179, name: "Premiership", country: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", priority: 3, volatility: "medium" },
  { id: 180, name: "Championship", country: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", priority: 4, volatility: "high" },

  // İskandinav Ligleri
  { id: 113, name: "Allsvenskan", country: "Sweden", flag: "🇸🇪", priority: 3, volatility: "medium" },
  { id: 114, name: "Superettan", country: "Sweden", flag: "🇸🇪", priority: 4, volatility: "high" },
  { id: 103, name: "Eliteserien", country: "Norway", flag: "🇳🇴", priority: 3, volatility: "medium" },
  { id: 104, name: "OBOS-ligaen", country: "Norway", flag: "🇳🇴", priority: 4, volatility: "high" },
  { id: 119, name: "Superliga", country: "Denmark", flag: "🇩🇰", priority: 3, volatility: "medium" },
  { id: 120, name: "1st Division", country: "Denmark", flag: "🇩🇰", priority: 4, volatility: "high" },
  { id: 244, name: "Veikkausliiga", country: "Finland", flag: "🇫🇮", priority: 4, volatility: "high" },
  { id: 164, name: "Úrvalsdeild", country: "Iceland", flag: "🇮🇸", priority: 4, volatility: "high" },

  // Doğu Avrupa
  { id: 106, name: "Ekstraklasa", country: "Poland", flag: "🇵🇱", priority: 3, volatility: "medium" },
  { id: 107, name: "I Liga", country: "Poland", flag: "🇵🇱", priority: 4, volatility: "high" },
  { id: 345, name: "Czech Liga", country: "Czech Republic", flag: "🇨🇿", priority: 3, volatility: "medium" },
  { id: 333, name: "Premier League", country: "Ukraine", flag: "🇺🇦", priority: 3, volatility: "high" },
  { id: 283, name: "Liga I", country: "Romania", flag: "🇷🇴", priority: 3, volatility: "high" },
  { id: 271, name: "NB I", country: "Hungary", flag: "🇭🇺", priority: 3, volatility: "high" },
  { id: 172, name: "First League", country: "Bulgaria", flag: "🇧🇬", priority: 4, volatility: "high" },
  { id: 332, name: "Super Liga", country: "Slovakia", flag: "🇸🇰", priority: 4, volatility: "high" },
  { id: 373, name: "PrvaLiga", country: "Slovenia", flag: "🇸🇮", priority: 4, volatility: "high" },
  { id: 310, name: "Superliga", country: "Albania", flag: "🇦🇱", priority: 4, volatility: "high" },
  { id: 318, name: "First Division", country: "Cyprus", flag: "🇨🇾", priority: 4, volatility: "high" },
  { id: 362, name: "Premier Liga", country: "Bosnia", flag: "🇧🇦", priority: 4, volatility: "high" },
  { id: 210, name: "HNL", country: "Croatia", flag: "🇭🇷", priority: 3, volatility: "high" },
  { id: 286, name: "Super Liga", country: "Serbia", flag: "🇷🇸", priority: 3, volatility: "high" },
  { id: 197, name: "Super League 1", country: "Greece", flag: "🇬🇷", priority: 3, volatility: "medium" },

  // Rusya
  { id: 235, name: "Premier Liga", country: "Russia", flag: "🇷🇺", priority: 3, volatility: "medium" },
  { id: 236, name: "FNL", country: "Russia", flag: "🇷🇺", priority: 4, volatility: "high" },

  // İsviçre
  { id: 207, name: "Super League", country: "Switzerland", flag: "🇨🇭", priority: 3, volatility: "medium" },
  { id: 208, name: "Challenge League", country: "Switzerland", flag: "🇨🇭", priority: 4, volatility: "high" },

  // Avusturya
  { id: 218, name: "Bundesliga", country: "Austria", flag: "🇦🇹", priority: 3, volatility: "medium" },
  { id: 219, name: "2. Liga", country: "Austria", flag: "🇦🇹", priority: 4, volatility: "high" },

  // İsrail
  { id: 382, name: "Ligat Ha'al", country: "Israel", flag: "🇮🇱", priority: 3, volatility: "high" },

  // Güney Amerika
  { id: 71, name: "Brasileirão Serie A", country: "Brazil", flag: "🇧🇷", priority: 2, volatility: "high" },
  { id: 72, name: "Brasileirão Serie B", country: "Brazil", flag: "🇧🇷", priority: 3, volatility: "high" },
  { id: 128, name: "Liga Profesional", country: "Argentina", flag: "🇦🇷", priority: 2, volatility: "high" },
  { id: 239, name: "Primera A", country: "Colombia", flag: "🇨🇴", priority: 3, volatility: "high" },
  { id: 265, name: "Primera División", country: "Chile", flag: "🇨🇱", priority: 3, volatility: "high" },
  { id: 268, name: "Primera División", country: "Uruguay", flag: "🇺🇾", priority: 3, volatility: "high" },
  { id: 281, name: "Liga 1", country: "Peru", flag: "🇵🇪", priority: 4, volatility: "high" },
  { id: 242, name: "Serie A", country: "Ecuador", flag: "🇪🇨", priority: 4, volatility: "high" },
  { id: 157, name: "División de Honor", country: "Paraguay", flag: "🇵🇾", priority: 4, volatility: "high" },

  // Kuzey & Orta Amerika
  { id: 253, name: "MLS", country: "USA", flag: "🇺🇸", priority: 3, volatility: "high" },
  { id: 262, name: "Liga MX", country: "Mexico", flag: "🇲🇽", priority: 3, volatility: "high" },

  // Asya
  { id: 98, name: "J1 League", country: "Japan", flag: "🇯🇵", priority: 3, volatility: "medium" },
  { id: 99, name: "J2 League", country: "Japan", flag: "🇯🇵", priority: 4, volatility: "high" },
  { id: 292, name: "K League 1", country: "South Korea", flag: "🇰🇷", priority: 3, volatility: "medium" },
  { id: 169, name: "Super League", country: "China", flag: "🇨🇳", priority: 4, volatility: "high" },
  { id: 323, name: "Super League", country: "India", flag: "🇮🇳", priority: 4, volatility: "high" },

  // Orta Doğu
  { id: 307, name: "Saudi Pro League", country: "Saudi Arabia", flag: "🇸🇦", priority: 3, volatility: "medium" },
  { id: 305, name: "Stars League", country: "Qatar", flag: "🇶🇦", priority: 4, volatility: "high" },
  { id: 302, name: "Pro League", country: "UAE", flag: "🇦🇪", priority: 4, volatility: "high" },

  // Okyanusya
  { id: 188, name: "A-League", country: "Australia", flag: "🇦🇺", priority: 3, volatility: "high" },

  // Afrika
  { id: 200, name: "Botola Pro", country: "Morocco", flag: "🇲🇦", priority: 4, volatility: "high" },
  { id: 202, name: "Ligue Professionnelle 1", country: "Tunisia", flag: "🇹🇳", priority: 4, volatility: "high" },
  { id: 233, name: "Premier League", country: "Egypt", flag: "🇪🇬", priority: 4, volatility: "high" },

  // Avrupa Kupaları
  { id: 2, name: "Champions League", country: "World", flag: "🌍", priority: 1, volatility: "low" },
  { id: 3, name: "Europa League", country: "World", flag: "🌍", priority: 1, volatility: "low" },
  { id: 848, name: "Conference League", country: "World", flag: "🌍", priority: 2, volatility: "medium" },

  // Milli Takım
  { id: 4, name: "Euro Championship", country: "World", flag: "🌍", priority: 1, volatility: "low" },
  { id: 1, name: "World Cup", country: "World", flag: "🌍", priority: 1, volatility: "low" },
  { id: 5, name: "UEFA Nations League", country: "World", flag: "🌍", priority: 2, volatility: "medium" },
  { id: 6, name: "World Cup Qualifiers - Africa", country: "World", flag: "🌍", priority: 3, volatility: "high" },
  { id: 32, name: "World Cup Qualifiers - Europe", country: "World", flag: "🌍", priority: 2, volatility: "medium" },
  { id: 34, name: "World Cup Qualifiers - South America", country: "World", flag: "🌍", priority: 2, volatility: "high" },

  // Copa / Kupa maçları
  { id: 11, name: "Copa America", country: "World", flag: "🌍", priority: 2, volatility: "medium" },
  { id: 15, name: "Copa Libertadores", country: "World", flag: "🌍", priority: 2, volatility: "high" },
  { id: 16, name: "Copa Sudamericana", country: "World", flag: "🌍", priority: 3, volatility: "high" },
];

export const LEAGUE_IDS = LEAGUES.map((l) => l.id);

export function getLeagueById(id: number): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.id === id);
}

export function getLeagueByName(name: string): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.name === name);
}

export function getLeaguesByPriority(priority: number): LeagueConfig[] {
  return LEAGUES.filter((l) => l.priority <= priority);
}
