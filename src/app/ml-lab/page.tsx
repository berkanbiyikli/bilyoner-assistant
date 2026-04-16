"use client";

import { useEffect, useState } from "react";
import { Brain, RefreshCw, Target, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";

type MLLabResponse = {
  success: boolean;
  model: {
    version: string;
    trained_at: string;
    record_count: number;
    market_count: number;
  } | null;
  totals: {
    settled: number;
    focusPicks: number;
    mlCoverage: number;
  };
  quality: {
    brierMl: number | null;
    brierConfidence: number | null;
    mlSignalHitRate: number;
    confSignalHitRate: number;
    samplesCompared: number;
  };
  surprise: {
    upset: { sample: number; hitRate: number };
    htBtts: { sample: number; hitRate: number };
    topLeaguesForUpset: Array<{ league: string; sample: number; hitRate: number }>;
  };
};

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export default function MLLabPage() {
  const [data, setData] = useState<MLLabResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stats/ml-lab");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            ML Lab
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ML modelinin özellikle 1/2 ve IY KG Var pazarlarında gerçekten değer üretip üretmediği.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!data || loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Veriler yukleniyor...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card title="Model Versiyonu" value={data.model?.version || "Yok"} sub={data.model ? new Date(data.model.trained_at).toLocaleString("tr-TR") : "Model egitilmemis"} />
            <Card title="ML Coverage" value={`%${data.totals.mlCoverage}`} sub={`Settled: ${data.totals.settled}`} />
            <Card title="ML Signal Hit" value={`%${data.quality.mlSignalHitRate}`} sub="ML >= %55 sinyalleri" />
            <Card title="Conf Signal Hit" value={`%${data.quality.confSignalHitRate}`} sub="Confidence >= %60" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-primary" />
                Kalite Karsilastirma (Brier, dusuk daha iyi)
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>ML Brier</span><b>{data.quality.brierMl ?? "-"}</b></div>
                <div className="flex justify-between"><span>Confidence Brier</span><b>{data.quality.brierConfidence ?? "-"}</b></div>
                <div className="flex justify-between"><span>Karsilastirma sample</span><b>{data.quality.samplesCompared}</b></div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Surpriz Market Performansi
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>Upset (1/2, odds {">="} 2.8)</span><b>%{data.surprise.upset.hitRate} ({data.surprise.upset.sample})</b></div>
                <div className="flex justify-between"><span>IY KG Var (odds {">="} 2.0)</span><b>%{data.surprise.htBtts.hitRate} ({data.surprise.htBtts.sample})</b></div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-primary" />
              Upset yakalamaya uygun ligler (gecmis oran davranisina gore)
            </div>
            {data.surprise.topLeaguesForUpset.length === 0 ? (
              <div className="mt-3 text-sm text-muted-foreground">Yeterli sample yok.</div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4">Lig</th>
                      <th className="py-2 pr-4">Sample</th>
                      <th className="py-2 pr-4">Hit Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.surprise.topLeaguesForUpset.map((row) => (
                      <tr key={row.league} className="border-b border-border/40">
                        <td className="py-2 pr-4">{row.league}</td>
                        <td className="py-2 pr-4">{row.sample}</td>
                        <td className="py-2 pr-4">%{row.hitRate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Yorum
            </div>
            <p className="mt-2 text-muted-foreground">
              Hedef pazarlar 1/2 ve IY KG Var. Burada ML Signal Hit ve ML Brier, confidence tabanli yaklasimdan iyiye gidiyorsa model gercek katki uretiyor demektir.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
