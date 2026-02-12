import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { findValueBets } from "@/lib/value-bet";

export async function GET(req: NextRequest) {
  try {
    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    const predictions = await analyzeMatches(fixtures);
    const valueBets = findValueBets(predictions);

    return NextResponse.json({
      count: valueBets.length,
      valueBets,
    });
  } catch (error) {
    console.error("Value Bets API error:", error);
    return NextResponse.json(
      { error: "Value bet'ler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
