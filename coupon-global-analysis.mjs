/**
 * GLOBAL ORAN BAZLI İY/MS ANALİZİ - TÜM SEZONLAR
 * 
 * Her takımın son 100 maçına bakar (tüm sezonlar)
 * H2H tüm geçmişe bakar
 * Lig yerine GLOBAL bazda oran-dönüşüm karşılaştırması yapar
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

if (!API_KEY) { console.error('❌ API_FOOTBALL_KEY bulunamadı!'); process.exit(1); }

let requestCount = 0;

async function apiFetch(endpoint, params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
  });
  const url = `${API_BASE_URL}${endpoint}?${searchParams.toString()}`;
  
  requestCount++;
  if (requestCount > 1) await new Promise(r => setTimeout(r, 350));
  
  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
  });
  
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length > 0) throw new Error(`API: ${JSON.stringify(data.errors)}`);
  
  console.log(`   [API ${requestCount}] ${endpoint} → ${data.results} sonuç | Kalan: ${remaining}`);
  return data.response || [];
}

// ==================== KUPON ====================

const matches = [
  { home: 'Fenerbahce',    away: 'Genclerbirligi', betType: '2/1', odds: 21.65, homeId: 611, awayId: 3574 },
  { home: 'Kayserispor',   away: 'Kocaelispor',    betType: '2/1', odds: 35.00, homeId: 3563, awayId: 3589 },
  { home: 'Villarreal',    away: 'Espanyol',        betType: '2/1', odds: 22.70, homeId: 533, awayId: 540 },
  { home: 'AS Roma',       away: 'Cagliari',        betType: '2/1', odds: 27.00, homeId: 497, awayId: 490 },
  { home: 'Porto',         away: 'Sporting CP',     betType: '1/2', odds: 35.00, homeId: 212, awayId: 228 },
  { home: 'Santander',     away: 'Mirandes',        betType: '2/1', odds: 21.55, homeId: 728, awayId: 727 },
  { home: 'Atalanta',      away: 'Cremonese',       betType: '2/1', odds: 23.10, homeId: 499, awayId: 512 },
  { home: 'AGF Aarhus',    away: 'Odense',          betType: '2/1', odds: 21.40, homeId: 400, awayId: 401 },
];

// ==================== YARDIMCI ====================

function getHTFT(fix) {
  const ht = fix.score?.halftime;
  const ft = fix.goals;
  if (!ht || ft?.home == null || ft?.away == null || ht?.home == null || ht?.away == null) return null;
  
  const htR = ht.home > ht.away ? '1' : (ht.home === ht.away ? 'X' : '2');
  const ftR = ft.home > ft.away ? '1' : (ft.home === ft.away ? 'X' : '2');
  
  return {
    htft: `${htR}/${ftR}`,
    htScore: `${ht.home}-${ht.away}`,
    ftScore: `${ft.home}-${ft.away}`,
    teams: `${fix.teams.home.name} vs ${fix.teams.away.name}`,
    league: fix.league?.name || '?',
    date: fix.fixture?.date?.split('T')[0] || '?',
    homeId: fix.teams.home.id,
    awayId: fix.teams.away.id,
    isHome: null // sonra set edilir
  };
}

function categorizeOdds(homeOdd) {
  if (homeOdd <= 1.25) return { label: 'çok ağır favorit', min: 1.01, max: 1.30 };
  if (homeOdd <= 1.50) return { label: 'ağır favorit',     min: 1.20, max: 1.60 };
  if (homeOdd <= 1.80) return { label: 'favori',            min: 1.40, max: 1.95 };
  if (homeOdd <= 2.20) return { label: 'hafif favori',      min: 1.70, max: 2.40 };
  if (homeOdd <= 2.80) return { label: 'eşit',              min: 2.00, max: 3.00 };
  if (homeOdd <= 3.50) return { label: 'hafif underdog',    min: 2.60, max: 3.80 };
  return { label: 'underdog',                               min: 3.20, max: 99 };
}

// ==================== MAÇ ANALİZİ ====================

async function analyzeMatch(match, idx) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📊 MAÇ ${idx + 1}: ${match.home} vs ${match.away} | İY/MS ${match.betType} @ ${match.odds}`);
  console.log('═'.repeat(80));

  // 1. Mevcut maç oranlarını al
  console.log('\n   📥 Mevcut maç oranları...');
  let currentOdds = null;
  try {
    const nextFix = await apiFetch('/fixtures', { team: match.homeId, next: 1, timezone: 'Europe/Istanbul' });
    if (nextFix.length > 0) {
      const fid = nextFix[0].fixture.id;
      const oddsData = await apiFetch('/odds', { fixture: fid });
      if (oddsData.length > 0) {
        const bookie = oddsData[0].bookmakers?.find(b => b.id === 8) || oddsData[0].bookmakers?.[0];
        if (bookie) {
          for (const bet of bookie.bets) {
            if (bet.id === 1) {
              const v = {};
              bet.values.forEach(val => v[val.value] = parseFloat(val.odd));
              currentOdds = { home: v['Home'], draw: v['Draw'], away: v['Away'], bookmaker: bookie.name };
            }
          }
        }
      }
    }
  } catch (e) { console.log(`   ⚠️ Oran alınamadı: ${e.message}`); }

  if (currentOdds) {
    console.log(`   1X2: Ev ${currentOdds.home} | Beraberlik ${currentOdds.draw} | Dep ${currentOdds.away} (${currentOdds.bookmaker})`);
    console.log(`   Kategori: ${categorizeOdds(currentOdds.home).label}`);
  }

  // 2. Her iki takımın tamamlanmış maçlarını al - birden fazla sezon
  console.log('\n   📥 Tüm sezon geçmişi alınıyor...');
  
  // API "last" parametresi tek başına team ile çalışıyor
  // Birden fazla sezon için ayrı ayrı çekelim
  const seasons = [2025, 2024, 2023];
  let homeFixtures = [];
  let awayFixtures = [];
  
  for (const season of seasons) {
    try {
      const [hf, af] = await Promise.all([
        apiFetch('/fixtures', { team: match.homeId, season, status: 'FT', timezone: 'Europe/Istanbul' }),
        apiFetch('/fixtures', { team: match.awayId, season, status: 'FT', timezone: 'Europe/Istanbul' }),
      ]);
      homeFixtures.push(...hf);
      awayFixtures.push(...af);
    } catch (e) {
      console.log(`   ⚠️ Sezon ${season} hatası: ${e.message}`);
    }
  }

  // 3. H2H - TÜM GEÇMİŞ
  console.log('   📥 H2H tüm geçmiş...');
  const h2h = await apiFetch('/fixtures/headtohead', {
    h2h: `${match.homeId}-${match.awayId}`,
    last: 50,
    timezone: 'Europe/Istanbul'
  });

  // 4. HT/FT sonuçlarını çıkar
  const homeResults = homeFixtures.map(f => {
    const r = getHTFT(f);
    if (r) r.isHome = f.teams.home.id === match.homeId;
    return r;
  }).filter(Boolean);
  
  const awayResults = awayFixtures.map(f => {
    const r = getHTFT(f);
    if (r) r.isHome = f.teams.home.id === match.awayId;
    return r;
  }).filter(Boolean);
  
  const h2hResults = h2h.map(f => getHTFT(f)).filter(Boolean);

  // Tüm benzersiz maçları birleştir (duplicate'leri kaldır)
  const allMatchMap = new Map();
  [...homeResults, ...awayResults, ...h2hResults].forEach(r => {
    const key = `${r.date}_${r.teams}`;
    if (!allMatchMap.has(key)) allMatchMap.set(key, r);
  });
  const allMatches = [...allMatchMap.values()];

  console.log(`\n   📊 Toplam benzersiz maç: ${allMatches.length} (Ev: ${homeResults.length}, Dep: ${awayResults.length}, H2H: ${h2hResults.length})`);

  // ==================== ANALİZ 1: GLOBAL HT/FT DAĞILIMI ====================
  const combos = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
  
  // Ev sahibi takımın evinde oynadığı maçlar
  const homeAtHome = homeResults.filter(r => r.isHome);
  // Deplasman takımının deplasmanda oynadığı maçlar
  const awayAtAway = awayResults.filter(r => !r.isHome);

  console.log(`\n   ── ${match.home} EV SAHİBİ OLARAK (${homeAtHome.length} maç) ──`);
  const homeHTFT = {};
  combos.forEach(c => homeHTFT[c] = 0);
  homeAtHome.forEach(r => { if (homeHTFT[r.htft] !== undefined) homeHTFT[r.htft]++; });
  
  for (const [combo, count] of Object.entries(homeHTFT).sort((a, b) => b[1] - a[1])) {
    if (count === 0) continue;
    const pct = (count / homeAtHome.length * 100).toFixed(1);
    const marker = combo === match.betType ? ' ◄◄◄' : '';
    console.log(`      ${combo}: ${count}/${homeAtHome.length} (%${pct})${marker}`);
  }
  
  // 2/1 dönüşüm detayları - ev sahibi
  const homeReversals = homeAtHome.filter(r => r.htft === match.betType);
  if (homeReversals.length > 0) {
    console.log(`      🔄 ${match.betType} dönüşüm detayları:`);
    for (const r of homeReversals) {
      console.log(`         ${r.date} | ${r.teams} → HT: ${r.htScore} → FT: ${r.ftScore} (${r.league})`);
    }
  }

  console.log(`\n   ── ${match.away} DEPLASMAN OLARAK (${awayAtAway.length} maç) ──`);
  const awayHTFT = {};
  combos.forEach(c => awayHTFT[c] = 0);
  awayAtAway.forEach(r => { if (awayHTFT[r.htft] !== undefined) awayHTFT[r.htft]++; });
  
  for (const [combo, count] of Object.entries(awayHTFT).sort((a, b) => b[1] - a[1])) {
    if (count === 0) continue;
    const pct = (count / awayAtAway.length * 100).toFixed(1);
    const marker = combo === match.betType ? ' ◄◄◄' : '';
    console.log(`      ${combo}: ${count}/${awayAtAway.length} (%${pct})${marker}`);
  }
  
  const awayReversals = awayAtAway.filter(r => r.htft === match.betType);
  if (awayReversals.length > 0) {
    console.log(`      🔄 ${match.betType} dönüşüm detayları:`);
    for (const r of awayReversals) {
      console.log(`         ${r.date} | ${r.teams} → HT: ${r.htScore} → FT: ${r.ftScore} (${r.league})`);
    }
  }

  // ==================== ANALİZ 2: H2H TARİHÇESİ ====================
  console.log(`\n   ── H2H: ${match.home} vs ${match.away} (${h2hResults.length} maç) ──`);
  const h2hHTFT = {};
  combos.forEach(c => h2hHTFT[c] = 0);
  h2hResults.forEach(r => { if (h2hHTFT[r.htft] !== undefined) h2hHTFT[r.htft]++; });
  
  for (const [combo, count] of Object.entries(h2hHTFT).sort((a, b) => b[1] - a[1])) {
    if (count === 0) continue;
    const pct = (count / h2hResults.length * 100).toFixed(1);
    const marker = combo === match.betType ? ' ◄◄◄' : '';
    console.log(`      ${combo}: ${count}/${h2hResults.length} (%${pct})${marker}`);
  }
  
  const h2hReversals = h2hResults.filter(r => r.htft === match.betType);
  if (h2hReversals.length > 0) {
    console.log(`      🔄 H2H ${match.betType} dönüşümler:`);
    for (const r of h2hReversals) {
      console.log(`         ${r.date} | ${r.teams} → HT: ${r.htScore} → FT: ${r.ftScore}`);
    }
  } else {
    console.log(`      ⚠️ H2H'de hiç ${match.betType} dönüşüm yok`);
  }

  // ==================== ANALİZ 3: ORAN KATEGORİSİNE GÖRE DÖNÜŞÜM ====================
  // Ev sahibi takımın EVİNDEKİ tüm maçlardaki dönüşüm + deplasman takımının DEPLASMANDAKİ dönüşüm
  const relevantPool = [...homeAtHome, ...awayAtAway];
  const uniquePool = [];
  const poolSeen = new Set();
  for (const r of relevantPool) {
    const key = `${r.date}_${r.teams}`;
    if (!poolSeen.has(key)) { poolSeen.add(key); uniquePool.push(r); }
  }

  const betReversals = uniquePool.filter(r => r.htft === match.betType);
  const totalReversalPct = uniquePool.length > 0 ? (betReversals.length / uniquePool.length * 100) : 0;

  console.log(`\n   ── TOPLAM DÖNÜŞÜM ANALİZİ ──`);
  console.log(`      Havuz: ${uniquePool.length} maç (${match.home} evde + ${match.away} deplasmanda)`);
  console.log(`      ${match.betType} dönüşüm: ${betReversals.length}/${uniquePool.length} (%${totalReversalPct.toFixed(1)})`);
  console.log(`      H2H'de ${match.betType}: ${h2hReversals.length}/${h2hResults.length}`);

  // ==================== DEĞER ANALİZİ ====================
  const impliedProb = 1 / match.odds;
  
  // Ağırlıklı olasılık: H2H ağırlığı daha yüksek
  const homeProb = homeAtHome.length > 0 ? (homeHTFT[match.betType] || 0) / homeAtHome.length : 0;
  const awayProb = awayAtAway.length > 0 ? (awayHTFT[match.betType] || 0) / awayAtAway.length : 0;
  const h2hProb = h2hResults.length > 0 ? (h2hHTFT[match.betType] || 0) / h2hResults.length : 0;
  
  // Ağırlık: H2H %30, Ev sahibi evde %35, Deplasman dışarda %35
  const weightedProb = h2hResults.length >= 5 
    ? (homeProb * 0.35 + awayProb * 0.35 + h2hProb * 0.30)
    : (homeProb * 0.50 + awayProb * 0.50);
  
  const valueRatio = weightedProb > 0 ? weightedProb / impliedProb : 0;

  console.log(`\n   💰 DEĞER HESABI:`);
  console.log(`      Bahisçi zımni olasılık:    %${(impliedProb * 100).toFixed(2)} (oran: ${match.odds})`);
  console.log(`      ${match.home} evde ${match.betType}:   %${(homeProb * 100).toFixed(2)} (${homeHTFT[match.betType] || 0}/${homeAtHome.length})`);
  console.log(`      ${match.away} dışarda ${match.betType}: %${(awayProb * 100).toFixed(2)} (${awayHTFT[match.betType] || 0}/${awayAtAway.length})`);
  console.log(`      H2H ${match.betType}:                   %${(h2hProb * 100).toFixed(2)} (${h2hHTFT[match.betType] || 0}/${h2hResults.length})`);
  console.log(`      Ağırlıklı gerçek olasılık: %${(weightedProb * 100).toFixed(2)}`);
  console.log(`      Değer oranı: ${valueRatio.toFixed(2)}x ${valueRatio >= 1.0 ? '✅ DEĞER VAR' : '❌ DEĞER YOK'}`);

  // DERECE
  let grade;
  if (weightedProb >= 0.06 && valueRatio >= 1.2) grade = 'A';
  else if (weightedProb >= 0.04 && valueRatio >= 0.8) grade = 'B';
  else if (weightedProb >= 0.03) grade = 'C';
  else grade = 'D';

  const emoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' };
  console.log(`\n   ${emoji[grade]} DERECE: ${grade}`);

  return {
    match: `${match.home} vs ${match.away}`,
    betType: match.betType,
    odds: match.odds,
    homeProb, awayProb, h2hProb, weightedProb,
    impliedProb,
    valueRatio,
    grade,
    homeReversalCount: homeHTFT[match.betType] || 0,
    homeTotal: homeAtHome.length,
    awayReversalCount: awayHTFT[match.betType] || 0,
    awayTotal: awayAtAway.length,
    h2hReversalCount: h2hHTFT[match.betType] || 0,
    h2hTotal: h2hResults.length,
    reversalExamples: [...homeReversals, ...awayReversals, ...h2hReversals].slice(0, 5),
  };
}

// ==================== MAIN ====================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║   🏆 GLOBAL İY/MS DÖNÜŞÜM ANALİZİ - TÜM SEZONLAR / TÜM LİGLER             ║');
  console.log('║   Her takımın son 100 maçı + H2H son 50 maç + oran karşılaştırması          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`📅 ${new Date().toLocaleDateString('tr-TR')}\n`);

  const results = [];
  for (let i = 0; i < matches.length; i++) {
    results.push(await analyzeMatch(matches[i], i));
  }

  // ==================== ÖZET TABLO ====================
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              📊 GLOBAL ÖZET RAPOR                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝');

  console.log(`\n  ${'Maç'.padEnd(35)} ${'Bahis'.padEnd(6)} ${'Oran'.padEnd(7)} ${'Ev(%evde)'.padEnd(14)} ${'Dep(%dışarda)'.padEnd(14)} ${'H2H'.padEnd(10)} ${'Model%'.padEnd(8)} ${'Değer'.padEnd(7)} Derece`);
  console.log('  ' + '─'.repeat(110));

  for (const r of results) {
    const homeStr = `${r.homeReversalCount}/${r.homeTotal}(${(r.homeProb*100).toFixed(1)}%)`;
    const awayStr = `${r.awayReversalCount}/${r.awayTotal}(${(r.awayProb*100).toFixed(1)}%)`;
    const h2hStr = `${r.h2hReversalCount}/${r.h2hTotal}`;
    const emoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' };
    
    console.log(`  ${r.match.padEnd(35)} ${r.betType.padEnd(6)} ${String(r.odds).padEnd(7)} ${homeStr.padEnd(14)} ${awayStr.padEnd(14)} ${h2hStr.padEnd(10)} ${(r.weightedProb*100).toFixed(1)}%`.padEnd(103) + `   ${r.valueRatio.toFixed(2)}x   ${emoji[r.grade]}${r.grade}`);
  }

  // Sıralama
  console.log('\n\n  📈 En yüksek olasılıklı → en düşük:');
  const sorted = [...results].sort((a, b) => b.weightedProb - a.weightedProb);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const emoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' };
    console.log(`     ${i+1}. ${emoji[r.grade]} ${r.match} (${r.betType}) → %${(r.weightedProb*100).toFixed(2)} | ${r.valueRatio.toFixed(2)}x değer`);
  }

  // Monte Carlo
  console.log('\n\n  📊 MONTE CARLO SİMÜLASYONU (500.000 deneme):');
  const probs = results.map(r => r.weightedProb);
  const trials = 500000;
  const hitCounts = new Array(9).fill(0);
  
  for (let t = 0; t < trials; t++) {
    let hits = 0;
    for (const p of probs) {
      if (Math.random() < p) hits++;
    }
    hitCounts[hits]++;
  }

  for (let i = 0; i <= 8; i++) {
    const pct = (hitCounts[i] / trials * 100).toFixed(3);
    if (hitCounts[i] > 0) {
      const bar = '█'.repeat(Math.max(1, Math.round(hitCounts[i] / trials * 80)));
      console.log(`     ${i} maç tutar: %${pct.padStart(7)} ${bar}`);
    }
  }

  const atLeast2 = hitCounts.slice(2).reduce((a, b) => a + b, 0);
  const atLeast3 = hitCounts.slice(3).reduce((a, b) => a + b, 0);
  const expected = probs.reduce((a, b) => a + b, 0);

  console.log(`\n     Sistem 2 (en az 2): %${(atLeast2 / trials * 100).toFixed(3)}`);
  console.log(`     Sistem 3 (en az 3): %${(atLeast3 / trials * 100).toFixed(3)}`);
  console.log(`     8/8 hepsi:          %${(hitCounts[8] / trials * 100).toFixed(6)}`);
  console.log(`     Beklenen tutacak:   ${expected.toFixed(2)} / 8 maç`);

  // Para analizi
  console.log('\n\n  💰 YATIRIM ANALİZİ:');
  console.log(`     Kupon bedeli: 168 TL`);
  console.log(`     Sistem 2,3 → minimum 2 veya 3 maç tutması lazım`);
  
  // Sistem 2: herhangi 2'li kombinasyondan biri tutarsa
  // Beklenen getiri
  const pAtLeast2 = atLeast2 / trials;
  const expectedReturn2 = pAtLeast2 * 168 * 10; // kabaca
  console.log(`     Sistem 2 tutma olasılığı: %${(pAtLeast2 * 100).toFixed(3)}`);
  console.log(`     Sistem 3 tutma olasılığı: %${(atLeast3 / trials * 100).toFixed(3)}`);

  console.log(`\n  📊 Toplam API istekleri: ${requestCount}`);
}

main().catch(console.error);
