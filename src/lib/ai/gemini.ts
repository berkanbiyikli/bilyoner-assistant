// ============================================
// Gemini AI Entegrasyonu
// Oran analizi, hareket yorumu, akıllı öneriler
// ============================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCached, setCache } from "@/lib/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL_NAME = "gemini-2.0-flash";

interface OddsMovement {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  market: string;
  openingOdds: number;
  currentOdds: number;
  change: number;       // yüzde değişim
  direction: "up" | "down" | "stable";
  timestamp: string;
}

interface GeminiAnalysis {
  summary: string;
  keyMovements: Array<{
    match: string;
    market: string;
    interpretation: string;
    signal: "positive" | "negative" | "neutral";
    confidence: number;
  }>;
  recommendations: string[];
  marketSentiment: string;
  timestamp: string;
}

/**
 * Gemini'ye oran hareketlerini analiz ettir
 */
export async function analyzeOddsMovements(
  movements: OddsMovement[]
): Promise<GeminiAnalysis> {
  const cacheKey = `gemini:odds-analysis:${new Date().toISOString().split("T")[0]}:${movements.length}`;
  const cached = getCached<GeminiAnalysis>(cacheKey);
  if (cached) return cached;

  if (!process.env.GEMINI_API_KEY) {
    return createFallbackAnalysis(movements);
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = buildOddsAnalysisPrompt(movements);

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text) as GeminiAnalysis;
    parsed.timestamp = new Date().toISOString();

    setCache(cacheKey, parsed, 1800); // 30 dk cache
    return parsed;
  } catch (error) {
    console.error("[GEMINI] Oran analizi hatası:", error);
    return createFallbackAnalysis(movements);
  }
}

/**
 * Gemini'ye tek maç detaylı analiz yaptır
 */
