/**
 * Kupon Analiz Script'i
 * 
 * İlk Yarı / Maç Sonu (HT/FT) tahminlerini analiz eder.
 * Her maç için:
 * - Poisson dağılımıyla ilk yarı ve maç sonu olasılıklarını hesaplar
 * - Tarihi H2H verilerinden HT/FT dönüşüm oranlarını çıkarır
 * - Son maçlardaki HT-FT dönüşüm eğilimlerini inceler
 * - "1'den 2" ve "2'den 1" olan maçları filtreler
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

if (!API_KEY) {
  console.error('❌ API_FOOTBALL_KEY bulunamadı! .env.local dosyasını kontrol edin.');
  process.exit(1);
}

// ==================== API HELPERS ====================

let requestCount = 0;

async function apiFetch(endpoint, params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
  });
  const url = `${API_BASE_URL}${endpoint}?${searchParams.toString()}`;
  
  requestCount++;
  if (requestCount > 1) await new Promise(r => setTimeout(r, 350)); // rate limit koruması
  
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    }
  });
  
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  console.log(`   [API ${requestCount}] ${endpoint} → ${res.status} | Günlük kalan: ${remaining}`);
  
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API Error: ${JSON.stringify(data.errors)}`);
  }
  return data.response;
}

// ==================== POISSON MODEL ====================

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProb(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * İlk Yarı ve İkinci Yarı için ayrı Poisson modeli
 * İlk yarı genellikle maçın ~42-45%'inde gol girer (ilk yarı oranı daha düşük)
 */
function generateHTFTMatrix(homeXG, awayXG) {
  const HT_RATIO = 0.43; // İlk yarıda gollerin ~%43'ü atılır
  const FT_RATIO = 0.57;

  const homeHTxG = homeXG * HT_RATIO;
  const awayHTxG = awayXG * HT_RATIO;
  const homeSHxG = homeXG * FT_RATIO; // İkinci yarı
  const awaySHxG = awayXG * FT_RATIO;

  // 9 HT/FT kombinasyonu
  const htftProbs = {};
  const combos = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
  combos.forEach(c => htftProbs[c] = 0);

  const maxGoals = 5;

  for (let htHome = 0; htHome <= maxGoals; htHome++) {
    for (let htAway = 0; htAway <= maxGoals; htAway++) {
      const pHT = poissonProb(htHome, homeHTxG) * poissonProb(htAway, awayHTxG);
      
      // İlk yarı sonucu
      let htResult;
      if (htHome > htAway) htResult = '1';
      else if (htHome === htAway) htResult = 'X';
      else htResult = '2';

      // İkinci yarıda skorları ekle
      for (let shHome = 0; shHome <= maxGoals; shHome++) {
        for (let shAway = 0; shAway <= maxGoals; shAway++) {
          const pSH = poissonProb(shHome, homeSHxG) * poissonProb(shAway, awaySHxG);
          
          const ftHome = htHome + shHome;
          const ftAway = htAway + shAway;
          
          let ftResult;
          if (ftHome > ftAway) ftResult = '1';
          else if (ftHome === ftAway) ftResult = 'X';
          else ftResult = '2';

          const combo = `${htResult}/${ftResult}`;
          if (htftProbs[combo] !== undefined) {
            htftProbs[combo] += pHT * pSH;
          }
        }
      }
    }
  }

  return htftProbs;
}

// ==================== MAÇ ANALİZİ ====================

/**
 * Tarihi maçlardan HT/FT dönüşüm oranlarını hesapla
 */
