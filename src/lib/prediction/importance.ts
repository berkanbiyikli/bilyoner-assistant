// ============================================
// Match Importance (Motivasyon Filtresi)
// "Black Swan" savunması: Sezon sonu motivasyon farkları
// ============================================

import type { StandingsResponse, StandingEntry } from "@/types/api-football";
import { getStandings, getCurrentSeason } from "@/lib/api-football";
import { getCached, setCache } from "@/lib/cache";

/**
 * Takımın maç önemine göre motivasyon katsayısı
 * 
 * Senaryo bazlı çarpanlar:
 * - Şampiyonluk yarışı (1-3. sıra, fark ≤ 6 puan) → 1.08 boost
 * - Avrupa kupası yarışı (4-6. sıra, fark ≤ 4 puan) → 1.05 boost
 * - Küme düşme hattı (son 3-4, fark ≤ 6 puan) → 1.10 boost (hayatta kalma motivasyonu)
 * - Orta sıra, iddiası yok → 0.95 (motivasyon düşüklüğü)
 * - Şampiyon kesinleşmiş → 0.92 (rehavet)
 * - Küme düşmüş → 0.88 (moral çöküş)
 */
export interface MatchImportance {
  homeImportance: number;   // 0.88 – 1.10
  awayImportance: number;
  homeContext: string;       // "Şampiyonluk yarışı", "Küme düşme hattı" vb.
  awayContext: string;
  motivationGap: number;     // Takımlar arası motivasyon farkı (mutlak)
  warning?: string;          // Black Swan uyarısı
}

interface TeamStandingContext {
  rank: number;
  points: number;
  totalTeams: number;
  gapToTop: number;          // Lidere puan farkı
  gapToRelegation: number;   // Küme düşme hattına puan farkı  
  gapToEurope: number;       // Avrupa kupası hattına puan farkı
  form: string;
  matchesPlayed: number;
  totalMatches: number;       // Lig toplam maç sayısı (genelde 34-38)
  seasonProgress: number;     // 0-1 arası, sezonun neresindeyiz
}

function analyzeTeamContext(
  teamId: number,
  standings: StandingEntry[]
): TeamStandingContext | null {
  const teamEntry = standings.find((s) => s.team.id === teamId);
  if (!teamEntry) return null;

  const totalTeams = standings.length;
  const leader = standings[0];
  const relegationLine = Math.max(totalTeams - 3, 1); // Son 3 takım küme düşer (genelde)
  const europeLine = Math.min(6, totalTeams - 1); // İlk 6 Avrupa
  
  const relegationTeam = standings[relegationLine - 1];
  const europeTeam = standings[europeLine - 1];

  // Toplam maç hesabı (çift devreli lig)
  const totalMatches = (totalTeams - 1) * 2;
  const matchesPlayed = teamEntry.all.played;
  const seasonProgress = matchesPlayed / totalMatches;

  return {
    rank: teamEntry.rank,
    points: teamEntry.points,
    totalTeams,
    gapToTop: leader.points - teamEntry.points,
    gapToRelegation: teamEntry.points - (relegationTeam?.points ?? 0),
    gapToEurope: (europeTeam?.points ?? 0) - teamEntry.points,
    form: teamEntry.form || "",
    matchesPlayed,
    totalMatches,
    seasonProgress,
  };
}

