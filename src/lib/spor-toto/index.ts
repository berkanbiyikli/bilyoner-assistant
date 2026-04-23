// ============================================
// Spor Toto Module - Public API
// ============================================

export { buildTotoBulletin, buildBulletinSummary, getForeignCandidates } from "./bulletin";
export type { ForeignCandidate } from "./bulletin";
export { buildSporTotoCoupons, buildBudgetCoupon } from "./coupon-builder";
export type { SporTotoCoupon, CouponMatchPick, SelectionMode, CouponStrategy } from "./coupon-builder";
