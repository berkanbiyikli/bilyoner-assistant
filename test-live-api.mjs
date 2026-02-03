/**
 * Live Bot API Test Script
 */

const BASE_URL = 'http://localhost:3000';

async function testLiveAPI() {
  console.log('🔴 Live API Test Başlıyor...\n');
  
  try {
    const res = await fetch(`${BASE_URL}/api/bot/live`);
    const data = await res.json();
    
    console.log('✅ API Yanıtı:');
    console.log('Success:', data.success);
    console.log('Matches:', data.matches);
    console.log('Opportunities:', data.opportunities?.length || 0);
    console.log('All Opportunities:', data.allOpportunitiesCount || 0);
    console.log('');
    
    if (data.liveMatches && data.liveMatches.length > 0) {
      console.log('📺 Canlı Maçlar:');
      data.liveMatches.forEach((m, i) => {
        console.log(`${i + 1}. ${m.fixture} ${m.score} (${m.minute}')`);
        if (m.stats) {
          console.log(`   📊 Şut: ${m.stats.shotsOnTarget} | Korner: ${m.stats.corners} | Top: ${m.stats.possession}`);
        }
      });
      console.log('');
    }
    
    if (data.opportunities && data.opportunities.length > 0) {
      console.log('💎 Tespit Edilen Fırsatlar:');
      data.opportunities.forEach((o, i) => {
        console.log(`${i + 1}. ${o.match.homeTeam} vs ${o.match.awayTeam} (${o.match.score})`);
        console.log(`   Type: ${o.type} | Market: ${o.market} | Pick: ${o.pick}`);
        console.log(`   Confidence: ${o.confidence}% | Value: ${o.value}%`);
      });
    } else {
      console.log('⚠️ Henüz fırsat tespit edilmedi');
      console.log('   (Fırsatlar için yüksek şut/korner/top kontrolü gerekli)');
    }
    
    console.log('\n✅ Test Tamamlandı!');
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
}

testLiveAPI();
