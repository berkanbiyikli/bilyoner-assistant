/**
 * Result Checker
 * Bitmiş maçların sonuçlarını API'den çekip backtesting store'u günceller
 */

import { useBacktestStore } from './store';
import type { FixtureResponse } from '@/types/api-football';

const API_KEY = process.env.NEXT_PUBLIC_API_FOOTBALL_KEY || '';
const API_BASE = 'https://v3.football.api-sports.io';

/**
 * Belirli bir tarihteki bitmiş maçların sonuçlarını çek
 * @param date Tarih (YYYY-MM-DD formatında)
 */
export async function checkResultsForDate(date: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/fixtures?date=${date}&status=FT`, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const data: { response: FixtureResponse[] } = await response.json();
    
    if (!data.response || data.response.length === 0) {
      console.log(`No finished matches found for ${date}`);
      return;
    }
    
    // Sonuçları store'a kaydet
    const settlements = data.response.map((fixture) => {
      const homeGoals = fixture.goals.home ?? 0;
      const awayGoals = fixture.goals.away ?? 0;
      
      let actualResult: 'home' | 'away' | 'draw';
      if (homeGoals > awayGoals) actualResult = 'home';
      else if (awayGoals > homeGoals) actualResult = 'away';
      else actualResult = 'draw';
      
      return {
        fixtureId: fixture.fixture.id,
        result: {
          actualResult,
          actualScore: {
            home: homeGoals,
            away: awayGoals,
          },
        },
      };
    });
    
    useBacktestStore.getState().batchSettle(settlements);
    
    console.log(`✅ Checked ${settlements.length} finished matches for ${date}`);
  } catch (error) {
    console.error('Result checker error:', error);
    throw error;
  }
}

/**
 * Son N günün sonuçlarını kontrol et
 * @param days Kaç gün geriye gidilecek
 */
export async function checkRecentResults(days: number = 7): Promise<void> {
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    try {
      await checkResultsForDate(dateStr);
      // API rate limit için kısa bekle
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to check results for ${dateStr}:`, error);
    }
  }
}

/**
 * Dünün sonuçlarını otomatik olarak kontrol et
 * Bu fonksiyon cron job ile her gün yarısında çalıştırılabilir
 */
export async function checkYesterdayResults(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  await checkResultsForDate(dateStr);
}
