import { NextResponse } from "next/server";
import { calculateValidationStats } from "@/lib/prediction/validator";

export async function GET() {
  try {
    const stats = await calculateValidationStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Validation stats error:", error);
    return NextResponse.json({ error: "Failed to calculate stats" }, { status: 500 });
  }
}
