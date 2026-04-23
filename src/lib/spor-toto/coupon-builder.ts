/**
 * Spor Toto Kupon Üretici
 *
 * 15 maçlık Spor Toto programı için 5 farklı maliyet/risk
 * profilinde kupon önerisi üretir.
 *
 * Stratejiler:
 *  1. Banko Kupon (1 kolon)        — Hepsi tek seçim, en güvenli favori.
 *  2. Tedbirli      (4-8 kolon)    — En zor 2-3 maç çifte şans.
 *  3. Dengeli       (16-32 kolon)  — 4 çifte şans, 0-1 üçlü.
 *  4. Geniş         (64-128 kolon) — 6 çifte şans + 1 üçlü.
 *  5. Sistem        (256+ kolon)   — Zor maçlar çoğunlukla çoklu.
 */

import type { TotoMatch, TotoSelection } from "@/types/spor-toto";

export type SelectionMode = "single" | "double" | "triple";

export interface CouponMatchPick {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  mode: SelectionMode;
  picks: TotoSelection[];        // 1 / 2 / 3 element
  label: string;                 // "1", "1X", "X2", "12", "1X2"
  confidence: number;            // 0-100, en olası seçimin güveni
  reasoning: string;
  isSurprise: boolean;
  isBanko: boolean;
}

export interface SporTotoCoupon {
  id: string;
  name: string;
  emoji: string;
  description: string;
  riskLevel: "very_low" | "low" | "medium" | "high" | "very_high";
  picks: CouponMatchPick[];
  totalColumns: number;
  pricePerColumn: number;        // TL
  totalCost: number;             // TL
  bankoCount: number;            // single seçim sayısı
  doubleCount: number;
  tripleCount: number;
  expectedAccuracy: number;      // 0-100, kupon kazanma olasılığı tahmini
}

const PRICE_PER_COLUMN = 20; // TL (Spor Toto kolon ücreti)

interface MatchAnalysis {
  match: TotoMatch;
  favorite: TotoSelection;
  favoriteProb: number;
  secondPick: TotoSelection;
  secondProb: number;
  difficulty: number;            // 0-1, yüksek = zor maç
  isBanko: boolean;
  isSurprise: boolean;
}

/**
 * Maçı analiz eder: en olası, ikinci en olası, zorluk skoru.
 */
function analyzeMatch(match: TotoMatch): MatchAnalysis {
  const probs = match.stats.probabilities;
  const entries: { pick: TotoSelection; prob: number }[] = [
    { pick: "1", prob: probs.homeWin },
    { pick: "0", prob: probs.draw },
    { pick: "2", prob: probs.awayWin },
  ].sort((a, b) => b.prob - a.prob);

  const favorite = entries[0].pick;
  const favoriteProb = entries[0].prob;
  const secondPick = entries[1].pick;
  const secondProb = entries[1].prob;

  // AI tahmini varsa onu favori say (daha akıllı)
  const ai = match.aiPrediction;
  const aiPick = ai?.recommendation;
  const aiConfidence = ai?.confidence ?? 0;

  let chosenFavorite = favorite;
  let chosenConfidence = favoriteProb;
  if (aiPick && aiConfidence >= 60) {
    chosenFavorite = aiPick;
    chosenConfidence = aiConfidence;
  }

  // Zorluk: favori % 60+ ise kolay, % 40 altı ise zor
  const difficulty = Math.max(0, Math.min(1, 1 - chosenConfidence / 100));

  const isBanko =
    chosenConfidence >= 70 && (match.surprise?.score ?? 0) < 35;
  const isSurprise = (match.surprise?.score ?? 0) >= 60;

  return {
    match,
    favorite: chosenFavorite,
    favoriteProb: chosenConfidence,
    secondPick,
    secondProb,
    difficulty,
    isBanko,
    isSurprise,
  };
}

/**
 * Çift şans label'ı üretir: 1X / X2 / 12.
 */
function doubleChanceLabel(picks: TotoSelection[]): string {
  const set = new Set(picks);
  if (set.has("1") && set.has("0")) return "1X";
  if (set.has("0") && set.has("2")) return "X2";
  if (set.has("1") && set.has("2")) return "12";
  return picks.join("");
}