function analyzeHTFTHistory(fixtures) {
  const stats = {
    total: 0,
    htft: {},
    reversal_2to1: 0, // IY deplasman öndeyken MS ev sahibi kazanır
    reversal_1to2: 0, // IY ev sahibi öndeyken MS deplasman kazanır
    details_2to1: [],
    details_1to2: [],
  };
  
  const combos = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
  combos.forEach(c => stats.htft[c] = 0);

  for (const fix of fixtures) {
    const ht = fix.score?.halftime;
    const ft = fix.goals;
    if (!ht || ft?.home === null || ft?.away === null || ht?.home === null || ht?.away === null) continue;

    stats.total++;

    let htR;
    if (ht.home > ht.away) htR = '1';
    else if (ht.home === ht.away) htR = 'X';
    else htR = '2';

    let ftR;
    if (ft.home > ft.away) ftR = '1';
    else if (ft.home === ft.away) ftR = 'X';
    else ftR = '2';

    const combo = `${htR}/${ftR}`;
    if (stats.htft[combo] !== undefined) stats.htft[combo]++;

    const matchInfo = `${fix.teams.home.name} ${ht.home}-${ht.away} (HT) → ${ft.home}-${ft.away} (FT) vs ${fix.teams.away.name}`;

    if (combo === '2/1') {
      stats.reversal_2to1++;
      stats.details_2to1.push(matchInfo);
    }
    if (combo === '1/2') {
      stats.reversal_1to2++;
      stats.details_1to2.push(matchInfo);
    }
  }

  return stats;
}

// ==================== ANA ANALİZ ====================

// Kupondaki maçlar
const matches = [
  { home: 'Fenerbahce',    away: 'Genclerbirligi', betType: '2/1', odds: 21.65, homeId: 611, awayId: 3574, leagueId: 203 },
  { home: 'Kayserispor',   away: 'Kocaelispor',    betType: '2/1', odds: 35.00, homeId: 3563, awayId: 3589, leagueId: 203 },
  { home: 'Villarreal',    away: 'Espanyol',        betType: '2/1', odds: 22.70, homeId: 533, awayId: 540, leagueId: 140 },
  { home: 'AS Roma',       away: 'Cagliari',        betType: '2/1', odds: 27.00, homeId: 497, awayId: 490, leagueId: 135 },
  { home: 'Porto',         away: 'Sporting CP',     betType: '1/2', odds: 35.00, homeId: 212, awayId: 228, leagueId: 94 },
  { home: 'Santander',     away: 'Mirandes',        betType: '2/1', odds: 21.55, homeId: 728, awayId: 727, leagueId: 141 },
  { home: 'Atalanta',      away: 'Cremonese',       betType: '2/1', odds: 23.10, homeId: 499, awayId: 512, leagueId: 135 },
  { home: 'AGF Aarhus',    away: 'Odense',          betType: '2/1', odds: 21.40, homeId: 400, awayId: 401, leagueId: 119 },
];

