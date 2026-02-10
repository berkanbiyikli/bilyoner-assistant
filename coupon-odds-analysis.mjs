/**
 * ORAN BAZLI İY/MS ANALİZİ
 * 
 * Yaklaşım:
 * 1. Kupondaki her maçın mevcut 1xBet 1X2 oranlarını al
 * 2. Her lig için bu sezon tamamlanan tüm maçları al (HT skorlarıyla)
 * 3. Her lig için sezon oranlarını çek (sayfalı)
 * 4. Benzer oran profiline sahip bitmiş maçlarda kaç tanesinde 2/1 veya 1/2 dönüş olmuş hesapla
 * 5. "Bu oranlarda %kaç ihtimal" bilgisini ver
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

if (!API_KEY) {
  console.error('❌ API_FOOTBALL_KEY bulunamadı!');
  process.exit(1);
}

let requestCount = 0;

async function apiFetch(endpoint, params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') searchParams.append(k, String(v));
  });
  const url = `${API_BASE_URL}${endpoint}?${searchParams.toString()}`;
  
  requestCount++;
  if (requestCount > 1) await new Promise(r => setTimeout(r, 400));
  
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io'
    }
  });
  
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  const data = await res.json();
  
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API Error: ${JSON.stringify(data.errors)}`);
  }
  
  const paging = data.paging || {};
  console.log(`   [API ${requestCount}] ${endpoint} → ${data.results} sonuç | Sayfa: ${paging.current || '?'}/${paging.total || '?'} | Kalan: ${remaining}`);
  
  return { response: data.response, paging: data.paging };
}

// ==================== KUPON MAÇLARI ====================

const matches = [
  { home: 'Fenerbahce',    away: 'Genclerbirligi', betType: '2/1', odds: 21.65, homeId: 611, awayId: 3574, leagueId: 203, season: 2025 },
  { home: 'Kayserispor',   away: 'Kocaelispor',    betType: '2/1', odds: 35.00, homeId: 3563, awayId: 3589, leagueId: 203, season: 2025 },
  { home: 'Villarreal',    away: 'Espanyol',        betType: '2/1', odds: 22.70, homeId: 533, awayId: 540, leagueId: 140, season: 2025 },
  { home: 'AS Roma',       away: 'Cagliari',        betType: '2/1', odds: 27.00, homeId: 497, awayId: 490, leagueId: 135, season: 2025 },
  { home: 'Porto',         away: 'Sporting CP',     betType: '1/2', odds: 35.00, homeId: 212, awayId: 228, leagueId: 94,  season: 2025 },
  { home: 'Santander',     away: 'Mirandes',        betType: '2/1', odds: 21.55, homeId: 728, awayId: 727, leagueId: 141, season: 2025 },
  { home: 'Atalanta',      away: 'Cremonese',       betType: '2/1', odds: 23.10, homeId: 499, awayId: 512, leagueId: 135, season: 2025 },
  { home: 'AGF Aarhus',    away: 'Odense',          betType: '2/1', odds: 21.40, homeId: 400, awayId: 401, leagueId: 119, season: 2025 },
];

// Lig bazlı gruplandırma
const uniqueLeagues = [...new Set(matches.map(m => m.leagueId))];

// ==================== AŞAMA 1: Mevcut maç oranları ====================

async function getCurrentMatchOdds(match) {
  try {
    // Bugünün maçlarından fixture ID bul
    const { response: todayFixtures } = await apiFetch('/fixtures', {
      team: match.homeId,
      next: 1,
      timezone: 'Europe/Istanbul'
    });
    
    if (!todayFixtures || todayFixtures.length === 0) {
      console.log(`   ⚠️ ${match.home} için fixture bulunamadı`);
      return null;
    }
    
    const fixture = todayFixtures[0];
    const fixtureId = fixture.fixture.id;
    console.log(`   📌 ${match.home} vs ${match.away} → Fixture ID: ${fixtureId}`);
    
    // 1xBet odds (bookmaker id = 8)
    const { response: oddsData } = await apiFetch('/odds', {
      fixture: fixtureId,
      bookmaker: 8
    });
    
    if (!oddsData || oddsData.length === 0) {
      // Fallback: herhangi bir bookmaker
      const { response: anyOdds } = await apiFetch('/odds', { fixture: fixtureId });
      if (anyOdds && anyOdds.length > 0) {
        return parseOddsResponse(anyOdds[0], fixtureId);
      }
      return { fixtureId, ms: null, htft: null };
    }
    
    return parseOddsResponse(oddsData[0], fixtureId);
  } catch (err) {
    console.error(`   ❌ Oran hatası: ${err.message}`);
    return null;
  }
}

function parseOddsResponse(oddsEntry, fixtureId) {
  const result = { fixtureId, ms: null, htft: null, bookmaker: null };
  
  if (!oddsEntry || !oddsEntry.bookmakers) return result;
  
  // 1xBet tercih et
  let bookie = oddsEntry.bookmakers.find(b => b.id === 8);
  if (!bookie) bookie = oddsEntry.bookmakers[0];
  
  result.bookmaker = bookie.name;
  
  for (const bet of bookie.bets) {
    // Bet 1 = Match Winner (1X2)
    if (bet.id === 1) {
      const vals = {};
      for (const v of bet.values) {
        vals[v.value] = parseFloat(v.odd);
      }
      result.ms = { home: vals['Home'], draw: vals['Draw'], away: vals['Away'] };
    }
    
    // Bet 13 = HT/FT
    if (bet.id === 13) {
      const vals = {};
      for (const v of bet.values) {
        // "1 / 1", "1 / X", "1 / 2", "X / 1", "X / X", "X / 2", "2 / 1", "2 / X", "2 / 2"
        const key = v.value.replace(/\s/g, '').replace(/\//g, '/');
        vals[key] = parseFloat(v.odd);
      }
      result.htft = vals;
    }
  }
  
  return result;
}

// ==================== AŞAMA 2: Sezon maçları + oranları ====================

async function getSeasonFixtures(leagueId, season) {
  // Tamamlanan maçları al
  const allFixtures = [];
  const { response } = await apiFetch('/fixtures', {
    league: leagueId,
    season: season,
    status: 'FT',
    timezone: 'Europe/Istanbul'
  });
  
  return response || [];
}

async function getSeasonOdds(leagueId, season, maxPages = 4) {
  const allOdds = [];
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      const { response, paging } = await apiFetch('/odds', {
        league: leagueId,
        season: season,
        bookmaker: 8,
        page: page
      });
      
      if (response) allOdds.push(...response);
      
      // Son sayfa kontrolü
      if (!paging || page >= paging.total) break;
    } catch (err) {
      console.log(`   ⚠️ Oran sayfası ${page} hatası: ${err.message}`);
      break;
    }
  }
  
  return allOdds;
}

// ==================== AŞAMA 3: Cross-reference & Analiz ====================

function getHTFTResult(fixture) {
  const ht = fixture.score?.halftime;
  const ft = fixture.goals;
  
  if (!ht || ft?.home === null || ft?.away === null || ht?.home === null || ht?.away === null) return null;
  
  let htR = ht.home > ht.away ? '1' : (ht.home === ht.away ? 'X' : '2');
  let ftR = ft.home > ft.away ? '1' : (ft.home === ft.away ? 'X' : '2');
  
  return {
    ht: htR,
    ft: ftR,
    htft: `${htR}/${ftR}`,
    htScore: `${ht.home}-${ht.away}`,
    ftScore: `${ft.home}-${ft.away}`,
    teams: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`
  };
}

function categorizeOdds(homeOdd) {
  // Ev sahibi oranına göre "favori seviyesi" kategorize et
  if (homeOdd <= 1.25) return 'çok ağır favorit';     // 1.01-1.25
  if (homeOdd <= 1.50) return 'ağır favorit';           // 1.26-1.50
  if (homeOdd <= 1.80) return 'favori';                  // 1.51-1.80
  if (homeOdd <= 2.20) return 'hafif favori';            // 1.81-2.20
  if (homeOdd <= 2.80) return 'eşit';                    // 2.21-2.80
  if (homeOdd <= 3.50) return 'hafif underdog';          // 2.81-3.50
  return 'underdog';                                     // 3.51+
}

function isInSameOddsRange(odd1, odd2, tolerance = 0.30) {
  // İki oran birbirine yakın mı? (± %30 tolerans)
  if (!odd1 || !odd2) return false;
  const ratio = odd1 / odd2;
  return ratio >= (1 - tolerance) && ratio <= (1 + tolerance);
}

// ==================== ANA ANALİZ ====================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║     🎰 ORAN BAZLI İY/MS DÖNÜŞÜM ANALİZİ                                ║');
  console.log('║     "Bu oranlarda kaç maç 2→1 veya 1→2 dönmüş?"                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  
  // AŞAMA 1: Mevcut maç oranlarını çek
  console.log('\n\n━━━ AŞAMA 1: Mevcut Maç Oranları ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const matchOdds = [];
  for (const match of matches) {
    console.log(`\n🔍 ${match.home} vs ${match.away}:`);
    const odds = await getCurrentMatchOdds(match);
    matchOdds.push({ ...match, currentOdds: odds });
    
    if (odds?.ms) {
      console.log(`   1X2: Ev ${odds.ms.home} | Beraberlik ${odds.ms.draw} | Dep ${odds.ms.away} (${odds.bookmaker})`);
      console.log(`   Kategori: ${categorizeOdds(odds.ms.home)}`);
    }
    if (odds?.htft) {
      const betKey = match.betType.replace('/', '/');
      console.log(`   İY/MS ${match.betType} oranı: ${odds.htft[betKey] || 'bulunamadı'}`);
      
      // En popüler HT/FT oranları
      const sorted = Object.entries(odds.htft).sort((a, b) => a[1] - b[1]);
      console.log(`   En düşük 3 İY/MS: ${sorted.slice(0, 3).map(([k,v]) => `${k}@${v}`).join(', ')}`);
    }
  }
  
  // AŞAMA 2: Her lig için tamamlanan maçları ve oranlarını çek
  console.log('\n\n━━━ AŞAMA 2: Lig Bazlı Sezon Verileri ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const leagueData = {};
  
  for (const leagueId of uniqueLeagues) {
    const leagueMatches = matches.filter(m => m.leagueId === leagueId);
    const leagueName = leagueMatches[0].home + ' ligi (' + leagueId + ')';
    console.log(`\n📊 Lig ${leagueId} maçları alınıyor...`);
    
    try {
      const fixtures = await getSeasonFixtures(leagueId, 2025);
      console.log(`   → ${fixtures.length} tamamlanmış maç bulundu`);
      
      // Eğer 2025 sezonu boşsa 2024 dene
      let seasonFixtures = fixtures;
      let usedSeason = 2025;
      if (fixtures.length < 10) {
        console.log(`   ⚠️ 2025 sezonu az maç, 2024 deneniyor...`);
        const fixtures2024 = await getSeasonFixtures(leagueId, 2024);
        if (fixtures2024.length > fixtures.length) {
          seasonFixtures = fixtures2024;
          usedSeason = 2024;
          console.log(`   → 2024 sezonu: ${fixtures2024.length} maç`);
        }
      }
      
      // Oranları çek (max 5 sayfa)
      console.log(`   📥 Sezon oranları alınıyor (sezon ${usedSeason})...`);
      const odds = await getSeasonOdds(leagueId, usedSeason, 5);
      console.log(`   → ${odds.length} maç için oran verisi alındı`);
      
      leagueData[leagueId] = {
        fixtures: seasonFixtures,
        odds: odds,
        season: usedSeason
      };
    } catch (err) {
      console.error(`   ❌ Lig ${leagueId} hatası: ${err.message}`);
      leagueData[leagueId] = { fixtures: [], odds: [], season: 2025 };
    }
  }
  
  // AŞAMA 3: Oran-sonuç karşılaştırması
  console.log('\n\n━━━ AŞAMA 3: Oran Bazlı HT/FT Dönüşüm Analizi ━━━━━━━━━━━━━━━━━━━\n');
  
  // Oranları fixture ID ile indexle
  const oddsIndex = {};
  for (const leagueId of uniqueLeagues) {
    const ld = leagueData[leagueId];
    if (!ld) continue;
    
    for (const oddEntry of ld.odds) {
      const fixtureId = oddEntry.fixture?.id;
      if (!fixtureId) continue;
      
      const parsed = parseOddsResponse(oddEntry, fixtureId);
      if (parsed?.ms) {
        oddsIndex[fixtureId] = parsed;
      }
    }
  }
  
  console.log(`   📊 Toplam ${Object.keys(oddsIndex).length} maç için oran verisi indexlendi\n`);
  
  // Her maç için analiz
  for (let mi = 0; mi < matchOdds.length; mi++) {
    const match = matchOdds[mi];
    const currentOdds = match.currentOdds;
    const ld = leagueData[match.leagueId];
    
    console.log(`\n${'═'.repeat(75)}`);
    console.log(`📊 MAÇ ${mi + 1}: ${match.home} vs ${match.away} | İY/MS ${match.betType} @ ${match.odds}`);
    
    if (currentOdds?.ms) {
      console.log(`   Mevcut 1X2: Ev ${currentOdds.ms.home} | Beraberlik ${currentOdds.ms.draw} | Dep ${currentOdds.ms.away}`);
    }
    console.log('═'.repeat(75));
    
    if (!ld || ld.fixtures.length === 0) {
      console.log('   ❌ Lig verileri bulunamadı');
      continue;
    }
    
    // Tüm bitmiş maçları HT/FT sonuçlarıyla birleştir
    const enrichedMatches = [];
    
    for (const fix of ld.fixtures) {
      const htft = getHTFTResult(fix);
      if (!htft) continue;
      
      const fixId = fix.fixture.id;
      const fixOdds = oddsIndex[fixId];
      
      enrichedMatches.push({
        fixtureId: fixId,
        ...htft,
        odds: fixOdds?.ms || null,
        htftOdds: fixOdds?.htft || null,
        date: fix.fixture.date
      });
    }
    
    console.log(`   📈 HT/FT verisi olan maç: ${enrichedMatches.length} | Oran verisi olan: ${enrichedMatches.filter(m => m.odds).length}`);
    
    // === ANALİZ 1: Genel HT/FT dağılımı (tüm lig) ===
    console.log(`\n   📋 Lig genelinde İY/MS dağılımı (${enrichedMatches.length} maç):`);
    const htftCounts = {};
    const combos = ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'];
    combos.forEach(c => htftCounts[c] = 0);
    
    for (const m of enrichedMatches) {
      if (htftCounts[m.htft] !== undefined) htftCounts[m.htft]++;
    }
    
    const total = enrichedMatches.length;
    const sortedHTFT = Object.entries(htftCounts).sort((a, b) => b[1] - a[1]);
    for (const [combo, count] of sortedHTFT) {
      if (count === 0) continue;
      const pct = (count / total * 100).toFixed(1);
      const marker = combo === match.betType ? ' ◄◄◄ SENİN BAHİSİN' : '';
      console.log(`      ${combo}: ${count}/${total} (%${pct})${marker}`);
    }
    
    // === ANALİZ 2: Benzer oran profiline sahip maçlar ===
    if (currentOdds?.ms) {
      const homeOdd = currentOdds.ms.home;
      const category = categorizeOdds(homeOdd);
      
      // Benzer oranlı maçları filtrele (±%25 tolerans)
      const similarMatches = enrichedMatches.filter(m => {
        if (!m.odds) return false;
        return isInSameOddsRange(m.odds.home, homeOdd, 0.25);
      });
      
      console.log(`\n   🎯 BENZER ORANLI MAÇLAR (Ev oranı ${homeOdd} ±%25 → ${(homeOdd * 0.75).toFixed(2)}-${(homeOdd * 1.25).toFixed(2)} aralığı):`);
      console.log(`      Bulunan: ${similarMatches.length} maç`);
      
      if (similarMatches.length > 0) {
        const simHTFT = {};
        combos.forEach(c => simHTFT[c] = 0);
        for (const m of similarMatches) {
          if (simHTFT[m.htft] !== undefined) simHTFT[m.htft]++;
        }
        
        const simTotal = similarMatches.length;
        console.log(`\n      Bu oran aralığındaki İY/MS dağılımı:`);
        const sortedSim = Object.entries(simHTFT).sort((a, b) => b[1] - a[1]);
        for (const [combo, count] of sortedSim) {
          if (count === 0) continue;
          const pct = (count / simTotal * 100).toFixed(1);
          const marker = combo === match.betType ? ' ◄◄◄ SENİN BAHİSİN' : '';
          const bar = '█'.repeat(Math.round(count / simTotal * 50));
          console.log(`      ${combo}: ${count}/${simTotal} (%${pct}) ${bar}${marker}`);
        }
        
        const betCount = simHTFT[match.betType] || 0;
        console.log(`\n      ✅ ${match.betType} dönüşüm oranı: ${betCount}/${simTotal} (${(betCount/simTotal*100).toFixed(1)}%)`);
        
        // Dönüşüm yapan maçları göster
        const reversals = similarMatches.filter(m => m.htft === match.betType);
        if (reversals.length > 0) {
          console.log(`      Dönüşüm yapan maçlar:`);
          for (const r of reversals) {
            console.log(`         ${r.teams} → HT: ${r.htScore} → FT: ${r.ftScore} | 1X2 oranları: ${r.odds.home}/${r.odds.draw}/${r.odds.away}`);
          }
        }
        
        // HT/FT oran karşılaştırması
        if (currentOdds?.htft) {
          const currentHTFTOdd = currentOdds.htft[match.betType] || match.odds;
          const similarWithHTFT = similarMatches.filter(m => m.htftOdds);
          
          if (similarWithHTFT.length > 0) {
            // Benzer İY/MS oranlarıyla eşleştir
            const betKey = match.betType;
            const closeHTFTMatches = similarWithHTFT.filter(m => {
              const mOdd = m.htftOdds[betKey];
              if (!mOdd) return false;
              return isInSameOddsRange(mOdd, currentHTFTOdd, 0.30);
            });
            
            if (closeHTFTMatches.length > 0) {
              console.log(`\n      🔬 İY/MS ${match.betType} oranı ${currentHTFTOdd} ±%30 aralığındaki maçlar: ${closeHTFTMatches.length}`);
              const htftHits = closeHTFTMatches.filter(m => m.htft === match.betType);
              console.log(`         Bu maçların kaçı tutmuş: ${htftHits.length}/${closeHTFTMatches.length} (${(htftHits.length/closeHTFTMatches.length*100).toFixed(1)}%)`);
              
              for (const m of closeHTFTMatches) {
                const hit = m.htft === match.betType ? '✅ TUTMUŞ' : '❌';
                console.log(`         ${m.teams} → ${m.htScore} / ${m.ftScore} (İY/MS: ${m.htft}) | Oran: ${m.htftOdds[betKey]} | ${hit}`);
              }
            }
          }
        }
        
        // Değer analizi
        const impliedProb = 1 / match.odds;
        const historicalProb = betCount / simTotal;
        const valueRatio = historicalProb > 0 ? historicalProb / impliedProb : 0;
        
        console.log(`\n      💰 DEĞER ANALİZİ:`);
        console.log(`         Bahisçi zımni olasılığı: ${(impliedProb * 100).toFixed(2)}%`);
        console.log(`         Oran bazlı gerçek olasılık: ${(historicalProb * 100).toFixed(2)}%`);
        console.log(`         Değer oranı: ${valueRatio.toFixed(2)}x ${valueRatio > 1.0 ? '✅ DEĞER VAR' : '❌ DEĞER YOK'}`);
        
        match.historicalOddsProb = historicalProb;
        match.similarMatchCount = simTotal;
        match.reversalCount = betCount;
      } else {
        console.log(`      ⚠️ Bu oran aralığında yeterli veri yok, daha geniş aralık deneniyor...`);
        
        // Daha geniş tolerans
        const widerMatches = enrichedMatches.filter(m => {
          if (!m.odds) return false;
          return isInSameOddsRange(m.odds.home, homeOdd, 0.45);
        });
        
        if (widerMatches.length > 0) {
          const wSimHTFT = {};
          combos.forEach(c => wSimHTFT[c] = 0);
          for (const m of widerMatches) {
            if (wSimHTFT[m.htft] !== undefined) wSimHTFT[m.htft]++;
          }
          
          console.log(`      Geniş aralık (±%45): ${widerMatches.length} maç`);
          const betCount = wSimHTFT[match.betType] || 0;
          console.log(`      ${match.betType} dönüşüm: ${betCount}/${widerMatches.length} (${(betCount/widerMatches.length*100).toFixed(1)}%)`);
          
          match.historicalOddsProb = betCount / widerMatches.length;
          match.similarMatchCount = widerMatches.length;
          match.reversalCount = betCount;
        }
      }
    } else {
      // Oran yoksa sadece lig geneli kullan
      const betCount = htftCounts[match.betType] || 0;
      match.historicalOddsProb = betCount / total;
      match.similarMatchCount = total;
      match.reversalCount = betCount;
    }
    
    // === ANALİZ 3: Dönüşüm yapan tüm maçları listele ===
    const allReversals = enrichedMatches.filter(m => m.htft === match.betType);
    if (allReversals.length > 0) {
      console.log(`\n   📜 Bu ligde bu sezon tüm ${match.betType} dönüşümleri (${allReversals.length} maç):`);
      for (const r of allReversals) {
        const oddsStr = r.odds ? `1X2: ${r.odds.home}/${r.odds.draw}/${r.odds.away}` : 'oran yok';
        const htftOddStr = r.htftOdds ? `İY/MS ${match.betType} @${r.htftOdds[match.betType] || '?'}` : '';
        console.log(`      ${r.teams} → HT: ${r.htScore} → FT: ${r.ftScore} | ${oddsStr} ${htftOddStr}`);
      }
    } else {
      console.log(`\n   ⚠️ Bu ligde bu sezon hiç ${match.betType} dönüşüm olmamış!`);
    }
  }
  
  // ==================== ÖZET RAPOR ====================
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 ORAN BAZLI ÖZET RAPOR                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
  
  console.log('\n┌─────────────────────────────────┬────────┬──────────┬──────────────┬──────────────────┬────────┐');
  console.log('│ Maç                             │ Bahis  │ Bilyoner │ Benzer Oran  │ Oran Bazlı       │ Değer  │');
  console.log('│                                 │        │ Oranı    │ Maç Sayısı   │ Dönüşüm Oranı    │        │');
  console.log('├─────────────────────────────────┼────────┼──────────┼──────────────┼──────────────────┼────────┤');
  
  for (const m of matchOdds) {
    const prob = m.historicalOddsProb !== undefined ? (m.historicalOddsProb * 100).toFixed(1) + '%' : '?';
    const count = m.reversalCount !== undefined ? `${m.reversalCount}/${m.similarMatchCount}` : '?';
    const implied = 1 / m.odds;
    const value = m.historicalOddsProb !== undefined ? 
      (m.historicalOddsProb > implied ? '✅' : '❌') : '?';
    
    console.log(`│ ${(m.home + ' vs ' + m.away).padEnd(31)} │ ${m.betType.padEnd(6)} │ ${String(m.odds).padEnd(8)} │ ${count.padEnd(12)} │ ${prob.padEnd(16)} │ ${value.padEnd(4)}   │`);
  }
  
  console.log('└─────────────────────────────────┴────────┴──────────┴──────────────┴──────────────────┴────────┘');
  
  // Monte Carlo
  console.log('\n📊 MONTE CARLO SİMÜLASYONU (oran bazlı olasılıklarla):');
  const probs = matchOdds.map(m => m.historicalOddsProb || 0.02);
  
  const trials = 200000;
  const hitCounts = new Array(9).fill(0);
  for (let t = 0; t < trials; t++) {
    let hits = 0;
    for (const p of probs) {
      if (Math.random() < p) hits++;
    }
    hitCounts[hits]++;
  }
  
  for (let i = 0; i <= 8; i++) {
    const pct = (hitCounts[i] / trials * 100).toFixed(2);
    if (hitCounts[i] > 0) {
      const bar = '█'.repeat(Math.round(hitCounts[i] / trials * 100));
      console.log(`   ${i} maç tutar: %${pct} ${bar}`);
    }
  }
  
  const atLeast2 = hitCounts.slice(2).reduce((a, b) => a + b, 0);
  const atLeast3 = hitCounts.slice(3).reduce((a, b) => a + b, 0);
  const expected = probs.reduce((a, b) => a + b, 0);
  
  console.log(`\n   Sistem 2: En az 2 maç tutma → %${(atLeast2 / trials * 100).toFixed(2)}`);
  console.log(`   Sistem 3: En az 3 maç tutma → %${(atLeast3 / trials * 100).toFixed(2)}`);
  console.log(`   Beklenen tutacak maç sayısı: ${expected.toFixed(2)} / 8`);
  
  console.log(`\n   Toplam API istekleri: ${requestCount}`);
}

main().catch(console.error);
