import { NextRequest, NextResponse } from "next/server";
import { getOddsMovements, getFixtureOddsHistory } from "@/lib/odds";
import { analyzeOddsMovements, analyzeMatchWithAI, analyzeCouponWithAI } from "@/lib/ai/gemini";

/**
 * /api/ai/analyze?type=odds           → Günün oran hareketlerini analiz et
 * /api/ai/analyze?type=match&id=123   → Tek maç AI analizi
 * /api/ai/analyze?type=coupon         → Kupon AI analizi (POST body)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "odds";

    if (type === "odds") {
      const date = searchParams.get("date") || undefined;
      const movements = await getOddsMovements(date);

      if (movements.length === 0) {
        return NextResponse.json({
          success: true,
          movements: [],
          analysis: null,
          message: "Henüz oran hareketi yok. İlk snapshot'tan sonra karşılaştırma yapılacak.",
        });
      }

      const analysis = await analyzeOddsMovements(movements);

      return NextResponse.json({
        success: true,
        movements: movements.slice(0, 50), // İlk 50 hareket
        analysis,
        stats: {
          total: movements.length,
          steams: movements.filter(m => m.change < -8).length,
          significant: movements.filter(m => Math.abs(m.change) > 5).length,
        },
      });
    }

    if (type === "history") {
      const fixtureId = Number(searchParams.get("id"));
      if (!fixtureId) {
        return NextResponse.json({ error: "fixture id gerekli" }, { status: 400 });
      }

      const history = await getFixtureOddsHistory(fixtureId);
      return NextResponse.json({ success: true, fixtureId, history });
    }

    return NextResponse.json({ error: "Geçersiz type" }, { status: 400 });
  } catch (error) {
    console.error("[AI API] Error:", error);
    return NextResponse.json(
      { error: "AI analizi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body;

    if (type === "match") {
      const analysis = await analyzeMatchWithAI(body.matchData);
      return NextResponse.json({ success: true, analysis });
    }

    if (type === "coupon") {
      const analysis = await analyzeCouponWithAI(body.couponData);
      return NextResponse.json({ success: true, analysis });
    }

    return NextResponse.json({ error: "Geçersiz type" }, { status: 400 });
  } catch (error) {
    console.error("[AI API] POST Error:", error);
    return NextResponse.json(
      { error: "AI analizi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
