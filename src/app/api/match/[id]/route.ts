import { NextRequest, NextResponse } from "next/server";
import { getFixtureById } from "@/lib/api-football";
import { analyzeMatch } from "@/lib/prediction";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fixtureId = parseInt(id);

    if (isNaN(fixtureId)) {
      return NextResponse.json({ error: "Geçersiz fixture ID" }, { status: 400 });
    }

    const fixture = await getFixtureById(fixtureId);

    if (!fixture) {
      return NextResponse.json({ error: "Maç bulunamadı" }, { status: 404 });
    }

    const prediction = await analyzeMatch(fixture);

    return NextResponse.json({ prediction });
  } catch (error) {
    console.error("Match API error:", error);
    return NextResponse.json(
      { error: "Maç analizi yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
