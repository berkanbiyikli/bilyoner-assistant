import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Günün TÜM maçlarını çek
    const allFixtures = await getFixturesByDate(date);

    // Henüz başlamamış maçları analiz et
    const upcomingFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    // Maçları analiz et (API rate limit nedeniyle batch halinde)
    const predictions = await analyzeMatches(upcomingFixtures);

    return NextResponse.json({
      date,
      total: allFixtures.length,
      analyzed: predictions.length,
      predictions,
    });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json(
      { error: "Tahminler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
