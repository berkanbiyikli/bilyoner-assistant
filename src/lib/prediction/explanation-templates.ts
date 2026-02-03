/**
 * AI Tahmin Açıklama Şablonları
 * Türkçe doğal dil şablonları
 */

import type { PredictionFactors } from '@/lib/prediction/types';
import type { BetSuggestion } from '@/types/api-football';

// Şablon tipi
interface ExplanationTemplate {
  condition: (factors: PredictionFactors, suggestion?: BetSuggestion) => boolean;
  generate: (factors: PredictionFactors, homeTeam: string, awayTeam: string, suggestion?: BetSuggestion) => string;
  priority: number;
}

// Form bazlı şablonlar
const formTemplates: ExplanationTemplate[] = [
  {
    condition: (f) => f.form.formDifference >= 30,
    generate: (f, home, away) => {
      const better = f.form.homeForm > f.form.awayForm ? home : away;
      const worse = f.form.homeForm > f.form.awayForm ? away : home;
      return `${better} son dönemde ${worse}'e göre çok daha iyi bir form grafiği sergiliyor (${Math.abs(f.form.formDifference)} puan fark).`;
    },
    priority: 10,
  },
  {
    condition: (f) => f.form.homeHomeForm >= 80,
    generate: (f, home) => `${home} kendi sahasında son derece güçlü, evdeki form skoru %${f.form.homeHomeForm}.`,
    priority: 8,
  },
  {
    condition: (f) => f.form.awayAwayForm >= 75,
    generate: (f, _, away) => `${away} deplasmanda zorlu bir rakip, deplasman formu %${f.form.awayAwayForm}.`,
    priority: 8,
  },
  {
    condition: (f) => f.form.homeForm <= 30 && f.form.awayForm <= 30,
    generate: () => `Her iki takım da kötü bir formda, dikkatli yaklaşmak gerekiyor.`,
    priority: 7,
  },
];

// H2H bazlı şablonlar
const h2hTemplates: ExplanationTemplate[] = [
  {
    condition: (f) => f.h2h.totalMatches >= 5 && f.h2h.homeWins >= f.h2h.totalMatches * 0.6,
    generate: (f, home, away) => 
      `${home}, ${away} karşısında son ${f.h2h.totalMatches} maçın ${f.h2h.homeWins}'ini kazandı - açık üstünlük.`,
    priority: 9,
  },
  {
    condition: (f) => f.h2h.totalMatches >= 5 && f.h2h.awayWins >= f.h2h.totalMatches * 0.6,
    generate: (f, home, away) => 
      `${away}, ${home} karşısında son ${f.h2h.totalMatches} maçın ${f.h2h.awayWins}'ini kazandı.`,
    priority: 9,
  },
  {
    condition: (f) => f.h2h.avgGoals >= 3,
    generate: (f) => `Karşılıklı maçlarda ortalama ${f.h2h.avgGoals.toFixed(1)} gol - golcü bir eşleşme bekleniyor.`,
    priority: 7,
  },
  {
    condition: (f) => f.h2h.bttsPercentage >= 70,
    generate: (f) => `Son maçların %${f.h2h.bttsPercentage}'inde karşılıklı gol var.`,
    priority: 6,
  },
  {
    condition: (f) => f.h2h.avgGoals <= 2,
    generate: (f) => `Bu eşleşmede genelde az gol oluyor, ortalama ${f.h2h.avgGoals.toFixed(1)} gol.`,
    priority: 6,
  },
];