export async function analyzeMatchWithAI(matchData: {
  homeTeam: string;
  awayTeam: string;
  league: string;
  odds: { home: number; draw: number; away: number; over25: number; under25: number; bttsYes: number; bttsNo: number };
  oddsHistory?: Array<{ timestamp: string; home: number; draw: number; away: number }>;
  homeForm: string;
  awayForm: string;
  h2hSummary: string;
  confidence: number;
  picks: Array<{ type: string; odds: number; confidence: number }>;
  injuries?: string;
}): Promise<{ analysis: string; recommendation: string; riskLevel: string }> {
  const cacheKey = `gemini:match:${matchData.homeTeam}-${matchData.awayTeam}`;
  const cached = getCached<{ analysis: string; recommendation: string; riskLevel: string }>(cacheKey);
  if (cached) return cached;

  if (!process.env.GEMINI_API_KEY) {
    return {
      analysis: "Gemini API key tanımlı değil.",
      recommendation: "Sistem tahminlerine güvenin.",
      riskLevel: "unknown",
    };
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `Sen profesyonel bir futbol bahis analistisin. Aşağıdaki maç verisini Türkçe analiz et.

MAÇ: ${matchData.homeTeam} vs ${matchData.awayTeam}
LİG: ${matchData.league}
ORANLAR: MS1: ${matchData.odds.home} | Beraberlik: ${matchData.odds.draw} | MS2: ${matchData.odds.away}
Üst 2.5: ${matchData.odds.over25} | Alt 2.5: ${matchData.odds.under25}
KG Var: ${matchData.odds.bttsYes} | KG Yok: ${matchData.odds.bttsNo}
${matchData.oddsHistory ? `ORAN GEÇMİŞİ (açılış→güncel): ${JSON.stringify(matchData.oddsHistory)}` : ""}
EV SAHİBİ FORM: ${matchData.homeForm}
DEPLASMAN FORM: ${matchData.awayForm}
H2H: ${matchData.h2hSummary}
${matchData.injuries ? `SAKATLIKLAR: ${matchData.injuries}` : ""}
SİSTEM GÜVEN: %${matchData.confidence}
SİSTEM TAHMİNLERİ: ${matchData.picks.map(p => `${p.type} @${p.odds} (%${p.confidence})`).join(", ")}

JSON formatında yanıt ver:
{
  "analysis": "3-4 cümlelik detaylı maç analizi",
  "recommendation": "Net önerim: hangi bahis ve neden",
  "riskLevel": "low|medium|high"
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);
    setCache(cacheKey, parsed, 3600);
    return parsed;
  } catch (error) {
    console.error("[GEMINI] Maç analizi hatası:", error);
    return {
      analysis: "AI analizi şu an kullanılamıyor.",
      recommendation: "Sistem tahminlerine güvenin.",
      riskLevel: "unknown",
    };
  }
}

/**
 * Gemini'ye kupon analizi yaptır
 */
export async function analyzeCouponWithAI(couponData: {
  items: Array<{
    homeTeam: string;
    awayTeam: string;
    league: string;
    pick: string;
    odds: number;
    confidence: number;
  }>;
  totalOdds: number;
  category: string;
}): Promise<{ verdict: string; weakestLink: string; suggestion: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      verdict: "AI analizi kullanılamıyor.",
      weakestLink: "-",
      suggestion: "Sistem güven oranlarını kontrol edin.",
    };
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const matchList = couponData.items.map(
    (item, i) => `${i + 1}. ${item.homeTeam} vs ${item.awayTeam} (${item.league}) → ${item.pick} @${item.odds} [%${item.confidence}]`
  ).join("\n");

  const prompt = `Sen bir bahis kupon analistisin. Bu kuponu Türkçe değerlendir.

KUPON (${couponData.category}):
${matchList}

TOPLAM ORAN: ${couponData.totalOdds.toFixed(2)}

JSON formatında yanıt ver:
{
  "verdict": "Kuponun genel değerlendirmesi (2-3 cümle)",
  "weakestLink": "En zayıf halka hangi maç ve neden",
  "suggestion": "İyileştirme önerisi"
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("[GEMINI] Kupon analizi hatası:", error);
    return {
      verdict: "AI analizi şu an kullanılamıyor.",
      weakestLink: "-",
      suggestion: "Sistem güven oranlarını kontrol edin.",
    };
  }
}

// ============================================
// Oran Analizi Prompt Builder
// ============================================

function buildOddsAnalysisPrompt(movements: OddsMovement[]): string {
  const significantMoves = movements.filter(m => Math.abs(m.change) > 3);
  const steams = movements.filter(m => m.change < -8); // Sharp düşüşler

  const movementList = significantMoves.slice(0, 20).map(m =>
    `• ${m.homeTeam} vs ${m.awayTeam} | ${m.market}: ${m.openingOdds.toFixed(2)} → ${m.currentOdds.toFixed(2)} (${m.change > 0 ? "+" : ""}${m.change.toFixed(1)}%)`
  ).join("\n");

  return `Sen profesyonel bir oran analisti sin. Aşağıdaki oran hareketlerini Türkçe olarak analiz et.

BUGÜNKÜ ORAN HAREKETLERİ (${movements.length} maç tarandı, ${significantMoves.length} anlamlı hareket):

${movementList}

${steams.length > 0 ? `⚡ STEAM MOVES (keskin düşüş): ${steams.map(s => `${s.homeTeam} vs ${s.awayTeam} ${s.market}`).join(", ")}` : ""}

JSON formatında yanıt ver:
{
  "summary": "Bugünkü oran hareketlerinin genel özeti (3-4 cümle Türkçe)",
  "keyMovements": [
    {
      "match": "Takım A vs Takım B",
      "market": "MS1 / Over 2.5 / etc",
      "interpretation": "Bu oran değişimi ne anlama geliyor",
      "signal": "positive | negative | neutral",
      "confidence": 0-100
    }
  ],
  "recommendations": ["Öneri 1", "Öneri 2"],
  "marketSentiment": "Genel piyasa eğilimi özeti"
}`;
}

/**
 * Gemini API yoksa fallback analiz
 */
function createFallbackAnalysis(movements: OddsMovement[]): GeminiAnalysis {
  const significant = movements.filter(m => Math.abs(m.change) > 5);
  const steams = movements.filter(m => m.change < -8);

  return {
    summary: `Bugün ${movements.length} maçta oran takibi yapıldı. ${significant.length} anlamlı hareket tespit edildi. ${steams.length > 0 ? `${steams.length} steam move (keskin düşüş) mevcut.` : "Keskin hareket yok."}`,
    keyMovements: significant.slice(0, 5).map(m => ({
      match: `${m.homeTeam} vs ${m.awayTeam}`,
      market: m.market,
      interpretation: m.change < -5
        ? "Oran düşüyor — para bu yöne giriyor, piyasa bu sonucu bekliyor."
        : "Oran yükseliyor — para tersi yöne gidiyor.",
      signal: m.change < -5 ? "positive" as const : m.change > 5 ? "negative" as const : "neutral" as const,
      confidence: Math.min(80, Math.abs(m.change) * 5),
    })),
    recommendations: steams.length > 0
      ? steams.map(s => `${s.homeTeam} vs ${s.awayTeam}: ${s.market} oranı keskin düşüşte, takip edin.`)
      : ["Bugün belirgin steam move yok, sistem tahminlerine güvenin."],
    marketSentiment: steams.length >= 3
      ? "Piyasada yoğun aktivite var, sharp money birkaç maça giriyor."
      : "Piyasa nispeten sakin, büyük sürpriz beklentisi düşük.",
    timestamp: new Date().toISOString(),
  };
}
