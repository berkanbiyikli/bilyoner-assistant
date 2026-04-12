// ============================================
// Gemini AI — Maç Başı Derinlemesine Analiz
// Her maç için AI tabanlı yorum ve öneri üretir
// ============================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIAnalysis, MatchAnalysis, MatchOdds, MonteCarloResult, KeyMissingPlayer } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODELS = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3-pro-preview"];

interface MatchDataForAI {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  analysis: MatchAnalysis;
  odds?: MatchOdds;
  simulation?: MonteCarloResult;
  injuries?: KeyMissingPlayer[];
  h2hGoalAvg?: number;
  topPick?: { type: string; confidence: number; odds: number; ev: number };
}

/**
 * Tek bir maç için Gemini AI analizi yap.
 * Structured JSON output döner.
 * ~2-3K input token, ~500 output token = maç başı ~$0.0004
 */
export async function analyzeMatchWithAI(data: MatchDataForAI): Promise<AIAnalysis | null> {
  const prompt = buildMatchPrompt(data);

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text) as AIAnalysis;

      // Validation
      if (!parsed.headline || !parsed.keyFactors || !parsed.recommendation) {
        console.warn(`[AI-MATCH] ${data.homeTeam} vs ${data.awayTeam}: Geçersiz AI response — eksik alanlar`);
        continue;
      }

      // Confidence adjustment clamp
      parsed.confidenceAdjustment = Math.max(-10, Math.min(10, parsed.confidenceAdjustment || 0));

      // keyFactors max 7
      if (parsed.keyFactors.length > 7) parsed.keyFactors = parsed.keyFactors.slice(0, 7);

      // scoringScenarios max 3
      if (parsed.scoringScenarios && parsed.scoringScenarios.length > 3) parsed.scoringScenarios = parsed.scoringScenarios.slice(0, 3);

      // matchTemperature validation
      const validTemps = ["low", "medium", "high", "explosive"];
      if (parsed.matchTemperature && !validTemps.includes(parsed.matchTemperature)) {
        parsed.matchTemperature = "medium";
      }

      return parsed;
    } catch (err) {
      const error = err as { status?: number; message?: string };
      if (error.status === 429) {
        console.warn(`[AI-MATCH] ${modelName} rate limit — sonraki model deneniyor`);
        continue;
      }
      console.error(`[AI-MATCH] ${modelName} hata:`, error.message || err);
      continue;
    }
  }

  console.warn(`[AI-MATCH] ${data.homeTeam} vs ${data.awayTeam}: Tüm modeller başarısız`);
  return null;
}

/**
 * Batch: Birden fazla maçı paralel analiz et (5 concurrent)
 */
export async function analyzeMatchesBatchWithAI(
  matches: MatchDataForAI[]
): Promise<Map<string, AIAnalysis>> {
  const results = new Map<string, AIAnalysis>();
  const batchSize = 5;

  for (let i = 0; i < matches.length; i += batchSize) {
    const batch = matches.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (m) => {
        const key = `${m.homeTeam} vs ${m.awayTeam}`;
        const analysis = await analyzeMatchWithAI(m);
        if (analysis) results.set(key, analysis);
      })
    );
    // Log failures
    for (const r of batchResults) {
      if (r.status === "rejected") {
        console.warn("[AI-MATCH-BATCH] Bir analiz başarısız:", r.reason);
      }
    }
  }

  return results;
}

