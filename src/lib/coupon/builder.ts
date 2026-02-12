// ============================================
// Coupon Builder
// Otomatik ve manuel kupon oluşturma
// ============================================

import type { MatchPrediction, Coupon, CouponItem, CouponCategory, Pick } from "@/types";
import { calculateTotalOdds } from "@/lib/utils";

interface CouponBuildOptions {
  category: CouponCategory;
  maxItems?: number;
  minConfidence?: number;
  minOdds?: number;
  maxOdds?: number;
  targetTotalOdds?: number;
  stake?: number;
}

const CATEGORY_DEFAULTS: Record<CouponCategory, Partial<CouponBuildOptions>> = {
  safe: {
    maxItems: 3,
    minConfidence: 70,
    minOdds: 1.2,
    maxOdds: 1.8,
    targetTotalOdds: 4,
  },
  balanced: {
    maxItems: 5,
    minConfidence: 55,
    minOdds: 1.4,
    maxOdds: 2.5,
    targetTotalOdds: 10,
  },
  risky: {
    maxItems: 7,
    minConfidence: 40,
    minOdds: 1.8,
    maxOdds: 5.0,
    targetTotalOdds: 50,
  },
  value: {
    maxItems: 5,
    minConfidence: 45,
    minOdds: 1.5,
    maxOdds: 4.0,
    targetTotalOdds: 15,
  },
  custom: {
    maxItems: 10,
    minConfidence: 30,
    minOdds: 1.1,
    maxOdds: 10.0,
  },
};

export function buildCoupon(
  predictions: MatchPrediction[],
  options: CouponBuildOptions
): Coupon {
  const config = { ...CATEGORY_DEFAULTS[options.category], ...options };

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

  // En yüksek confidence'a göre sırala
  eligiblePicks.sort((a, b) => b.pick.confidence - a.pick.confidence);

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

  const items: CouponItem[] = selected.map(({ prediction, pick }) => ({
    fixtureId: prediction.fixtureId,
    homeTeam: prediction.homeTeam.name,
    awayTeam: prediction.awayTeam.name,
    league: prediction.league.name,
    kickoff: prediction.kickoff,
    pick: pick.type,
    odds: pick.odds,
    confidence: pick.confidence,
    result: "pending",
  }));

  const totalOdds = calculateTotalOdds(items);
  const stake = options.stake || 100;

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
    custom: "✏️ Özel",
  };
  return labels[category];
}
