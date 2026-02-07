/**
 * Daily Matches API Route
 * Top 20 ligden günlük maçları döndürür
 * Redis cache ile optimize edilmiş
 */

import { NextResponse } from 'next/server';
import { getDailyMatches, getDailyMatchStats, getDailyMatchesForLeagues } from '@/lib/api-football/daily-matches';
import { cacheGet, cacheSet, redisCacheKeys, REDIS_TTL } from '@/lib/cache/redis-cache';
import type { DailyMatchFixture } from '@/types/api-football';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const leaguesParam = searchParams.get('leagues');
    const liveOnly = searchParams.get('live') === 'true';

    // Tarih parse
    let date: Date | undefined;
    let dateStr = 'today';
    if (dateParam && dateParam !== 'today') {
      date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid date format' },
          { status: 400 }
        );
      }
      dateStr = dateParam;
    } else {
      // Türkiye saat dilimine göre bugünün tarihi (Vercel UTC'de çalışır)
      dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());
    }

    // Lig filtresi parse
    const leagueIds = leaguesParam
      ? leaguesParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
      : undefined;

    // Cache key oluştur
    const cacheKey = leagueIds 
      ? `${redisCacheKeys.dailyMatches(dateStr)}:${leagueIds.join('-')}`
      : redisCacheKeys.dailyMatches(dateStr);

    // Canlı maç varsa cache'i atla (güncel veri lazım)
    let matches: DailyMatchFixture[];
    
    if (!liveOnly) {
      // Redis cache kontrol
      const cached = await cacheGet<DailyMatchFixture[]>(cacheKey);
      if (cached && cached.length > 0) {
        // Cache'den gelen veride canlı maç var mı kontrol et
        const hasLive = cached.some(m => m.status.isLive);
        if (!hasLive) {
          // Canlı maç yoksa cache'i kullan
          const stats = getDailyMatchStats(cached);
          return NextResponse.json({
            success: true,
            data: cached,
            stats,
            timestamp: new Date().toISOString(),
            cached: true,
          });
        }
      }
    }

    // Maçları API'den getir
    matches = leagueIds && leagueIds.length > 0
      ? await getDailyMatchesForLeagues(leagueIds, date)
      : await getDailyMatches(date);

    // Cache'e kaydet (boş sonuçları cache'leme!)
    if (matches.length > 0) {
      const hasLiveMatches = matches.some(m => m.status.isLive);
      const ttl = hasLiveMatches ? REDIS_TTL.DAILY_MATCHES : REDIS_TTL.DAILY_MATCHES * 5;
      cacheSet(cacheKey, matches, ttl).catch(() => {});
    }

    // Sadece canlı maçlar isteniyorsa filtrele
    if (liveOnly) {
      matches = matches.filter(m => m.status.isLive);
    }

    // İstatistikleri hesapla
    const stats = getDailyMatchStats(matches);

    return NextResponse.json({
      success: true,
      data: matches,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Daily Matches API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch daily matches' },
      { status: 500 }
    );
  }
}