function buildMatchPrompt(data: MatchDataForAI): string {
  const { homeTeam, awayTeam, league, analysis, odds, simulation, injuries, h2hGoalAvg, topPick } = data;

  const sim = simulation || analysis.simulation;

  // Compact stat summary
  const stats = [
    `Ev Form: ${analysis.homeForm}/100, Dep Form: ${analysis.awayForm}/100`,
    `Ev Atak: ${analysis.homeAttack}/100, Dep Atak: ${analysis.awayAttack}/100`,
    `Ev Savunma: ${analysis.homeDefense}/100, Dep Savunma: ${analysis.awayDefense}/100`,
    `H2H Avantaj: ${analysis.h2hAdvantage}`,
    analysis.homeXg ? `xG: Ev ${analysis.homeXg.toFixed(2)} - Dep ${analysis.awayXg?.toFixed(2)}` : null,
    h2hGoalAvg ? `H2H Gol Ort: ${h2hGoalAvg.toFixed(1)}` : null,
  ].filter(Boolean).join("\n");

  const simStats = sim ? [
    `MC Sim (${sim.simRuns} run): Ev %${sim.simHomeWinProb.toFixed(1)}, X %${sim.simDrawProb.toFixed(1)}, Dep %${sim.simAwayWinProb.toFixed(1)}`,
    `Ü2.5 %${sim.simOver25Prob.toFixed(1)}, KG Var %${sim.simBttsProb.toFixed(1)}`,
    sim.topScorelines?.length ? `En Olası Skorlar: ${sim.topScorelines.slice(0, 3).map(s => `${s.score} (%${s.probability.toFixed(1)})`).join(", ")}` : null,
  ].filter(Boolean).join("\n") : "Simülasyon verisi yok";

  const oddsInfo = odds ? `Oranlar: 1=${odds.home.toFixed(2)}, X=${odds.draw.toFixed(2)}, 2=${odds.away.toFixed(2)}, Ü2.5=${odds.over25.toFixed(2)}, KG+=${odds.bttsYes.toFixed(2)}` : "Oran verisi yok";

  const injuryInfo = injuries && injuries.length > 0
    ? `Eksikler: ${injuries.map(i => `${i.name} (${i.team === "home" ? "Ev" : "Dep"}, ${i.position}, ${i.impactLevel})`).join(", ")}`
    : "Önemli eksik yok";

  const topPickInfo = topPick
    ? `En İyi Pick: ${topPick.type} @${topPick.odds.toFixed(2)} (%${topPick.confidence} güven, EV ${(topPick.ev * 100).toFixed(1)}%)`
    : "";

  const refInfo = analysis.refereeProfile
    ? `Hakem: ${analysis.referee} (${analysis.refereeProfile.cardTendency}, ort ${analysis.refereeProfile.avgCardsPerMatch.toFixed(1)} kart/maç)`
    : "";

  return `Sen dünya çapında bir futbol analisti, bahis stratejisti ve veri bilimcisin. Derin, kapsamlı, profesyonel analizler üret. Türkçe cevap ver.

## Maç: ${homeTeam} vs ${awayTeam}
Lig: ${league}

## Temel İstatistikler
${stats}

## Monte Carlo Simülasyon
${simStats}

## Bahis Oranları
${oddsInfo}

## Sakatlıklar
${injuryInfo}
${refInfo}
${topPickInfo}

## Görev
Bu maçı derinlemesine analiz et. Profesyonel bir bahis analisti gibi düşün. Her veri noktasını yorumla, trendleri bul, rakamların arkasındaki hikayeyi anlat.

Aşağıdaki JSON formatında yanıt ver:

{
  "headline": "Maçı 1 güçlü cümlede özetle. Dikkat çekici, net, analitik. Örnek: 'Forest'ın çelik savunması Villa'nın atak gücünü söndürebilir — düşük tempolu maç bekleniyor'",
  "tacticalAnalysis": "2-3 cümlelik taktiksel analiz paragrafı. Takımların güçlü/zayıf yönlerini karşılaştır. Form, atak-savunma dengesi, ev sahibi avantajı, taktiksel uyum gibi konuları detaylı ele al. Verideki somut rakamları kullanarak yorumla.",
  "keyFactors": [
    "5-7 kritik faktör. Her biri detaylı bir cümle olsun. Rakamlarla destekle.",
    "Örnek: 'Ev sahibinin savunma puanı 67/100 ile ligin üst çeyreğinde — son maçlarda az gol yiyor'",
    "Örnek: 'xG farkı (1.20 vs 1.00) minimal — iki takım da aynı gol beklentisinde'",
    "Örnek: 'Simülasyon %39.3 olasılıkla Üst 2.5 gösteriyor — istatistiksel olarak düşük skorlu maç'",
    "Örnek: 'H2H gol ortalaması 3.4 — tarihsel olarak golcü seri ama güncel form aksini söylüyor'"
  ],
  "scoringScenarios": [
    "Senaryo 1: En olası — Açıklama ile birlikte (ör: '1-0 veya 0-0 — savunma odaklı iki takım')",
    "Senaryo 2: Alternatif — (ör: '2-1 — Villa'nın atak potansiyeli devreye girerse')",
    "Senaryo 3: Sürpriz — (ör: '0-2 — Forest savunması çökerse deplasman fırtınası')"
  ],
  "recommendation": "Net ve cesur tahmin önerisi. Neden bu pick'i seçtiğini 2-3 cümleyle açıkla. Sayısal dayanaklar sun. Örnek: 'Under 2.5 oyna — xG toplamı sadece 2.20, simülasyon %60.7 düşük skor gösteriyor, ev sahibi savunma puanı 67/100 ile maçı kontrol edecek.'",
  "valuePicks": [
    { "pick": "Under 2.5", "reasoning": "Sim %60.7, oran 1.85 ile gerçek olasılığa göre değerli" },
    { "pick": "1X", "reasoning": "Ev sahibi form 58/100 + simülasyon ev %41.2 + beraberlik %30.5 = toplam %71.7" }
  ],
  "matchTemperature": "low | medium | high | explosive — maçın beklenen temposunu belirle. low=düşük skorlu taktik mücadele, medium=dengeli, high=golcü, explosive=kaotik maç",
  "riskWarning": "Gerçek risk faktörleri varsa detaylıca açıkla. Hangi durumda tahmin ters gidebilir? Yoksa null.",
  "verdict": "2-3 cümlelik genel sonuç paragrafı. Tüm verileri bir araya getirip final kararını ver. Bu maça nasıl yaklaşılmalı? Hangi bahis stratejisi uygulanmalı?",
  "confidenceAdjustment": 0
}

Kurallar:
- Sadece verilen istatistiklere dayan, istatistik uydurmak YASAK
- Her faktörde somut rakam kullan (form puanı, xG, simülasyon olasılığı vb.)
- confidenceAdjustment: Motor güvenini ne kadar düzeltmeli? (-10 ile +10). 0 = değişiklik yok
- keyFactors minimum 5, maximum 7 eleman
- scoringScenarios tam 3 eleman
- valuePicks 1-3 eleman (en değerli bahisleri seç)
- matchTemperature: sadece "low", "medium", "high", "explosive" değerlerinden biri
- Belirsiz ifadeler kullanma: 'belki, olabilir, muhtemelen' YASAK — cesur ve net ol
- Türkçe yaz, akıcı ve profesyonel bir dil kullan`;
}
