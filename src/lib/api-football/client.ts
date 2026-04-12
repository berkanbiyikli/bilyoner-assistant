// ============================================
// API-Football Client
// Tüm API-Football isteklerini merkezi yönetir
// ============================================

import type {
  ApiResponse,
  FixtureResponse,
  StandingsResponse,
  PredictionResponse,
  OddsResponse,
  InjuryResponse,
  LineupResponse,
  FixtureStatisticsResponse,
  H2HResponse,
  FixtureEvent,
  TeamStatisticsResponse,
} from "@/types/api-football";
import { getCached, setCache } from "@/lib/cache";

const API_KEY = process.env.API_FOOTBALL_KEY!;
const BASE_URL = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

// ---- Request Counter (sadece log amaçlı, engelleme yok) ----
let dailyRequestCount = 0;
let lastResetDate = new Date().toISOString().split("T")[0];

function checkAndResetCounter() {
  const today = new Date().toISOString().split("T")[0];
  if (today !== lastResetDate) {
    dailyRequestCount = 0;
    lastResetDate = today;
  }
}

export function getApiUsage() {
  checkAndResetCounter();
  return { used: dailyRequestCount, limit: 75000, remaining: 75000 - dailyRequestCount };
}

interface FetchOptions {
  revalidate?: number;
  cache?: RequestCache;
  cacheTtl?: number; // in-memory cache TTL in seconds
}

