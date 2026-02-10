/**
 * 100 → 10.000 TL Challenge API Route
 * 
 * GET: Challenge durumunu getir
 * POST: Yeni challenge başlat / adım ilerlet / kupon oluştur
 * 
 * Query params:
 * - action=start: Yeni challenge başlat
 * - action=build: Mevcut adım için kupon oluştur
 * - action=tweet-start: Challenge başlangıç tweeti at
 * - action=tweet-coupon: Kupon tweeti at
 * - action=settle&won=true/false: Adımı sonuçlandır
 */

import { NextResponse } from 'next/server';
import { getDailyMatches } from '@/lib/api-football/daily-matches';
import { cacheGet, cacheSet } from '@/lib/cache/redis-cache';
import { sendTweet } from '@/lib/bot/twitter/sender';
import { getLeaguePriority, isLeagueInBilyoner } from '@/config/league-priorities';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';
import {
  initializeChallenge,
  buildChallengeCoupon,
  createBotCouponFromChallenge,
  advanceChallengeStep,
  formatChallengeStartTweet,
  formatChallengeCouponTweet,
  formatChallengeResultTweet,
  DEFAULT_CHALLENGE_CONFIG,
  type ChallengeState,
} from '@/lib/bot/challenge-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHALLENGE_CACHE_KEY = 'challenge:current';
const CHALLENGE_TTL = 7 * 24 * 60 * 60; // 7 gün

// Base URL (Vercel'de veya local'de)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function getChallengeState(): Promise<ChallengeState | null> {
  return cacheGet<ChallengeState>(CHALLENGE_CACHE_KEY);
}

async function saveChallengeState(state: ChallengeState): Promise<void> {
  await cacheSet(CHALLENGE_CACHE_KEY, state, CHALLENGE_TTL);
}

// ============ BET SUGGESTIONS ENRICHMENT ============

/**
 * Maçlar için betSuggestions çek (match-detail API'den)
 * Paralel batch'ler halinde — tıpkı bot engine gibi
 */
