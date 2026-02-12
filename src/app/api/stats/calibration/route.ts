import { NextResponse } from "next/server";
import { calculateCalibration } from "@/lib/prediction/validator";

export async function GET() {
  try {
    const calibration = await calculateCalibration();
    return NextResponse.json({ success: true, calibration });
  } catch (error) {
    console.error("Calibration stats error:", error);
    return NextResponse.json({ error: "Failed to calculate calibration" }, { status: 500 });
  }
}
