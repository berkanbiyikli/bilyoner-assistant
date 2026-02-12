"use client";

import { useEffect, useState } from "react";
import { Gem, TrendingUp, ArrowUpRight } from "lucide-react";
import type { ValueBet } from "@/types";
import { cn, formatOdds, confidenceColor } from "@/lib/utils";

export default function ValueBetsPage() {
  const [valueBets, setValueBets] = useState<ValueBet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchValueBets = async () => {
      try {
        const res = await fetch("/api/value-bets");
        const data = await res.json();
        setValueBets(data.valueBets || []);
      } catch (error) {
        console.error("Value bet'ler yüklenemedi:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchValueBets();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gem className="h-6 w-6 text-yellow-500" />
          Value Bet Bulucu
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bahisçi oranlarını fair odds ile karşılaştırarak değerli bahisleri bul
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
      ) : valueBets.length > 0 ? (
        <div className="space-y-3">
          {valueBets.map((bet, i) => (
            <div
              key={`${bet.fixtureId}-${bet.pick}-${i}`}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{bet.league}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-500">
                  <ArrowUpRight className="h-3 w-3" />
                  +{bet.edge}% edge
                </span>
              </div>

              <div className="font-semibold text-sm mb-2">
                {bet.homeTeam} - {bet.awayTeam}
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Market: </span>
                  <span className="font-medium">{bet.market}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Tahmin: </span>
                  <span className="font-semibold text-primary">{bet.pick}</span>
                </div>
              </div>

              <div className="flex items-center gap-6 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Bahisçi: </span>
                  <span className="font-semibold">{formatOdds(bet.bookmakerOdds)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fair Odds: </span>
                  <span className="font-semibold">{formatOdds(bet.fairOdds)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Güven: </span>
                  <span className={cn("font-semibold", confidenceColor(bet.confidence))}>
                    %{bet.confidence}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Kelly: </span>
                  <span className="font-semibold">%{bet.kellyStake}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Gem className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Value Bet Bulunamadı</h3>
          <p className="text-sm text-muted-foreground">
            Şu anda yeterli edge sunan bahis bulunamadı.
          </p>
        </div>
      )}
    </div>
  );
}
