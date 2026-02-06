/**
 * Live Pick Tracker - Canlı Bahis Takip Deposu
 * 
 * Redis'te canlı pick'leri saklar, sonuçları takip eder,
 * günlük performans istatistiklerini tutar.
 * 
 * Akış:
 * 1. Fırsat tespit → pick kaydedilir (status: 'active')
 * 2. Maç biter → sonuç kontrol edilir (status: 'won' | 'lost')
 * 3. Sonuç tweet'i atılır
 * 4. Günlük özet tweet'i atılır
 */

import { cacheGet, cacheSet } from '@/lib/cache/redis-cache';

// ============ TİPLER ============

export interface LivePick {
  id: string;
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  
  // Tahmin detayları
  market: string;           // "Üst 1.5", "Sıradaki Gol Ev Sahibi" vb.
  pick: string;             // "Üst 1.5", "Ev Sahibi Golü" vb.
  confidence: number;       // 0-100
  estimatedOdds: number;
  reasoning: string;
  
  // Tweet referansı
  tweetId?: string;         // Bu pick'in tweet edildiği tweet ID
  
  // Maç durumu (pick anında)
  scoreAtPick: string;      // "0-0", "1-0" vb.
  minuteAtPick: number;
  
  // Sonuç
  status: 'active' | 'won' | 'lost' | 'void';
  finalScore?: string;
  settledAt?: string;       // ISO date
  
  // Zaman
  createdAt: string;        // ISO date
  source: 'live-bot' | 'cron-bot';
}

export interface LivePickStats {
  date: string;             // YYYY-MM-DD
  totalPicks: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  winRate: number;          // 0-100
  streak: number;           // pozitif = kazanma serisi, negatif = kayıp serisi
  bestPick?: {
    match: string;
    pick: string;
    odds: number;
  };
  picks: LivePick[];
}

// ============ REDIS KEY'LER ============

const PICKS_KEY = 'live-picks:active';           // Aktif pick'ler
const DAILY_STATS_KEY = (date: string) => `live-picks:stats:${date}`;
const ALL_PICKS_KEY = (date: string) => `live-picks:all:${date}`;
const TTL_ACTIVE = 24 * 60 * 60;                 // 24 saat 
const TTL_STATS = 7 * 24 * 60 * 60;              // 7 gün

// ============ PICK YÖNETİMİ ============

/**
 * Yeni pick kaydet
 */
export async function saveLivePick(pick: LivePick): Promise<boolean> {
  try {
    // Aktif pick'leri al
    const activePicks = await getActivePicks();
    
    // Aynı maç + aynı market zaten varsa ekleme
    const existing = activePicks.find(p => 
      p.fixtureId === pick.fixtureId && p.market === pick.market
    );
    if (existing) {
      console.log(`[LivePicker] Pick zaten var: ${pick.fixtureId} - ${pick.market}`);
      return false;
    }
    
    activePicks.push(pick);
    await cacheSet(PICKS_KEY, activePicks, TTL_ACTIVE);
    
    // Günlük listeye de ekle
    const today = new Date().toISOString().split('T')[0];
    const allPicks = await getDailyPicks(today);
    allPicks.push(pick);
    await cacheSet(ALL_PICKS_KEY(today), allPicks, TTL_STATS);
    
    console.log(`[LivePicker] Pick kaydedildi: ${pick.homeTeam} vs ${pick.awayTeam} - ${pick.pick}`);
    return true;
  } catch (err) {
    console.error('[LivePicker] Pick kayıt hatası:', err);
    return false;
  }
}

/**
 * Aktif pick'leri getir
 */
export async function getActivePicks(): Promise<LivePick[]> {
  const picks = await cacheGet<LivePick[]>(PICKS_KEY);
  return picks || [];
}

/**
 * Günlük tüm pick'leri getir
 */
export async function getDailyPicks(date: string): Promise<LivePick[]> {
  const picks = await cacheGet<LivePick[]>(ALL_PICKS_KEY(date));
  return picks || [];
}

