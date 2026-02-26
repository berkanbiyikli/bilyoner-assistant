// ============================================
// Reset Stats API v4
// Tüm tahmin ve validasyon verilerini sıfırla
// RPC fonksiyonu ile RLS bypass garanti
// ============================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clearCache } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "RESET_ALL_STATS") {
      return NextResponse.json(
        { error: "Onay gerekli. Body'de { confirm: 'RESET_ALL_STATS' } gönderin." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const usedKey = serviceKey ? "service_role" : "anon";

    const supabase = createClient(url, serviceKey || anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "public" },
    });

    const details: Record<string, unknown> = { key_type: usedKey };

    // === 1. Mevcut kayıt sayıları ===
    const { count: valBefore } = await supabase
      .from("validation_records")
      .select("*", { count: "exact", head: true });
    const { count: predBefore } = await supabase
      .from("predictions")
      .select("*", { count: "exact", head: true });

    details.before = {
      validation_records: valBefore ?? 0,
      predictions: predBefore ?? 0,
    };

    // === 2. Öncelik: RPC ile sil (SECURITY DEFINER, RLS bypass) ===
    let rpcWorked = false;
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "reset_all_stats" as never
    );
    if (!rpcError) {
      rpcWorked = true;
      details.method = "rpc_reset_all_stats";
      details.rpc_result = rpcData;
    } else {
      details.rpc_error = rpcError.message;
      details.method = "fallback_direct_delete";

      // === 3a. Fallback: Direct delete — validation_records ===
      let valDel = 0;
      for (let i = 0; i < 30; i++) {
        const { data: batch } = await supabase
          .from("validation_records")
          .select("id")
          .limit(1000);
        if (!batch || batch.length === 0) break;

        const ids = batch.map((r) => r.id);
        const { data: deleted, error: delErr } = await supabase
          .from("validation_records")
          .delete()
          .in("id", ids)
          .select("id");

        if (delErr) {
          details.val_delete_error = delErr.message;
          break;
        }
        const actualDel = deleted?.length ?? 0;
        valDel += actualDel;
        // Eğer delete çağrısı 0 dönüyorsa RLS engeli var
        if (actualDel === 0 && batch.length > 0) {
          details.val_rls_blocked = true;
          break;
        }
      }
      details.validation_deleted = valDel;

      // === 3b. Fallback: Direct delete — predictions ===
      let predDel = 0;
      for (let i = 0; i < 30; i++) {
        const { data: batch } = await supabase
          .from("predictions")
          .select("id")
          .limit(1000);
        if (!batch || batch.length === 0) break;

        const ids = batch.map((r) => r.id);
        const { data: deleted, error: delErr } = await supabase
          .from("predictions")
          .delete()
          .in("id", ids)
          .select("id");

        if (delErr) {
          details.pred_delete_error = delErr.message;
          break;
        }
        const actualDel = deleted?.length ?? 0;
        predDel += actualDel;
        if (actualDel === 0 && batch.length > 0) {
          details.pred_rls_blocked = true;
          // Son çare: hepsini result='reset' yap (stats'da sayılmaz)
          const { error: updErr } = await supabase
            .from("predictions")
            .update({ result: "void" })
            .neq("result", "void");
          details.voided = updErr ? `Update hata: ${updErr.message}` : "Tüm kayıtlar void yapıldı";
          break;
        }
      }
      details.predictions_deleted = predDel;
    }

    // === 4. Son kontrol ===
    const { count: valAfter } = await supabase
      .from("validation_records")
      .select("*", { count: "exact", head: true });
    const { count: predAfter } = await supabase
      .from("predictions")
      .select("*", { count: "exact", head: true });

    details.after = {
      validation_records: valAfter ?? 0,
      predictions: predAfter ?? 0,
    };

    // === 5. Cache temizle ===
    clearCache();

    const totalBefore = (valBefore ?? 0) + (predBefore ?? 0);
    const totalAfter = (valAfter ?? 0) + (predAfter ?? 0);
    const totalDeleted = totalBefore - totalAfter;
    const success = totalAfter === 0;

    console.log(`[RESET-v4] key=${usedKey} rpc=${rpcWorked} before=${totalBefore} after=${totalAfter}`, JSON.stringify(details));

    return NextResponse.json({
      success,
      message: success
        ? `Tüm istatistikler sıfırlandı. ${totalDeleted} kayıt silindi.`
        : `Kısmi reset: ${totalDeleted} silindi, ${totalAfter} kaldı. Detaylara bakın.`,
      totalDeleted,
      remaining: totalAfter,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RESET-v4] Error:", error);
    return NextResponse.json(
      { error: "Reset sırasında hata oluştu", details: String(error) },
      { status: 500 }
    );
  }
}
