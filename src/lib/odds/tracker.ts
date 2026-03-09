// ============================================
// Odds Movement Tracker
// Oran değişimlerini izle, kaydet, analiz et
// ============================================

import { getFixturesByDate, getOdds, LEAGUE_IDS } from "@/lib/api-football";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";
import type { OddsResponse } from "@/types/api-football";

export interface OddsSnapshot {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
  bookmaker: string;
  timestamp: string;
}

export interface OddsMovement {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  market: string;
  openingOdds: number;
  currentOdds: number;
  change: number;
  direction: "up" | "down" | "stable";
  timestamp: string;
}

/**
 * Günün tüm maçlarının oranlarını çek ve Supabase'e kaydet
 * Her çalıştığında yeni snapshot oluşturur
 */
export async function captureOddsSnapshot(): Promise<{
  captured: number;
  updated: number;
  movements: OddsMovement[];
}> {
  const supabase = createAdminSupabase();
  const date = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Günün NS maçlarını çek
  const allFixtures = await getFixturesByDate(date);
  const fixtures = allFixtures.filter(
    (f) => f.fixture.status.short === "NS" && LEAGUE_IDS.includes(f.league.id)
  );

  const snapshots: OddsSnapshot[] = [];
  const movements: OddsMovement[] = [];

  // Her maç için oran çek (paralel, max 5 concurrent)
  const batchSize = 5;
  for (let i = 0; i < fixtures.length; i += batchSize) {
    const batch = fixtures.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (fixture) => {
        const odds = await getOdds(fixture.fixture.id);
        if (!odds) return null;

        const snapshot = extractSnapshot(fixture, odds, now);
        if (snapshot) snapshots.push(snapshot);
        return snapshot;
      })
    );
  }

  // Önceki snapshot'ları al ve hareket hesapla
  const { data: previousSnapshots } = await supabase
    .from("odds_snapshots")
    .select("*")
    .gte("kickoff", `${date}T00:00:00.000Z`)
    .lte("kickoff", `${date}T23:59:59.999Z`)
    .order("captured_at", { ascending: true });

  // Fixture bazlı ilk snapshot'ları bul (opening odds)
  const openingMap = new Map<number, OddsSnapshot>();
  for (const snap of (previousSnapshots || [])) {
    if (!openingMap.has(snap.fixture_id)) {
      openingMap.set(snap.fixture_id, {
        fixtureId: snap.fixture_id,
        homeTeam: snap.home_team,
        awayTeam: snap.away_team,
        league: snap.league,
        kickoff: snap.kickoff,
        home: Number(snap.home_odds),
        draw: Number(snap.draw_odds),
        away: Number(snap.away_odds),
        over25: Number(snap.over25_odds || 0),
        under25: Number(snap.under25_odds || 0),
        bttsYes: Number(snap.btts_yes_odds || 0),
        bttsNo: Number(snap.btts_no_odds || 0),
        bookmaker: snap.bookmaker || "",
        timestamp: snap.captured_at,
      });
    }
  }

  // Yeni snapshot'ları kaydet + hareketleri hesapla
  let savedCount = 0;
  for (const snapshot of snapshots) {
    // DB'ye kaydet
    const { error } = await supabase.from("odds_snapshots").insert({
      fixture_id: snapshot.fixtureId,
      home_team: snapshot.homeTeam,
      away_team: snapshot.awayTeam,
      league: snapshot.league,
      kickoff: snapshot.kickoff,
      home_odds: snapshot.home,
      draw_odds: snapshot.draw,
      away_odds: snapshot.away,
      over25_odds: snapshot.over25,
      under25_odds: snapshot.under25,
      btts_yes_odds: snapshot.bttsYes,
      btts_no_odds: snapshot.bttsNo,
      bookmaker: snapshot.bookmaker,
      captured_at: snapshot.timestamp,
    });

    if (!error) savedCount++;

    // Hareket hesapla
    const opening = openingMap.get(snapshot.fixtureId);
    if (opening) {
      const markets = [
        { name: "MS1", open: opening.home, current: snapshot.home },
        { name: "Beraberlik", open: opening.draw, current: snapshot.draw },
        { name: "MS2", open: opening.away, current: snapshot.away },
        { name: "Üst 2.5", open: opening.over25, current: snapshot.over25 },
        { name: "Alt 2.5", open: opening.under25, current: snapshot.under25 },
        { name: "KG Var", open: opening.bttsYes, current: snapshot.bttsYes },
        { name: "KG Yok", open: opening.bttsNo, current: snapshot.bttsNo },
      ];

      for (const m of markets) {
        if (m.open <= 0 || m.current <= 0) continue;
        const change = ((m.current - m.open) / m.open) * 100;
        if (Math.abs(change) < 1) continue; // %1'den az değişim önemsiz

        movements.push({
          fixtureId: snapshot.fixtureId,
          homeTeam: snapshot.homeTeam,
          awayTeam: snapshot.awayTeam,
          league: snapshot.league,
          kickoff: snapshot.kickoff,
          market: m.name,
          openingOdds: m.open,
          currentOdds: m.current,
          change: Math.round(change * 10) / 10,
          direction: change < -1 ? "down" : change > 1 ? "up" : "stable",
          timestamp: now,
        });
      }
    }
  }

  // Hareketleri cache'le (UI için)
  if (movements.length > 0) {
    setCache(`odds-movements:${date}`, movements, 1800);
  }

  return {
    captured: savedCount,
    updated: snapshots.length,
    movements,
  };
}

