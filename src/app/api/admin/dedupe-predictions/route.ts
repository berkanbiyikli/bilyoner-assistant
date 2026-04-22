// ============================================
// One-shot cleanup: predictions tablosundaki duplicate (fixture_id, pick) kayıtlarını sil.
// Concurrent cron çalışmaları geçmişte duplicate yarattı.
// Aynı (fixture_id, pick) için en yüksek confidence olanı tutar, diğerlerini siler.
// ============================================

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // opsiyonel: belirli gün
  const dryRun = searchParams.get("dry") === "true";

  const supabase = createAdminSupabase();

  // Tüm pick'leri çek (gerekirse tarih filtreli) — pagination ile (1000 satır limiti)
  type Row = { id: string; fixture_id: number; pick: string; confidence: number | null; created_at: string };
  const rows: Row[] = [];
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase
      .from("predictions")
      .select("id, fixture_id, pick, confidence, created_at")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (date) {
      q = q.gte("kickoff", `${date}T00:00:00.000Z`).lte("kickoff", `${date}T23:59:59.999Z`);
    }
    const { data, error: pageErr } = await q;
    if (pageErr) return NextResponse.json({ error: pageErr.message }, { status: 500 });
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
    if (rows.length > 50000) break; // güvenlik tavanı
  }

  // (fixture_id, pick) -> en iyi kayıt
  const bestByKey = new Map<string, { id: string; confidence: number; created_at: string }>();
  const allByKey = new Map<string, string[]>();

  for (const r of rows || []) {
    const key = `${r.fixture_id}_${r.pick}`;
    const conf = r.confidence ?? 0;
    if (!allByKey.has(key)) allByKey.set(key, []);
    allByKey.get(key)!.push(r.id as string);

    const current = bestByKey.get(key);
    if (!current || conf > current.confidence ||
        (conf === current.confidence && (r.created_at as string) > current.created_at)) {
      bestByKey.set(key, { id: r.id as string, confidence: conf, created_at: r.created_at as string });
    }
  }

  // Silinecek ID'ler: best olmayanlar
  const idsToDelete: string[] = [];
  let duplicateGroups = 0;
  for (const [key, ids] of allByKey.entries()) {
    if (ids.length <= 1) continue;
    duplicateGroups++;
    const keepId = bestByKey.get(key)!.id;
    for (const id of ids) if (id !== keepId) idsToDelete.push(id);
  }

  if (dryRun) {
    return NextResponse.json({
      success: true,
      mode: "dry-run",
      totalRows: rows?.length ?? 0,
      duplicateGroups,
      wouldDelete: idsToDelete.length,
    });
  }

  // Batch delete (Supabase 1000 ID limiti)
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += 500) {
    const batch = idsToDelete.slice(i, i + 500);
    const { error: delError } = await supabase.from("predictions").delete().in("id", batch);
    if (delError) {
      return NextResponse.json({
        success: false,
        deleted,
        remaining: idsToDelete.length - deleted,
        error: delError.message,
      }, { status: 500 });
    }
    deleted += batch.length;
  }

  return NextResponse.json({
    success: true,
    totalRows: rows?.length ?? 0,
    duplicateGroups,
    deleted,
  });
}
