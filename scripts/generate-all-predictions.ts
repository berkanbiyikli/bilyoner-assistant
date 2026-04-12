/**
 * Tüm liglerdeki tüm maçları analiz edip DB'ye kaydet
 * LEAGUE_IDS filtresiz — her maç analiz edilir
 * 
 * Kullanım: npx tsx scripts/generate-all-predictions.ts [tarih]
 * Örnek:    npx tsx scripts/generate-all-predictions.ts 2026-04-12
 */

import { getFixturesByDate, getApiUsage } from "../src/lib/api-football";
import { analyzeMatches } from "../src/lib/prediction";
import { createAdminSupabase } from "../src/lib/supabase/admin";

const date = process.argv[2] || new Date().toISOString().split("T")[0];
const BATCH_SIZE = 20;

async function main() {
  console.log(`\n=== TÜM MAÇLARI ANALİZ ET: ${date} ===\n`);
  
  const supabase = createAdminSupabase();
  
  // 1) Tüm fixture'ları çek (lig filtresi YOK)
  const allFixtures = await getFixturesByDate(date);
  const nsFixtures = allFixtures.filter(f => f.fixture.status.short === "NS");
  
  console.log(`Toplam fixture: ${allFixtures.length}`);
  console.log(`NS (başlamamış): ${nsFixtures.length}`);
  
  // 2) DB'de zaten olan fixture'ları atla
  const { data: existingPreds } = await supabase
    .from("predictions")
    .select("fixture_id")
    .gte("kickoff", `${date}T00:00:00.000Z`)
    .lte("kickoff", `${date}T23:59:59.999Z`);
  
  const existingIds = new Set((existingPreds || []).map(p => p.fixture_id));
  const newFixtures = nsFixtures.filter(f => !existingIds.has(f.fixture.id));
  
  console.log(`DB'de mevcut: ${existingIds.size}`);
  console.log(`Yeni analiz edilecek: ${newFixtures.length}\n`);
  
  if (newFixtures.length === 0) {
    console.log("Tüm maçlar zaten analiz edildi!");
    return;
  }
  
  let totalSaved = 0;
  let totalAnalyzed = 0;
  let totalNoPick = 0;
  
  // 3) Batch'ler halinde analiz et
  for (let i = 0; i < newFixtures.length; i += BATCH_SIZE) {
    const batch = newFixtures.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(newFixtures.length / BATCH_SIZE);
    
    console.log(`--- Batch ${batchNum}/${totalBatches} (${batch.length} maç) ---`);
    
    try {
      const predictions = await analyzeMatches(batch);
      totalAnalyzed += batch.length;
      
      for (const pred of predictions) {
        if (pred.picks.length === 0) {
          totalNoPick++;
          // no_pick marker yaz
          await supabase.from("predictions").insert({
            fixture_id: pred.fixtureId,
            home_team: pred.homeTeam.name,
            away_team: pred.awayTeam.name,
            league: pred.league.name,
            league_id: pred.league.id || null,
            kickoff: pred.kickoff,
            pick: "no_pick",
            odds: 0,
            confidence: 0,
            expected_value: 0,
            is_value_bet: false,
            analysis_summary: "Yeterli veri yok",
            analysis_data: null,
          });
          continue;
        }
        
        // Analiz verisini hazırla
        const oddsForJson = pred.odds ? {
          ...pred.odds,
          realMarkets: pred.odds.realMarkets ? Array.from(pred.odds.realMarkets) : [],
        } : undefined;
        const analysisData = {
          analysis: pred.analysis,
          insights: pred.insights,
          odds: oddsForJson,
          aiAnalysis: pred.aiAnalysis || null,
        };
        
        for (const pick of pred.picks) {
          const { error } = await supabase.from("predictions").insert({
            fixture_id: pred.fixtureId,
            home_team: pred.homeTeam.name,
            away_team: pred.awayTeam.name,
            league: pred.league.name,
            league_id: pred.league.id || null,
            kickoff: pred.kickoff,
            pick: pick.type,
            odds: pick.odds,
            confidence: pick.confidence,
            expected_value: pick.expectedValue,
            is_value_bet: pick.isValueBet,
            analysis_summary: pick.reasoning || pred.analysis.summary,
            analysis_data: analysisData,
          });
          
          if (!error) totalSaved++;
          else console.error(`  ✗ ${pred.homeTeam.name} vs ${pred.awayTeam.name} / ${pick.type}: ${error.message}`);
        }
        
        console.log(`  ✓ ${pred.homeTeam.name} vs ${pred.awayTeam.name}: ${pred.picks.length} pick`);
      }
      
      const usage = getApiUsage();
      console.log(`  API: ${usage.used}/${usage.limit} | Saved: ${totalSaved} | NoPick: ${totalNoPick}\n`);
      
    } catch (err) {
      console.error(`  Batch ${batchNum} hata:`, err);
    }
  }
  
  console.log(`\n=== TAMAMLANDI ===`);
  console.log(`Analiz edilen: ${totalAnalyzed}`);
  console.log(`Kayıt edilen pick: ${totalSaved}`);
  console.log(`No-pick: ${totalNoPick}`);
  console.log(`API kullanım: ${getApiUsage().used}/${getApiUsage().limit}`);
}

main().catch(console.error);
