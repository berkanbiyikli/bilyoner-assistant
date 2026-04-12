import { NextRequest, NextResponse } from "next/server";
import { buildAllCascadeStrategies } from "@/lib/cascade";
import { getCached, setCache } from "@/lib/cache";
import type { MatchPrediction, CascadeRiskLevel, CascadeStrategy } from "@/types";

export const maxDuration = 30;

const CASCADE_CACHE_TTL = 10 * 60; // 10 dakika

/**
 * GET /api/cascade?date=YYYY-MM-DD&stake=100
 * Günün maçları için kademeli bahis stratejisi oluştur
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const stake = Math.max(10, Math.min(10000, Number(searchParams.get("stake")) || 100));

    // Cache kontrol
    const cacheKey = `cascade:${date}:${stake}`;
    const cached = getCached<Record<CascadeRiskLevel, CascadeStrategy>>(cacheKey);
    if (cached) {
      return NextResponse.json({
        date,
        stake,
        source: "cache",
        strategies: cached,
      });
    }

    // Predictions API'den maçları al (internal fetch)
    const baseUrl = req.nextUrl.origin;
    const predRes = await fetch(`${baseUrl}/api/predictions?date=${date}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!predRes.ok) {
      return NextResponse.json({ error: "Tahminler alınamadı" }, { status: 500 });
    }

    const predData = await predRes.json();
    const predictions: MatchPrediction[] = predData.predictions || [];

    if (predictions.length === 0) {
      return NextResponse.json({
        date,
        stake,
        source: "empty",
        strategies: null,
        message: "Bu tarih için tahmin bulunamadı",
      });
    }

    // 3 risk seviyesi için cascade stratejileri oluştur
    const strategies = buildAllCascadeStrategies(predictions, stake);

    // Cache'le
    setCache(cacheKey, strategies, CASCADE_CACHE_TTL);

    return NextResponse.json({
      date,
      stake,
      source: "live",
      strategies,
    });
  } catch (error) {
    console.error("[CASCADE] API error:", error);
    return NextResponse.json({ error: "Cascade strateji oluşturulamadı" }, { status: 500 });
  }
}
