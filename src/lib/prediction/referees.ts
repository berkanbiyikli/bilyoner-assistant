// ============================================
// Hakem Profilleri
// Bilinen hakemlerin kart eğilim tablosu
// ============================================

import type { RefereeProfile } from "@/types";

/**
 * Hakem kart eğilim veritabanı
 * Kaynak: Genel istatistikler & gözlem verileri
 *
 * avgCardsPerMatch: Maç başına ortalama kart (sarı + kırmızı)
 * cardTendency: strict (>5), moderate (3.5-5), lenient (<3.5)
 */
const REFEREE_DATABASE: Record<string, Omit<RefereeProfile, "name">> = {
  // ---- Türkiye Süper Lig ----
  "Halil Umut Meler": { avgCardsPerMatch: 5.2, cardTendency: "strict" },
  "Cüneyt Çakır": { avgCardsPerMatch: 4.8, cardTendency: "moderate" },
  "Ali Palabıyık": { avgCardsPerMatch: 5.5, cardTendency: "strict" },
  "Atilla Karaoğlan": { avgCardsPerMatch: 5.8, cardTendency: "strict" },
  "Arda Kardeşler": { avgCardsPerMatch: 4.6, cardTendency: "moderate" },
  "Zorbay Küçük": { avgCardsPerMatch: 5.0, cardTendency: "strict" },
  "Volkan Bayarslan": { avgCardsPerMatch: 4.3, cardTendency: "moderate" },
  "Erkan Özdamar": { avgCardsPerMatch: 4.1, cardTendency: "moderate" },
  "Abdulkadir Bitigen": { avgCardsPerMatch: 4.9, cardTendency: "moderate" },
  "Mete Kalkavan": { avgCardsPerMatch: 5.1, cardTendency: "strict" },
  "Yaşar Kemal Uğurlu": { avgCardsPerMatch: 4.4, cardTendency: "moderate" },
  "Tugay Kaan Numanoğlu": { avgCardsPerMatch: 4.7, cardTendency: "moderate" },
  "Kadir Sağlam": { avgCardsPerMatch: 4.5, cardTendency: "moderate" },
  "Burak Şeker": { avgCardsPerMatch: 4.0, cardTendency: "moderate" },

  // ---- Premier League ----
  "Michael Oliver": { avgCardsPerMatch: 3.8, cardTendency: "moderate" },
  "Anthony Taylor": { avgCardsPerMatch: 4.2, cardTendency: "moderate" },
  "Craig Pawson": { avgCardsPerMatch: 3.5, cardTendency: "moderate" },
  "Paul Tierney": { avgCardsPerMatch: 4.0, cardTendency: "moderate" },
  "Simon Hooper": { avgCardsPerMatch: 3.9, cardTendency: "moderate" },
  "Robert Jones": { avgCardsPerMatch: 3.6, cardTendency: "moderate" },
  "Stuart Attwell": { avgCardsPerMatch: 3.4, cardTendency: "lenient" },
  "Andy Madley": { avgCardsPerMatch: 3.3, cardTendency: "lenient" },
  "David Coote": { avgCardsPerMatch: 3.7, cardTendency: "moderate" },
  "Peter Bankes": { avgCardsPerMatch: 4.1, cardTendency: "moderate" },
  "John Brooks": { avgCardsPerMatch: 3.2, cardTendency: "lenient" },
  "Tim Robinson": { avgCardsPerMatch: 3.5, cardTendency: "moderate" },

  // ---- La Liga ----
  "Mateu Lahoz": { avgCardsPerMatch: 5.8, cardTendency: "strict" },
  "Carlos del Cerro Grande": { avgCardsPerMatch: 5.3, cardTendency: "strict" },
  "Jesús Gil Manzano": { avgCardsPerMatch: 5.1, cardTendency: "strict" },
  "Juan Martínez Munuera": { avgCardsPerMatch: 4.7, cardTendency: "moderate" },
  "Ricardo De Burgos Bengoetxea": { avgCardsPerMatch: 5.4, cardTendency: "strict" },
  "José María Sánchez Martínez": { avgCardsPerMatch: 4.9, cardTendency: "moderate" },
  "Alejandro Hernández Hernández": { avgCardsPerMatch: 5.6, cardTendency: "strict" },
  "César Soto Grado": { avgCardsPerMatch: 4.5, cardTendency: "moderate" },

  // ---- Serie A ----
  "Daniele Orsato": { avgCardsPerMatch: 4.9, cardTendency: "moderate" },
  "Marco Di Bello": { avgCardsPerMatch: 5.2, cardTendency: "strict" },
  "Davide Massa": { avgCardsPerMatch: 4.8, cardTendency: "moderate" },
  "Gianluca Manganiello": { avgCardsPerMatch: 5.0, cardTendency: "strict" },
  "Marco Guida": { avgCardsPerMatch: 4.6, cardTendency: "moderate" },
  "Luca Pairetto": { avgCardsPerMatch: 5.1, cardTendency: "strict" },
  "Maurizio Mariani": { avgCardsPerMatch: 4.4, cardTendency: "moderate" },
  "Simone Sozza": { avgCardsPerMatch: 4.7, cardTendency: "moderate" },

  // ---- Bundesliga ----
  "Felix Zwayer": { avgCardsPerMatch: 4.1, cardTendency: "moderate" },
  "Daniel Siebert": { avgCardsPerMatch: 3.8, cardTendency: "moderate" },
  "Deniz Aytekin": { avgCardsPerMatch: 3.5, cardTendency: "moderate" },
  "Sascha Stegemann": { avgCardsPerMatch: 3.9, cardTendency: "moderate" },
  "Frank Willenborg": { avgCardsPerMatch: 3.3, cardTendency: "lenient" },
  "Tobias Stieler": { avgCardsPerMatch: 3.6, cardTendency: "moderate" },
  "Robert Hartmann": { avgCardsPerMatch: 3.7, cardTendency: "moderate" },

  // ---- Ligue 1 ----
  "Clément Turpin": { avgCardsPerMatch: 4.3, cardTendency: "moderate" },
  "François Letexier": { avgCardsPerMatch: 3.9, cardTendency: "moderate" },
  "Benoît Bastien": { avgCardsPerMatch: 4.5, cardTendency: "moderate" },
  "Jérémie Pignard": { avgCardsPerMatch: 4.2, cardTendency: "moderate" },
  "Willy Delajod": { avgCardsPerMatch: 4.0, cardTendency: "moderate" },
  "Pierre Music": { avgCardsPerMatch: 3.7, cardTendency: "moderate" },

  // ---- UEFA (Champions League / Europa League) ----
  "Slavko Vinčić": { avgCardsPerMatch: 4.0, cardTendency: "moderate" },
  "Szymon Marciniak": { avgCardsPerMatch: 3.8, cardTendency: "moderate" },
  "Danny Makkelie": { avgCardsPerMatch: 3.5, cardTendency: "moderate" },
  "Artur Dias": { avgCardsPerMatch: 4.2, cardTendency: "moderate" },
  "Istvan Kovacs": { avgCardsPerMatch: 4.6, cardTendency: "moderate" },
  "Ovidiu Hategan": { avgCardsPerMatch: 4.4, cardTendency: "moderate" },
  "Tobias Welz": { avgCardsPerMatch: 3.6, cardTendency: "moderate" },
};

