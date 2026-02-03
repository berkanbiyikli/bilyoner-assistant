/**
 * Alerts - Value Bet ve Maç Öncesi Hatırlatma Sistemi
 * 
 * Yüksek value tekli öneriler
 * 30 dakika önce maç hatırlatmaları
 */

import type { BotMatch, BotCoupon } from './types';
import type { DailyMatchFixture, BetSuggestion } from '@/types/api-football';

// ============ TİP TANIMLARI ============

export interface ValueBetAlert {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: Date;
  prediction: {
    type: string;
    label: string;
    odds: number;
    probability: number;
  };
  value: number;              // Value yüzdesi (örn: 35 = %35)
  confidenceScore: number;
}

export interface MatchReminder {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: Date;
  prediction: {
    label: string;
    odds: number;
  };
  minutesUntilKickoff: number;
}

// ============ VALUE BET ALERT ============

const MIN_VALUE_FOR_ALERT = 25; // %25+ value için alert
const MAX_ODDS_FOR_ALERT = 4.00; // Çok yüksek oranlarda risk

// Value string'ini sayıya çevir
function parseValue(value: string | undefined): number {
  if (!value) return 0;
  if (value === 'high') return 30;
  if (value === 'medium') return 20;
  if (value === 'low') return 10;
  return 0;
}

/**
 * Yüksek value bet'leri bul (kupon dışı tekli öneriler)
 */
export function findHighValueBets(
  matches: DailyMatchFixture[],
  alreadyInCoupon: number[] = []
): ValueBetAlert[] {
  const alerts: ValueBetAlert[] = [];
  
  for (const match of matches) {
    // Zaten kuponda varsa atla
    if (alreadyInCoupon.includes(match.id)) continue;
    
    // betSuggestions yoksa atla
    if (!match.betSuggestions || match.betSuggestions.length === 0) continue;
    
    // En yüksek value'lu öneriyi bul
    for (const suggestion of match.betSuggestions) {
      const valueNum = parseValue(suggestion.value);
      
      if (
        valueNum >= MIN_VALUE_FOR_ALERT &&
        suggestion.confidence >= 70 &&
        suggestion.odds <= MAX_ODDS_FOR_ALERT &&
        suggestion.odds >= 1.30
      ) {
        alerts.push({
          fixtureId: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          league: match.league.name,
          kickoff: new Date(match.timestamp * 1000),
          prediction: {
            type: mapPickToType(suggestion.pick),
            label: suggestion.pick,
            odds: suggestion.odds,
            probability: suggestion.confidence / 100,
          },
          value: valueNum,
          confidenceScore: suggestion.confidence,
        });
      }
    }
  }
  
  // Value'a göre sırala (en yüksek önce)
  return alerts.sort((a, b) => b.value - a.value);
}

/**
 * Pick label'ını type'a çevir
 */
function mapPickToType(pick: string): string {
  const map: Record<string, string> = {
    'Ev Sahibi': 'home',
    'Beraberlik': 'draw',
    'Deplasman': 'away',
    'Üst 2.5': 'over25',
    'Alt 2.5': 'under25',
    'KG Var': 'btts',
    'KG Yok': 'btts_no',
  };
  return map[pick] || pick;
}

/**
 * Value bet alert tweet formatı
 */
export function formatValueBetAlertTweet(alert: ValueBetAlert): string {
  const lines: string[] = [];
  
  const time = alert.kickoff.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  // Emoji based on value
  const valueEmoji = alert.value >= 40 ? '🔥🔥' : alert.value >= 30 ? '🔥' : '⚡';
  
  lines.push(`${valueEmoji} YÜKSEK VALUE FIRSAT!`);
  lines.push('');
  lines.push(`⚽ ${alert.homeTeam} vs ${alert.awayTeam}`);
  lines.push(`🏆 ${alert.league}`);
  lines.push(`⏰ ${time}`);
  lines.push('');
  lines.push(`🎯 ${alert.prediction.label} @${alert.prediction.odds.toFixed(2)}`);
  lines.push(`📊 Value: %${alert.value.toFixed(0)}`);
  lines.push(`🎲 Güven: %${alert.confidenceScore}`);
  lines.push('');
  lines.push('💡 Kupon dışı tekli öneri!');
  lines.push('');
  lines.push('#Bahis #ValueBet #BilyonerBot');
  
  return lines.join('\n');
}

