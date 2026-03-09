// ============================================
// Gemini AI Chat — DB tabanlı futbol analisti
// Kullanıcıyla sohbet eder, DB'den veri çeker
// ============================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminSupabase } from "@/lib/supabase/admin";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * DB'den güncel verileri çek ve system prompt oluştur
 */
async function buildSystemContext(): Promise<string> {
  const today = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let predictions: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let validations: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oddsSnapshots: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let coupons: any[] = [];

  try {
    const supabase = createAdminSupabase();

    const [predictionsRes, validationRes, oddsRes, couponsRes] = await Promise.all([
      supabase
        .from("predictions")
        .select("*")
        .gte("kickoff", `${today}T00:00:00`)
        .order("kickoff", { ascending: true })
        .limit(50),
      supabase
        .from("validation_records")
        .select("*")
        .order("kickoff", { ascending: false })
        .limit(100),
      supabase
        .from("odds_snapshots")
        .select("*")
        .gte("kickoff", `${today}T00:00:00`)
        .order("captured_at", { ascending: false })
        .limit(100),
      supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    predictions = predictionsRes.data || [];
    validations = validationRes.data || [];
    oddsSnapshots = oddsRes.data || [];
    coupons = couponsRes.data || [];
  } catch (dbError) {
    console.error("[GEMINI] DB erişim hatası:", dbError);
  }

  // İstatistikler
  const totalValidated = validations.length;
  const wins = validations.filter(v => v.result === "won").length;
  const losses = validations.filter(v => v.result === "lost").length;
  const winRate = totalValidated > 0 ? ((wins / totalValidated) * 100).toFixed(1) : "N/A";

  // Oran hareketleri özeti
  const fixtureOddsMap = new Map<number, { first: typeof oddsSnapshots[0]; last: typeof oddsSnapshots[0] }>();
  for (const snap of oddsSnapshots) {
    const existing = fixtureOddsMap.get(snap.fixture_id);
    if (!existing) {
      fixtureOddsMap.set(snap.fixture_id, { first: snap, last: snap });
    } else {
      if (snap.captured_at < existing.first.captured_at) existing.first = snap;
      if (snap.captured_at > existing.last.captured_at) existing.last = snap;
    }
  }

  const oddsMovements: string[] = [];
  for (const [, { first, last }] of fixtureOddsMap) {
    if (first.captured_at === last.captured_at) continue;
    const homeChange = ((Number(last.home_odds) - Number(first.home_odds)) / Number(first.home_odds)) * 100;
    const drawChange = ((Number(last.draw_odds) - Number(first.draw_odds)) / Number(first.draw_odds)) * 100;
    const awayChange = ((Number(last.away_odds) - Number(first.away_odds)) / Number(first.away_odds)) * 100;
    if (Math.abs(homeChange) > 3 || Math.abs(drawChange) > 3 || Math.abs(awayChange) > 3) {
      oddsMovements.push(
        `${first.home_team} vs ${first.away_team}: MS1 ${Number(first.home_odds).toFixed(2)}→${Number(last.home_odds).toFixed(2)} (${homeChange > 0 ? "+" : ""}${homeChange.toFixed(1)}%), X ${Number(first.draw_odds).toFixed(2)}→${Number(last.draw_odds).toFixed(2)}, MS2 ${Number(first.away_odds).toFixed(2)}→${Number(last.away_odds).toFixed(2)}`
      );
    }
  }

  // Bugünkü tahminler özeti
  const predictionsText = predictions.length > 0
    ? predictions.map(p =>
        `• ${p.home_team} vs ${p.away_team} (${p.league}) → ${p.pick} @${p.odds} güven:%${p.confidence} EV:${p.expected_value} ${p.is_value_bet ? "[VALUE]" : ""} sonuç:${p.result}`
      ).join("\n")
    : "Bugün henüz tahmin yok.";

  // Son kuponlar
  const couponsText = coupons.length > 0
    ? coupons.slice(0, 5).map(c => {
        const items = Array.isArray(c.items) ? c.items : [];
        return `• ${c.category} kupon (${items.length} maç) toplam oran: ${c.total_odds} durum: ${c.status}`;
      }).join("\n")
    : "Henüz kupon yok.";

  return `Sen "Bilyoner AI" adında profesyonel bir Türk futbol bahis analistisin. Her zaman Türkçe konuşursun.

GÖREVIN:
- Kullanıcıyla maçlar, oranlar, kuponlar hakkında sohbet et
- Veritabanındaki gerçek verilere dayanarak yorum yap
- Bahis stratejileri ve öneriler sun
- Sorulara dürüst ve net cevaplar ver
- Riskli bahislerde uyar

GÜNCEL VERİTABANI BİLGİLERİ (${today}):

📊 SİSTEM PERFORMANSI:
Son ${totalValidated} tahmin — Kazanma: ${wins} | Kayıp: ${losses} | Oran: %${winRate}

⚽ BUGÜNKÜ TAHMİNLER:
${predictionsText}

${oddsMovements.length > 0 ? `📈 ORAN HAREKETLERİ (>%3 değişim):\n${oddsMovements.join("\n")}` : "📈 Henüz anlamlı oran hareketi yok."}

🎫 SON KUPONLAR:
${couponsText}

KURALLAR:
- Sadece veritabanında gördüğüne dayan, uydurma
- Güven oranı düşük tahminlerde uyar
- Value bet'leri vurgula
- Oran düşüşlerini "para giriyor" olarak yorumla
- Kısa, net ve samimi konuş
- Emoji kullanabilirsin ama abartma`;
}

/**
 * Gemini AI ile sohbet — DB context ile
 */
export async function chatWithAI(
  messages: ChatMessage[],
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return "⚠️ Gemini API key tanımlı değil. Lütfen GEMINI_API_KEY environment variable'ını ayarlayın.";
  }

  const systemContext = await buildSystemContext();
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));
  const lastMessage = messages[messages.length - 1];

  const errors: string[] = [];

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemContext,
      });

      const chat = model.startChat({
        history,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });

      const result = await chat.sendMessage(lastMessage.content);
      return result.response.text();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[GEMINI] ${modelName} hatası:`, errMsg);
      errors.push(`${modelName}: ${errMsg.slice(0, 100)}`);
      // 429 = rate limit, sonraki modeli dene
      if (errMsg.includes("429") || errMsg.includes("quota")) continue;
      // Başka hata ise dur
      return `❌ AI Hatası: ${errMsg}`;
    }
  }

  return `❌ Tüm modeller kota limitine ulaştı. Lütfen birkaç dakika sonra tekrar deneyin.\n\n${errors.join("\n")}`;
}
