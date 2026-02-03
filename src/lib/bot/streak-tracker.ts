/**
 * Streak Tracker - Seri ve Milestone Takip Sistemi
 * 
 * Kazanç/kayıp serileri
 * Milestone kutlamaları (10, 25, 50, 100 kupon vb.)
 */

import type { StreakInfo, MilestoneEvent, BankrollState, BotCoupon } from './types';

// ============ VARSAYILAN STREAK ============

export const DEFAULT_STREAK_INFO: StreakInfo = {
  currentStreak: 0,
  longestWinStreak: 0,
  longestLoseStreak: 0,
  lastResults: [],
  milestones: [],
};

// ============ MILESTONE TANIMLARI ============

const COUPON_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const WIN_STREAK_MILESTONES = [3, 5, 7, 10, 15, 20];
const ROI_MILESTONES = [10, 25, 50, 100]; // %10, %25, %50, %100 ROI
const PROFIT_MILESTONES = [500, 1000, 2500, 5000, 10000]; // TL

// ============ STREAK FONKSİYONLAR ============

/**
 * Kupon sonucuna göre streak güncelle
 */
export function updateStreak(
  streak: StreakInfo,
  couponWon: boolean
): StreakInfo {
  const newStreak = { ...streak };
  const result: 'W' | 'L' = couponWon ? 'W' : 'L';
  
  // Son sonuçlara ekle (maks 10)
  newStreak.lastResults = [result, ...streak.lastResults].slice(0, 10);
  
  // Current streak güncelle
  if (couponWon) {
    if (streak.currentStreak >= 0) {
      newStreak.currentStreak = streak.currentStreak + 1;
    } else {
      newStreak.currentStreak = 1; // Kayıp serisinden kazanca geçiş
    }
  } else {
    if (streak.currentStreak <= 0) {
      newStreak.currentStreak = streak.currentStreak - 1;
    } else {
      newStreak.currentStreak = -1; // Kazanç serisinden kayba geçiş
    }
  }
  
  // En uzun serileri güncelle
  if (newStreak.currentStreak > streak.longestWinStreak) {
    newStreak.longestWinStreak = newStreak.currentStreak;
  }
  if (Math.abs(newStreak.currentStreak) > streak.longestLoseStreak && newStreak.currentStreak < 0) {
    newStreak.longestLoseStreak = Math.abs(newStreak.currentStreak);
  }
  
  return newStreak;
}

/**
 * Milestone kontrol et ve yenilerini döndür
 */
export function checkMilestones(
  state: BankrollState,
  streak: StreakInfo
): MilestoneEvent[] {
  const newMilestones: MilestoneEvent[] = [];
  const existingIds = new Set(streak.milestones.map(m => m.id));
  
  // 1. Toplam kupon milestones
  for (const target of COUPON_MILESTONES) {
    const id = `total_coupons_${target}`;
    if (state.totalBets >= target && !existingIds.has(id)) {
      newMilestones.push({
        id,
        type: 'total_coupons',
        value: target,
        achievedAt: new Date(),
        tweeted: false,
      });
    }
  }
  
  // 2. Win streak milestones
  for (const target of WIN_STREAK_MILESTONES) {
    const id = `win_streak_${target}`;
    if (streak.currentStreak >= target && !existingIds.has(id)) {
      newMilestones.push({
        id,
        type: 'win_streak',
        value: target,
        achievedAt: new Date(),
        tweeted: false,
      });
    }
  }
  
  // 3. ROI milestones
  const roi = state.totalStaked > 0 
    ? ((state.totalWon - state.totalStaked) / state.totalStaked) * 100 
    : 0;
  for (const target of ROI_MILESTONES) {
    const id = `roi_target_${target}`;
    if (roi >= target && !existingIds.has(id)) {
      newMilestones.push({
        id,
        type: 'roi_target',
        value: target,
        achievedAt: new Date(),
        tweeted: false,
      });
    }
  }
  
  // 4. Profit milestones
  const profit = state.totalWon - state.totalStaked;
  for (const target of PROFIT_MILESTONES) {
    const id = `profit_target_${target}`;
    if (profit >= target && !existingIds.has(id)) {
      newMilestones.push({
        id,
        type: 'profit_target',
        value: target,
        achievedAt: new Date(),
        tweeted: false,
      });
    }
  }
  
  return newMilestones;
}

/**
 * Milestone'u işaretle (tweet atıldı)
 */
