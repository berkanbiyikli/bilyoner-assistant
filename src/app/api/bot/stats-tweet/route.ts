/**
 * Futbol İstatistik Paylaşımı API
 * İlginç futbol istatistikleri tweetler
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendTweet } from '@/lib/bot/twitter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// İlginç istatistikler havuzu
const STATS_POOL = [
  // Premier League
  {
    category: 'Premier League',
    stats: [
      '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League\'de ev sahibi takımlar %45 galibiyet alıyor',
      '🏴󠁧󠁢󠁥󠁮󠁧󠁿 PL\'de maçların %52\'sinde Üst 2.5 gol oluyor',
      '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League\'de KG Var oranı: %48',
      '🏴󠁧󠁢󠁥󠁮󠁧󠁿 PL\'de en golcü devre: 2. yarı ilk 15 dk',
    ],
  },
  // La Liga
  {
    category: 'La Liga',
    stats: [
      '🇪🇸 La Liga\'da maçların %58\'i 2.5 üstü gol görüyor',
      '🇪🇸 Barcelona evinde son 20 maçta sadece 2 kez yenildi',
      '🇪🇸 La Liga\'da penaltı oranı: maç başına 0.31',
      '🇪🇸 Real Madrid-Barcelona derbilerinde ort. 3.2 gol',
    ],
  },
  // Serie A
  {
    category: 'Serie A',
    stats: [
      '🇮🇹 Serie A\'da ilk yarı gol ortalaması: 1.1',
      '🇮🇹 Inter evinde son 15 maçta yenilmedi',
      '🇮🇹 Serie A\'da kart ortalaması: maç başına 4.8',
      '🇮🇹 İtalya\'da 0-0 biten maç oranı: %8',
    ],
  },
  // Bundesliga
  {
    category: 'Bundesliga',
    stats: [
      '🇩🇪 Bundesliga Avrupa\'nın en golcü ligi: maç başına 3.1 gol',
      '🇩🇪 Bayern Münih evinde %89 galibiyet oranı',
      '🇩🇪 Bundesliga\'da KG Var oranı: %54',
      '🇩🇪 Alman liginde Üst 2.5 oranı: %62',
    ],
  },
  // Süper Lig
  {
    category: 'Süper Lig',
    stats: [
      '🇹🇷 Süper Lig\'de ev avantajı: %48 galibiyet',
      '🇹🇷 Galatasaray-Fenerbahçe derbilerinde ort. 2.8 gol',
      '🇹🇷 Süper Lig\'de maç başına kart: 5.2',
      '🇹🇷 Türkiye\'de Üst 2.5 oranı: %51',
    ],
  },
  // Genel
  {
    category: 'Genel',
    stats: [
      '⚽ Futbolda en çok gol atılan dakika: 90+',
      '⚽ Dünyada en popüler bahis: Maç Sonucu (1X2)',
      '⚽ Şampiyonlar Ligi\'nde ort. 2.9 gol/maç',
      '⚽ Avrupa\'da en az gol gören lig: Ligue 1 (2.5/maç)',
      '⚽ Korner sayısı ile gol ilişkisi: %23 korelasyon',
      '⚽ İlk golü atan takım %67 oranında kazanıyor',
      '⚽ 0-0 devre giren maçların %65\'i gollü bitiyor',
      '⚽ Kırmızı kart sonrası gol olasılığı: %41 artış',
    ],
  },
  // Bahis Taktikleri
  {
    category: 'Bahis Taktikleri',
    stats: [
      '💡 Kombine kuponlarda max 3 maç tutma ihtimalini artırır',
      '💡 Value bet: Olasılık > Oran\'ın ima ettiği olasılık',
      '💡 Kelly kriteri ile stake %2-5 arası tutulmalı',
      '💡 Uzun vadede %55 başarı bile kârlı',
      '💡 Tek maç bahisleri daha güvenli',
    ],
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const useMock = process.env.TWITTER_MOCK === 'true';
  
  try {
    // Rastgele kategori seç
    const categoryIndex = Math.floor(Math.random() * STATS_POOL.length);
    const category = STATS_POOL[categoryIndex];
    
    // Rastgele istatistik seç
    const statIndex = Math.floor(Math.random() * category.stats.length);
    const stat = category.stats[statIndex];
    
    // Tweet formatla
    const tweetText = formatStatsTweet(stat, category.category);
    
    // Tweet at
    if (!isTestMode) {
      if (useMock) {
        console.log('[Stats] MOCK Tweet:\n', tweetText);
      } else {
        await sendTweet(tweetText);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : 'İstatistik tweeti atıldı',
      tweet: tweetText,
      category: category.category,
    });
    
  } catch (error) {
    console.error('[Stats] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}

function formatStatsTweet(stat: string, category: string): string {
  const lines: string[] = [];
  
  lines.push('📈 BİLİYOR MUYDUNUZ?');
  lines.push('');
  lines.push(stat);
  lines.push('');
  lines.push(`📊 Kategori: ${category}`);
  lines.push('');
  lines.push('#futbol #istatistik #bahis #bilgi');
  
  return lines.join('\n');
}
