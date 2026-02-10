/**
 * Auto-Settle Hook
 * Bekleyen bahisleri otomatik sonuçlandırır.
 * API-Football'dan maç sonuçlarını çeker ve pick'le karşılaştırır.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useBankrollStore, type BankrollBet } from '@/lib/bankroll/store';

const SETTLE_INTERVAL = 5 * 60 * 1000; // 5 dakika

/** Maç sonucu pick'ini değerlendir */
function evaluateResult(
  pick: string,
  homeGoals: number,
  awayGoals: number,
  htHome: number | null,
  htAway: number | null,
): 'won' | 'lost' | null {
  const p = pick.toLowerCase().replace(/\s+/g, ' ').trim();
  const totalGoals = homeGoals + awayGoals;

  // === Maç Sonucu (MS / 1X2) ===
  if (p.includes('maç sonucu') || p.includes('sonuç')) {
    if (p.includes('ev sahibi') || p.includes('home') || p.endsWith(': 1')) {
      return homeGoals > awayGoals ? 'won' : 'lost';
    }
    if (p.includes('berabere') || p.includes('draw') || p.endsWith(': x')) {
      return homeGoals === awayGoals ? 'won' : 'lost';
    }
    if (p.includes('deplasman') || p.includes('away') || p.endsWith(': 2')) {
      return homeGoals < awayGoals ? 'won' : 'lost';
    }
  }

  // === Çifte Şans ===
  if (p.includes('çifte şans') || p.includes('double chance')) {
    if (p.includes('1x') || (p.includes('ev') && p.includes('ber'))) {
      return homeGoals >= awayGoals ? 'won' : 'lost';
    }
    if (p.includes('x2') || (p.includes('ber') && p.includes('dep'))) {
      return awayGoals >= homeGoals ? 'won' : 'lost';
    }
    if (p.includes('12') || (p.includes('ev') && p.includes('dep'))) {
      return homeGoals !== awayGoals ? 'won' : 'lost';
    }
  }

  // === Üst/Alt (Over/Under) ===
  const overUnderMatch = p.match(/(üst|alt|over|under)\s*([\d.]+)/i);
  if (overUnderMatch) {
    const line = parseFloat(overUnderMatch[2]);
    const isOver = overUnderMatch[1].toLowerCase() === 'üst' || overUnderMatch[1].toLowerCase() === 'over';
    if (isOver) return totalGoals > line ? 'won' : 'lost';
    return totalGoals < line ? 'won' : 'lost';
  }

  // === KG (BTTS - Both Teams To Score) ===
  if (p.includes('kg var') || p.includes('btts: yes') || p.includes('kg: var')) {
    return (homeGoals > 0 && awayGoals > 0) ? 'won' : 'lost';
  }
  if (p.includes('kg yok') || p.includes('btts: no') || p.includes('kg: yok')) {
    return (homeGoals === 0 || awayGoals === 0) ? 'won' : 'lost';
  }

  // === İlk Yarı Sonucu ===
  if ((p.includes('ilk yarı') || p.includes('iy')) && htHome !== null && htAway !== null) {
    if (p.includes('ev') || p.includes('1')) return htHome > htAway ? 'won' : 'lost';
    if (p.includes('ber') || p.includes('x')) return htHome === htAway ? 'won' : 'lost';
    if (p.includes('dep') || p.includes('2')) return htHome < htAway ? 'won' : 'lost';
  }

  // === Toplam Gol Aralığı ===
  const goalRangeMatch = p.match(/(\d+)-(\d+)\s*gol/i);
  if (goalRangeMatch) {
    const min = parseInt(goalRangeMatch[1]);
    const max = parseInt(goalRangeMatch[2]);
    return (totalGoals >= min && totalGoals <= max) ? 'won' : 'lost';
  }

  // Bilinmeyen pick tipi - elle settle edilsin
  return null;
}

async function fetchFixtureResult(fixtureId: number): Promise<{
  isFinished: boolean;
  homeGoals: number;
  awayGoals: number;
  htHome: number | null;
  htAway: number | null;
} | null> {
  try {
    const res = await fetch(`/api/fixtures/${fixtureId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.fixture) return null;
    const f = data.fixture;
    return {
      isFinished: f.status?.isFinished ?? false,
      homeGoals: f.score?.home ?? 0,
      awayGoals: f.score?.away ?? 0,
      htHome: f.score?.halftimeHome ?? null,
      htAway: f.score?.halftimeAway ?? null,
    };
  } catch {
    return null;
  }
}

export function useAutoSettle() {
  const { bets, settleBet } = useBankrollStore();
  const lastCheckRef = useRef<number>(0);

  const checkAndSettle = useCallback(async () => {
    const pending = bets.filter(
      (b: BankrollBet) => b.result === 'pending' && b.fixtureId
    );
    if (pending.length === 0) return;

    // Her bir bekleyen bahis için kontrol et
    for (const bet of pending) {
      if (!bet.fixtureId) continue;

      const result = await fetchFixtureResult(bet.fixtureId);
      if (!result || !result.isFinished) continue;

      const outcome = evaluateResult(
        bet.pick,
        result.homeGoals,
        result.awayGoals,
        result.htHome,
        result.htAway,
      );

      if (outcome) {
        settleBet(bet.id, outcome);
        console.log(
          `[AutoSettle] ${bet.homeTeam} vs ${bet.awayTeam}: ${bet.pick} → ${outcome} (${result.homeGoals}-${result.awayGoals})`
        );
      }
    }
  }, [bets, settleBet]);

  useEffect(() => {
    // İlk kontrol
    const now = Date.now();
    if (now - lastCheckRef.current > SETTLE_INTERVAL) {
      lastCheckRef.current = now;
      checkAndSettle();
    }

    // Periyodik kontrol
    const interval = setInterval(() => {
      lastCheckRef.current = Date.now();
      checkAndSettle();
    }, SETTLE_INTERVAL);

    return () => clearInterval(interval);
  }, [checkAndSettle]);

  return { checkAndSettle, pendingCount: bets.filter((b: BankrollBet) => b.result === 'pending' && b.fixtureId).length };
}