export function markMilestoneTweeted(
  streak: StreakInfo,
  milestoneId: string
): StreakInfo {
  return {
    ...streak,
    milestones: streak.milestones.map(m => 
      m.id === milestoneId ? { ...m, tweeted: true } : m
    ),
  };
}

/**
 * Tweet atılmamış milestones'ları getir
 */
export function getUntweetedMilestones(streak: StreakInfo): MilestoneEvent[] {
  return streak.milestones.filter(m => !m.tweeted);
}

// ============ TWEET FORMATLAR ============

/**
 * Streak tweet formatı
 */
export function formatStreakTweet(streak: StreakInfo, state: BankrollState): string | null {
  const lines: string[] = [];
  
  // Kazanç serisi (3+)
  if (streak.currentStreak >= 3) {
    lines.push(`🔥 ${streak.currentStreak} KUPON ÜST ÜSTE KAZANDI!`);
    lines.push('');
    lines.push(`📊 Seri: ${'✅'.repeat(Math.min(streak.currentStreak, 10))}`);
    lines.push(`💼 Kasa: ${state.balance.toFixed(0)}₺`);
    lines.push('');
    lines.push('Ateş devam ediyor! 🚀');
    lines.push('');
    lines.push('#Bahis #WinStreak #BilyonerBot');
    return lines.join('\n');
  }
  
  // Kayıp serisi uyarısı (3+)
  if (streak.currentStreak <= -3) {
    lines.push(`⚠️ DİKKAT: ${Math.abs(streak.currentStreak)} kupon üst üste kaybedildi`);
    lines.push('');
    lines.push(`📊 Seri: ${'❌'.repeat(Math.min(Math.abs(streak.currentStreak), 10))}`);
    lines.push('');
    lines.push('Strateji gözden geçiriliyor, sabır önemli! 🧘');
    lines.push('');
    lines.push('#Bahis #BilyonerBot');
    return lines.join('\n');
  }
  
  return null; // Streak tweet'i gerekmiyor
}

/**
 * Milestone tweet formatı
 */
export function formatMilestoneTweet(milestone: MilestoneEvent, state: BankrollState): string {
  const lines: string[] = [];
  
  switch (milestone.type) {
    case 'total_coupons':
      lines.push(`🎉 ${milestone.value}. KUPON TAMAMLANDI!`);
      lines.push('');
      lines.push('📈 İstatistikler:');
      lines.push(`   ✅ Kazanan: ${state.wonBets}`);
      lines.push(`   ❌ Kaybeden: ${state.lostBets}`);
      lines.push(`   📊 Win Rate: %${((state.wonBets / state.totalBets) * 100).toFixed(1)}`);
      lines.push(`   💼 Kasa: ${state.balance.toFixed(0)}₺`);
      break;
      
    case 'win_streak':
      lines.push(`🔥🔥🔥 ${milestone.value} KUPON KAZANÇ SERİSİ!`);
      lines.push('');
      lines.push(`${'✅'.repeat(milestone.value)}`);
      lines.push('');
      lines.push('Form tuttu, devam! 🚀');
      break;
      
    case 'roi_target':
      lines.push(`📈 %${milestone.value} ROI HEDEFINE ULAŞILDI!`);
      lines.push('');
      const profit = state.totalWon - state.totalStaked;
      lines.push(`💰 Toplam Kar: +${profit.toFixed(0)}₺`);
      lines.push(`📊 Yatırım: ${state.totalStaked.toFixed(0)}₺`);
      lines.push(`💼 Kasa: ${state.balance.toFixed(0)}₺`);
      break;
      
    case 'profit_target':
      lines.push(`💰 ${milestone.value}₺ KAR HEDEFİNE ULAŞILDI!`);
      lines.push('');
      lines.push(`🎯 Hedef: ${milestone.value}₺ ✅`);
      lines.push(`💼 Güncel Kasa: ${state.balance.toFixed(0)}₺`);
      break;
  }
  
  lines.push('');
  lines.push('#Bahis #Milestone #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Seri sonuç görseli (son 10 maç)
 */
export function getStreakVisual(streak: StreakInfo): string {
  if (streak.lastResults.length === 0) return '';
  
  return streak.lastResults
    .map(r => r === 'W' ? '✅' : '❌')
    .join('');
}

/**
 * Seri özeti (kısa)
 */
export function getStreakSummary(streak: StreakInfo): string {
  if (streak.currentStreak > 0) {
    return `🔥 ${streak.currentStreak}W streak`;
  } else if (streak.currentStreak < 0) {
    return `❄️ ${Math.abs(streak.currentStreak)}L streak`;
  }
  return '➖ No streak';
}
