// ============================================
// ML Eğitim Verisi Hazırlama Scripti (Faz 4)
// ============================================
// Kullanım: npx tsx scripts/prepare-training-data.ts
// Çıktı: data/training-data.json
//
// validation_records + predictions tablolarından
// geçmiş maç verilerini çeker ve flatten'lenmiş
// feature vector'lerine dönüştürür.
// ============================================

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface TrainingRow {
  features: Record<string, number>;
  labels: Record<string, number>; // market -> 0/1
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("📊 Validation records çekiliyor...");

  // Tüm settle edilmiş kayıtları çek (won/lost)
  const allRecords: Array<{
    fixture_id: number;
    home_team: string;
    away_team: string;
    pick: string;
    confidence: number;
    odds: number;
    expected_value: number;
    is_value_bet: boolean;
    sim_probability: number | null;
    actual_score: string | null;
    result: string;
  }> = [];

  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("validation_records")
      .select("fixture_id, home_team, away_team, pick, confidence, odds, expected_value, is_value_bet, sim_probability, actual_score, result")
      .in("result", ["won", "lost"])
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase hatası:", error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRecords.push(...(data as typeof allRecords));
      page++;
      if (data.length < pageSize) hasMore = false;
    }
  }

  console.log(`✅ ${allRecords.length} kayıt çekildi`);

  if (allRecords.length < 50) {
    console.warn("⚠️  Yeterli veri yok (minimum 50 kayıt önerilir). Mevcut veriyle devam ediliyor.");
  }

  // fixture_id bazında grupla
  const fixtureMap = new Map<number, typeof allRecords>();
  for (const r of allRecords) {
    if (!fixtureMap.has(r.fixture_id)) fixtureMap.set(r.fixture_id, []);
    fixtureMap.get(r.fixture_id)!.push(r);
  }

  console.log(`📦 ${fixtureMap.size} benzersiz maç`);

  // Her maç için feature vector + labels oluştur
  const trainingData: TrainingRow[] = [];

  for (const [fixtureId, records] of fixtureMap) {
    // Skor parse et
    const scorer = records.find(r => r.actual_score);
    let homeGoals = 0;
    let awayGoals = 0;

    if (scorer?.actual_score) {
      const parts = scorer.actual_score.split("-").map(s => parseInt(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        homeGoals = parts[0];
        awayGoals = parts[1];
      }
    }

    const totalGoals = homeGoals + awayGoals;

    // Feature vector (validation_records'tan çıkarılabilenler)
    const repRecord = records[0];
    const features: Record<string, number> = {
      confidence: repRecord.confidence,
      odds: repRecord.odds,
      expected_value: repRecord.expected_value,
      is_value_bet: repRecord.is_value_bet ? 1 : 0,
      sim_probability: repRecord.sim_probability || 0,
    };

    // Her pick için label oluştur
    const labels: Record<string, number> = {};

    // Maç sonucu labelleri (gerçek sonuçtan)
    labels["home_win"] = homeGoals > awayGoals ? 1 : 0;
    labels["draw"] = homeGoals === awayGoals ? 1 : 0;
    labels["away_win"] = awayGoals > homeGoals ? 1 : 0;
    labels["over_25"] = totalGoals > 2.5 ? 1 : 0;
    labels["under_25"] = totalGoals < 2.5 ? 1 : 0;
    labels["over_15"] = totalGoals > 1.5 ? 1 : 0;
    labels["under_15"] = totalGoals < 1.5 ? 1 : 0;
    labels["over_35"] = totalGoals > 3.5 ? 1 : 0;
    labels["under_35"] = totalGoals < 3.5 ? 1 : 0;
    labels["btts_yes"] = homeGoals > 0 && awayGoals > 0 ? 1 : 0;
    labels["btts_no"] = homeGoals === 0 || awayGoals === 0 ? 1 : 0;

    // Her record'tan da pick bazlı ek feature ekle
    for (const r of records) {
      const pickKey = r.pick.toLowerCase().replace(/\s+/g, "_").replace(/\./g, "");
      features[`pick_${pickKey}_confidence`] = r.confidence;
      features[`pick_${pickKey}_odds`] = r.odds;
      features[`pick_${pickKey}_ev`] = r.expected_value;
      features[`pick_${pickKey}_simprob`] = r.sim_probability || 0;
    }

    trainingData.push({ features, labels });
  }

  // Çıktı dizini oluştur
  const outDir = join(process.cwd(), "data");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, "training-data.json");
  writeFileSync(outPath, JSON.stringify(trainingData, null, 2));

  console.log(`\n✅ Eğitim verisi kaydedildi: ${outPath}`);
  console.log(`📊 ${trainingData.length} örnek, ${Object.keys(trainingData[0]?.labels || {}).length} market label`);
  console.log(`\n🐍 Şimdi Python ile modeli eğitin:`);
  console.log(`   python scripts/train-model.py`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