/**
 * Hakem adına göre profil getir
 * Tam eşleşme veya kısmi eşleşme (soyadı) dener
 * Bulunamazsa undefined döner — filtre uygulanmaz
 */
export function getRefereeProfile(refereeName: string | null | undefined): RefereeProfile | undefined {
  if (!refereeName) return undefined;

  const name = refereeName.trim();

  // Tam eşleşme
  if (REFEREE_DATABASE[name]) {
    const profile = REFEREE_DATABASE[name];
    return { name, ...profile, tempoImpact: deriveTempoImpact(profile.avgCardsPerMatch) };
  }

  // Kısmi eşleşme — soyadı ile ara
  const nameLower = name.toLowerCase();
  for (const [dbName, profile] of Object.entries(REFEREE_DATABASE)) {
    const dbLower = dbName.toLowerCase();
    // Soyadı eşleşmesi: DB'deki son kelime, input'un son kelimesiyle aynı mı?
    const dbLastName = dbLower.split(" ").pop() || "";
    const inputLastName = nameLower.split(" ").pop() || "";
    if (dbLastName.length > 2 && dbLastName === inputLastName) {
      return { name: dbName, ...profile, tempoImpact: deriveTempoImpact(profile.avgCardsPerMatch) };
    }
  }

  return undefined;
}

/**
 * Hakem kart ortalamasından tempo etkisini türet
 * Sık düdük çalan hakem → düşük tempo → xG düşüşü
 */
function deriveTempoImpact(avgCards: number): "high-tempo" | "neutral" | "low-tempo" {
  if (avgCards >= 5.0) return "low-tempo";   // Çok duru, oyun akışını bozuyor
  if (avgCards <= 3.5) return "high-tempo";  // Akıcı oyun, az durma
  return "neutral";
}
