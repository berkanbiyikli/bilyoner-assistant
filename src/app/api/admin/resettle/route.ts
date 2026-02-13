// ============================================
// Admin Re-Settle API
// POST /api/admin/resettle
// Yanlış settle edilmiş tahminleri tekrar kontrol eder
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixtureById, getFixtureStatistics, getFixtureEvents } from "@/lib/api-football";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const body = await req.json().catch(() => ({}));
    const adminKey = body.adminKey || "";

    // Basit auth kontrolü
    if (
      authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      adminKey !== process.env.CRON_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabase();

    // Yanlış settle edilmiş olabilecek tahminleri bul:
    // - Corners/Cards/HT pick'leri + result=lost olan herşey
    const statsPickPatterns = [
      "Corners", "Cards", "HT Over", "HT Under",
    ];

    const { data: suspiciousLost } = await supabase
      .from("predictions")
      .select("*")
      .eq("result", "lost")
      .order("kickoff", { ascending: false });

    if (!suspiciousLost || suspiciousLost.length === 0) {
      return NextResponse.json({ message: "No lost predictions found", resettled: 0 });
    }

    // Sadece stats-dependent pick'leri filtrele
    const statsDependent = suspiciousLost.filter((p) =>
      statsPickPatterns.some((pattern) => p.pick.includes(pattern))
    );

    let resettled = 0;
    let unchanged = 0;
    let errors = 0;
    const details: Array<{
      id: string;
      fixture_id: number;
      pick: string;
      oldResult: string;
      newResult: string;
      statValue: number | null;
    }> = [];

    // Fixture bazlı grupla
    const byFixture = new Map<number, typeof statsDependent>();
    for (const pred of statsDependent) {
      const group = byFixture.get(pred.fixture_id) || [];
      group.push(pred);
      byFixture.set(pred.fixture_id, group);
    }

    for (const [fixtureId, preds] of byFixture) {
      try {
        const fixture = await getFixtureById(fixtureId);
        if (!fixture) {
          errors++;
          continue;
        }

        const status = fixture.fixture.status.short;
        if (!["FT", "AET", "PEN"].includes(status)) {
          // Maç henüz bitmemiş → pending'e al
          for (const pred of preds) {
            await supabase.from("predictions").update({ result: "pending" }).eq("id", pred.id);
            details.push({ id: pred.id, fixture_id: fixtureId, pick: pred.pick, oldResult: "lost", newResult: "pending", statValue: null });
            resettled++;
          }
          continue;
        }

        // İstatistikleri çek
        let fixtureStats: Awaited<ReturnType<typeof getFixtureStatistics>> = [];
        try {
          fixtureStats = await getFixtureStatistics(fixtureId);
        } catch {
          console.error(`[RESETTLE] Stats fetch failed for ${fixtureId}`);
        }

        const statsAvailable = fixtureStats.length > 0 &&
          fixtureStats.some((t) => t.statistics && t.statistics.length > 0);

        const getStatValue = (type: string): number | null => {
          if (!statsAvailable) return null;
          let total = 0;
          for (const team of fixtureStats) {
            const stat = team.statistics?.find((s: { type: string }) => s.type === type);
            if (stat?.value != null) total += Number(stat.value) || 0;
          }
          return total;
        };

        // Events (HT goals)
        let htGoals: number | null = null;
        try {
          const events = await getFixtureEvents(fixtureId);
          if (events && events.length > 0) {
            htGoals = events.filter(
              (e) => e.type === "Goal" && (e.time?.elapsed ?? 99) <= 45
            ).length;
          }
        } catch {}

        for (const pred of preds) {
          let newResult: "won" | "lost" | null = null;
          let statValue: number | null = null;

          if (pred.pick.includes("Corners")) {
            const corners = getStatValue("Corner Kicks");
            statValue = corners;
            if (corners === null) {
              // Hala veri yok → pending'e geri al
              newResult = null;
            } else {
              const threshold = parseFloat(pred.pick.match(/(\d+\.?\d*)/)?.[1] || "8.5");
              if (pred.pick.startsWith("Over")) {
                newResult = corners > threshold ? "won" : "lost";
              } else {
                newResult = corners < threshold ? "won" : "lost";
              }
            }
          } else if (pred.pick.includes("Cards")) {
            const yellowCards = getStatValue("Yellow Cards");
            const redCards = getStatValue("Red Cards");
            statValue = yellowCards !== null && redCards !== null ? yellowCards + redCards : null;
            if (statValue === null) {
              newResult = null;
            } else {
              const threshold = parseFloat(pred.pick.match(/(\d+\.?\d*)/)?.[1] || "3.5");
              if (pred.pick.startsWith("Over")) {
                newResult = statValue > threshold ? "won" : "lost";
              } else {
                newResult = statValue < threshold ? "won" : "lost";
              }
            }
          } else if (pred.pick.includes("HT")) {
            statValue = htGoals;
            if (htGoals === null) {
              newResult = null;
            } else {
              const threshold = parseFloat(pred.pick.match(/(\d+\.?\d*)/)?.[1] || "0.5");
              if (pred.pick.includes("Over")) {
                newResult = htGoals > threshold ? "won" : "lost";
              } else {
                newResult = htGoals <= threshold ? "won" : "lost";
              }
            }
          }

          if (newResult === null) {
            // Veri hala yok → pending'e al
            await supabase.from("predictions").update({ result: "pending" }).eq("id", pred.id);
            details.push({ id: pred.id, fixture_id: fixtureId, pick: pred.pick, oldResult: "lost", newResult: "pending", statValue });
            resettled++;
          } else if (newResult !== pred.result) {
            // Sonuç farklı → güncelle
            await supabase.from("predictions").update({ result: newResult }).eq("id", pred.id);
            details.push({ id: pred.id, fixture_id: fixtureId, pick: pred.pick, oldResult: pred.result, newResult, statValue });
            resettled++;
          } else {
            unchanged++;
          }
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[RESETTLE] Error for fixture ${fixtureId}:`, err);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      total: statsDependent.length,
      resettled,
      unchanged,
      errors,
      details,
    });
  } catch (error) {
    console.error("Re-settle error:", error);
    return NextResponse.json({ error: "Re-settle failed" }, { status: 500 });
  }
}