/**
 * Maç için çifte şans seçimi (favori + ikinci olasılık).
 */
function buildDoubleChance(a: MatchAnalysis): TotoSelection[] {
  // Favori + ikinci olasılık
  const picks = new Set<TotoSelection>([a.favorite, a.secondPick]);
  return Array.from(picks).sort();
}

/**
 * Bir kupon profilini uygular: doubleCount kadar maçı çift,
 * tripleCount kadar maçı üçlü yapar (en zor maçlardan başlayarak).
 */
function applyCouponProfile(
  analyses: MatchAnalysis[],
  doubleCount: number,
  tripleCount: number
): CouponMatchPick[] {
  // Zorluk azalan sırada: en zor maçlar önce çoklu olsun
  const sortedByDifficulty = [...analyses].sort(
    (a, b) => b.difficulty - a.difficulty
  );

  // Sürpriz adayı maçlar üçlü için öncelikli (favorinin tersine de açık)
  const tripleSet = new Set<string>();
  const doubleSet = new Set<string>();

  // 1) Üçlüler: en yüksek difficulty + sürpriz olanlar
  const tripleCandidates = sortedByDifficulty.slice(0, tripleCount + 2);
  // Sürprizleri öne al
  tripleCandidates.sort((a, b) => {
    if (a.isSurprise !== b.isSurprise) return a.isSurprise ? -1 : 1;
    return b.difficulty - a.difficulty;
  });
  for (const a of tripleCandidates.slice(0, tripleCount)) {
    tripleSet.add(a.match.id);
  }

  // 2) Çiftler: kalan zor maçlardan
  for (const a of sortedByDifficulty) {
    if (tripleSet.has(a.match.id)) continue;
    if (doubleSet.size >= doubleCount) break;
    doubleSet.add(a.match.id);
  }

  // Orijinal sıra (programdaki gibi) korunsun
  return analyses.map((a) => {
    const matchId = a.match.id;
    const home = a.match.homeTeam.shortName ?? a.match.homeTeam.name;
    const away = a.match.awayTeam.shortName ?? a.match.awayTeam.name;
    const league = a.match.league.name;

    if (tripleSet.has(matchId)) {
      return {
        matchId,
        homeTeam: home,
        awayTeam: away,
        league,
        mode: "triple" as const,
        picks: ["1", "0", "2"] as TotoSelection[],
        label: "1X2",
        confidence: a.favoriteProb,
        reasoning: a.isSurprise
          ? "Sürpriz alarmı yüksek — tüm seçenekler"
          : "Çok dengeli maç — tüm seçenekler",
        isSurprise: a.isSurprise,
        isBanko: false,
      };
    }

    if (doubleSet.has(matchId)) {
      const picks = buildDoubleChance(a);
      return {
        matchId,
        homeTeam: home,
        awayTeam: away,
        league,
        mode: "double" as const,
        picks,
        label: doubleChanceLabel(picks),
        confidence: a.favoriteProb,
        reasoning: `Favori ${a.favorite} (%${Math.round(a.favoriteProb)}) + ikinci olasılık ${a.secondPick} (%${Math.round(a.secondProb)})`,
        isSurprise: a.isSurprise,
        isBanko: false,
      };
    }

    return {
      matchId,
      homeTeam: home,
      awayTeam: away,
      league,
      mode: "single" as const,
      picks: [a.favorite],
      label: a.favorite,
      confidence: a.favoriteProb,
      reasoning: a.isBanko
        ? `Banko aday — %${Math.round(a.favoriteProb)} güven`
        : `Favori ${a.favorite} — %${Math.round(a.favoriteProb)}`,
      isSurprise: a.isSurprise,
      isBanko: a.isBanko,
    };
  });
}

/**
 * Tek kuponun toplam kolon sayısı = 2^double * 3^triple.
 */
function computeColumns(picks: CouponMatchPick[]): number {
  let cols = 1;
  for (const p of picks) {
    if (p.mode === "double") cols *= 2;
    else if (p.mode === "triple") cols *= 3;
  }
  return cols;
}

