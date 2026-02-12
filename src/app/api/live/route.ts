import { NextResponse } from "next/server";
import { getLiveFixtures } from "@/lib/api-football";

export const revalidate = 0; // No cache

export async function GET() {
  try {
    const matches = await getLiveFixtures();

    return NextResponse.json({
      count: matches.length,
      matches,
    });
  } catch (error) {
    console.error("Live API error:", error);
    return NextResponse.json(
      { error: "Canlı maçlar yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
