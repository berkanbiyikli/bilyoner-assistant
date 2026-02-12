// ============================================
// Value Bet Finder
// Oran karşılaştırma ve edge hesaplama
// ============================================

import type { MatchPrediction, ValueBet } from "@/types";

export function findValueBets(predictions: MatchPrediction[]): ValueBet[] {
  const valueBets: ValueBet[] = [];

  for (const prediction of predictions) {
    if (!prediction.odds) continue;

    const markets = [
      {
        market: "Maç Sonucu",
        pick: "Ev Sahibi",
        probability: prediction.analysis.homeForm / 100,
        bookmakerOdds: prediction.odds.home,
      },
      {
        market: "Maç Sonucu",
        pick: "Berabere",
        probability: (100 - prediction.analysis.homeForm - prediction.analysis.awayForm) / 100,
        bookmakerOdds: prediction.odds.draw,
      },
      {
        market: "Maç Sonucu",
        pick: "Deplasman",
        probability: prediction.analysis.awayForm / 100,
        bookmakerOdds: prediction.odds.away,
      },
      {
        market: "Gol Sayısı",
        pick: "2.5 Üst",
        probability: ((prediction.analysis.homeAttack + prediction.analysis.awayAttack) / 200),
        bookmakerOdds: prediction.odds.over25,
      },
      {
        market: "Gol Sayısı",
        pick: "2.5 Alt",
        probability: ((prediction.analysis.homeDefense + prediction.analysis.awayDefense) / 200),
        bookmakerOdds: prediction.odds.under25,
      },
      {
        market: "Karşılıklı Gol",
        pick: "Var",
        probability: Math.min(0.8, (prediction.analysis.homeAttack + prediction.analysis.awayAttack) / 180),
        bookmakerOdds: prediction.odds.bttsYes,
      },
    ];

    for (const m of markets) {
      const fairOdds = 1 / m.probability;
      const edge = ((m.bookmakerOdds / fairOdds) - 1) * 100;

      if (edge > 5) { // %5'ten fazla edge varsa value bet
        const kellyFraction = (m.bookmakerOdds * m.probability - 1) / (m.bookmakerOdds - 1);

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