// İstatistik bazlı şablonlar
const statsTemplates: ExplanationTemplate[] = [
  {
    condition: (f) => f.stats.homeAttack >= 80 && f.stats.awayDefense <= 40,
    generate: (f, home, away) => 
      `${home}'in hücum gücü (${f.stats.homeAttack}) ${away}'in zayıf savunmasına (${f.stats.awayDefense}) karşı etkili olabilir.`,
    priority: 9,
  },
  {
    condition: (f) => f.stats.awayAttack >= 80 && f.stats.homeDefense <= 40,
    generate: (f, home, away) => 
      `${away}'in güçlü hücumu (${f.stats.awayAttack}) ${home}'in savunma zaafiyetinden faydalanabilir.`,
    priority: 9,
  },
  {
    condition: (f) => f.stats.homeDefense >= 80 && f.stats.awayDefense >= 80,
    generate: () => `Her iki takımın da savunması sağlam - düşük skorlu maç olasılığı yüksek.`,
    priority: 7,
  },
  {
    condition: (f) => f.stats.homeAttack >= 75 && f.stats.awayAttack >= 75,
    generate: () => `İki takım da hücumda güçlü - golcü ve heyecanlı bir maç bekleniyor.`,
    priority: 7,
  },
  {
    condition: (f) => 
      f.stats.homeGoalsScored >= 2 && f.stats.awayGoalsScored >= 2 &&
      f.stats.homeGoalsConceded >= 1 && f.stats.awayGoalsConceded >= 1,
    generate: (f) => 
      `Her iki takım da hem gol atıyor hem yiyor. Ev sahibi ort. ${(f.stats.homeGoalsScored).toFixed(1)} atıp ${(f.stats.homeGoalsConceded).toFixed(1)} yiyor.`,
    priority: 6,
  },
];

// Sıralama bazlı şablonlar  
const standingsTemplates: ExplanationTemplate[] = [
  {
    condition: (f) => f.standings.positionDifference >= 10,
    generate: (f, home, away) => {
      const top = f.standings.homePosition < f.standings.awayPosition ? home : away;
      const bottom = f.standings.homePosition < f.standings.awayPosition ? away : home;
      const topPos = Math.min(f.standings.homePosition, f.standings.awayPosition);
      const bottomPos = Math.max(f.standings.homePosition, f.standings.awayPosition);
      return `${top} (${topPos}.) ile ${bottom} (${bottomPos}.) arasında büyük puan farkı var.`;
    },
    priority: 7,
  },
  {
    condition: (f) => f.standings.homePosition <= 3 && f.standings.awayPosition <= 3,
    generate: (f, home, away) => 
      `Zirve maçı! ${home} (${f.standings.homePosition}.) vs ${away} (${f.standings.awayPosition}.) - prestijli karşılaşma.`,
    priority: 8,
  },
];

// Motivasyon bazlı şablonlar
const motivationTemplates: ExplanationTemplate[] = [
  {
    condition: (f) => f.motivation.importanceLevel === 'critical',
    generate: () => `Kritik öneme sahip bir maç - iki takım da her şeyini verecek.`,
    priority: 10,
  },
  {
    condition: (f) => f.motivation.homeMotivation >= 90,
    generate: (f, home) => `${home} bu maça çok motive, motivasyon skoru %${f.motivation.homeMotivation}.`,
    priority: 7,
  },
  {
    condition: (f) => f.motivation.awayMotivation >= 90,
    generate: (f, _, away) => `${away} bu maça çok motive, motivasyon skoru %${f.motivation.awayMotivation}.`,
    priority: 7,
  },
  {
    condition: (f) => f.motivation.homeMotivation <= 40 && f.motivation.awayMotivation <= 40,
    generate: () => `Her iki takımın da motivasyonu düşük görünüyor - sezon sonu etkisi olabilir.`,
    priority: 5,
  },
];

// Tüm şablonları birleştir
const allTemplates: ExplanationTemplate[] = [
  ...formTemplates,
  ...h2hTemplates,
  ...statsTemplates,
  ...standingsTemplates,
  ...motivationTemplates,
];

/**
 * Tahmin için AI açıklaması oluştur
 */
export function generatePredictionExplanation(
  factors: PredictionFactors,
  homeTeam: string,
  awayTeam: string,
  suggestion?: BetSuggestion,
  maxSentences: number = 3
): string[] {
  // Koşulu sağlayan şablonları bul ve önceliğe göre sırala
  const matchingTemplates = allTemplates
    .filter(t => t.condition(factors, suggestion))
    .sort((a, b) => b.priority - a.priority);

  // En önemli açıklamaları al
  const explanations = matchingTemplates
    .slice(0, maxSentences)
    .map(t => t.generate(factors, homeTeam, awayTeam, suggestion));

  // Eğer hiç şablon eşleşmezse, varsayılan açıklama
  if (explanations.length === 0) {
    explanations.push('Mevcut veriler ışığında dengeli bir karşılaşma bekleniyor.');
  }

  return explanations;
}