function getImportanceMultiplier(ctx: TeamStandingContext): { multiplier: number; context: string } {
  const isLateseason = ctx.seasonProgress > 0.7;  // Son %30
  const isEndgame = ctx.seasonProgress > 0.85;     // Son %15
  
  // --- Şampiyon kesinleşmiş ---
  if (ctx.rank === 1 && ctx.gapToTop === 0 && isEndgame) {
    // Lider ve 2.'ye fark çok açıksa
    // Bu bilgiyi direkt kontrol edemiyoruz ama rank=1 + endgame = rehavet riski
    return { multiplier: 0.95, context: "Lider — rehavet riski" };
  }

  // --- Küme düşmüş (matematiksel olarak kurtulma ihtimali çok düşük) ---
  if (ctx.rank >= ctx.totalTeams - 2 && ctx.gapToRelegation < -8 && isLateseason) {
    return { multiplier: 0.88, context: "Küme düşme kesinleşmiş — moral çöküşü" };
  }

  // --- Küme düşme hattı (hayatta kalma savaşı) ---
  if (ctx.rank >= ctx.totalTeams - 4 && ctx.gapToRelegation <= 6) {
    if (isEndgame) return { multiplier: 1.12, context: "Küme düşme finali — hayatta kalma" };
    if (isLateseason) return { multiplier: 1.10, context: "Küme düşme hattı — yüksek motivasyon" };
    return { multiplier: 1.05, context: "Küme düşme bölgesi" };
  }

  // --- Şampiyonluk yarışı ---
  if (ctx.rank <= 3 && ctx.gapToTop <= 6) {
    if (isEndgame) return { multiplier: 1.10, context: "Şampiyonluk finali — her puan kritik" };
    if (isLateseason) return { multiplier: 1.08, context: "Şampiyonluk yarışı" };
    return { multiplier: 1.04, context: "Zirve mücadelesi" };
  }

  // --- Avrupa kupası yarışı ---
  if (ctx.rank <= 7 && ctx.gapToEurope <= 4 && ctx.gapToEurope >= -4) {
    if (isLateseason) return { multiplier: 1.06, context: "Avrupa kupası yarışı" };
    return { multiplier: 1.03, context: "Avrupa hattı" };
  }

  // --- Orta sıra, iddiası kalmamış ---
  if (ctx.rank > 7 && ctx.rank < ctx.totalTeams - 4 && isLateseason) {
    // İddiası yok, ne küme düşme ne Avrupa
    if (ctx.gapToRelegation > 10 && ctx.gapToEurope > 8) {
      return { multiplier: 0.95, context: "Orta sıra — motivasyon düşük" };
    }
  }

  // --- Nötr ---
  return { multiplier: 1.0, context: "Normal motivasyon" };
}

/**
 * İki takım için maç önemini hesapla
 * Standings API'den puan durumunu çekip motivasyon katsayılarını döndürür
 */
export async function calculateMatchImportance(
  leagueId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<MatchImportance> {
  const defaultResult: MatchImportance = {
    homeImportance: 1.0,
    awayImportance: 1.0,
    homeContext: "Veri yok",
    awayContext: "Veri yok",
    motivationGap: 0,
  };

  // Avrupa kupalarında motivasyon filtresi farklı çalışır (grup/eleme)
  // Şimdilik sadece lig maçlarına uygula
  if ([2, 3, 848].includes(leagueId)) return defaultResult;

  try {
    const cacheKey = `standings-${leagueId}-${getCurrentSeason()}`;
    let standings = getCached<StandingEntry[]>(cacheKey);

    if (!standings) {
      const standingsData = await getStandings(leagueId, getCurrentSeason());
      if (!standingsData?.league?.standings?.[0]) return defaultResult;
      standings = standingsData.league.standings[0];
      setCache(cacheKey, standings, 3600); // 1 saat cache
    }

    const homeCtx = analyzeTeamContext(homeTeamId, standings);
    const awayCtx = analyzeTeamContext(awayTeamId, standings);

    if (!homeCtx || !awayCtx) return defaultResult;

    const homeResult = getImportanceMultiplier(homeCtx);
    const awayResult = getImportanceMultiplier(awayCtx);

    const motivationGap = Math.abs(homeResult.multiplier - awayResult.multiplier);

    // Black Swan uyarısı: Motivasyon farkı > 0.15 ise uyar
    let warning: string | undefined;
    if (motivationGap > 0.15) {
      const motivated = homeResult.multiplier > awayResult.multiplier ? "Ev sahibi" : "Deplasman";
      const unmotivated = homeResult.multiplier > awayResult.multiplier ? "Deplasman" : "Ev sahibi";
      warning = `⚠️ Motivasyon uçurumu: ${motivated} (${homeResult.multiplier > awayResult.multiplier ? homeResult.context : awayResult.context}) vs ${unmotivated} (${homeResult.multiplier > awayResult.multiplier ? awayResult.context : homeResult.context})`;
    }

    return {
      homeImportance: homeResult.multiplier,
      awayImportance: awayResult.multiplier,
      homeContext: `${homeResult.context} (${homeCtx.rank}.sıra, ${homeCtx.points}p)`,
      awayContext: `${awayResult.context} (${awayCtx.rank}.sıra, ${awayCtx.points}p)`,
      motivationGap: Math.round(motivationGap * 100) / 100,
      warning,
    };
  } catch (err) {
    console.error(`[IMPORTANCE] League ${leagueId} error:`, err);
    return defaultResult;
  }
}
