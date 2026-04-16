// ============================================
// Bankroll Manager
// Para yönetimi ve Kelly Criterion
// ============================================

import type { BankrollEntry, BankrollStats } from "@/types";

export interface DrawdownProtectionState {
  drawdownPercent: number;
  stakeMultiplier: number;
  shouldPause: boolean;
  reason: string;
}

export function calculateBankrollStats(entries: BankrollEntry[]): BankrollStats {
  const deposits = entries.filter((e) => e.type === "deposit");
  const withdrawals = entries.filter((e) => e.type === "withdrawal");
  const bets = entries.filter((e) => e.type === "bet");
  const wins = entries.filter((e) => e.type === "win");

  const totalDeposit = deposits.reduce((sum, e) => sum + e.amount, 0);
  const totalWithdrawal = withdrawals.reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const totalBets = bets.reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const totalWins = wins.reduce((sum, e) => sum + e.amount, 0);

  const currentBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;
  const roi = totalBets > 0 ? ((totalWins - totalBets) / totalBets) * 100 : 0;
  const winRate = bets.length > 0 ? (wins.length / bets.length) * 100 : 0;

  // Streak hesaplama
  const streak = calculateStreak(entries);

  return {
    totalDeposit,
    totalWithdrawal,
    totalBets,
    totalWins,
    currentBalance,
    roi: Math.round(roi * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    streak,
  };
}

function calculateStreak(entries: BankrollEntry[]): { current: number; type: "win" | "loss"; best: number } {
  const results = entries.filter((e) => e.type === "bet" || e.type === "win");

  let currentStreak = 0;
  let currentType: "win" | "loss" = "win";
  let bestStreak = 0;

  for (let i = results.length - 1; i >= 0; i--) {
    const entry = results[i];
    const isWin = entry.type === "win";

    if (i === results.length - 1) {
      currentType = isWin ? "win" : "loss";
      currentStreak = 1;
    } else if ((isWin && currentType === "win") || (!isWin && currentType === "loss")) {
      currentStreak++;
    } else {
      break;
    }

    if (currentType === "win") {
      bestStreak = Math.max(bestStreak, currentStreak);
    }
  }

  return { current: currentStreak, type: currentType, best: bestStreak };
}

export function kellyBet(
  odds: number,
  probability: number,
  bankroll: number,
  fraction: number = 0.25
): { stake: number; unitSize: number; recommendation: string } {
  if (odds <= 1 || probability <= 0 || probability >= 1 || bankroll <= 0) {
    return {
      stake: 0,
      unitSize: 0,
      recommendation: "❌ Geçersiz parametreler — bahis hesaplanamadı",
    };
  }

  const b = odds - 1;
  const q = 1 - probability;
  const kelly = (b * probability - q) / b;

  if (kelly <= 0) {
    return {
      stake: 0,
      unitSize: 0,
      recommendation: "❌ Bu bahis değer sunmuyor, geç",
    };
  }

  const stake = Math.max(0, Math.round(bankroll * kelly * fraction));
  const unitSize = Math.round((kelly * fraction) * 100 * 10) / 10;

  let recommendation: string;
  if (kelly > 0.2) {
    recommendation = "🟢 Güçlü value — tam birim oyna";
  } else if (kelly > 0.1) {
    recommendation = "🟡 Makul value — yarım birim oyna";
  } else if (kelly > 0.05) {
    recommendation = "🟠 Düşük value — çeyrek birim oyna";
  } else {
    recommendation = "🔴 Çok düşük value — minimum oyna veya geç";
  }

  return { stake, unitSize, recommendation };
}

export function getDrawdownProtectionState(
  currentBankroll: number,
  peakBankroll: number,
  lossStreak: number
): DrawdownProtectionState {
  if (peakBankroll <= 0 || currentBankroll <= 0) {
    return {
      drawdownPercent: 0,
      stakeMultiplier: 1,
      shouldPause: false,
      reason: "Yeterli bankroll geçmişi yok",
    };
  }

  const drawdownPercent = Math.max(0, ((peakBankroll - currentBankroll) / peakBankroll) * 100);

  if (drawdownPercent >= 25 || lossStreak >= 6) {
    return {
      drawdownPercent: Math.round(drawdownPercent * 10) / 10,
      stakeMultiplier: 0,
      shouldPause: true,
      reason: "Kritik drawdown/loss streak — bahisleri durdur",
    };
  }

  if (drawdownPercent >= 15 || lossStreak >= 4) {
    return {
      drawdownPercent: Math.round(drawdownPercent * 10) / 10,
      stakeMultiplier: 0.25,
      shouldPause: false,
      reason: "Yuksek risk modu — stake %75 azalt",
    };
  }

  if (drawdownPercent >= 10 || lossStreak >= 3) {
    return {
      drawdownPercent: Math.round(drawdownPercent * 10) / 10,
      stakeMultiplier: 0.5,
      shouldPause: false,
      reason: "Koruma modu — stake %50 azalt",
    };
  }

  return {
    drawdownPercent: Math.round(drawdownPercent * 10) / 10,
    stakeMultiplier: 1,
    shouldPause: false,
    reason: "Normal risk modu",
  };
}

export function applyStakeMultiplier(stake: number, multiplier: number): number {
  return Math.max(0, Math.round(stake * Math.max(0, multiplier)));
}

export function calculateDailyBudget(
  bankroll: number,
  riskLevel: "conservative" | "moderate" | "aggressive"
): number {
  const multipliers = {
    conservative: 0.02,
    moderate: 0.05,
    aggressive: 0.1,
  };
  return Math.round(bankroll * multipliers[riskLevel]);
}
