// ============================================
// Reset Stats API
// Tüm tahmin ve validasyon verilerini sıfırla
// Yeni algoritma testleri için temiz sayfa
// ============================================

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { clearCache } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  try {
    // Basit güvenlik: Admin secret veya body'de onay
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "RESET_ALL_STATS") {
      return NextResponse.json(
        { error: "Onay gerekli. Body'de { confirm: 'RESET_ALL_STATS' } gönderin." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabase();
    const results: Record<string, { success: boolean; deleted: number; error?: string }> = {};

    // 1. validation_records tablosunu temizle
    const { data: valRecords, error: valError } = await supabase
      .from("validation_records")
      .select("id", { count: "exact" });
    
    const valCount = valRecords?.length || 0;
    
    if (valCount > 0) {
      const { error } = await supabase
        .from("validation_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Tümünü sil (dummy condition)
      
      results.validation_records = {
        success: !error,
        deleted: error ? 0 : valCount,
        error: error?.message,
      };
    } else {
      results.validation_records = { success: true, deleted: 0 };
    }

    // 2. predictions tablosundaki result'ları sıfırla (won/lost → silinecek)
    const { data: predRecords } = await supabase
      .from("predictions")
      .select("id", { count: "exact" })
      .in("result", ["won", "lost", "void"]);
    
    const predCount = predRecords?.length || 0;

    if (predCount > 0) {
      const { error } = await supabase
        .from("predictions")
        .delete()
        .in("result", ["won", "lost", "void"]);
      
      results.predictions_settled = {
        success: !error,
        deleted: error ? 0 : predCount,
        error: error?.message,
      };
    } else {
      results.predictions_settled = { success: true, deleted: 0 };
    }

    // 3. Pending tahminleri de sil (temiz başlangıç)
    const { data: pendingRecords } = await supabase
      .from("predictions")
      .select("id", { count: "exact" })
      .eq("result", "pending");

    const pendingCount = pendingRecords?.length || 0;

    if (pendingCount > 0) {
      const { error } = await supabase
        .from("predictions")
        .delete()
        .eq("result", "pending");
      
      results.predictions_pending = {
        success: !error,
        deleted: error ? 0 : pendingCount,
        error: error?.message,
      };
    } else {
      results.predictions_pending = { success: true, deleted: 0 };
    }

    // 4. Tüm in-memory cache'i temizle (optimizer, calibration, prediction cache dahil)
    clearCache();
    results.cache = { success: true, deleted: 0 };

    // Toplam silinen
    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0);
    const allSuccess = Object.values(results).every((r) => r.success);

    console.log(`[RESET] Stats reset completed. Total deleted: ${totalDeleted}`, results);

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