/**
 * Günün oran hareketlerini getir
 */
export async function getOddsMovements(date?: string): Promise<OddsMovement[]> {
  const d = date || new Date().toISOString().split("T")[0];

  // Önce cache'ten bak
  const cached = getCached<OddsMovement[]>(`odds-movements:${d}`);
  if (cached) return cached;

  // Cache'te yoksa DB'den hesapla
  const supabase = createAdminSupabase();
  const { data: allSnapshots } = await supabase
    .from("odds_snapshots")
    .select("*")
    .gte("kickoff", `${d}T00:00:00.000Z`)
    .lte("kickoff", `${d}T23:59:59.999Z`)
    .order("captured_at", { ascending: true });

  if (!allSnapshots || allSnapshots.length === 0) return [];

  // Fixture bazlı ilk ve son snapshot'ları bul
  const firstMap = new Map<number, typeof allSnapshots[0]>();
  const lastMap = new Map<number, typeof allSnapshots[0]>();

  for (const snap of allSnapshots) {
    if (!firstMap.has(snap.fixture_id)) {
      firstMap.set(snap.fixture_id, snap);
    }
    lastMap.set(snap.fixture_id, snap);
  }

  const movements: OddsMovement[] = [];
  const now = new Date().toISOString();

  for (const [fixtureId, first] of firstMap.entries()) {
    const last = lastMap.get(fixtureId)!;
    if (first.captured_at === last.captured_at) continue; // Tek snapshot, hareket yok

    const markets = [
      { name: "MS1", open: Number(first.home_odds), current: Number(last.home_odds) },
      { name: "Beraberlik", open: Number(first.draw_odds), current: Number(last.draw_odds) },
      { name: "MS2", open: Number(first.away_odds), current: Number(last.away_odds) },
      { name: "Üst 2.5", open: Number(first.over25_odds || 0), current: Number(last.over25_odds || 0) },
      { name: "Alt 2.5", open: Number(first.under25_odds || 0), current: Number(last.under25_odds || 0) },
      { name: "KG Var", open: Number(first.btts_yes_odds || 0), current: Number(last.btts_yes_odds || 0) },
      { name: "KG Yok", open: Number(first.btts_no_odds || 0), current: Number(last.btts_no_odds || 0) },
    ];

    for (const m of markets) {
      if (m.open <= 0 || m.current <= 0) continue;
      const change = ((m.current - m.open) / m.open) * 100;
      if (Math.abs(change) < 1) continue;

      movements.push({
        fixtureId,
        homeTeam: first.home_team,
        awayTeam: first.away_team,
        league: first.league,
        kickoff: first.kickoff,
        market: m.name,
        openingOdds: m.open,
        currentOdds: m.current,
        change: Math.round(change * 10) / 10,
        direction: change < -1 ? "down" : change > 1 ? "up" : "stable",
        timestamp: now,
      });
    }
  }

  // Anlamlı hareketleri öne sırala
  movements.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  setCache(`odds-movements:${d}`, movements, 1800);

  return movements;
}

/**
 * Tek maçın oran geçmişini getir
 */
export async function getFixtureOddsHistory(fixtureId: number): Promise<OddsSnapshot[]> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("odds_snapshots")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("captured_at", { ascending: true });

  if (!data) return [];

  return data.map((snap) => ({
    fixtureId: snap.fixture_id,
    homeTeam: snap.home_team,
    awayTeam: snap.away_team,
    league: snap.league,
    kickoff: snap.kickoff,
    home: Number(snap.home_odds),
    draw: Number(snap.draw_odds),
    away: Number(snap.away_odds),
    over25: Number(snap.over25_odds || 0),
    under25: Number(snap.under25_odds || 0),
    bttsYes: Number(snap.btts_yes_odds || 0),
    bttsNo: Number(snap.btts_no_odds || 0),
    bookmaker: snap.bookmaker || "",
    timestamp: snap.captured_at,
  }));
}

// ============================================
// Helpers
// ============================================

function extractSnapshot(
  fixture: { fixture: { id: number; date: string }; teams: { home: { name: string }; away: { name: string } }; league: { name: string } },
  oddsData: OddsResponse,
  timestamp: string
): OddsSnapshot | null {
  const bookmaker = oddsData.bookmakers?.[0];
  if (!bookmaker) return null;

  const getOdd = (betName: string, value: string): number => {
    const bet = bookmaker.bets.find((b) =>
      b.name.toLowerCase().includes(betName.toLowerCase())
    );
    if (!bet) return 0;
    const v = bet.values.find((v) => v.value === value);
    return v ? parseFloat(v.odd) : 0;
  };

  return {
    fixtureId: fixture.fixture.id,
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    league: fixture.league.name,
    kickoff: fixture.fixture.date,
    home: getOdd("Match Winner", "Home"),
    draw: getOdd("Match Winner", "Draw"),
    away: getOdd("Match Winner", "Away"),
    over25: getOdd("Goals Over/Under", "Over 2.5"),
    under25: getOdd("Goals Over/Under", "Under 2.5"),
    bttsYes: getOdd("Both Teams Score", "Yes"),
    bttsNo: getOdd("Both Teams Score", "No"),
    bookmaker: bookmaker.name,
    timestamp,
  };
}
