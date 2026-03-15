// ============================================
// Hakem Profilleri — Tamamen Gerçek Veri
// Hardcoded hakem veritabanı KALDIRILDI.
// Tüm hakem profilleri settle-bets sırasında gerçek
// maç istatistiklerinden öğrenilir ve Supabase'e kaydedilir.
// ============================================

import type { RefereeProfile } from "@/types";
import { getCached, setCache } from "@/lib/cache";

// Dinamik öğrenilen hakem profilleri (runtime cache)
const dynamicRefereeCache = new Map<string, Omit<RefereeProfile, "name">>();

/**
 * Hakem adına göre profil getir
 * 1. Runtime cache'te (bu oturumdaki)
 * 2. Kalıcı cache'te (daha önce öğrenilen)
 * 3. Supabase'ten (settle-bets tarafından öğrenilmiş)
 * Bulunamazsa undefined döner — nötr etki uygulanır
 */
export async function getRefereeProfile(refereeName: string | null | undefined): Promise<RefereeProfile | undefined> {
  if (!refereeName) return undefined;

  const name = refereeName.trim();
  const nameLower = name.toLowerCase();

  // 1. Runtime cache — bu oturumdaki profil
  const cached = dynamicRefereeCache.get(nameLower);
  if (cached) {
    return { name, ...cached, tempoImpact: deriveTempoImpact(cached.avgCardsPerMatch) };
  }

  // 2. Kalıcı cache kontrol (learnRefereeProfile tarafından yazılan)
  const persistedProfile = getCached<Omit<RefereeProfile, "name">>(`referee:${nameLower}`);
  if (persistedProfile) {
    dynamicRefereeCache.set(nameLower, persistedProfile);
    return { name, ...persistedProfile, tempoImpact: deriveTempoImpact(persistedProfile.avgCardsPerMatch) };
  }

  // 3. Supabase'ten kontrol — settle-bets tarafından öğrenilmiş veriler
  try {
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = createAdminSupabase();
    const { data } = await supabase
      .from("referee_profiles")
      .select("avg_cards_per_match, card_tendency, matches_analyzed")
      .eq("name_lower", nameLower)
      .single();

    if (data && data.matches_analyzed >= 3) {
      const profile = {
        avgCardsPerMatch: data.avg_cards_per_match,
        cardTendency: data.card_tendency as "strict" | "moderate" | "lenient",
      };
      dynamicRefereeCache.set(nameLower, profile);
      setCache(`referee:${nameLower}`, profile, 7 * 24 * 3600);
      return { name, ...profile, tempoImpact: deriveTempoImpact(profile.avgCardsPerMatch) };
    }
  } catch {
    // Supabase hatası — sessizce geç
  }

  // Profil yok → nötr etki (undefined döner, simulator'da çarpan = 1.0)
  return undefined;
}

/**
 * Hakem profilini tamamlanmış maçtan öğren ve hem cache'e hem Supabase'e kaydet.
 * settle-bets cron'u tarafından çağrılır.
 *
 * @param refereeName Hakem adı
 * @param totalCards Maçtaki toplam kart sayısı (sarı + kırmızı)
 */
export async function learnRefereeProfile(refereeName: string, totalCards: number): Promise<void> {
  if (!refereeName) return;
  const name = refereeName.trim();
  const nameLower = name.toLowerCase();

  // Mevcut dinamik profil varsa güncelle (hareketli ortalama)
  const existing = dynamicRefereeCache.get(nameLower);
  let avgCards: number;
  let matchCount = 1;

  if (existing) {
    avgCards = Math.round((existing.avgCardsPerMatch * 0.7 + totalCards * 0.3) * 10) / 10;
  } else {
    avgCards = totalCards;
  }

  const tendency: "strict" | "moderate" | "lenient" =
    avgCards >= 5.0 ? "strict" : avgCards <= 3.5 ? "lenient" : "moderate";

  const profile = { avgCardsPerMatch: avgCards, cardTendency: tendency };
  dynamicRefereeCache.set(nameLower, profile);
  setCache(`referee:${nameLower}`, profile, 30 * 24 * 3600);

  // Supabase'e persist et (upsert)
  try {
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = createAdminSupabase();

    const { data: existingRow } = await supabase
      .from("referee_profiles")
      .select("avg_cards_per_match, matches_analyzed")
      .eq("name_lower", nameLower)
      .single();

    if (existingRow) {
      matchCount = existingRow.matches_analyzed + 1;
      const weight = Math.min(0.95, existingRow.matches_analyzed / (existingRow.matches_analyzed + 1));
      avgCards = Math.round((existingRow.avg_cards_per_match * weight + totalCards * (1 - weight)) * 10) / 10;
      const updatedTendency: "strict" | "moderate" | "lenient" =
        avgCards >= 5.0 ? "strict" : avgCards <= 3.5 ? "lenient" : "moderate";

      await supabase
        .from("referee_profiles")
        .update({
          avg_cards_per_match: avgCards,
          card_tendency: updatedTendency,
          matches_analyzed: matchCount,
          updated_at: new Date().toISOString(),
        })
        .eq("name_lower", nameLower);
    } else {
      await supabase
        .from("referee_profiles")
        .insert({
          name: name,
          name_lower: nameLower,
          avg_cards_per_match: avgCards,
          card_tendency: tendency,
          matches_analyzed: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }

    console.log(`[REFEREE] Profil güncellendi: ${name} → ${avgCards} kart/maç (${tendency}), ${matchCount} maç`);
  } catch (err) {
    console.warn(`[REFEREE] Supabase kayıt hatası (${name}):`, err);
  }
}

/**
 * Hakem kart ortalamasından tempo etkisini türet
 */
function deriveTempoImpact(avgCards: number): "high-tempo" | "neutral" | "low-tempo" {
  if (avgCards >= 5.0) return "low-tempo";
  if (avgCards <= 3.5) return "high-tempo";
  return "neutral";
}
