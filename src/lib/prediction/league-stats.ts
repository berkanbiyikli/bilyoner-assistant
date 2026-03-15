// ============================================
// Real League Statistics — Standings'ten Hesaplanan
// Hardcoded sabitleri GERÇEK lig verisiyle değiştirir:
//   - Ev sahibi avantaj çarpanı
//   - Takım başı maç başı ortalama gol
//   - Overdispersion (gol dağılımı varyansı)
// ============================================

import { getStandings, getCurrentSeason } from "@/lib/api-football";
import { getCached, setCache } from "@/lib/cache";
import type { StandingEntry } from "@/types/api-football";

export interface LeagueRealStats {
  homeAdvantage: number;      // Lambda çarpanı (ör: 1.08)
  avgGoalsPerTeam: number;    // Takım başı maç başı ortalama gol
  overdispersion: number;     // NB r parametresi
  totalGames: number;         // Veri kaynağı büyüklüğü
}

const CACHE_TTL = 24 * 3600; // 24 saat

/**
 * Gerçek lig istatistiklerini standings verisinden hesapla.
 * Hardcoded tablolar yerine bunu kullan.
 */
export async function getLeagueRealStats(leagueId: number): Promise<LeagueRealStats | null> {
  const cacheKey = `league-real-stats:${leagueId}`;
  const cached = getCached<LeagueRealStats>(cacheKey);
  if (cached) return cached;

  try {
    const season = getCurrentSeason();
    const standingsData = await getStandings(leagueId, season);
    if (!standingsData?.league?.standings?.[0]) return null;

    const standings: StandingEntry[] = standingsData.league.standings[0];
    if (standings.length < 4) return null; // Çok az takım — güvenilir değil

    // Tüm takımların ev/deplasman istatistiklerini topla
    let totalHomeGoalsFor = 0;
    let totalHomeGoalsAgainst = 0;
    let totalAwayGoalsFor = 0;
    let totalAwayGoalsAgainst = 0;
    let totalHomeGames = 0;
    let totalAwayGames = 0;
    let totalHomeWins = 0;
    let totalAwayWins = 0;

    for (const team of standings) {
      totalHomeGoalsFor += team.home.goals.for;
      totalHomeGoalsAgainst += team.home.goals.against;
      totalAwayGoalsFor += team.away.goals.for;
      totalAwayGoalsAgainst += team.away.goals.against;
      totalHomeGames += team.home.played;
      totalAwayGames += team.away.played;
      totalHomeWins += team.home.win;
      totalAwayWins += team.away.win;
    }

    if (totalHomeGames === 0 || totalAwayGames === 0) return null;

    // === Ev sahibi avantajı ===
    // Ev sahibi maç başı gol ortalaması / Deplasman maç başı gol ortalaması
    const homeGoalsPerGame = totalHomeGoalsFor / totalHomeGames;
    const awayGoalsPerGame = totalAwayGoalsFor / totalAwayGames;
    let homeAdvantage = awayGoalsPerGame > 0 ? homeGoalsPerGame / awayGoalsPerGame : 1.05;
    // Makul aralıkta sınırla (1.00 - 1.20)
    homeAdvantage = Math.max(1.00, Math.min(1.20, homeAdvantage));

    // === Takım başı ortalama gol ===
    const totalGoals = totalHomeGoalsFor + totalAwayGoalsFor;
    const totalGames = (totalHomeGames + totalAwayGames) / 2; // Her maç iki kez sayılıyor
    const avgGoalsPerTeam = totalGames > 0 ? (totalGoals / 2) / totalGames : 1.40;

    // === Overdispersion (gol varyansından) ===
    // Takımların gol ortalamalarının varyansını hesapla
    // Yüksek varyans → düşük r → daha fazla sürpriz
    const teamGoalAvgs: number[] = [];
    for (const team of standings) {
      const played = team.all.played;
      if (played > 0) {
        teamGoalAvgs.push(team.all.goals.for / played);
      }
    }

    let overdispersion = 6.0; // Default
    if (teamGoalAvgs.length >= 6) {
      const mean = teamGoalAvgs.reduce((a, b) => a + b, 0) / teamGoalAvgs.length;
      const variance = teamGoalAvgs.reduce((sum, g) => sum + (g - mean) ** 2, 0) / teamGoalAvgs.length;
      const cv = mean > 0 ? variance / mean : 1; // Coefficient of variation

      // CV yüksek → takımlar arası fark büyük → overdispersion düşük (daha öngörülebilir)
      // CV düşük → dengeli lig → overdispersion yüksek (bireysel maçlarda sürpriz olur)
      if (cv > 0.5) overdispersion = 4.5;       // Çok dengesiz (Bundesliga gibi)
      else if (cv > 0.35) overdispersion = 5.0;  // Dengesiz
      else if (cv > 0.25) overdispersion = 5.5;  // Orta
      else if (cv > 0.15) overdispersion = 6.0;  // Dengeli
      else overdispersion = 7.0;                  // Çok dengeli (Serie A gibi)
    }

    const stats: LeagueRealStats = {
      homeAdvantage: Math.round(homeAdvantage * 1000) / 1000,
      avgGoalsPerTeam: Math.round(avgGoalsPerTeam * 100) / 100,
      overdispersion,
      totalGames: Math.round(totalGames),
    };

    setCache(cacheKey, stats, CACHE_TTL);
    console.log(`[LEAGUE-STATS] Liga ${leagueId}: HA=${stats.homeAdvantage}, AvgGoals=${stats.avgGoalsPerTeam}, OD=${stats.overdispersion} (${stats.totalGames} maç)`);
    return stats;
  } catch (err) {
    console.warn(`[LEAGUE-STATS] Liga ${leagueId} istatistikleri alınamadı:`, err);
    return null;
  }
}