// ============ MAÇ ÖNCESİ HATIRLATMA ============

/**
 * 30 dakika içinde başlayacak kupon maçlarını bul
 */
export function getUpcomingMatches(
  coupon: BotCoupon | null,
  reminderMinutes = 30
): MatchReminder[] {
  if (!coupon) return [];
  
  const now = new Date();
  const reminders: MatchReminder[] = [];
  
  for (const match of coupon.matches) {
    const kickoff = new Date(match.kickoff);
    const diffMs = kickoff.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    // 25-35 dakika aralığında (30 dk civarı)
    if (diffMinutes >= reminderMinutes - 5 && diffMinutes <= reminderMinutes + 5) {
      reminders.push({
        fixtureId: match.fixtureId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
        kickoff,
        prediction: {
          label: match.prediction.label,
          odds: match.prediction.odds,
        },
        minutesUntilKickoff: diffMinutes,
      });
    }
  }
  
  return reminders;
}

/**
 * Maç öncesi hatırlatma tweet formatı
 */
export function formatMatchReminderTweet(reminder: MatchReminder): string {
  const lines: string[] = [];
  
  const time = reminder.kickoff.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  lines.push('⏰ MAÇ HATIRLATMASI');
  lines.push('');
  lines.push(`🔔 ${reminder.minutesUntilKickoff} dakika sonra başlıyor!`);
  lines.push('');
  lines.push(`⚽ ${reminder.homeTeam} vs ${reminder.awayTeam}`);
  lines.push(`🏆 ${reminder.league}`);
  lines.push(`⏰ ${time}`);
  lines.push('');
  lines.push(`🎯 Tahmin: ${reminder.prediction.label} @${reminder.prediction.odds.toFixed(2)}`);
  lines.push('');
  lines.push('#Bahis #Kupon #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Çoklu maç hatırlatması (aynı saatte birden fazla maç varsa)
 */
export function formatMultiMatchReminderTweet(reminders: MatchReminder[]): string {
  const lines: string[] = [];
  
  lines.push('⏰ MAÇ HATIRLATMASI');
  lines.push('');
  lines.push(`🔔 ${reminders[0].minutesUntilKickoff} dakika içinde ${reminders.length} maç başlıyor!`);
  lines.push('');
  
  reminders.forEach((r, i) => {
    const time = r.kickoff.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(`${i + 1}. ${r.homeTeam} vs ${r.awayTeam}`);
    lines.push(`   ⏰ ${time} | ${r.prediction.label} @${r.prediction.odds.toFixed(2)}`);
  });
  
  lines.push('');
  lines.push('Hazır mısınız? 🚀');
  lines.push('');
  lines.push('#Bahis #Kupon #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Tüm kupon maçları için tek bir başlangıç hatırlatması
 */
export function formatCouponStartReminderTweet(coupon: BotCoupon): string {
  const lines: string[] = [];
  
  // İlk maçın başlama saati
  const firstKickoff = coupon.matches
    .map(m => new Date(m.kickoff))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  
  const time = firstKickoff.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  lines.push('🎬 KUPON BAŞLIYOR!');
  lines.push('');
  lines.push(`⏰ İlk maç: ${time}`);
  lines.push('');
  
  coupon.matches.forEach((match, i) => {
    const matchTime = new Date(match.kickoff).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(`${i + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
    lines.push(`   ${matchTime} | ${match.prediction.label} @${match.prediction.odds.toFixed(2)}`);
  });
  
  lines.push('');
  lines.push(`📊 Toplam Oran: ${coupon.totalOdds.toFixed(2)}`);
  lines.push(`💰 ${coupon.stake.toFixed(0)}₺ → ${coupon.potentialWin.toFixed(0)}₺`);
  lines.push('');
  lines.push('Hadi bakalım! 🤞');
  lines.push('');
  lines.push('#Bahis #Kupon #BilyonerBot');
  
  return lines.join('\n');
}
