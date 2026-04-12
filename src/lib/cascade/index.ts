// ============================================
// Cascade Strategy Engine — Kademeli Bahis
// Saat bazlı zaman dilimlerine göre maçları grupla,
// her dilimde en iyi pick'leri seç, kazancı sonraki dilime aktar
// ============================================

import type {
  MatchPrediction,
  CascadeStrategy,
  CascadeTimeSlot,
  CascadePickItem,
  CascadeRiskLevel,
} from "@/types";

// Zaman dilimleri tanımı
const TIME_SLOTS = [
  { label: "Sabah", startHour: 10, endHour: 13 },
  { label: "Öğlen", startHour: 13, endHour: 16 },
  { label: "Akşamüstü", startHour: 16, endHour: 19 },
  { label: "Gece", startHour: 19, endHour: 22 },
  { label: "Geç Gece", startHour: 22, endHour: 26 }, // 26 = next day 02:00
] as const;

// Risk seviyesi konfigürasyonu
const RISK_CONFIG: Record<CascadeRiskLevel, {
  maxPicksPerSlot: number;
  minConfidence: number;
  minOdds: number;
  maxOdds: number;
  targetSlotOdds: number; // Dilim başı hedef combined odds
}> = {
  safe: {
    maxPicksPerSlot: 2,
    minConfidence: 65,
    minOdds: 1.25,
    maxOdds: 1.80,
    targetSlotOdds: 2.5,
  },
  balanced: {
    maxPicksPerSlot: 3,
    minConfidence: 55,
    minOdds: 1.35,
    maxOdds: 2.50,
    targetSlotOdds: 5.0,
  },
  risky: {
    maxPicksPerSlot: 3,
    minConfidence: 45,
    minOdds: 1.50,
    maxOdds: 3.50,
    targetSlotOdds: 10.0,
  },
};

/**
 * Pick scoring — cascade seçimi için picks'i sırala 
 * Yüksek confidence + pozitif EV + value bet bonus
 */
function scorePick(pick: MatchPrediction["picks"][0]): number {
  const confScore = pick.confidence;
  const evBonus = pick.expectedValue > 0 ? pick.expectedValue * 30 : 0;
  const valueBonus = pick.isValueBet ? 8 : 0;
  const simBonus = (pick.simProbability || 0) > 60 ? 5 : 0;
  return confScore + evBonus + valueBonus + simBonus;
}

/**
 * Maçları zaman dilimlerine grupla
 */
function groupByTimeSlot(predictions: MatchPrediction[]): Map<number, MatchPrediction[]> {
  const groups = new Map<number, MatchPrediction[]>();

  for (const pred of predictions) {
    const kickoff = new Date(pred.kickoff);
    let hour = kickoff.getHours() + kickoff.getMinutes() / 60;
    // Gece yarısından sonraki maçlar (0-2 arası) = 24-26 olarak ele al
    if (hour < 4) hour += 24;

    const slotIndex = TIME_SLOTS.findIndex(s => hour >= s.startHour && hour < s.endHour);
    if (slotIndex === -1) continue; // 04:00-10:00 arası maç yok

    if (!groups.has(slotIndex)) groups.set(slotIndex, []);
    groups.get(slotIndex)!.push(pred);
  }

  return groups;
}

/**
 * Bir zaman dilimi için en iyi pick'leri seç
 */
