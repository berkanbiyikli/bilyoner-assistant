import { NextRequest, NextResponse } from "next/server";
import { chatWithAI, ChatMessage } from "@/lib/ai/gemini";

/**
 * POST /api/ai/analyze — AI Chat endpoint
 * Body: { messages: ChatMessage[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body as { messages: ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array gerekli" }, { status: 400 });
    }

    // Son mesaj user'dan olmalı
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "user") {
      return NextResponse.json({ error: "Son mesaj user'dan olmalı" }, { status: 400 });
    }

    const reply = await chatWithAI(messages);

    return NextResponse.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("[AI CHAT] Error:", error);
    return NextResponse.json(
      { error: "AI yanıt veremedi, lütfen tekrar deneyin." },
      { status: 500 }
    );
  }
}
