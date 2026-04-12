// ============================================
// Gemini AI Chat — DB tabanlı futbol analisti
// Kullanıcıyla sohbet eder, DB'den veri çeker
// ============================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminSupabase } from "@/lib/supabase/admin";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODELS = ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-3-pro-preview"];

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Kullanıcı mesajından takım isimlerini çıkart
 */
function extractTeamNames(message: string): string[] {
  const teams: string[] = [];
  // "X - Y", "X vs Y", "X – Y" formatlarını yakala
  const matchPatterns = [
    /([A-Za-zÀ-ÿğüşıöçĞÜŞİÖÇ\s.]+?)\s*[-–vs]+\s*([A-Za-zÀ-ÿğüşıöçĞÜŞİÖÇ\s.]+)/gi,
  ];
  for (const pattern of matchPatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const t1 = match[1].trim();
      const t2 = match[2].trim();
      if (t1.length >= 3) teams.push(t1);
      if (t2.length >= 3) teams.push(t2);
    }
  }
  // Eğer pattern bulamadıysa, 3+ kelimelik özel isimleri dene
  if (teams.length === 0) {
    const words = message.split(/\s+/).filter(w => w.length >= 3 && /^[A-ZÀ-ÿĞÜŞİÖÇ]/.test(w));
    teams.push(...words);
  }
  return [...new Set(teams)];
}

/**
 * DB'den güncel verileri çek ve system prompt oluştur
 * userMessage: kullanıcının son mesajı — ilgili maçları aramak için kullanılır
 */
async function buildSystemContext(userMessage: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let predictions: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let validations: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oddsSnapshots: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let coupons: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let teamPredictions: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let teamOdds: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let teamValidations: any[] = [];

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

    // Kullanıcının sorduğu takımları ara
    const teamNames = extractTeamNames(userMessage);
    if (teamNames.length > 0) {
      const teamQueries = teamNames.flatMap(name => [
        supabase
          .from("predictions")
          .select("*")
          .or(`home_team.ilike.%${name}%,away_team.ilike.%${name}%`)
          .order("kickoff", { ascending: false })
          .limit(10),
        supabase
          .from("odds_snapshots")
          .select("*")
          .or(`home_team.ilike.%${name}%,away_team.ilike.%${name}%`)
          .order("captured_at", { ascending: false })
          .limit(10),
        supabase
          .from("validation_records")
          .select("*")
          .or(`home_team.ilike.%${name}%,away_team.ilike.%${name}%`)
          .order("kickoff", { ascending: false })
          .limit(10),
      ]);

      const teamResults = await Promise.all(teamQueries);
      for (let i = 0; i < teamResults.length; i++) {
        const data = teamResults[i].data || [];
        const type = i % 3; // 0=predictions, 1=odds, 2=validations
        if (type === 0) teamPredictions.push(...data);
        else if (type === 1) teamOdds.push(...data);
        else teamValidations.push(...data);
      }

      // Deduplicate by id
      const dedup = <T extends { id?: number; fixture_id?: number }>(arr: T[]): T[] => {
        const seen = new Set<string>();
        return arr.filter(item => {
          const key = `${item.id || item.fixture_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      teamPredictions = dedup(teamPredictions);
      teamOdds = dedup(teamOdds);
      teamValidations = dedup(teamValidations);
    }
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

  // Takım bazlı arama sonuçları
  let teamSection = "";
  if (teamPredictions.length > 0 || teamOdds.length > 0 || teamValidations.length > 0) {
    const teamPredText = teamPredictions.length > 0
      ? teamPredictions.map(p =>
          `• ${p.home_team} vs ${p.away_team} (${p.league}) [${p.kickoff}] → ${p.pick} @${p.odds} güven:%${p.confidence} EV:${p.expected_value} ${p.is_value_bet ? "[VALUE]" : ""} sonuç:${p.result || "bekliyor"}`
        ).join("\n")
      : "Tahmin bulunamadı.";
    const teamOddsText = teamOdds.length > 0
      ? teamOdds.map(o =>
          `• ${o.home_team} vs ${o.away_team} [${o.kickoff}] — MS1: ${o.home_odds} X: ${o.draw_odds} MS2: ${o.away_odds} (${o.captured_at})`
        ).join("\n")
      : "Oran verisi bulunamadı.";
    const teamValText = teamValidations.length > 0
      ? teamValidations.map(v =>
          `• ${v.home_team} vs ${v.away_team} [${v.kickoff}] → tahmin: ${v.pick} sonuç: ${v.result} skor: ${v.actual_score || "?"}`
        ).join("\n")
      : "Geçmiş kayıt bulunamadı.";
    teamSection = `

🔍 KULLANICININ SORDUĞU TAKIMLARA AİT VERİLER:

Tahminler:
${teamPredText}

Oranlar:
${teamOddsText}

Geçmiş Sonuçlar:
${teamValText}`;
  }

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
${teamSection}

KURALLAR:
- Önce "KULLANICININ SORDUĞU TAKIMLARA AİT VERİLER" bölümüne bak, orada varsa kullan
- Genel günlük verileri de kullanabilirsin
- Veritabanında gerçekten olmayan bilgiyi uydurma
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

  const lastMessage = messages[messages.length - 1];
  const systemContext = await buildSystemContext(lastMessage.content);
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

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