function selectBestPicks(
  predictions: MatchPrediction[],
  config: typeof RISK_CONFIG[CascadeRiskLevel]
): CascadePickItem[] {
  // Her maçın en iyi uygun pick'ini bul
  const candidates: { pred: MatchPrediction; pick: MatchPrediction["picks"][0]; score: number }[] = [];

  for (const pred of predictions) {
    for (const pick of pred.picks) {
      if (pick.confidence < config.minConfidence) continue;
      if (pick.odds < config.minOdds || pick.odds > config.maxOdds) continue;

      candidates.push({
        pred,
        pick,
        score: scorePick(pick),
      });
    }
  }

  // Score'a göre sırala
  candidates.sort((a, b) => b.score - a.score);

  // Unique fixture, max picks per slot
  const selected: CascadePickItem[] = [];
  const usedFixtures = new Set<number>();

  for (const c of candidates) {
    if (usedFixtures.has(c.pred.fixtureId)) continue;
    usedFixtures.add(c.pred.fixtureId);

    selected.push({
      fixtureId: c.pred.fixtureId,
      homeTeam: c.pred.homeTeam.name,
      awayTeam: c.pred.awayTeam.name,
      league: c.pred.league.name,
      leagueFlag: c.pred.league.flag || undefined,
      kickoff: c.pred.kickoff,
      pick: c.pick.type,
      odds: c.pick.odds,
      confidence: c.pick.confidence,
      simProbability: c.pick.simProbability,
      isValueBet: c.pick.isValueBet,
      aiHeadline: c.pred.aiAnalysis?.headline,
    });

    if (selected.length >= config.maxPicksPerSlot) break;
  }

  return selected;
}

/**
 * Ana cascade strateji fonksiyonu
 * Tüm tahminlerden risk seviyesine göre kademeli strateji oluştur
 */
export function buildCascadeStrategy(
  predictions: MatchPrediction[],
  riskLevel: CascadeRiskLevel = "balanced",
  initialStake: number = 100
): CascadeStrategy {
  const config = RISK_CONFIG[riskLevel];
  const grouped = groupByTimeSlot(predictions);

  const timeSlots: CascadeTimeSlot[] = [];
  const cascadeReturns: number[] = [];
  let runningAmount = initialStake;

  // Kronolojik sırayla zaman dilimlerini işle
  const sortedSlotIndices = Array.from(grouped.keys()).sort((a, b) => a - b);

  for (const slotIndex of sortedSlotIndices) {
    const slotPredictions = grouped.get(slotIndex)!;
    const slotDef = TIME_SLOTS[slotIndex];
    const picks = selectBestPicks(slotPredictions, config);

    if (picks.length === 0) continue;

    const combinedOdds = picks.reduce((acc, p) => acc * p.odds, 1);
    // Win probability: her pick'in bağımsız olasılığını çarp
    const winProbability = picks.reduce((acc, p) => {
      const prob = (p.simProbability || p.confidence) / 100;
      return acc * prob;
    }, 1) * 100;

    const timeLabel = `${String(slotDef.startHour % 24).padStart(2, "0")}:00 - ${String(slotDef.endHour % 24).padStart(2, "0")}:00`;

    timeSlots.push({
      label: timeLabel,
      startHour: slotDef.startHour,
      endHour: slotDef.endHour,
      picks,
      combinedOdds: Math.round(combinedOdds * 100) / 100,
      winProbability: Math.round(winProbability * 10) / 10,
    });

    // Cascade hesabı: bu dilim kazanırsa ne kadar olur?
    runningAmount = Math.round(runningAmount * combinedOdds * 100) / 100;
    cascadeReturns.push(runningAmount);
  }

  const totalCombinedOdds = timeSlots.reduce((acc, s) => acc * s.combinedOdds, 1);
  const overallWinProbability = timeSlots.reduce((acc, s) => acc * (s.winProbability / 100), 1) * 100;

  return {
    riskLevel,
    timeSlots,
    initialStake,
    cascadeReturns,
    totalPotentialReturn: Math.round(initialStake * totalCombinedOdds * 100) / 100,
    totalCombinedOdds: Math.round(totalCombinedOdds * 100) / 100,
    overallWinProbability: Math.round(overallWinProbability * 10) / 10,
  };
}

/**
 * 3 risk seviyesi için cascade stratejileri oluştur
 */
export function buildAllCascadeStrategies(
  predictions: MatchPrediction[],
  initialStake: number = 100
): Record<CascadeRiskLevel, CascadeStrategy> {
  return {
    safe: buildCascadeStrategy(predictions, "safe", initialStake),
    balanced: buildCascadeStrategy(predictions, "balanced", initialStake),
    risky: buildCascadeStrategy(predictions, "risky", initialStake),
  };
}
