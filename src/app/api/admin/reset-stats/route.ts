// ============================================
// Reset Stats API
// Tüm tahmin ve validasyon verilerini sıfırla
// Yeni algoritma testleri için temiz sayfa
// ============================================

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { clearCache } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "RESET_ALL_STATS") {
      return NextResponse.json(
        { error: "Onay gerekli. Body'de { confirm: 'RESET_ALL_STATS' } gönderin." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabase();
    const results: Record<string, { success: boolean; deleted: number; error?: string }> = {};
    let totalDeleted = 0;

    // 1. validation_records — tümünü sil (gte ile tarih filtresiz hepsini yakala)
    const { data: valDel, error: valErr } = await supabase
      .from("validation_records")
      .delete()
      .gte("created_at", "2000-01-01T00:00:00Z")
      .select("id");
    
    results.validation_records = {
      success: !valErr,
      deleted: valDel?.length || 0,
      error: valErr?.message,
    };
    totalDeleted += valDel?.length || 0;

    // 2. predictions — settle edilmişleri sil
    const { data: predDel, error: predErr } = await supabase
      .from("predictions")
      .delete()
      .in("result", ["won", "lost", "void"])
      .select("id");
    
    results.predictions_settled = {
      success: !predErr,
      deleted: predDel?.length || 0,
      error: predErr?.message,
    };
    totalDeleted += predDel?.length || 0;

    // 3. predictions — pending olanları da sil
    const { data: pendDel, error: pendErr } = await supabase
      .from("predictions")
      .delete()
      .eq("result", "pending")
      .select("id");

    results.predictions_pending = {
      success: !pendErr,
      deleted: pendDel?.length || 0,
      error: pendErr?.message,
    };
    totalDeleted += pendDel?.length || 0;

    // 4. Kalan varsa — ikinci geçiş (Supabase 1000 row limit)
    let extraDeleted = 0;
    for (let i = 0; i < 5; i++) {
      const { data: extraVal } = await supabase
        .from("validation_records")
        .delete()
        .gte("created_at", "2000-01-01T00:00:00Z")
        .select("id");
      const { data: extraPred } = await supabase
        .from("predictions")
        .delete()
        .gte("created_at", "2000-01-01T00:00:00Z")
        .select("id");
      
      const batchCount = (extraVal?.length || 0) + (extraPred?.length || 0);
      extraDeleted += batchCount;
      if (batchCount === 0) break; // Kalan yok
    }
    totalDeleted += extraDeleted;
    if (extraDeleted > 0) {
      results.extra_cleanup = { success: true, deleted: extraDeleted };
    }

    // 5. Tüm in-memory cache temizle
    clearCache();
    results.cache = { success: true, deleted: 0 };

    const allSuccess = Object.values(results).every((r) => r.success);

    console.log(`[RESET] Completed. Total deleted: ${totalDeleted}`, results);

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess
        ? `Tüm istatistikler sıfırlandı. ${totalDeleted} kayıt silindi.`
        : "Bazı tablolarda hata oluştu.",
      totalDeleted,
      details: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RESET] Error:", error);
    return NextResponse.json(
      { error: "Reset sırasında hata oluştu", details: String(error) },
      { status: 500 }
    );
  }
}