async function apiFetch<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  // In-memory cache kontrolü
  const cacheKey = `api:${endpoint}:${JSON.stringify(params)}`;
  const cacheTtl = options.cacheTtl || 0;
  if (cacheTtl > 0) {
    const cached = getCached<ApiResponse<T>>(cacheKey);
    if (cached) return cached;
  }

  const url = new URL(endpoint, BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Rate limit backoff: 5s, 10s
      const waitMs = attempt * 5000;
      console.log(`[API-FOOTBALL] Rate limit retry ${attempt}/${MAX_RETRIES}, waiting ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const res = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": API_KEY,
      },
      next: options.revalidate ? { revalidate: options.revalidate } : undefined,
      cache: options.cache,
    });

    dailyRequestCount++;

    if (!res.ok) {
      throw new Error(`API-Football error: ${res.status} ${res.statusText}`);
    }

    const data: ApiResponse<T> = await res.json();

    // Rate limit hatası — retry
    if (data.errors && typeof data.errors === "object") {
      const errObj = data.errors as Record<string, string>;
      if (errObj.rateLimit) {
        console.warn(`[API-FOOTBALL] Rate limited on ${endpoint}, attempt ${attempt + 1}/${MAX_RETRIES}`);
        lastError = new Error(errObj.rateLimit);
        continue;
      }
      // Diğer API hataları — log'la ama devam et
      if (Object.keys(errObj).length > 0) {
        console.warn(`[API-FOOTBALL] API error for ${endpoint}:`, data.errors);
      }
    }

    // Cache'e kaydet
    if (cacheTtl > 0 && data.response && (Array.isArray(data.response) ? data.response.length > 0 : true)) {
      setCache(cacheKey, data, cacheTtl);
    }

    return data;
  }

  // Tüm retry'lar tükendi
  throw lastError || new Error(`API-Football rate limit exceeded after ${MAX_RETRIES} retries`);
}

// ---- Fixtures ----

export async function getFixturesByDate(date: string, forceRefresh = false): Promise<FixtureResponse[]> {
  const data = await apiFetch<FixtureResponse>("/fixtures", { date }, {
    cache: "no-store",
    cacheTtl: forceRefresh ? 0 : 300,
  });
  return data.response;
}

export async function getFixturesByLeague(
  leagueId: number,
  season: number
): Promise<FixtureResponse[]> {
  const data = await apiFetch<FixtureResponse>(
    "/fixtures",
    { league: leagueId, season },
    { revalidate: 600, cacheTtl: 1800 }
  );
  return data.response;
}

export async function getFixtureById(fixtureId: number): Promise<FixtureResponse | null> {
  const data = await apiFetch<FixtureResponse>("/fixtures", { id: fixtureId }, { revalidate: 60, cacheTtl: 300 });
  return data.response[0] ?? null;
}

export async function getLiveFixtures(): Promise<FixtureResponse[]> {
  const data = await apiFetch<FixtureResponse>("/fixtures", { live: "all" }, { cache: "no-store", cacheTtl: 30 });
  return data.response;
}

// ---- Standings ----

export async function getStandings(
  leagueId: number,
  season: number
): Promise<StandingsResponse | null> {
  const data = await apiFetch<StandingsResponse>(
    "/standings",
    { league: leagueId, season },
    { revalidate: 3600, cacheTtl: 7200 }
  );
  return data.response[0] ?? null;
}

// ---- Head to Head ----

export async function getH2H(
  homeTeamId: number,
  awayTeamId: number,
  last: number = 10
): Promise<H2HResponse[]> {
  const h2h = `${homeTeamId}-${awayTeamId}`;
  const data = await apiFetch<H2HResponse>(
    "/fixtures/headtohead",
    { h2h, last },
    { revalidate: 3600, cacheTtl: 7200 }
  );
  return data.response;
}

// ---- Predictions ----

export async function getPrediction(fixtureId: number): Promise<PredictionResponse | null> {
  const data = await apiFetch<PredictionResponse>(
    "/predictions",
    { fixture: fixtureId },
    { revalidate: 1800, cacheTtl: 3600 }
  );
  return data.response[0] ?? null;
}

// ---- Odds ----

export async function getOdds(fixtureId: number): Promise<OddsResponse | null> {
  const data = await apiFetch<OddsResponse>(
    "/odds",
    { fixture: fixtureId },
    { revalidate: 900, cacheTtl: 1800 }
  );
  return data.response[0] ?? null;
}

// ---- Statistics ----

export async function getFixtureStatistics(
  fixtureId: number
): Promise<FixtureStatisticsResponse[]> {
  const data = await apiFetch<FixtureStatisticsResponse>(
    "/fixtures/statistics",
    { fixture: fixtureId },
    { revalidate: 300, cacheTtl: 1800 }
  );
  return data.response;
}

// ---- Injuries ----

export async function getInjuries(fixtureId: number): Promise<InjuryResponse[]> {
  const data = await apiFetch<InjuryResponse>(
    "/injuries",
    { fixture: fixtureId },
    { revalidate: 3600, cacheTtl: 7200 }
  );
  return data.response;
}

// ---- Team Statistics (Season-level) ----

export async function getTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
): Promise<TeamStatisticsResponse | null> {
  const data = await apiFetch<TeamStatisticsResponse>(
    "/teams/statistics",
    { team: teamId, league: leagueId, season },
    { revalidate: 3600, cacheTtl: 86400 } // 24 saat cache — sezon istatistikleri yavaş değişir
  );
  // /teams/statistics tek obje döner, dizi değil
  return (data.response as unknown as TeamStatisticsResponse) ?? null;
}

// ---- Lineups ----

export async function getLineups(fixtureId: number): Promise<LineupResponse[]> {
  const data = await apiFetch<LineupResponse>(
    "/fixtures/lineups",
    { fixture: fixtureId },
    { revalidate: 300, cacheTtl: 1800 }
  );
  return data.response;
}

// ---- Events ----

export async function getFixtureEvents(fixtureId: number): Promise<FixtureEvent[]> {
  const data = await apiFetch<FixtureEvent>(
    "/fixtures/events",
    { fixture: fixtureId },
    { revalidate: 60, cacheTtl: 300 }
  );
  return data.response;
}

// ---- Season ----

export function getCurrentSeason(): number {
  const now = new Date();
  // Futbol sezonu genelde Ağustos-Mayıs arası
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}