/**
 * Pick sonucunu güncelle
 */
export async function settlePick(
  fixtureId: number, 
  market: string,
  result: 'won' | 'lost' | 'void',
  finalScore: string
): Promise<LivePick | null> {
  try {
    // Aktif pick'lerden bul
    const activePicks = await getActivePicks();
    const pickIndex = activePicks.findIndex(p => 
      p.fixtureId === fixtureId && p.market === market
    );
    
    if (pickIndex === -1) return null;
    
    const pick = activePicks[pickIndex];
    pick.status = result;
    pick.finalScore = finalScore;
    pick.settledAt = new Date().toISOString();
    
    // Aktif listeden çıkar
    activePicks.splice(pickIndex, 1);
    await cacheSet(PICKS_KEY, activePicks, TTL_ACTIVE);
    
    // Günlük listede güncelle
    const today = pick.createdAt.split('T')[0];
    const allPicks = await getDailyPicks(today);
    const dailyIndex = allPicks.findIndex(p => p.id === pick.id);
    if (dailyIndex !== -1) {
      allPicks[dailyIndex] = pick;
      await cacheSet(ALL_PICKS_KEY(today), allPicks, TTL_STATS);
    }
    
    // Günlük istatistikleri güncelle
    await updateDailyStats(today);
    
    console.log(`[LivePicker] Pick settle: ${pick.homeTeam} vs ${pick.awayTeam} - ${result} (${finalScore})`);
    return pick;
  } catch (err) {
    console.error('[LivePicker] Pick settle hatası:', err);
    return null;
  }
}

/**
 * Günlük istatistikleri hesapla ve kaydet
 */
export async function updateDailyStats(date: string): Promise<LivePickStats> {
  const picks = await getDailyPicks(date);
  
  const won = picks.filter(p => p.status === 'won').length;
  const lost = picks.filter(p => p.status === 'lost').length;
  const voided = picks.filter(p => p.status === 'void').length;
  const pending = picks.filter(p => p.status === 'active').length;
  const settled = won + lost;
  
  // Streak hesapla (son pick'lerden geriye doğru)
  let streak = 0;
  const settledPicks = picks
    .filter(p => p.status === 'won' || p.status === 'lost')
    .sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''));
  
  if (settledPicks.length > 0) {
    const lastResult = settledPicks[0].status;
    for (const p of settledPicks) {
      if (p.status === lastResult) {
        streak += lastResult === 'won' ? 1 : -1;
      } else {
        break;
      }
    }
  }
  
  // En iyi pick
  const bestWon = picks
    .filter(p => p.status === 'won')
    .sort((a, b) => b.estimatedOdds - a.estimatedOdds)[0];
  
  const stats: LivePickStats = {
    date,
    totalPicks: picks.length,
    won,
    lost,
    voided,
    pending,
    winRate: settled > 0 ? Math.round((won / settled) * 100) : 0,
    streak,
    bestPick: bestWon ? {
      match: `${bestWon.homeTeam} vs ${bestWon.awayTeam}`,
      pick: bestWon.pick,
      odds: bestWon.estimatedOdds,
    } : undefined,
    picks,
  };
  
  await cacheSet(DAILY_STATS_KEY(date), stats, TTL_STATS);
  return stats;
}

/**
 * Günlük istatistikleri getir
 */
export async function getDailyStats(date: string): Promise<LivePickStats | null> {
  return await cacheGet<LivePickStats>(DAILY_STATS_KEY(date));
}

// ============ SONUÇ KONTROL YARDIMCILARI ============

/**
 * Pick tuttu mu kontrol et
 */
