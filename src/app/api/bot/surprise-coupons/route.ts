/**
 * Surprise Coupons API - 3 Farklı Strateji ile Günlük Kupon
 * 
 * Her gün saat 13:00 TSİ'de çalışır (UTC 10:00)
 * 3 adet istatistik bazlı kupon üretir ve fotoğraflı tweet atar:
 * 1. ⚽ Gol Kuponu
 * 2. 🏆 Favori Kuponu
 * 3. 🎲 Sürpriz Kuponu
 * 
 * Vercel Cron: "0 10 * * *"
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSurpriseCoupons, formatSurpriseCouponTweet } from '@/lib/bot/surprise-engine';
import type { SurpriseCoupon } from '@/lib/bot/surprise-engine';
import { sendTweet } from '@/lib/bot/twitter/sender';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Uzun sürebilir, 2 dakika

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://bilyoner-assistant.vercel.app';

// ============ AUTH ============

function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'development') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return false;
}

// ============ OG IMAGE URL ============

function buildImageUrl(coupon: SurpriseCoupon, index: number): string {
  const params = new URLSearchParams();
  params.set('strategy', coupon.strategy);
  params.set('title', `${coupon.emoji} ${coupon.title}`);
  params.set('desc', coupon.description);
  params.set('odds', coupon.totalOdds.toFixed(2));
  params.set('conf', String(coupon.avgConfidence));
  params.set('count', String(coupon.matches.length));
  params.set('index', String(index));

  // Maç bilgisi encode: home|away|prediction|odds|statLine|league
  const matchesEncoded = coupon.matches.map(m =>
    [
      m.homeTeam,
      m.awayTeam,
      m.prediction,
      m.odds.toFixed(2),
      m.statLine,
      m.league,
    ].join('|')
  ).join(';');
  params.set('matches', matchesEncoded);

  return `${BASE_URL}/api/og/surprise?${params.toString()}`;
}

// ============ MAIN HANDLER ============

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  // Sadece belirli stratejileri tweet at: ?strategies=favori,surpriz
  const strategiesParam = searchParams.get('strategies');
  const allowedStrategies = strategiesParam
    ? new Set(strategiesParam.split(',').map(s => s.trim().toLowerCase()))
    : null; // null = hepsini at

  if (!isVercelCron && !isTestMode && !checkAuth(request)) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[SurpriseCoupons] ${msg}`);
    logs.push(msg);
  };

  try {
    log('Sürpriz kupon üretimi başlıyor...');

    // 3 strateji ile kuponları üret
    const allCoupons = await generateSurpriseCoupons();

    // strategies param ile filtrele (varsa)
    const coupons = allowedStrategies
      ? allCoupons.filter(c => allowedStrategies.has(c.strategy))
      : allCoupons;

    if (coupons.length === 0) {
      log(`Hiç kupon üretilemedi (toplam üretilen: ${allCoupons.length}, filtre: ${strategiesParam || 'yok'})`);
      return NextResponse.json({
        success: false,
        message: 'Kupon üretilemedi',
        allGenerated: allCoupons.length,
        filter: strategiesParam || null,
        logs,
      });
    }

    log(`${allCoupons.length} kupon üretildi${allowedStrategies ? `, ${coupons.length} tanesi filtreye uygun (${strategiesParam})` : ''}`);

    // Her kupon için tweet at
    const tweetResults: Array<{
      strategy: string;
      title: string;
      matchCount: number;
      totalOdds: number;
      tweetId?: string;
      error?: string;
    }> = [];

    const useMock = process.env.TWITTER_MOCK === 'true';

    for (let i = 0; i < coupons.length; i++) {
      const coupon = coupons[i];
      const couponIndex = i + 1;

      log(`\n--- ${coupon.emoji} ${coupon.title} ---`);
      log(`Maç sayısı: ${coupon.matches.length}`);
      log(`Toplam oran: ${coupon.totalOdds.toFixed(2)}`);
      log(`Ort. güven: %${coupon.avgConfidence}`);
      
      coupon.matches.forEach(m => {
        log(`  · ${m.homeTeam} vs ${m.awayTeam} → ${m.prediction} @${m.odds.toFixed(2)} (${m.statLine})`);
      });

      const tweetText = formatSurpriseCouponTweet(coupon, couponIndex);
      const imageUrl = buildImageUrl(coupon, couponIndex);

      if (isTestMode) {
        log(`[TEST] Tweet atılmadı (test modu)`);
        log(`[TEST] Image URL: ${imageUrl}`);
        tweetResults.push({
          strategy: coupon.strategy,
          title: coupon.title,
          matchCount: coupon.matches.length,
          totalOdds: coupon.totalOdds,
        });
      } else if (useMock) {
        log(`[MOCK] Tweet: ${tweetText.substring(0, 100)}...`);
        tweetResults.push({
          strategy: coupon.strategy,
          title: coupon.title,
          matchCount: coupon.matches.length,
          totalOdds: coupon.totalOdds,
        });
      } else {
        try {
          const result = await sendTweet(tweetText, { imageUrl });
          
          if (result.success) {
            log(`✅ Tweet atıldı: ${result.tweetId}`);
            tweetResults.push({
              strategy: coupon.strategy,
              title: coupon.title,
              matchCount: coupon.matches.length,
              totalOdds: coupon.totalOdds,
              tweetId: result.tweetId,
            });
          } else {
            log(`❌ Tweet hatası: ${result.error}`);
            tweetResults.push({
              strategy: coupon.strategy,
              title: coupon.title,
              matchCount: coupon.matches.length,
              totalOdds: coupon.totalOdds,
              error: result.error,
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';
          log(`❌ Tweet exception: ${errorMsg}`);
          tweetResults.push({
            strategy: coupon.strategy,
            title: coupon.title,
            matchCount: coupon.matches.length,
            totalOdds: coupon.totalOdds,
            error: errorMsg,
          });
        }

        // Tweet'ler arası bekleme (rate limit)
        if (i < coupons.length - 1) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    log(`\n=== Sonuç: ${tweetResults.filter(t => !t.error).length}/${coupons.length} kupon tweetlendi ===`);

    return NextResponse.json({
      success: true,
      couponsGenerated: coupons.length,
      tweetResults,
      coupons: coupons.map(c => ({
        strategy: c.strategy,
        title: c.title,
        matchCount: c.matches.length,
        totalOdds: c.totalOdds,
        avgConfidence: c.avgConfidence,
        matches: c.matches.map(m => ({
          home: m.homeTeam,
          away: m.awayTeam,
          prediction: m.prediction,
          odds: m.odds,
          confidence: m.confidence,
          reasoning: m.reasoning,
        })),
      })),
      logs,
    });

  } catch (error) {
    console.error('[SurpriseCoupons] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      logs,
    }, { status: 500 });
  }
}
