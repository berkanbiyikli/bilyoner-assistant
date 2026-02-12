"use client";

import { useAppStore } from "@/lib/store";
import { cn, formatOdds, formatCurrency, calculateTotalOdds } from "@/lib/utils";
import { Ticket, Trash2, X, ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CouponSidebar() {
  const { activeCoupon, couponStake, setCouponStake, removeFromCoupon, clearCoupon } =
    useAppStore();
  const [open, setOpen] = useState(false);

  const totalOdds = activeCoupon.length > 0 ? calculateTotalOdds(activeCoupon) : 0;
  const potentialWin = couponStake * totalOdds;

  const handleSave = async () => {
    toast.success("Kupon kaydedildi!");
    // TODO: Supabase'e kaydet
  };

  if (activeCoupon.length === 0) return null;

  return (
    <>
      {/* Floating button (mobile) */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg"
      >
        <Ticket className="h-5 w-5" />
        <span className="font-semibold">{activeCoupon.length}</span>
      </button>

      {/* Sidebar */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-80 border-l border-border bg-card shadow-2xl transition-transform duration-300 md:translate-x-0 md:relative md:block",
          open ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              <span className="font-semibold">Kupon ({activeCoupon.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearCoupon}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Temizle
              </button>
              <button
                onClick={() => setOpen(false)}
                className="md:hidden text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {activeCoupon.map((item) => (
              <div
                key={item.fixtureId}
                className="rounded-lg border border-border bg-background p-3 text-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">
                    {item.league}
                  </span>
                  <button
                    onClick={() => removeFromCoupon(item.fixtureId)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="font-medium text-xs mb-1">
                  {item.homeTeam} - {item.awayTeam}
                </div>
                <div className="flex items-center justify-between">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {item.pick}
                  </span>
                  <span className="text-xs font-semibold">
                    @{formatOdds(item.odds)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Yatırım:</span>
              <input
                type="number"
                value={couponStake}
                onChange={(e) => setCouponStake(Number(e.target.value) || 0)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
              <span className="text-xs text-muted-foreground">₺</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Toplam Oran:</span>
              <span className="font-bold text-primary">
                {formatOdds(totalOdds)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Potansiyel Kazanç:</span>
              <span className="font-bold text-green-500">
                {formatCurrency(potentialWin)}
              </span>
            </div>

            <button
              onClick={handleSave}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              Kuponu Kaydet
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
