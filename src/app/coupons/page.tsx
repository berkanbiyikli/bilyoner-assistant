"use client";

import { useState } from "react";
import { Ticket, Trophy, Shield, Flame, Gem, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CouponCategory } from "@/types";
import { getCouponCategoryLabel } from "@/lib/coupon";

const CATEGORIES: { key: CouponCategory; icon: React.ReactNode; description: string }[] = [
  { key: "safe", icon: <Shield className="h-4 w-4" />, description: "Düşük oran, yüksek güven" },
  { key: "balanced", icon: <Trophy className="h-4 w-4" />, description: "Orta risk, orta getiri" },
  { key: "risky", icon: <Flame className="h-4 w-4" />, description: "Yüksek oran, yüksek risk" },
  { key: "value", icon: <Gem className="h-4 w-4" />, description: "Value bet'lerden oluşan kupon" },
];

export default function CouponsPage() {
  const [activeCategory, setActiveCategory] = useState<CouponCategory>("balanced");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/coupon/generate?category=${activeCategory}`);
      const data = await res.json();
      // TODO: Kupon sonucunu göster
    } catch (error) {
      console.error("Kupon oluşturulamadı:", error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Ticket className="h-6 w-6 text-primary" />
          Kupon Oluşturucu
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI ile otomatik kupon oluştur veya manuel kuponunu yönet
        </p>
      </div>

      {/* Category Selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              activeCategory === cat.key
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={activeCategory === cat.key ? "text-primary" : "text-muted-foreground"}>
                {cat.icon}
              </span>
              <span className="font-semibold text-sm">
                {getCouponCategoryLabel(cat.key)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{cat.description}</p>
          </button>
        ))}
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full md:w-auto rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {generating ? (
          <>Oluşturuluyor...</>
        ) : (
          <>
            <Ticket className="h-4 w-4" />
            Kupon Oluştur
          </>
        )}
      </button>

      {/* Saved Coupons */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Kayıtlı Kuponlar</h2>
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Ticket className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            Henüz kayıtlı kupon bulunmuyor. Tahminler sayfasından kupon oluşturabilirsiniz.
          </p>
        </div>
      </div>
    </div>
  );
}
