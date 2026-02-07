/**
 * Test: Fotoğraflı tweet gönderme
 * Production OG image endpoint'ini kullanarak Twitter'a resimli tweet atar
 */

import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.local') });

const {
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
} = process.env;

if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
  console.error('❌ Twitter OAuth 1.0a credentials eksik!');
  process.exit(1);
}

// OAuth 1.0a client (media upload için)
const oauth1Client = new TwitterApi({
  appKey: TWITTER_API_KEY,
  appSecret: TWITTER_API_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

async function main() {
  try {
    // 1. LOCAL OG image URL kullan (dev server çalışıyor)
    const matchesData = [
      {
        home: 'Leeds',
        away: 'Nott. Forest',
        score: '3-1',
        minute: 87,
        league: 'Premier League',
        pick: 'Üst 3.5 Gol',
        odds: 1.65,
        confidence: 82,
        reasoning: 'Yüksek xG, açık oyun',
      },
    ];

    const imageUrl = `http://127.0.0.1:3000/api/og/live?type=opportunity&matches=${encodeURIComponent(JSON.stringify(matchesData))}`;
    
    console.log('📸 OG Image URL:', imageUrl);
    console.log('⬇️ Görsel indiriliyor...');

    // 2. Görseli indir
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Görsel indirilemedi: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    console.log(`✅ Görsel indirildi: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

    // 3. Twitter'a yükle
    console.log('📤 Twitter\'a yükleniyor...');
    const mediaId = await oauth1Client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
    });
    console.log('✅ Media yüklendi:', mediaId);

    // 4. Tweet at
    const tweetText = `🔴 CANLI ANALİZ - Sistem Testi

⚽ Leeds 3-1 Nott. Forest
⏱️ 87' | Premier League
🎯 Üst 3.5 Gol @1.65 | Güven: %82

🔗 https://bilyoner-assistant.vercel.app/live

#CanlıAnaliz #VeriAnalizi`;

    console.log('🐦 Tweet gönderiliyor...');
    const tweet = await oauth1Client.v2.tweet({
      text: tweetText,
      media: { media_ids: [mediaId] },
    });
    
    console.log('🎉 Tweet gönderildi!');
    console.log(`🔗 https://twitter.com/i/web/status/${tweet.data.id}`);
    console.log('Tweet ID:', tweet.data.id);
    
  } catch (error) {
    console.error('❌ Hata:', error);
  }
}

main();
