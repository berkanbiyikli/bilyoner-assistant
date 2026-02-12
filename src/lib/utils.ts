import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercentage(value: number): string {
  return `%${value.toFixed(0)}`;
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 75) return "text-green-500";
  if (confidence >= 55) return "text-yellow-500";
  return "text-red-500";
}

export function confidenceBg(confidence: number): string {
  if (confidence >= 75) return "bg-green-500/10 border-green-500/20";
  if (confidence >= 55) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

export function statusBadge(status: string): { color: string; label: string } {
  switch (status) {
    case "won":
      return { color: "bg-green-500", label: "Kazandı" };
    case "lost":
      return { color: "bg-red-500", label: "Kaybetti" };
    case "pending":
      return { color: "bg-yellow-500", label: "Bekliyor" };
    case "void":
      return { color: "bg-gray-500", label: "İptal" };
    case "partial":
      return { color: "bg-orange-500", label: "Kısmi" };
    default:
      return { color: "bg-gray-500", label: status };
  }
}

export function calculateTotalOdds(items: { odds: number }[]): number {
  return items.reduce((acc, item) => acc * item.odds, 1);
}

export function calculateKellyStake(
  odds: number,
  probability: number,
  bankroll: number,
  fraction: number = 0.25 // quarter Kelly
): number {
  const q = 1 - probability;
  const b = odds - 1;
  const kelly = (b * probability - q) / b;
  if (kelly <= 0) return 0;
  return Math.round(bankroll * kelly * fraction);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getMatchDate(date: string): string {
  return new Date(date).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isMatchLive(status: string): boolean {
  return ["1H", "2H", "HT", "ET", "P", "BT", "LIVE"].includes(status);
}

export function isMatchFinished(status: string): boolean {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(status);
}
