// ============================================
// Value Bet Finder
// Oran karşılaştırma ve edge hesaplama
// ============================================

import type { MatchPrediction, ValueBet } from "@/types";

export function findValueBets(predictions: MatchPrediction[]): ValueBet[] {
  const valueBets: ValueBet[] = [];

  for (const prediction of predictions) {
    if (!prediction.odds) continue;

    // Gerçek olasılıkları kullan (prediction engine'den normalize edilmiş)
    const homeProb = prediction.analysis.homeForm / 100;
    const awayProb = prediction.analysis.awayForm / 100;
    const drawProb = (prediction.analysis.drawProb ?? (100 - prediction.analysis.homeForm - prediction.analysis.awayForm)) / 100;

    // Gol olasılıkları — hücum/savunma dengesinden türetilmiş
    const avgAttack = (prediction.analysis.homeAttack + prediction.analysis.awayAttack) / 2;
    const avgDefense = (prediction.analysis.homeDefense + prediction.analysis.awayDefense) / 2;
    const goalIndicator = avgAttack - avgDefense;

    // Üst/Alt olasılıklar daha mantıklı hesaplansın
    const overProb = Math.max(0.2, Math.min(0.75, 0.45 + goalIndicator / 100));
    const underProb = 1 - overProb;

    // KG olasılığı
    const bttsProb = Math.max(0.2, Math.min(0.75,
      (prediction.analysis.homeAttack > 55 && prediction.analysis.awayAttack > 55)
        ? ((prediction.analysis.homeAttack + prediction.analysis.awayAttack) / 200) * 0.85
        : 0.35
    ));

    const markets = [
      {
        market: "Maç Sonucu",
        pick: "Ev Sahibi",
        probability: homeProb,
        bookmakerOdds: prediction.odds.home,
      },
      {
        market: "Maç Sonucu",
        pick: "Berabere",
        probability: drawProb,
        bookmakerOdds: prediction.odds.draw,
      },
      {
        market: "Maç Sonucu",
        pick: "Deplasman",
        probability: awayProb,
        bookmakerOdds: prediction.odds.away,
      },
      {
        market: "Gol Sayısı",
        pick: "2.5 Üst",
        probability: overProb,
        bookmakerOdds: prediction.odds.over25,
      },
      {
        market: "Gol Sayısı",
        pick: "2.5 Alt",
        probability: underProb,
        bookmakerOdds: prediction.odds.under25,
      },
      {
        market: "Karşılıklı Gol",
        pick: "Var",
        probability: bttsProb,
        bookmakerOdds: prediction.odds.bttsYes,
      },
    ];

    // Korner & Kart pazarları devre dışı — sentetik veri güvenilir değil

    for (const m of markets) {
      if (m.probability <= 0.05 || m.probability >= 0.95) continue; // Saçma olasılıkları atla

      const fairOdds = 1 / m.probability;
      let edge = ((m.bookmakerOdds / fairOdds) - 1) * 100;

      // --- H2H Benzerlik Filtresi ---
      // Benzerlik skoru yüksek ve sonuç mevcut pick ile çelişiyorsa → value bet olarak ekleme
      const similarity = prediction.analysis.similarity;
      if (similarity && similarity.similarityScore > 70) {
        const simResultLower = similarity.result.toLowerCase();
        const isConflict =
          (m.market === "Gol Sayısı" && m.pick === "2.5 Üst" && simResultLower.includes("alt")) ||
          (m.market === "Gol Sayısı" && m.pick === "2.5 Alt" && simResultLower.includes("üst")) ||
          (m.market === "Karşılıklı Gol" && m.pick === "Var" && simResultLower.includes("yok")) ||
          (m.market === "Karşılıklı Gol" && m.pick === "Yok" && simResultLower.includes("var"));

        if (isConflict) continue; // Çelişen pick'i value bet olarak ekleme
      }

      // --- Hakem Filtresi (Kart pazarları) ---
      const refProfile = prediction.analysis.refereeProfile;
      if (refProfile && m.market === "Kart 3.5") {
        if (m.pick === "Üst" && refProfile.cardTendency === "lenient") {
          edge -= 5; // Cimri hakem Üst edge'i düşür
        }
        if (m.pick === "Alt" && refProfile.cardTendency === "strict") {
          edge -= 5; // Kartçı hakem Alt edge'i düşür
        }
      }

      if (edge > 8) { // %8'den fazla edge varsa value bet (daha sıkı filtre)
        const kellyFraction = (m.bookmakerOdds * m.probability - 1) / (m.bookmakerOdds - 1);

        // Kelly çok yüksekse şüpheli — muhtemelen olasılık hesabı yanlış
        if (kellyFraction > 0.5) continue;

        valueBets.push({
          fixtureId: prediction.fixtureId,
          homeTeam: prediction.homeTeam.name,
          awayTeam: prediction.awayTeam.name,
          league: prediction.league.name,
          kickoff: prediction.kickoff,
          market: m.market,
          pick: m.pick,
          bookmakerOdds: m.bookmakerOdds,
          fairOdds: Math.round(fairOdds * 100) / 100,
          edge: Math.round(edge * 10) / 10,
          confidence: Math.round(m.probability * 100),
          kellyStake: Math.max(0, Math.round(kellyFraction * 100 * 10) / 10),
        });
      }
    }
  }

  return valueBets.sort((a, b) => b.edge - a.edge);
}