/**
 * Kupon kazanma olasılığı (kaba): her maçın seçilen seçeneklerin
 * toplam olasılığının çarpımı.
 */
function estimateAccuracy(
  picks: CouponMatchPick[],
  analyses: MatchAnalysis[]
): number {
  const byId = new Map(analyses.map((a) => [a.match.id, a]));
  let prob = 1;
  for (const p of picks) {
    const a = byId.get(p.matchId);
    if (!a) continue;
    const probs = a.match.stats.probabilities;
    let sum = 0;
    for (const sel of p.picks) {
      if (sel === "1") sum += probs.homeWin / 100;
      else if (sel === "0") sum += probs.draw / 100;
      else if (sel === "2") sum += probs.awayWin / 100;
    }
    prob *= Math.max(0.01, Math.min(0.99, sum));
  }
  return Math.round(prob * 10000) / 100; // % iki ondalık
}

/**
 * 5 farklı kupon stratejisi üretir.
 */
export function buildSporTotoCoupons(matches: TotoMatch[]): SporTotoCoupon[] {
  if (!matches || matches.length === 0) return [];

  const analyses = matches.map(analyzeMatch);
  const total = matches.length;

  // 5 strateji profili (double, triple sayıları)
  // total <= 15 varsayımıyla
  const profiles: Array<{
    id: string;
    name: string;
    emoji: string;
    description: string;
    risk: SporTotoCoupon["riskLevel"];
    doubles: number;
    triples: number;
  }> = [
    {
      id: "banko",
      name: "Banko Kupon",
      emoji: "🎯",
      description:
        "Tüm maçlar en güvenli favoriden tek seçim. En ucuz, en riskli (yüksek tutturma şansı düşer).",
      risk: "very_high",
      doubles: 0,
      triples: 0,
    },
    {
      id: "tedbirli",
      name: "Tedbirli",
      emoji: "🛡️",
      description:
        "En zor 3 maçta çifte şans, geri kalan tek. Düşük maliyet, makul güvenlik.",
      risk: "high",
      doubles: 3,
      triples: 0,
    },
    {
      id: "dengeli",
      name: "Dengeli",
      emoji: "⚖️",
      description:
        "4 çifte şans + 1 üçlü. Klasik Spor Toto kupon profili — orta maliyet, güvenli.",
      risk: "medium",
      doubles: 4,
      triples: 1,
    },
    {
      id: "genis",
      name: "Geniş Kupon",
      emoji: "🌐",
      description:
        "6 çifte şans + 1 üçlü. Yüksek tutturma olasılığı, ciddi maliyet.",
      risk: "low",
      doubles: 6,
      triples: 1,
    },
    {
      id: "sistem",
      name: "Sistem Garanti",
      emoji: "🏰",
      description:
        "7 çifte şans + 2 üçlü. Ekstra maliyet ama 13+ doğru tutturma olasılığı çok yüksek.",
      risk: "very_low",
      doubles: 7,
      triples: 2,
    },
  ];

  return profiles
    .map((profile) => {
      const doubles = Math.min(profile.doubles, Math.max(0, total - profile.triples));
      const triples = Math.min(profile.triples, Math.max(0, total - doubles));
      const picks = applyCouponProfile(analyses, doubles, triples);
      const totalColumns = computeColumns(picks);
      const totalCost = totalColumns * PRICE_PER_COLUMN;
      const bankoCount = picks.filter((p) => p.mode === "single").length;
      const doubleCount = picks.filter((p) => p.mode === "double").length;
      const tripleCount = picks.filter((p) => p.mode === "triple").length;
      const expectedAccuracy = estimateAccuracy(picks, analyses);

      return {
        id: profile.id,
        name: profile.name,
        emoji: profile.emoji,
        description: profile.description,
        riskLevel: profile.risk,
        picks,
        totalColumns,
        pricePerColumn: PRICE_PER_COLUMN,
        totalCost,
        bankoCount,
        doubleCount,
        tripleCount,
        expectedAccuracy,
      };
    })
    .sort((a, b) => a.totalCost - b.totalCost);
}