/**
 * Bahis önerisi için özel açıklama
 */
export function generateBetExplanation(
  suggestion: BetSuggestion,
  factors: PredictionFactors,
  homeTeam: string,
  awayTeam: string
): string {
  const parts: string[] = [];
  
  // Bahis tipine göre özel açıklama
  const type = suggestion.type.toLowerCase();
  const market = suggestion.market.toLowerCase();
  
  if (type === 'goals' || market.includes('gol') || market.includes('alt') || market.includes('üst')) {
    // Gol bazlı bahisler
    if (factors.h2h.avgGoals >= 2.8) {
      parts.push(`H2H maçlarda ortalama ${factors.h2h.avgGoals.toFixed(1)} gol.`);
    }
    if (factors.stats.homeAttack >= 70 && factors.stats.awayAttack >= 70) {
      parts.push('Her iki takım da hücumda etkili.');
    }
    if (factors.stats.homeDefense <= 40 || factors.stats.awayDefense <= 40) {
      parts.push('Savunma zafiyeti gol beklentisini artırıyor.');
    }
  } else if (type === 'btts' || market.includes('karşılıklı') || market.includes('kg')) {
    // Karşılıklı gol
    if (factors.h2h.bttsPercentage >= 60) {
      parts.push(`Son H2H maçların %${factors.h2h.bttsPercentage}'inde KG var.`);
    }
    if (factors.stats.homeGoalsScored >= 1.5 && factors.stats.awayGoalsScored >= 1.5) {
      parts.push('İki takım da düzenli gol buluyor.');
    }
  } else if (type === 'result' || market.includes('ms') || market.includes('maç sonucu')) {
    // Maç sonucu
    if (factors.form.formDifference >= 20) {
      const better = factors.form.homeForm > factors.form.awayForm ? homeTeam : awayTeam;
      parts.push(`${better} formda açık ara önde.`);
    }
    if (factors.standings.positionDifference >= 8) {
      parts.push('Lig sıralamasında önemli fark var.');
    }
  } else if (type === 'cards' || market.includes('kart')) {
    // Kart bazlı
    parts.push('Hakem istatistikleri ve takım agresifliği analiz edildi.');
  }

  // Güven açıklaması
  if (suggestion.confidence >= 75) {
    parts.push(`%${suggestion.confidence} güvenle öneriliyor.`);
  }

  // Eğer hiç açıklama yoksa varsayılan
  if (parts.length === 0) {
    parts.push(suggestion.reasoning || 'İstatistiksel analiz sonucu önerildi.');
  }

  return parts.join(' ');
}

/**
 * Özet cümle oluştur (maç kartı için)
 */
export function generateQuickSummary(
  factors: PredictionFactors,
  homeTeam: string,
  awayTeam: string
): string {
  // En belirleyici faktörü bul
  const formDiff = Math.abs(factors.form.formDifference);
  const posDiff = factors.standings.positionDifference;
  const h2hDominant = Math.max(factors.h2h.homeWins, factors.h2h.awayWins) / Math.max(1, factors.h2h.totalMatches);

  if (formDiff >= 30) {
    const better = factors.form.homeForm > factors.form.awayForm ? homeTeam : awayTeam;
    return `${better} formda üstün`;
  }
  
  if (h2hDominant >= 0.7 && factors.h2h.totalMatches >= 4) {
    const winner = factors.h2h.homeWins > factors.h2h.awayWins ? homeTeam : awayTeam;
    return `${winner} H2H'de baskın`;
  }
  
  if (posDiff >= 10) {
    return 'Lig sıralaması farkı belirleyici';
  }
  
  if (factors.h2h.avgGoals >= 3) {
    return 'Golcü eşleşme bekleniyor';
  }
  
  return 'Dengeli karşılaşma';
}