export function checkPickResult(
  pick: LivePick, 
  finalHomeScore: number, 
  finalAwayScore: number
): 'won' | 'lost' | 'void' {
  const totalGoals = finalHomeScore + finalAwayScore;
  const market = pick.market.toLowerCase();
  const pickText = pick.pick.toLowerCase();
  
  // Üst/Alt kontrolleri
  if (market.includes('üst 0.5') || pickText.includes('üst 0.5')) {
    return totalGoals >= 1 ? 'won' : 'lost';
  }
  if (market.includes('üst 1.5') || pickText.includes('üst 1.5')) {
    return totalGoals >= 2 ? 'won' : 'lost';
  }
  if (market.includes('üst 2.5') || pickText.includes('üst 2.5') || market.includes('2.5 üst')) {
    return totalGoals >= 3 ? 'won' : 'lost';
  }
  if (market.includes('üst 3.5') || pickText.includes('üst 3.5')) {
    return totalGoals >= 4 ? 'won' : 'lost';
  }
  if (market.includes('alt 2.5') || pickText.includes('alt 2.5') || market.includes('2.5 alt')) {
    return totalGoals < 3 ? 'won' : 'lost';
  }
  
  // Sonraki Gol / Ev Sahibi Golü
  if (pickText.includes('ev sahibi') && (market.includes('sonraki gol') || market.includes('sıradaki gol'))) {
    // Pick anındaki skordan sonra ev sahibi gol attı mı?
    const [pickHome] = pick.scoreAtPick.split('-').map(Number);
    return finalHomeScore > pickHome ? 'won' : 'lost';
  }
  
  // Sonraki Gol / Deplasman Golü
  if (pickText.includes('deplasman') && (market.includes('sonraki gol') || market.includes('sıradaki gol'))) {
    const [, pickAway] = pick.scoreAtPick.split('-').map(Number);
    return finalAwayScore > pickAway ? 'won' : 'lost';
  }
  
  // Gol Var (en az 1 gol daha gelecek)
  if (pickText.includes('gol var') || pickText.includes('gol atacak')) {
    const [pickHome, pickAway] = pick.scoreAtPick.split('-').map(Number);
    const pickTotal = pickHome + pickAway;
    return totalGoals > pickTotal ? 'won' : 'lost';
  }
  
  // KG Var (Karşılıklı Gol)
  if (market.includes('kg var') || pickText.includes('kg var') || market.includes('btts')) {
    return (finalHomeScore > 0 && finalAwayScore > 0) ? 'won' : 'lost';
  }
  
  // MS 1 (Ev Sahibi Kazanır)
  if (market.includes('ms 1') || pickText === 'ms 1' || pickText === 'ev sahibi kazanır') {
    return finalHomeScore > finalAwayScore ? 'won' : 'lost';
  }
  
  // MS 2 (Deplasman Kazanır)
  if (market.includes('ms 2') || pickText === 'ms 2' || pickText === 'deplasman kazanır') {
    return finalAwayScore > finalHomeScore ? 'won' : 'lost';
  }
  
  // Korner Üstü
  if (market.includes('korner üst')) {
    // Korner bilgisini bilemediğimiz için void dönelim
    return 'void';
  }
  
  // Kart Üstü
  if (market.includes('kart üst')) {
    return 'void';
  }
  
  // Bilinmeyen market — güvende ol
  console.warn(`[LivePicker] Bilinmeyen market: ${pick.market} / ${pick.pick}`);
  return 'void';
}

// ============ TWEET FORMAT YARDIMCILARI ============

/**
 * Tek pick sonucu tweet metni
 */
export function formatPickResultTweet(pick: LivePick, stats: LivePickStats): string {
  const isWon = pick.status === 'won';
  const lines: string[] = [];
  
  if (isWon) {
    lines.push('✅ TUTTU! Sistem Doğrulandı 🎯');
  } else {
    lines.push('❌ Tutmadı - Veri Sapması');
  }
  lines.push('');
  lines.push(`⚽ ${pick.homeTeam} ${pick.finalScore} ${pick.awayTeam}`);
  lines.push(`🎯 ${pick.pick} @${pick.estimatedOdds.toFixed(2)} ${isWon ? '✓' : '✗'}`);
  lines.push(`📊 Güven: %${pick.confidence}`);
  
  if (pick.reasoning) {
    lines.push(`💡 ${pick.reasoning}`);
  }
  
  lines.push('');
  
  // Günlük performans
  const total = stats.won + stats.lost;
  if (total > 0) {
    lines.push(`📈 Günlük: ${stats.won}/${total} (%${stats.winRate})`);
    if (stats.streak > 0) {
      lines.push(`🔥 ${stats.streak} maç üst üste tuttu!`);
    } else if (stats.streak < 0) {
      lines.push(`💪 Seri kırılacak, sistem çalışıyor`);
    }
  }
  
  lines.push('');
  lines.push('🔗 https://bilyoner-assistant.vercel.app');
  lines.push('');
  lines.push('#CanlıAnaliz #BahisTakip');
  
  return lines.join('\n');
}

