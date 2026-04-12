import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { analyzeMatchWithAI } from "@/lib/ai/match-analyzer";
import type { MatchAnalysis, MatchOdds, AIAnalysis } from "@/types";

export const maxDuration = 30;

/**
 * POST /api/match/[id]/ai — On-demand AI analizi
 * Body: { analysis, odds, homeTeam, awayTeam, league, kickoff, topPick? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fixtureId = parseInt(id);
    if (isNaN(fixtureId)) {
      return NextResponse.json({ error: "Geçersiz fixture ID" }, { status: 400 });
    }

    const body = await req.json();
    const { analysis, odds, homeTeam, awayTeam, league, kickoff, topPick } = body as {
      analysis: MatchAnalysis;
      odds?: MatchOdds;
      homeTeam: string;
      awayTeam: string;
      league: string;
      kickoff: string;
      topPick?: { type: string; confidence: number; odds: number; ev: number };
    };

    if (!analysis || !homeTeam || !awayTeam) {
      return NextResponse.json({ error: "analysis, homeTeam, awayTeam gerekli" }, { status: 400 });
    }

    const aiResult = await analyzeMatchWithAI({
      homeTeam,
      awayTeam,
      league: league || "",
      kickoff: kickoff || new Date().toISOString(),
      analysis,
      odds,
      simulation: analysis.simulation,
      injuries: analysis.keyMissingPlayers,
      h2hGoalAvg: analysis.h2hGoalAvg,
      topPick,
    });

    if (!aiResult) {
      return NextResponse.json({ error: "AI analiz başarısız oldu, lütfen tekrar deneyin" }, { status: 502 });
    }

    // DB'deki analysis_data'ya AI analizini kaydet
    try {
      const supabase = createAdminSupabase();
      const { data: preds } = await supabase
        .from("predictions")
        .select("id, analysis_data")
        .eq("fixture_id", fixtureId)
        .limit(1);

      if (preds && preds.length > 0) {
        const existing = (preds[0].analysis_data || {}) as Record<string, unknown>;
        await supabase
          .from("predictions")
          .update({
            analysis_data: { ...existing, aiAnalysis: aiResult },
          })
          .eq("fixture_id", fixtureId);
      }
    } catch (dbErr) {
      console.warn("[AI-ON-DEMAND] DB kaydetme başarısız:", dbErr);
    }

    return NextResponse.json({ aiAnalysis: aiResult });
  } catch (error) {
    console.error("[AI-ON-DEMAND] Error:", error);
    return NextResponse.json(
      { error: "AI analizi yapılamadı" },
      { status: 500 }
    );
  }
}