async function analyzeMatch(match, index) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 MAÇ ${index + 1}: ${match.home} vs ${match.away}`);
  console.log(`   Bahis: İY/MS ${match.betType} @ ${match.odds}`);
  console.log('='.repeat(70));

  const result = {
    match: `${match.home} vs ${match.away}`,
    betType: match.betType,
    odds: match.odds,
    impliedProb: (1 / match.odds * 100).toFixed(2) + '%',
    poissonProb: null,
    historicalProb: null,
    historicalReversals: null,
    opponentFormReversals: null,
    finalVerdict: null,
    confidence: null,
    grade: null,
  };

  try {
    // 1. Son maçları al (ev sahibi + deplasman)
    console.log('\n   📥 Son maçlar alınıyor...');
    const [homeFixtures, awayFixtures] = await Promise.all([
      apiFetch('/fixtures', { team: match.homeId, last: 15, timezone: 'Europe/Istanbul' }),
      apiFetch('/fixtures', { team: match.awayId, last: 15, timezone: 'Europe/Istanbul' }),
    ]);

    // 2. H2H verileri
    console.log('   📥 H2H verileri alınıyor...');
    const h2h = await apiFetch('/fixtures/headtohead', {
      h2h: `${match.homeId}-${match.awayId}`,
      last: 20,
      timezone: 'Europe/Istanbul'
    });

    // 3. xG / Gol ortalamaları hesapla
    let homeGoalsFor = 0, homeGoalsAgainst = 0, homeMatches = 0;
    let awayGoalsFor = 0, awayGoalsAgainst = 0, awayMatches = 0;

    for (const f of homeFixtures) {
      if (f.goals?.home === null || f.goals?.away === null) continue;
      homeMatches++;
      if (f.teams.home.id === match.homeId) {
        homeGoalsFor += f.goals.home;
        homeGoalsAgainst += f.goals.away;
      } else {
        homeGoalsFor += f.goals.away;
        homeGoalsAgainst += f.goals.home;
      }
    }

    for (const f of awayFixtures) {
      if (f.goals?.home === null || f.goals?.away === null) continue;
      awayMatches++;
      if (f.teams.home.id === match.awayId) {
        awayGoalsFor += f.goals.home;
        awayGoalsAgainst += f.goals.away;
      } else {
        awayGoalsFor += f.goals.away;
        awayGoalsAgainst += f.goals.home;
      }
    }

    const homeAvgFor = homeMatches > 0 ? homeGoalsFor / homeMatches : 1.3;
    const homeAvgAgainst = homeMatches > 0 ? homeGoalsAgainst / homeMatches : 1.1;
    const awayAvgFor = awayMatches > 0 ? awayGoalsFor / awayMatches : 1.0;
    const awayAvgAgainst = awayMatches > 0 ? awayGoalsAgainst / awayMatches : 1.3;

    // Beklenen gol (basit Poisson lambda)
    const homeXG = (homeAvgFor + awayAvgAgainst) / 2 * 1.05; // ev sahibi avantajı
    const awayXG = (awayAvgFor + homeAvgAgainst) / 2 * 0.95;

    console.log(`\n   📈 Gol İstatistikleri:`);
    console.log(`      ${match.home}: Son ${homeMatches} maç → Ort ${homeAvgFor.toFixed(2)} gol atıyor, ${homeAvgAgainst.toFixed(2)} gol yiyor`);
    console.log(`      ${match.away}: Son ${awayMatches} maç → Ort ${awayAvgFor.toFixed(2)} gol atıyor, ${awayAvgAgainst.toFixed(2)} gol yiyor`);
    console.log(`      Beklenen Gol: ${match.home} ${homeXG.toFixed(2)} - ${awayXG.toFixed(2)} ${match.away}`);

    // 4. Poisson HT/FT Matrisi
    const htftProbs = generateHTFTMatrix(homeXG, awayXG);
    const poissonBetProb = htftProbs[match.betType] || 0;
    result.poissonProb = (poissonBetProb * 100).toFixed(2) + '%';

    console.log(`\n   🎲 Poisson HT/FT Olasılıkları:`);
    const sorted = Object.entries(htftProbs).sort((a, b) => b[1] - a[1]);
    for (const [combo, prob] of sorted) {
      const marker = combo === match.betType ? ' ◄◄◄ SEÇİLEN BAHİS' : '';
      const bar = '█'.repeat(Math.round(prob * 200));
      console.log(`      ${combo}: ${(prob * 100).toFixed(2)}% ${bar}${marker}`);
    }

    // 5. Tarihi HT/FT Analizi - Ev sahibi son maçları
    console.log(`\n   📜 ${match.home} Son Maç HT/FT Analizi:`);
    const homeHTFT = analyzeHTFTHistory(homeFixtures);
    if (homeHTFT.total > 0) {
      console.log(`      Toplam analiz edilen: ${homeHTFT.total} maç`);
      for (const [combo, count] of Object.entries(homeHTFT.htft)) {
        if (count > 0) {
          console.log(`      ${combo}: ${count}/${homeHTFT.total} (${(count/homeHTFT.total*100).toFixed(1)}%)`);
        }
      }
      if (homeHTFT.reversal_2to1 > 0) {
        console.log(`      🔄 2→1 Dönüşümler: ${homeHTFT.reversal_2to1}`);
        homeHTFT.details_2to1.forEach(d => console.log(`         ${d}`));
      }
      if (homeHTFT.reversal_1to2 > 0) {
        console.log(`      🔄 1→2 Dönüşümler: ${homeHTFT.reversal_1to2}`);
        homeHTFT.details_1to2.forEach(d => console.log(`         ${d}`));
      }
    }

    // 6. Tarihi HT/FT Analizi - Deplasman son maçları
    console.log(`\n   📜 ${match.away} Son Maç HT/FT Analizi:`);
    const awayHTFT = analyzeHTFTHistory(awayFixtures);
    if (awayHTFT.total > 0) {
      console.log(`      Toplam analiz edilen: ${awayHTFT.total} maç`);
      for (const [combo, count] of Object.entries(awayHTFT.htft)) {
        if (count > 0) {
          console.log(`      ${combo}: ${count}/${awayHTFT.total} (${(count/awayHTFT.total*100).toFixed(1)}%)`);
        }
      }
      if (awayHTFT.reversal_2to1 > 0) {
        console.log(`      🔄 2→1 Dönüşümler: ${awayHTFT.reversal_2to1}`);
        awayHTFT.details_2to1.forEach(d => console.log(`         ${d}`));
      }
      if (awayHTFT.reversal_1to2 > 0) {
        console.log(`      🔄 1→2 Dönüşümler: ${awayHTFT.reversal_1to2}`);
        awayHTFT.details_1to2.forEach(d => console.log(`         ${d}`));
      }
    }

    // 7. H2H Analizi
    console.log(`\n   📜 H2H Karşılaşma Analizi (Son ${h2h.length} maç):`);
    const h2hHTFT = analyzeHTFTHistory(h2h);
    if (h2hHTFT.total > 0) {
      console.log(`      Toplam analiz edilen: ${h2hHTFT.total} maç`);
      for (const [combo, count] of Object.entries(h2hHTFT.htft)) {
        if (count > 0) {
          console.log(`      ${combo}: ${count}/${h2hHTFT.total} (${(count/h2hHTFT.total*100).toFixed(1)}%)`);
        }
      }
    }
    
    // 8. Tarihsel olasılık
    const totalHistorical = homeHTFT.total + awayHTFT.total + h2hHTFT.total;
    const betTypeCount = (homeHTFT.htft[match.betType] || 0) + 
                         (awayHTFT.htft[match.betType] || 0) + 
                         (h2hHTFT.htft[match.betType] || 0);
    const historicalProb = totalHistorical > 0 ? betTypeCount / totalHistorical : 0;
    result.historicalProb = (historicalProb * 100).toFixed(2) + '%';

    // Dönüşüm analizi
    const totalReversals_2to1 = homeHTFT.reversal_2to1 + awayHTFT.reversal_2to1 + h2hHTFT.reversal_2to1;
    const totalReversals_1to2 = homeHTFT.reversal_1to2 + awayHTFT.reversal_1to2 + h2hHTFT.reversal_1to2;
    result.historicalReversals = {
      '2to1': totalReversals_2to1,
      '1to2': totalReversals_1to2,
      'total_matches': totalHistorical
    };

    // 9. Zımni olasılık vs gerçek olasılık
    const impliedProb = 1 / match.odds;
    const combinedProb = (poissonBetProb * 0.6 + historicalProb * 0.4); // Ağırlıklı model
    const valueRatio = combinedProb / impliedProb;

    console.log(`\n   💰 DEĞERLENDİRME:`);
    console.log(`      Bahisçi zımni olasılık:  ${(impliedProb * 100).toFixed(2)}%`);
    console.log(`      Poisson model olasılık:  ${(poissonBetProb * 100).toFixed(2)}%`);
    console.log(`      Tarihi olasılık:         ${(historicalProb * 100).toFixed(2)}%`);
    console.log(`      Kombine model olasılık:  ${(combinedProb * 100).toFixed(2)}%`);
    console.log(`      Değer oranı:             ${valueRatio.toFixed(2)}x ${valueRatio > 1 ? '✅ DEĞER VAR' : '❌ DEĞER YOK'}`);

    // 10. Not / Senaryo analizi
    if (match.betType === '2/1') {
      console.log(`\n   📋 SENARYO: İlk yarıda deplasman öne geçecek, ikinci yarıda ev sahibi dönecek`);
      console.log(`      → İlk yarıda ${match.away}'ın gol atma olasılığı (${match.home}'ye karşı)`);
      console.log(`      → ${match.home}'nin ikinci yarıda dönüş kapasitesi gerekli`);
      
      // Ev sahibi dönüş senaryosu
      if (homeAvgFor > 1.5) {
        console.log(`      ✅ ${match.home} ort ${homeAvgFor.toFixed(2)} gol atıyor - comeback kapasitesi var`);
      } else {
        console.log(`      ⚠️ ${match.home} ort ${homeAvgFor.toFixed(2)} gol atıyor - comeback zor`);
      }
    } else if (match.betType === '1/2') {
      console.log(`\n   📋 SENARYO: İlk yarıda ev sahibi öne geçecek, ikinci yarıda deplasman dönecek`);
      console.log(`      → İlk yarıda ${match.home}'un gol atma olasılığı`);
      console.log(`      → ${match.away}'ın ikinci yarıda dönüş kapasitesi gerekli`);
      
      if (awayAvgFor > 1.5) {
        console.log(`      ✅ ${match.away} ort ${awayAvgFor.toFixed(2)} gol atıyor - comeback kapasitesi var`);
      } else {
        console.log(`      ⚠️ ${match.away} ort ${awayAvgFor.toFixed(2)} gol atıyor - comeback zor`);
      }
    }

    // Derece
    let grade;
    if (combinedProb >= 0.06 && valueRatio >= 1.2) grade = 'A';
    else if (combinedProb >= 0.04 && valueRatio >= 0.8) grade = 'B';
    else if (combinedProb >= 0.03) grade = 'C';
    else grade = 'D';

    result.combinedProb = (combinedProb * 100).toFixed(2) + '%';
    result.valueRatio = valueRatio.toFixed(2) + 'x';
    result.grade = grade;
    
    const gradeEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' };
    console.log(`\n   ${gradeEmoji[grade]} DERECE: ${grade} | Kombine olasılık: ${(combinedProb * 100).toFixed(2)}% | Değer: ${valueRatio.toFixed(2)}x`);

    return result;

  } catch (err) {
    console.error(`   ❌ Hata: ${err.message}`);
    result.error = err.message;
    return result;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║         🏆 BİLYONER KUPON ANALİZİ - İY/MS SENARYO RAPORU           ║');
  console.log('║              8 Maç | Sistem 2,3 | 168 TL Bedel                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\n📅 Tarih: ${new Date().toLocaleDateString('tr-TR')}`);
  console.log(`📊 Toplam Oran: 976.023,53`);
  console.log(`💰 Maks Kazanç: 1.952.047,05 TL`);
  console.log(`\n⚠️  NOT: İY/MS 2/1 ve 1/2 bahisleri çok nadir sonuçlardır.`);
  console.log(`   Tarihsel olarak maçların sadece ~%3-6'sı bu şekilde biter.\n`);

  const results = [];
  
  for (let i = 0; i < matches.length; i++) {
    const result = await analyzeMatch(matches[i], i);
    results.push(result);
  }

  // ==================== ÖZET RAPOR ====================
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                      📊 ÖZET RAPOR                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  
  console.log('\n┌────────────────────────────────────────┬────────┬──────────┬──────────┬──────────┬───────┐');
  console.log('│ Maç                                    │ Bahis  │ Oran     │ Poisson  │ Kombine  │ Not   │');
  console.log('├────────────────────────────────────────┼────────┼──────────┼──────────┼──────────┼───────┤');

  let gradeA = 0, gradeB = 0, gradeC = 0, gradeD = 0;
  let probProduct = 1;

  for (const r of results) {
    if (r.error) {
      console.log(`│ ${r.match.padEnd(38)} │ ${r.betType.padEnd(6)} │ ${String(r.odds).padEnd(8)} │ HATA     │ HATA     │ ❌    │`);
      continue;
    }
    const gradeEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' };
    const combo = r.combinedProb || '?';
    const poisson = r.poissonProb || '?';
    console.log(`│ ${r.match.padEnd(38)} │ ${r.betType.padEnd(6)} │ ${String(r.odds).padEnd(8)} │ ${poisson.padEnd(8)} │ ${combo.padEnd(8)} │ ${gradeEmoji[r.grade]}${r.grade}  │`);

    if (r.grade === 'A') gradeA++;
    else if (r.grade === 'B') gradeB++;
    else if (r.grade === 'C') gradeC++;
    else gradeD++;
    
    const probVal = parseFloat(r.combinedProb) / 100;
    if (probVal > 0) probProduct *= probVal;
  }

  console.log('└────────────────────────────────────────┴────────┴──────────┴──────────┴──────────┴───────┘');

  // Monte Carlo Simülasyonu
  console.log('\n\n📊 MONTE CARLO SİMÜLASYONU (100.000 deneme):');
  const probabilities = results.filter(r => !r.error).map(r => parseFloat(r.combinedProb) / 100);
  
  const trials = 100000;
  const hitCounts = new Array(9).fill(0); // 0-8 tutabilecek maç sayısı
  
  for (let t = 0; t < trials; t++) {
    let hits = 0;
    for (const p of probabilities) {
      if (Math.random() < p) hits++;
    }
    hitCounts[hits]++;
  }

  console.log('   Tutar Sayısı  │ Olasılık');
  console.log('   ──────────────┼──────────');
  for (let i = 0; i <= 8; i++) {
    const pct = (hitCounts[i] / trials * 100).toFixed(2);
    const bar = '█'.repeat(Math.round(hitCounts[i] / trials * 100));
    console.log(`   ${i} maç tutar   │ ${pct}% ${bar}`);
  }

  // Sistem 2,3 hesabı
  console.log('\n\n💰 SİSTEM 2,3 ANALİZİ:');
  console.log('   Sistem 2,3 = En az 2 veya 3 maç tutması gerekir');
  const atLeast2 = hitCounts.slice(2).reduce((a, b) => a + b, 0);
  const atLeast3 = hitCounts.slice(3).reduce((a, b) => a + b, 0);
  console.log(`   En az 2 maç tutma olasılığı: ${(atLeast2 / trials * 100).toFixed(2)}%`);
  console.log(`   En az 3 maç tutma olasılığı: ${(atLeast3 / trials * 100).toFixed(2)}%`);
  console.log(`   8'in hepsinin tutma olasılığı: ${(hitCounts[8] / trials * 100).toFixed(4)}%`);

  // Tahmini tutacak maç sayısı
  const expectedHits = probabilities.reduce((a, b) => a + b, 0);
  console.log(`\n   📈 Beklenen tutacak maç sayısı: ${expectedHits.toFixed(1)} / 8`);

  // En iyi senaryolar
  console.log('\n\n🎯 SONUÇ VE TAVSİYE:');
  console.log('─'.repeat(60));
  
  const sortedResults = [...results].filter(r => !r.error).sort((a, b) => 
    parseFloat(b.combinedProb) - parseFloat(a.combinedProb)
  );

  console.log('\n   En yüksek olasılıklı maçlar (sıralı):');
  for (let i = 0; i < sortedResults.length; i++) {
    const r = sortedResults[i];
    const gradeEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' };
    console.log(`   ${i + 1}. ${gradeEmoji[r.grade]} ${r.match} (${r.betType}) → ${r.combinedProb} olasılık`);
  }

  console.log(`\n   ⚠️  KRİTİK NOT:`);
  console.log(`   İY/MS 2/1 bahisi = İlk yarı deplasman kazanır, maç sonu ev sahibi kazanır`);
  console.log(`   Bu, maçların çok küçük bir yüzdesi (%2-5 arası) ile gerçekleşir.`);
  console.log(`   8 maçın hepsi için bu sonucun çıkması astronomik derecede düşük olasılıklıdır.`);
  console.log(`   Sistem 2,3 ile oynamanız doğru strateji - ancak beklentileri düşük tutun.`);
  
  console.log(`\n   🏆 A derece (en iyi): ${gradeA} maç`);
  console.log(`   🟡 B derece: ${gradeB} maç`);
  console.log(`   🟠 C derece: ${gradeC} maç`);
  console.log(`   🔴 D derece (riskli): ${gradeD} maç`);

  console.log(`\n   Toplam API istekleri: ${requestCount}`);
}

main().catch(console.error);