async function enrichMatchesWithBetSuggestions(
  matches: DailyMatchFixture[]
): Promise<DailyMatchFixture[]> {
  const BATCH_SIZE = 5;
  const enriched: DailyMatchFixture[] = [];
  
  console.log(`[Challenge] ${matches.length} maç için betSuggestions çekiliyor...`);
  
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (match) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const params = new URLSearchParams({
          fixtureId: String(match.id),
          homeTeamId: String(match.homeTeam.id),
          awayTeamId: String(match.awayTeam.id),
          leagueId: String(match.league.id),
          noCache: '1', // Challenge bot: her zaman taze veri + gerçek oranlar
        });
        
        const res = await fetch(`${BASE_URL}/api/match-detail?${params}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) return match; // Başarısız ise bare fixture dön
        
        const json = await res.json();
        const data = json.data || json;
        
        if (data.betSuggestions?.length > 0) {
          console.log(`[Challenge] ✓ ${match.homeTeam.name} vs ${match.awayTeam.name}: ${data.betSuggestions.length} öneri`);
          return { ...match, betSuggestions: data.betSuggestions as BetSuggestion[] };
        }
        
        return match;
      } catch {
        return match;
      }
    });
    
    const results = await Promise.all(batchPromises);
    enriched.push(...results);
  }
  
  const withSuggestions = enriched.filter(m => m.betSuggestions && m.betSuggestions.length > 0);
  console.log(`[Challenge] Toplam ${withSuggestions.length}/${enriched.length} maçta betSuggestions var`);
  
  return enriched;
}

// ============ GET ============

export async function GET() {
  try {
    const state = await getChallengeState();
    
    if (!state) {
      return NextResponse.json({
        success: true,
        active: false,
        message: 'Aktif challenge yok. POST action=start ile başlatın.',
      });
    }
    
    return NextResponse.json({
      success: true,
      active: true,
      state,
    });
  } catch (error) {
    console.error('[Challenge API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Challenge durumu alınamadı' },
      { status: 500 }
    );
  }
}

// ============ POST ============

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    // Canlı mod — direkt tweet at, test yok
    const useMock = false;
    
    switch (action) {
      // ---- YENI CHALLENGE BAŞLAT ----
      case 'start': {
        const state = initializeChallenge(DEFAULT_CHALLENGE_CONFIG);
        state.plan[0].status = 'active';
        await saveChallengeState(state);
        
        return NextResponse.json({
          success: true,
          message: 'Challenge başlatıldı!',
          state,
        });
      }
      
      // ---- KUPON OLUŞTUR (mevcut adım için) ----
      case 'build': {
        const state = await getChallengeState();
        if (!state || state.status !== 'active') {
          return NextResponse.json({
            success: false,
            error: 'Aktif challenge yok. Önce start yapın.',
          }, { status: 400 });
        }
        
        const currentStep = state.plan[state.currentStep];
        if (!currentStep) {
          return NextResponse.json({
            success: false,
            error: 'Tüm adımlar tamamlanmış.',
          }, { status: 400 });
        }
        
        // Günün maçlarını al
        const allMatches = await getDailyMatches();
        
        if (!allMatches || allMatches.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'Bugün maç bulunamadı.',
          }, { status: 404 });
        }
        
        // SAAT BAZLI MAÇ SEÇİMİ
        // Önce başlamamış maçlar (bahis yapılabilir), sonra canlı
        // SADECE Bilyoner'de olan ligler (bahis yapılabilecek maçlar)
        const now = new Date();
        const nowTs = Math.floor(now.getTime() / 1000);
        
        // Bilyoner filtresi
        const bilyonerMatches = allMatches.filter(m => isLeagueInBilyoner(m.league.id));
        console.log(`[Challenge] Bilyoner filtresi: ${allMatches.length} → ${bilyonerMatches.length} maç`);
        
        // 1. Upcoming maçları saate yakınlığına göre sırala
        const upcomingMatches = bilyonerMatches
          .filter(m => m.status.isUpcoming)
          .sort((a, b) => {
            // En yakın saat önce
            const diffA = a.timestamp - nowTs;
            const diffB = b.timestamp - nowTs;
            // Geçmişi atla (negatif diff)
            if (diffA < 0 && diffB >= 0) return 1;
            if (diffB < 0 && diffA >= 0) return -1;
            if (diffA !== diffB) return diffA - diffB;
            return getLeaguePriority(b.league.id) - getLeaguePriority(a.league.id);
          })
          .slice(0, 20);
        
        // 2. Canlı maçları da ekle (max 5)
        const liveMatches = bilyonerMatches
          .filter(m => m.status.isLive)
          .sort((a, b) => getLeaguePriority(b.league.id) - getLeaguePriority(a.league.id))
          .slice(0, 5);
        
        const candidateMatches = [...upcomingMatches, ...liveMatches];
        
        const upcomingTimes = upcomingMatches.slice(0, 5).map(m => {
          const d = new Date(m.timestamp * 1000);
          return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
        });
        console.log(`[Challenge] ${allMatches.length} toplam | ${upcomingMatches.length} upcoming | ${liveMatches.length} canlı`);
        console.log(`[Challenge] En yakın saatler: ${upcomingTimes.join(', ')}`);
        console.log(`[Challenge] ${candidateMatches.length} aday zenginleştirilecek`);
        
        // BetSuggestions'ları zenginleştir (match-detail API çağrısı)
        const enrichedMatches = await enrichMatchesWithBetSuggestions(candidateMatches);
        
        // En iyi kuponu oluştur
        const result = buildChallengeCoupon(
          enrichedMatches,
          currentStep,
          state.config
        );
        
        if (!result) {
          const withSuggestions = enrichedMatches.filter(m => m.betSuggestions?.length);
          return NextResponse.json({
            success: false,
            error: 'Kriterlere uygun kupon bulunamadı.',
            matchCount: allMatches.length,
            candidateCount: candidateMatches.length,
            enrichedCount: withSuggestions.length,
            upcomingCount: allMatches.filter(m => m.status.isUpcoming).length,
            liveCount: allMatches.filter(m => m.status.isLive).length,
            hint: 'Yeterli maç yok veya oranlar uymuş olabilir. Daha sonra tekrar deneyin.',
          }, { status: 404 });
        }
        
        // BotCoupon oluştur
        const coupon = createBotCouponFromChallenge(
          result.selectedMatches,
          currentStep.step,
          currentStep.stakeAmount,
          result.totalOdds
        );
        
        // State'i güncelle
        state.coupons.push({
          step: currentStep.step,
          coupon,
          stakeAmount: currentStep.stakeAmount,
          expectedReturn: currentStep.expectedReturn,
        });
        await saveChallengeState(state);
        
        return NextResponse.json({
          success: true,
          message: `Adım ${currentStep.step} kuponu oluşturuldu!`,
          step: currentStep,
          coupon: {
            id: coupon.id,
            matches: coupon.matches.map(m => ({
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              league: m.league,
              leagueId: m.leagueId,
              prediction: m.prediction.label,
              odds: m.prediction.odds,
              oddsSource: (m as unknown as Record<string, unknown>).oddsSource || 'unknown',
              bookmaker: (m as unknown as Record<string, unknown>).bookmaker || 'unknown',
              confidence: m.confidenceScore,
              kickoff: m.kickoff,
              isLive: (m as unknown as Record<string, unknown>).isLive ?? false,
            })),
            totalOdds: coupon.totalOdds,
            stake: coupon.stake,
            potentialWin: coupon.potentialWin,
          },
          reasoning: result.reasoning,
          avgConfidence: result.avgConfidence,
          timeSlot: result.timeSlot,
        });
      }
      
      // ---- CHALLENGE BAŞLANGIÇ TWEETİ ----
      case 'tweet-start': {
        const state = await getChallengeState();
        if (!state) {
          return NextResponse.json({
            success: false,
            error: 'Aktif challenge yok.',
          }, { status: 400 });
        }
        
        const tweetText = formatChallengeStartTweet(state);
        const tweetResult = await sendTweet(tweetText, { mock: useMock });
        
        return NextResponse.json({
          success: true,
          tweet: tweetText,
          tweetResult,
        });
      }
      
      // ---- KUPON TWEETİ ----
      case 'tweet-coupon': {
        const state = await getChallengeState();
        if (!state) {
          return NextResponse.json({
            success: false,
            error: 'Aktif challenge yok.',
          }, { status: 400 });
        }
        
        const step = state.plan[state.currentStep];
        const lastCoupon = state.coupons[state.coupons.length - 1];
        
        if (!step || !lastCoupon) {
          return NextResponse.json({
            success: false,
            error: 'Kupon bulunamadı. Önce build yapın.',
          }, { status: 400 });
        }
        
        const tweetText = formatChallengeCouponTweet(state, step, lastCoupon.coupon);
        const tweetResult = await sendTweet(tweetText, { mock: useMock });
        
        return NextResponse.json({
          success: true,
          tweet: tweetText,
          tweetResult,
        });
      }
      
      // ---- ADIMI SONUÇLANDIR ----
      case 'settle': {
        const won = searchParams.get('won') === 'true';
        let state = await getChallengeState();
        
        if (!state || state.status !== 'active') {
          return NextResponse.json({
            success: false,
            error: 'Aktif challenge yok.',
          }, { status: 400 });
        }
        
        const step = state.plan[state.currentStep];
        const lastCoupon = state.coupons[state.coupons.length - 1];
        
        if (!step || !lastCoupon) {
          return NextResponse.json({
            success: false,
            error: 'Sonuçlandırılacak kupon yok.',
          }, { status: 400 });
        }
        
        // Eski bakiye
        const oldBalance = state.currentBalance;
        
        // Adımı ilerlet
        state = advanceChallengeStep(state, lastCoupon.coupon, won);
        await saveChallengeState(state);
        
        // Sonuç tweeti
        const resultTweet = formatChallengeResultTweet(state, step, won, state.currentBalance);
        
        // Tweet at (opsiyonel)
        const shouldTweet = searchParams.get('tweet') !== 'false';
        let tweetResult;
        if (shouldTweet) {
          tweetResult = await sendTweet(resultTweet, { mock: useMock });
        }
        
        return NextResponse.json({
          success: true,
          won,
          oldBalance,
          newBalance: state.currentBalance,
          challengeStatus: state.status,
          tweet: resultTweet,
          tweetResult,
          state,
        });
      }
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Geçersiz action. Kullanılabilir: start, build, tweet-start, tweet-coupon, settle',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Challenge API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Bilinmeyen hata' },
      { status: 500 }
    );
  }
}
