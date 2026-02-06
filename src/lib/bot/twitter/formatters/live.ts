/**
 * Live Formatters - Canlı Fırsat, Bahis, Snowball Tweet Formatları
 *
 * Tüm canlı maç odaklı tweet formatları burada.
 */

import type { LiveOpportunity, LiveBet, SnowballChain } from '../../live-types';
import { formatOpportunityType, formatMarket, withSiteLink } from './helpers';
import { safeTweet } from '../validator';

// ============ CANLI FIRSAT ============

/**
 * Canlı fırsat tweet'i
 */
export function formatLiveOpportunityTweet(
  opportunity: LiveOpportunity
): string {
  const lines: string[] = [];
  const { emoji, label } = formatOpportunityType(opportunity.type);

  lines.push(`🔴 CANLI | ${emoji} ${label.toUpperCase()}`);
  lines.push('');
  lines.push(
    `⚽ ${opportunity.match.homeTeam} vs ${opportunity.match.awayTeam}`
  );
  lines.push(
    `📍 ${opportunity.match.minute}' | Skor: ${opportunity.match.score}`
  );
  lines.push('');
  lines.push(`🎯 ${opportunity.market}: ${opportunity.pick}`);
  lines.push(
    `📊 Oran: ~${opportunity.estimatedOdds.toFixed(2)} | Güven: %${opportunity.confidence}`
  );

  if (opportunity.reasoning) {
    lines.push('');
    lines.push(`💡 ${opportunity.reasoning}`);
  }

  lines.push('');

  if (opportunity.urgency === 'critical') {
    lines.push('🚨 ACİL - Hemen oyna!');
  } else if (opportunity.urgency === 'high') {
    lines.push('⏰ Yüksek öncelik');
  }

  if (opportunity.value >= 15) {
    lines.push('🔥 YÜKSEK DEĞER!');
  } else if (opportunity.value >= 10) {
    lines.push('✨ İyi Değer');
  }

  lines.push('');
  lines.push('#CanlıBahis #LiveBet');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Çoklu canlı fırsat özeti
 */
export function formatLiveSummaryTweet(
  opportunities: LiveOpportunity[]
): string {
  const lines: string[] = [];

  lines.push(`🔴 CANLI FIRSATLAR (${opportunities.length} adet)`);
  lines.push('');

  opportunities.slice(0, 3).forEach((opp, i) => {
    const { emoji } = formatOpportunityType(opp.type);
    lines.push(
      `${i + 1}. ${emoji} ${opp.match.homeTeam} vs ${opp.match.awayTeam}`
    );
    lines.push(
      `   ${opp.match.minute}' | ${opp.market} @${opp.estimatedOdds.toFixed(2)}`
    );
  });

  if (opportunities.length > 3) {
    lines.push(`   ...ve ${opportunities.length - 3} fırsat daha`);
  }

  lines.push('');
  lines.push('#CanlıBahis #LiveBet');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

// ============ CANLI BAHİS SONUÇLARI ============

/**
 * Canlı bahis yerleştirildi
 */
export function formatLiveBetPlacedTweet(bet: LiveBet): string {
  const lines: string[] = [];

  lines.push('🔴 CANLI BAHİS YERLEŞTİRİLDİ!');
  lines.push('');
  lines.push(`⚽ ${bet.match.homeTeam} vs ${bet.match.awayTeam}`);
  lines.push(
    `📍 ${bet.match.minuteAtBet}' | Skor: ${bet.match.scoreAtBet}`
  );
  lines.push('');
  lines.push(`🎯 ${bet.market}: ${bet.pick}`);
  lines.push(`📊 Oran: ${bet.odds.toFixed(2)}`);
  lines.push(
    `💰 ${bet.stake.toFixed(0)}₺ → Potansiyel: ${(bet.stake * bet.odds).toFixed(0)}₺`
  );
  lines.push('');
  lines.push('⏳ Sonuç bekleniyor...');
  lines.push('#CanlıBahis');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Canlı bahis kazandı
 */
export function formatLiveBetWonTweet(bet: LiveBet): string {
  const profit = bet.result ? bet.result.payout - bet.stake : 0;
  const lines: string[] = [];

  lines.push('✅ CANLI BAHİS KAZANDI! 🎉');
  lines.push('');
  lines.push(`⚽ ${bet.match.homeTeam} vs ${bet.match.awayTeam}`);
  lines.push(`📍 Final: ${bet.result?.finalScore || '?-?'}`);
  lines.push('');
  lines.push(`🎯 ${bet.market}: ${bet.pick} ✓`);
  lines.push(`📊 Oran: ${bet.odds.toFixed(2)}`);
  lines.push('');
  lines.push(`💰 Stake: ${bet.stake.toFixed(0)}₺`);
  lines.push(`🎉 Kazanç: ${bet.result?.payout.toFixed(0) || 0}₺`);
  lines.push(`📈 Kar: +${profit.toFixed(0)}₺`);
  lines.push('#CanlıBahis #Kazandık');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Canlı bahis kaybetti
 */
export function formatLiveBetLostTweet(bet: LiveBet): string {
  const lines: string[] = [];

  lines.push('❌ CANLI BAHİS KAYBETTİ');
  lines.push('');
  lines.push(`⚽ ${bet.match.homeTeam} vs ${bet.match.awayTeam}`);
  lines.push(`📍 Final: ${bet.result?.finalScore || '?-?'}`);
  lines.push('');
  lines.push(`🎯 ${bet.market}: ${bet.pick} ✗`);
  lines.push(`💸 Kayıp: -${bet.stake.toFixed(0)}₺`);
  lines.push('');
  lines.push('Bir sonraki fırsatta görüşürüz! 💪');
  lines.push('#CanlıBahis');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Günlük canlı bahis özeti
 */
export function formatLiveDailySummaryTweet(
  bets: LiveBet[],
  stats: { won: number; lost: number; profit: number }
): string {
  const isProfit = stats.profit >= 0;
  const lines: string[] = [];

  lines.push('📊 GÜNLÜK CANLI BAHİS ÖZETİ');
  lines.push('');
  lines.push(`✅ Kazanan: ${stats.won}`);
  lines.push(`❌ Kaybeden: ${stats.lost}`);
  lines.push(
    `📈 Başarı: %${
      stats.won + stats.lost > 0
        ? ((stats.won / (stats.won + stats.lost)) * 100).toFixed(0)
        : 0
    }`
  );
  lines.push('');
  lines.push(
    isProfit
      ? `💰 Günlük Kar: +${stats.profit.toFixed(0)}₺ 🎉`
      : `💸 Günlük Zarar: ${stats.profit.toFixed(0)}₺`
  );

  // En iyi bahis
  const bestWin = bets
    .filter((b) => b.status === 'won' && b.result)
    .sort((a, b) => (b.result?.payout || 0) - (a.result?.payout || 0))[0];

  if (bestWin) {
    lines.push('');
    lines.push(
      `🏆 En iyi: ${bestWin.match.homeTeam} vs ${bestWin.match.awayTeam}`
    );
    lines.push(
      `   ${bestWin.pick} @${bestWin.odds.toFixed(2)} → +${((bestWin.result?.payout || 0) - bestWin.stake).toFixed(0)}₺`
    );
  }

  lines.push('');
  lines.push('#CanlıBahis #GünlükÖzet');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

// ============ CANLI SKOR GÜNCELLEMESİ ============

/**
 * Canlı skor güncelleme tweet'i (kupon takibi)
 */
export function formatLiveScoreUpdateTweet(
  matches: {
    homeTeam: string;
    awayTeam: string;
    predictionLabel: string;
    homeScore: number;
    awayScore: number;
    minute: number;
    status: 'winning' | 'losing' | 'pending';
  }[]
): string {
  const lines: string[] = [];
  let allCorrect = true;

  lines.push('⚽ CANLI SKOR GÜNCELLEMESİ');
  lines.push('');

  for (const m of matches) {
    const emoji =
      m.status === 'winning' ? '✅' : m.status === 'losing' ? '⚠️' : '🔄';
    if (m.status !== 'winning') allCorrect = false;
    lines.push(
      `${emoji} ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`
    );
    lines.push(`   ${m.minute}' | ${m.predictionLabel}`);
  }

  lines.push('');
  lines.push(
    allCorrect ? '🔥 Şu an hepsi tutuyor!' : '⏳ Maçlar devam ediyor...'
  );
  lines.push('#Bahis #Canlı');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

// ============ CANLI RADAR ============

export interface LiveRadarData {
  homeTeam: string;
  awayTeam: string;
  minute: number;
  deviation: string;
  parameter: string;
  xgNote: string;
  suggestion: string;
  confidencePercent: number;
  matchTag?: string;
}

export function formatLiveRadarTweet(data: LiveRadarData): string {
  const matchTag =
    data.matchTag ||
    `${data.homeTeam}vs${data.awayTeam}`.replace(/\s/g, '');

  return safeTweet(withSiteLink(`📡 [SİSTEM RADARI: CANLI ANALİZ]

🏟 Maç: ${data.homeTeam} vs ${data.awayTeam}
⏱ Dakika: ${data.minute}'
📉 Durum: Veri setinde ${data.deviation} tespit edildi.
📊 Parametre: ${data.parameter}. ${data.xgNote}

🎯 Öneri: ${data.suggestion}
🛠 Güven Skoru: %${data.confidencePercent}

#CanlıAnaliz #${matchTag}`));
}

// ============ CANLI TAKİP ============

export interface LiveTrackingData {
  match: string;
  minute: number;
  homeXG: number;
  awayXG: number;
  score: string;
  momentumTeam: string;
  actionable: string;
}

export function formatLiveTrackingTweet(data: LiveTrackingData): string {
  return safeTweet(withSiteLink(`📊 CANLI TAKİP: ${data.match}

⏱ ${data.minute}' | Skor: ${data.score}

📈 xG Akışı:
   Ev: ${data.homeXG.toFixed(2)} | Dep: ${data.awayXG.toFixed(2)}

🎯 Momentum: ${data.momentumTeam}
💡 ${data.actionable}

#CanlıAnaliz`));
}

// ============ CANLI GOL ============

export interface LiveMomentData {
  match: string;
  minute: number;
  event: 'goal' | 'halftime' | 'fulltime' | 'pressure' | 'red_card';
  team?: string;
  score?: string;
  prediction?: string;
  wasCorrect?: boolean;
}

export function formatLiveGoalTweet(data: LiveMomentData): string {
  if (data.event === 'pressure') {
    return safeTweet(`⚡ ${data.match} - ${data.minute}'

${data.team} baskıyı kurdu. xG artışı görülüyor.
Matematiksel olarak gol olasılığı yükseliyor... 📈

#canli #analiz`);
  }

  if (data.event === 'goal') {
    const celebration = data.wasCorrect
      ? '✅ Sistem Doğrulandı!'
      : '⚽ GOL!';
    return safeTweet(`${celebration}

${data.match} - ${data.minute}'
Skor: ${data.score}

${data.wasCorrect ? `Model çıktısı tuttu: ${data.prediction}` : ''}

#canli #analiz`);
  }

  if (data.event === 'halftime') {
    return safeTweet(`⏸️ DEVRE ARASI ANALİZİ

${data.match}
Skor: ${data.score}

📊 İlk yarı verileri işleniyor...
İkinci yarı projeksiyonu 👇`);
  }

  if (data.event === 'fulltime') {
    const resultText = data.wasCorrect
      ? '✅ Model Doğrulandı (Validated)'
      : '📊 Veri sapması analiz edilecek';
    return safeTweet(`🏁 MAÇ SONU

${data.match}
Final: ${data.score}

${resultText}`);
  }

  return '';
}

// ============ SNOWBALL (KATLAMA) ============

/**
 * Katlama başladı
 */
export function formatSnowballStartTweet(
  chain: SnowballChain,
  firstBet: LiveBet
): string {
  const lines: string[] = [];

  lines.push('🎰 KATLAMA BAŞLADI!');
  lines.push('');
  lines.push(`💰 Başlangıç: ${chain.initialStake.toFixed(0)}₺`);
  lines.push(
    `🎯 Hedef: ${(chain.initialStake * chain.targetMultiplier).toFixed(0)}₺ (${chain.targetMultiplier}x)`
  );
  lines.push(`📊 Max ${chain.maxSteps} bahis`);
  lines.push('');
  lines.push('─────────────────');
  lines.push(`1️⃣ İLK BAHİS:`);
  lines.push('');
  lines.push(`⚽ ${firstBet.match.homeTeam} vs ${firstBet.match.awayTeam}`);
  lines.push(
    `📍 ${firstBet.match.minuteAtBet}' | ${firstBet.match.scoreAtBet}`
  );
  lines.push(`🎯 ${formatMarket(firstBet.market, firstBet.pick)}`);
  lines.push(`📊 @${firstBet.odds.toFixed(2)}`);
  lines.push('');
  lines.push(
    `💰 ${firstBet.stake.toFixed(0)}₺ → ${(firstBet.stake * firstBet.odds).toFixed(0)}₺`
  );
  lines.push('#Katlama #Snowball');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Katlama devam ediyor
 */
export function formatSnowballContinueTweet(
  chain: SnowballChain,
  lastBet: LiveBet,
  nextBet: LiveBet
): string {
  const stepEmojis = [
    '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
    '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
  ];
  const lines: string[] = [];

  lines.push(`✅ ${stepEmojis[chain.currentStep - 2] || '✓'} KAZANDIK!`);
  lines.push('');
  lines.push(
    `⚽ ${lastBet.match.homeTeam} ${lastBet.result?.finalScore} ${lastBet.match.awayTeam}`
  );
  lines.push(`🎯 ${lastBet.pick} @${lastBet.odds.toFixed(2)} ✓`);
  lines.push('');
  lines.push(
    `💰 ${chain.initialStake.toFixed(0)}₺ → ${chain.currentStake.toFixed(0)}₺`
  );
  lines.push(
    `📈 Şu ana kadar ${(chain.currentStake / chain.initialStake).toFixed(1)}x`
  );
  lines.push('');
  lines.push('─────────────────');
  lines.push(
    `${stepEmojis[chain.currentStep - 1] || '🔢'} SONRAKİ BAHİS:`
  );
  lines.push('');
  lines.push(`⚽ ${nextBet.match.homeTeam} vs ${nextBet.match.awayTeam}`);
  lines.push(
    `📍 ${nextBet.match.minuteAtBet}' | ${nextBet.match.scoreAtBet}`
  );
  lines.push(`🎯 ${formatMarket(nextBet.market, nextBet.pick)}`);
  lines.push(`📊 @${nextBet.odds.toFixed(2)}`);
  lines.push('');
  lines.push(
    `💰 ${nextBet.stake.toFixed(0)}₺ → ${(nextBet.stake * nextBet.odds).toFixed(0)}₺`
  );
  lines.push('#Katlama #Snowball');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Katlama başarılı
 */
export function formatSnowballWonTweet(chain: SnowballChain): string {
  const profit = chain.finalPayout! - chain.initialStake;
  const multiplier = chain.finalPayout! / chain.initialStake;
  const stepEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  const lines: string[] = [];

  lines.push('🎉🎉🎉 KATLAMA BAŞARILI! 🎉🎉🎉');
  lines.push('');
  lines.push(
    `💰 ${chain.initialStake.toFixed(0)}₺ → ${chain.finalPayout!.toFixed(0)}₺`
  );
  lines.push(`📈 ${multiplier.toFixed(1)}x KATLANDI!`);
  lines.push(
    `🎯 ${chain.bets.length} bahiste ${chain.bets.length} kazandı`
  );
  lines.push('');
  lines.push('─────────────────');
  lines.push('📊 ÖZET:');

  chain.bets.forEach((bet, i) => {
    lines.push(
      `${stepEmojis[i] || '✓'} ${bet.match.homeTeam} vs ${bet.match.awayTeam}`
    );
    lines.push(`   ${bet.pick} @${bet.odds.toFixed(2)} ✅`);
  });

  lines.push('');
  lines.push(`🏆 TOPLAM KAR: +${profit.toFixed(0)}₺`);
  lines.push('#Katlama #Kazandık');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}

/**
 * Katlama kaybetti
 */
export function formatSnowballLostTweet(
  chain: SnowballChain,
  lastBet: LiveBet
): string {
  const lines: string[] = [];

  lines.push('❌ KATLAMA SONA ERDİ');
  lines.push('');
  lines.push(
    `⚽ ${lastBet.match.homeTeam} ${lastBet.result?.finalScore || '?-?'} ${lastBet.match.awayTeam}`
  );
  lines.push(`🎯 ${lastBet.pick} ✗`);
  lines.push('');
  lines.push(`📊 ${chain.currentStep}. bahiste kaybettik`);
  lines.push(`💰 ${chain.initialStake.toFixed(0)}₺ başlangıç`);
  lines.push(`💸 Kayıp: -${chain.initialStake.toFixed(0)}₺`);

  if (chain.bets.length > 1) {
    lines.push('');
    lines.push('Önceki bahisler:');
    chain.bets.slice(0, -1).forEach((bet) => {
      lines.push(
        `✅ ${bet.match.homeTeam} vs ${bet.match.awayTeam} @${bet.odds.toFixed(2)}`
      );
    });
  }

  lines.push('');
  lines.push('Yeni katlama yakında başlayacak! 💪');
  lines.push('#Katlama');

  return safeTweet(withSiteLink(lines.join('\n'), '/live'));
}
