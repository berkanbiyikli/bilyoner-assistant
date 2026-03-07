import { NextRequest, NextResponse } from "next/server";
import { buildTotoBulletin, buildBulletinSummary } from "@/lib/spor-toto";
import { format } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");
    const days = Math.min(parseInt(searchParams.get("days") || "3", 10), 7);

    const program = await buildTotoBulletin(date, days);
    const summary = buildBulletinSummary(program);

    return NextResponse.json({
      success: true,
      program,
      summary,
    });
  } catch (error) {
    console.error("[SPOR-TOTO] Bülten oluşturma hatası:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Bülten oluşturulamadı",
        details: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}
