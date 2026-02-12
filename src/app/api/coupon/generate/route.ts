import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { buildCoupon } from "@/lib/coupon";
import type { CouponCategory } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = (searchParams.get("category") || "balanced") as CouponCategory;
    const stake = Number(searchParams.get("stake")) || 100;

    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    const predictions = await analyzeMatches(fixtures);
    const coupon = buildCoupon(predictions, { category, stake });

    return NextResponse.json({ coupon });
  } catch (error) {
    console.error("Coupon Generate API error:", error);
    return NextResponse.json(
      { error: "Kupon oluşturulurken hata oluştu" },
      { status: 500 }
    );
  }
}
