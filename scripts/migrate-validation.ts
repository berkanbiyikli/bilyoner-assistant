// Migration: validation_records tablosu oluştur
// Kullanım: npx tsx scripts/migrate-validation.ts

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function migrate() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("🔄 validation_records tablosu oluşturuluyor...");

  // Supabase JS client ile rpc kullanamayız DDL için, 
  // ama tabloyu test amaçlı insert/select ile kontrol edebiliriz
  // Doğrudan SQL çalıştırmak için Supabase Management API veya DB URL kullanmamız lazım

  // Önce tablo var mı kontrol et
  const { data, error } = await supabase
    .from("validation_records")
    .select("id")
    .limit(1);

  if (!error) {
    console.log("✅ validation_records tablosu zaten mevcut!");
    return;
  }

  // Tablo bulunamadı — oluştur
  console.log("⚠️  Tablo bulunamadı. SQL ile oluşturuluyor...");
    
    // Supabase Management API ile SQL çalıştır
    const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
    
    const sql = `
      CREATE TABLE IF NOT EXISTS validation_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fixture_id INTEGER NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        league TEXT NOT NULL,
        kickoff TIMESTAMPTZ NOT NULL,
        pick TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        odds NUMERIC(5,2) NOT NULL,
        expected_value NUMERIC(5,2) NOT NULL DEFAULT 0,
        is_value_bet BOOLEAN NOT NULL DEFAULT FALSE,
        sim_probability NUMERIC(5,1),
        sim_top_scoreline TEXT,
        actual_score TEXT,
        result TEXT NOT NULL CHECK (result IN ('won', 'lost', 'void', 'pending')),
        edge_at_open NUMERIC(5,1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_validation_fixture ON validation_records(fixture_id);
      CREATE INDEX IF NOT EXISTS idx_validation_result ON validation_records(result);
      CREATE INDEX IF NOT EXISTS idx_validation_date ON validation_records(kickoff);
      CREATE INDEX IF NOT EXISTS idx_validation_confidence ON validation_records(confidence);
      CREATE INDEX IF NOT EXISTS idx_validation_league ON validation_records(league);

      ALTER TABLE validation_records ENABLE ROW LEVEL SECURITY;
      
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'validation_records' AND policyname = 'validation_select') THEN
          CREATE POLICY validation_select ON validation_records FOR SELECT USING (true);
        END IF;
      END $$;
      
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'validation_records' AND policyname = 'validation_insert') THEN
          CREATE POLICY validation_insert ON validation_records FOR INSERT WITH CHECK (true);
        END IF;
      END $$;
      
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'validation_records' AND policyname = 'validation_update') THEN
          CREATE POLICY validation_update ON validation_records FOR UPDATE USING (true);
        END IF;
      END $$;
    `;

    // Doğrudan PostgreSQL bağlantısı ile çalıştır
    const dbUrl = process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
      console.error("❌ SUPABASE_DB_URL bulunamadı. Lütfen .env.local dosyasına ekleyin.");
      console.log("\n📋 Alternatif: Aşağıdaki SQL'i Supabase Dashboard > SQL Editor'da çalıştırın:\n");
      console.log(sql);
      return;
    }

    try {
      // pg modülünü dinamik import et
      const pg = await import("pg");
      const client = new pg.default.Client({ connectionString: dbUrl });
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log("✅ validation_records tablosu başarıyla oluşturuldu!");
    } catch (pgErr: unknown) {
      const errMsg = pgErr instanceof Error ? pgErr.message : String(pgErr);
      console.error("❌ PostgreSQL bağlantı hatası:", errMsg);
      console.log("\n📋 SQL'i manuel çalıştırın (Supabase Dashboard > SQL Editor):\n");
      console.log(sql);
    }
}

migrate().catch(console.error);
