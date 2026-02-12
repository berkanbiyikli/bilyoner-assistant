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

  // Top 5 Avrupa Ligi
  { id: 39, name: "Premier League", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 1, volatility: "low" },
  { id: 140, name: "La Liga", country: "Spain", flag: "🇪🇸", priority: 1, volatility: "low" },
  { id: 135, name: "Serie A", country: "Italy", flag: "🇮🇹", priority: 1, volatility: "low" },
  { id: 78, name: "Bundesliga", country: "Germany", flag: "🇩🇪", priority: 1, volatility: "medium" },
  { id: 61, name: "Ligue 1", country: "France", flag: "🇫🇷", priority: 2, volatility: "low" },

  // Diğer Popüler Ligler
  { id: 94, name: "Primeira Liga", country: "Portugal", flag: "🇵🇹", priority: 2, volatility: "medium" },
  { id: 88, name: "Eredivisie", country: "Netherlands", flag: "🇳🇱", priority: 2, volatility: "medium" },
  { id: 144, name: "Jupiler Pro League", country: "Belgium", flag: "🇧🇪", priority: 3, volatility: "medium" },
  { id: 235, name: "Premier Liga", country: "Russia", flag: "🇷🇺", priority: 3, volatility: "medium" },

  // Güney Amerika (Yüksek Volatilite)
  { id: 71, name: "Brasileirão Serie A", country: "Brazil", flag: "🇧🇷", priority: 2, volatility: "high" },
  { id: 72, name: "Brasileirão Serie B", country: "Brazil", flag: "🇧🇷", priority: 3, volatility: "high" },
  { id: 128, name: "Liga Profesional", country: "Argentina", flag: "🇦🇷", priority: 2, volatility: "high" },
  { id: 239, name: "Primera A", country: "Colombia", flag: "🇨🇴", priority: 3, volatility: "high" },

  // Diğer Volatil Ligler
  { id: 253, name: "MLS", country: "USA", flag: "🇺🇸", priority: 3, volatility: "high" },
  { id: 218, name: "Bundesliga", country: "Austria", flag: "🇦🇹", priority: 3, volatility: "medium" },

  // Avrupa Kupaları
  { id: 2, name: "Champions League", country: "World", flag: "🌍", priority: 1, volatility: "low" },
  { id: 3, name: "Europa League", country: "World", flag: "🌍", priority: 1, volatility: "low" },
  { id: 848, name: "Conference League", country: "World", flag: "🌍", priority: 2, volatility: "medium" },
];

export const LEAGUE_IDS = LEAGUES.map((l) => l.id);

export function getLeagueById(id: number): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.id === id);
}

export function getLeaguesByPriority(priority: number): LeagueConfig[] {
  return LEAGUES.filter((l) => l.priority <= priority);
}
