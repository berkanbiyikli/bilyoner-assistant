"use client";

import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  PlusCircle,
} from "lucide-react";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import type { BankrollStats } from "@/types";

export default function BankrollPage() {
  const [stats] = useState<BankrollStats>({
    totalDeposit: 0,
    totalWithdrawal: 0,
    totalBets: 0,
    totalWins: 0,
    currentBalance: 0,
    roi: 0,
    winRate: 0,
    streak: { current: 0, type: "win", best: 0 },
  });

  const [deposit, setDeposit] = useState("");

  const handleDeposit = async () => {
    // TODO: Supabase'e kaydet
    setDeposit("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Bankroll Yönetimi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Para yönetimi, Kelly criterion ve performans takibi
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Bakiye"
          value={formatCurrency(stats.currentBalance)}
          icon={<DollarSign className="h-4 w-4" />}
          color="text-primary"
        />
        <StatCard
          label="ROI"
          value={formatPercentage(stats.roi)}
          icon={<TrendingUp className="h-4 w-4" />}
          color={stats.roi >= 0 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          label="Kazanma Oranı"
          value={formatPercentage(stats.winRate)}
          icon={<Target className="h-4 w-4" />}
          color="text-yellow-500"
        />
        <StatCard
          label="Seri"
          value={`${stats.streak.current} ${stats.streak.type === "win" ? "W" : "L"}`}
          icon={stats.streak.type === "win" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={stats.streak.type === "win" ? "text-green-500" : "text-red-500"}
        />
      </div>

      {/* Deposit */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <PlusCircle className="h-4 w-4 text-primary" />
          Para Yatır
        </h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="Miktar (₺)"
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={handleDeposit}
            disabled={!deposit || Number(deposit) <= 0}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Yatır
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-4">İşlem Geçmişi</h2>
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            Henüz işlem geçmişi bulunmuyor. Bakiye yatırarak başlayın.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={cn("text-xl font-bold", color)}>{value}</div>
    </div>
  );
}
