// ============================================
// Coupon Builder
// Otomatik ve manuel kupon oluşturma
// ============================================

import type { MatchPrediction, Coupon, CouponItem, CouponCategory, Pick } from "@/types";
import { calculateTotalOdds } from "@/lib/utils";
import { applyStakeMultiplier, getDrawdownProtectionState, kellyBet } from "@/lib/bankroll";

interface CouponBuildOptions {
  category: CouponCategory;
  maxItems?: number;
  minConfidence?: number;
  minOdds?: number;
  maxOdds?: number;
  targetTotalOdds?: number;
  stake?: number;
  bankroll?: number;
  peakBankroll?: number;
  lossStreak?: number;
}

const CATEGORY_DEFAULTS: Record<CouponCategory, Partial<CouponBuildOptions>> = {
  safe: {
    maxItems: 3,
    minConfidence: 75,
    minOdds: 1.25,
    maxOdds: 1.70,
    targetTotalOdds: 3.5,
  },
  balanced: {
    maxItems: 4,
    minConfidence: 65,
    minOdds: 1.40,
    maxOdds: 2.20,
    targetTotalOdds: 8,
  },
  risky: {
    maxItems: 5,
    minConfidence: 58,
    minOdds: 1.60,
    maxOdds: 3.50,
    targetTotalOdds: 25,
  },
  value: {
    maxItems: 4,
    minConfidence: 62,
    minOdds: 1.50,
    maxOdds: 3.00,
    targetTotalOdds: 12,
  },
  custom: {
    maxItems: 10,
    minConfidence: 40,
    minOdds: 1.1,
    maxOdds: 10.0,
  },
  crazy: {
    maxItems: 5,
    minConfidence: 0,
    minOdds: 15.0,
    maxOdds: 201.0,
  },
};

export function buildCoupon(
  predictions: MatchPrediction[],
  options: CouponBuildOptions
): Coupon {
  const config = { ...CATEGORY_DEFAULTS[options.category], ...options };
  const baseStake = options.stake || 100;
  const bankroll = Math.max(100, options.bankroll ?? baseStake * 20);
  const peakBankroll = Math.max(bankroll, options.peakBankroll ?? bankroll);
  const lossStreak = Math.max(0, options.lossStreak ?? 0);
  const drawdownControl = getDrawdownProtectionState(bankroll, peakBankroll, lossStreak);

  let eligiblePicks: Array<{ prediction: MatchPrediction; pick: Pick }> = [];

  for (const prediction of predictions) {
    for (const pick of prediction.picks) {
      if (
        pick.confidence >= (config.minConfidence || 0) &&
        pick.odds >= (config.minOdds || 0) &&
        pick.odds <= (config.maxOdds || 100) &&
        (options.category !== "value" || pick.isValueBet)
      ) {
        eligiblePicks.push({ prediction, pick });
      }
    }
  }

  // Confidence + Expected Value hibrit skoruna göre sırala
  eligiblePicks.sort((a, b) => {
    // EV pozitif olanları öncelikle
    const aScore = a.pick.confidence + (a.pick.expectedValue > 0 ? a.pick.expectedValue * 50 : 0);
    const bScore = b.pick.confidence + (b.pick.expectedValue > 0 ? b.pick.expectedValue * 50 : 0);
    return bScore - aScore;
  });

  // Aynı maçtan birden fazla pick alma
  const selectedFixtures = new Set<number>();
  const selected: Array<{ prediction: MatchPrediction; pick: Pick }> = [];

  for (const item of eligiblePicks) {
    if (selected.length >= (config.maxItems || 10)) break;
    if (selectedFixtures.has(item.prediction.fixtureId)) continue;

    selectedFixtures.add(item.prediction.fixtureId);
    selected.push(item);

    // Target odds'a ulaştıysa dur
    const currentOdds = calculateTotalOdds(selected.map((s) => s.pick));
    if (config.targetTotalOdds && currentOdds >= config.targetTotalOdds) break;
  }

  const items: CouponItem[] = selected.map(({ prediction, pick }) => {
    const probability = Math.max(
      0.05,
      Math.min(0.92, pick.modelProbability ?? (pick.simProbability ? pick.simProbability / 100 : pick.confidence / 100))
    );
    const kelly = kellyBet(pick.odds, probability, bankroll, 0.25);
    const recommendedStake = applyStakeMultiplier(kelly.stake, drawdownControl.stakeMultiplier);

    return {
      fixtureId: prediction.fixtureId,
      homeTeam: prediction.homeTeam.name,
      awayTeam: prediction.awayTeam.name,
      league: prediction.league.name,
      kickoff: prediction.kickoff,
      pick: pick.type,
      odds: pick.odds,
      confidence: pick.confidence,
      kellyPercent: kelly.unitSize,
      recommendedStake,
      result: "pending",
    };
  });

  const totalOdds = calculateTotalOdds(items);
  const stake = drawdownControl.shouldPause ? 0 : applyStakeMultiplier(baseStake, drawdownControl.stakeMultiplier);

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    items,
    totalOdds: Math.round(totalOdds * 100) / 100,
    stake,
    potentialWin: Math.round(stake * totalOdds * 100) / 100,
    status: "pending",
    category: options.category,
  };
}

export function addToCoupon(
  coupon: Coupon,
  prediction: MatchPrediction,
  pick: Pick
): Coupon {
  // Aynı maç zaten varsa güncelle
  const existingIdx = coupon.items.findIndex((i) => i.fixtureId === prediction.fixtureId);

  const newItem: CouponItem = {
    fixtureId: prediction.fixtureId,
    homeTeam: prediction.homeTeam.name,
    awayTeam: prediction.awayTeam.name,
    league: prediction.league.name,
    kickoff: prediction.kickoff,
    pick: pick.type,
    odds: pick.odds,
    confidence: pick.confidence,
    kellyPercent: undefined,
    recommendedStake: undefined,
    result: "pending",
  };

  const newItems =
    existingIdx >= 0
      ? coupon.items.map((item, i) => (i === existingIdx ? newItem : item))
      : [...coupon.items, newItem];

  const totalOdds = calculateTotalOdds(newItems);

  return {
    ...coupon,
    items: newItems,
    totalOdds: Math.round(totalOdds * 100) / 100,
    potentialWin: Math.round(coupon.stake * totalOdds * 100) / 100,
  };
}

export function removeFromCoupon(coupon: Coupon, fixtureId: number): Coupon {
  const newItems = coupon.items.filter((i) => i.fixtureId !== fixtureId);
  const totalOdds = newItems.length > 0 ? calculateTotalOdds(newItems) : 0;

  return {
    ...coupon,
    items: newItems,
    totalOdds: Math.round(totalOdds * 100) / 100,
    potentialWin: Math.round(coupon.stake * totalOdds * 100) / 100,
  };
}

export function getCouponCategoryLabel(category: CouponCategory): string {
  const labels: Record<CouponCategory, string> = {
    safe: "🛡️ Güvenli",
    balanced: "⚖️ Dengeli",
    risky: "🔥 Riskli",
    value: "💎 Value",
    crazy: "🎲 Crazy Pick",
    custom: "✏️ Özel",
  };
  return labels[category];
}
