// ============================================
// Desteklenen Lig Tanımları
// ============================================

export interface LeagueConfig {
  id: number;
  name: string;
  country: string;
  flag: string;
  priority: number; // 1 = en yüksek
}

export const LEAGUES: LeagueConfig[] = [
  // Türkiye
  { id: 203, name: "Süper Lig", country: "Turkey", flag: "🇹🇷", priority: 1 },
  { id: 204, name: "1. Lig", country: "Turkey", flag: "🇹🇷", priority: 3 },

  // Top 5 Avrupa Ligi
  { id: 39, name: "Premier League", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", priority: 1 },
  { id: 140, name: "La Liga", country: "Spain", flag: "🇪🇸", priority: 1 },
  { id: 135, name: "Serie A", country: "Italy", flag: "🇮🇹", priority: 1 },
  { id: 78, name: "Bundesliga", country: "Germany", flag: "🇩🇪", priority: 1 },
  { id: 61, name: "Ligue 1", country: "France", flag: "🇫🇷", priority: 2 },

  // Diğer Popüler Ligler
  { id: 94, name: "Primeira Liga", country: "Portugal", flag: "🇵🇹", priority: 2 },
  { id: 88, name: "Eredivisie", country: "Netherlands", flag: "🇳🇱", priority: 2 },
  { id: 144, name: "Jupiler Pro League", country: "Belgium", flag: "🇧🇪", priority: 3 },
  { id: 235, name: "Premier Liga", country: "Russia", flag: "🇷🇺", priority: 3 },

  // Avrupa Kupaları
  { id: 2, name: "Champions League", country: "World", flag: "🌍", priority: 1 },
  { id: 3, name: "Europa League", country: "World", flag: "🌍", priority: 1 },
  { id: 848, name: "Conference League", country: "World", flag: "🌍", priority: 2 },
];

export const LEAGUE_IDS = LEAGUES.map((l) => l.id);

export function getLeagueById(id: number): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.id === id);
}

export function getLeaguesByPriority(priority: number): LeagueConfig[] {
  return LEAGUES.filter((l) => l.priority <= priority);
}
