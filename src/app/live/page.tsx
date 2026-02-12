"use client";

import { useEffect, useState } from "react";
import { Radio, Zap } from "lucide-react";
import type { FixtureResponse } from "@/types/api-football";
import { isMatchLive, getMatchDate } from "@/lib/utils";
import Image from "next/image";

export default function LivePage() {
  const [matches, setMatches] = useState<FixtureResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await fetch("/api/live");
        const data = await res.json();
        setMatches(data.matches || []);
      } catch (error) {
        console.error("Canlı maçlar yüklenemedi:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 30000); // 30 saniyede bir güncelle
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="h-6 w-6 text-red-500 animate-pulse" />
          Canlı Maçlar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Şu anda oynanan maçlar — 30 saniyede bir güncellenir
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
      ) : matches.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {matches.map((match) => (
            <div
              key={match.fixture.id}
              className="rounded-xl border border-border bg-card p-4 relative overflow-hidden"
            >
              {/* Live indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-[10px] font-semibold text-red-500">
                  {match.fixture.status.elapsed}&apos;
                </span>
              </div>

              <div className="text-[10px] text-muted-foreground mb-3">
                {match.league.name}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  {match.teams.home.logo && (
                    <Image
                      src={match.teams.home.logo}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 object-contain"
                    />
                  )}
                  <span className="font-semibold text-sm">{match.teams.home.name}</span>
                </div>

                <div className="flex items-center gap-2 px-4">
                  <span className="text-2xl font-bold">{match.goals.home ?? 0}</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-2xl font-bold">{match.goals.away ?? 0}</span>
                </div>

                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="font-semibold text-sm">{match.teams.away.name}</span>
                  {match.teams.away.logo && (
                    <Image
                      src={match.teams.away.logo}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 object-contain"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Radio className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Canlı Maç Yok</h3>
          <p className="text-sm text-muted-foreground">
            Şu anda oynanan maç bulunmuyor.
          </p>
        </div>
      )}
    </div>
  );
}