/**
 * Günlük performans özeti tweet
 */
export function formatDailyPerformanceTweet(stats: LivePickStats): string {
  const lines: string[] = [];
  const total = stats.won + stats.lost;
  
  if (stats.winRate >= 70) {
    lines.push(`🔥 GÜNLÜK PERFORMANS: %${stats.winRate} İSABET!`);
  } else if (stats.winRate >= 50) {
    lines.push(`📊 GÜNLÜK PERFORMANS RAPORU`);
  } else {
    lines.push(`📊 GÜNLÜK PERFORMANS ÖZETİ`);
  }
  lines.push('');
  
  lines.push(`📅 ${stats.date}`);
  lines.push(`🎯 Toplam: ${stats.totalPicks} pick`);
  lines.push(`✅ Kazanan: ${stats.won}`);
  lines.push(`❌ Kaybeden: ${stats.lost}`);
  if (stats.pending > 0) {
    lines.push(`⏳ Bekleyen: ${stats.pending}`);
  }
  lines.push('');
  
  lines.push(`📈 İsabet Oranı: %${stats.winRate}`);
  
  if (stats.streak > 2) {
    lines.push(`🔥 ${stats.streak} maç serisi devam ediyor!`);
  }
  lines.push('');
  
  if (stats.bestPick) {
    lines.push(`🏆 En İyi Pick:`);
    lines.push(`   ${stats.bestPick.match}`);
    lines.push(`   ${stats.bestPick.pick} @${stats.bestPick.odds.toFixed(2)} ✅`);
    lines.push('');
  }
  
  // Motivasyon mesajı
  if (stats.winRate >= 80) {
    lines.push('💎 Mükemmel gün! Algoritma tam isabet!');
  } else if (stats.winRate >= 60) {
    lines.push('💪 İyi performans, sistem çalışıyor!');
  } else if (total > 0) {
    lines.push('📊 Veriler analiz ediliyor, yarın daha güçlü!');
  }
  
  lines.push('');
  lines.push('🔗 https://bilyoner-assistant.vercel.app');
  lines.push('');
  lines.push('#CanlıAnaliz #Performans #BahisTakip');
  
  return lines.join('\n');
}

/**
 * Çoklu pick tuttuğunda kutlama tweeti
 */
export function formatWinStreakTweet(picks: LivePick[], stats: LivePickStats): string {
  const lines: string[] = [];
  
  lines.push(`🔥🔥 ${picks.length} MAÇTA ${picks.length} TUTTU!`);
  lines.push('');
  
  picks.forEach((pick, i) => {
    lines.push(`${i + 1}. ✅ ${pick.homeTeam} ${pick.finalScore} ${pick.awayTeam}`);
    lines.push(`   🎯 ${pick.pick} @${pick.estimatedOdds.toFixed(2)}`);
  });
  
  lines.push('');
  lines.push(`📈 Günlük: ${stats.won}/${stats.won + stats.lost} (%${stats.winRate})`);
  
  if (stats.streak >= 5) {
    lines.push(`🏆 ${stats.streak} maçlık isabet serisi!`);
  }
  
  lines.push('');
  lines.push('🔗 https://bilyoner-assistant.vercel.app');
  lines.push('');
  lines.push('Algoritma konuşuyor! 🤖');
  lines.push('#CanlıAnaliz #İsabet #Bahis');
  
  return lines.join('\n');
}
