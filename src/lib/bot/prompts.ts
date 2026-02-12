// ============================================
// Tweet Prompt Templates — 3 Persona
// Rastgeleleşen, kendini tekrar etmeyen şablonlar
// Persona 1: Analitik (Veri Bilimci) — 📊
// Persona 2: Alert (Hızlı Uyarıcı) — 🚨
// Persona 3: Rapor (Şeffaf Performansçı) — 📋
// ============================================

// ---- Yardımcı ----

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---- Types ----

export interface PromptData {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  pick: string;
  odds: number;
  confidence: number;
  xgHome?: number;
  xgAway?: number;
  simEdge?: number;
  simTopScoreline?: string;
  simProbability?: number;
  keyInsight?: string;
  actualScore?: string;
  result?: "won" | "lost";
  stats?: {
    total: number;
    won: number;
    lost: number;
    winRate: number;
    roi: number;
  };
}

// ============================================
// PERSONA 1: ANALİTİK — "Data Scientist"
// Derinlemesine veri sunan, rakamlarla konuşan persona
// ============================================

const ANALYTIC_OPENERS = [
  "📊 VERİ ANALİZİ",
  "📊 İSTATİSTİK RAPORU",
  "📊 QUANTITATIVE EDGE",
  "📊 MODEL ÇIKTISI",
  "📊 DATA INSIGHT",
  "📊 SAYI KONUŞUYOR",
];

const ANALYTIC_XG_LINES = [
  (h: number, a: number) => `📈 xG modeli: ${h.toFixed(1)} - ${a.toFixed(1)} → ${h > a ? "Ev sahibi" : "Deplasman"} xG üstünlüğü`,
  (h: number, a: number) => `📈 Beklenen Gol: ${h.toFixed(1)} vs ${a.toFixed(1)} — ${(h + a).toFixed(1)} toplam xG`,
  (h: number, a: number) => `📈 xG Farkı: ${Math.abs(h - a).toFixed(2)} → ${h > a ? "ev sahibi" : "deplasman"} lehine`,
  (h: number, a: number) => `📈 Model xG hesabı ${h.toFixed(1)}-${a.toFixed(1)}, beklenti ${h > a ? "ev sahibinde" : "depalasmanda"}`,
];

const ANALYTIC_SIM_LINES = [
  (edge: number) => `🎲 Monte Carlo simülasyonumuz piyasanın %${edge.toFixed(0)} üzerinde fiyatladığını gösteriyor`,
  (edge: number) => `🎲 10K iterasyon sonucu: piyasa %${edge.toFixed(0)} düşük fiyatlıyor`,
  (edge: number) => `🎲 Simülasyon Edge: +%${edge.toFixed(0)} — istatistiksel fırsat`,
  (edge: number) => `🎲 Model vs Piyasa farkı: %${edge.toFixed(0)} EDGE tespit edildi`,
];

const ANALYTIC_CLOSERS = [
  "#verianalizi #istatistik",
  "#montecarlo #xG #analiz",
  "#datascience #bahis",
  "#quantitativedge #model",
  "#istatistik #futbol",
];

export function generateAnalyticTweet(data: PromptData): string {
  const lines: string[] = [];

  lines.push(`${pickRandom(ANALYTIC_OPENERS)} | ${data.league ?? "Futbol"}`);
  lines.push("");
  lines.push(`⚽ ${data.homeTeam} vs ${data.awayTeam}`);

  if (data.xgHome && data.xgAway) {
    lines.push(pickRandom(ANALYTIC_XG_LINES)(data.xgHome, data.xgAway));
  }

  if (data.simEdge && data.simEdge > 5) {
    lines.push(pickRandom(ANALYTIC_SIM_LINES)(data.simEdge));
  }

  if (data.simTopScoreline && data.simProbability) {
    lines.push(`🎯 En olası skor: ${data.simTopScoreline} (%${data.simProbability})`);
  }

  if (data.keyInsight) {
    lines.push(`\n💡 ${data.keyInsight}`);
  }

  lines.push("");
  lines.push(`➜ ${data.pick} @${data.odds.toFixed(2)} (Güven: %${data.confidence})`);
  lines.push("");
  lines.push(pickRandom(ANALYTIC_CLOSERS));

  return lines.join("\n");
}

// ============================================
// PERSONA 2: ALERT — "Hızlı Uyarıcı"
// Kısa, keskin, acil his veren uyarılar
// ============================================

const ALERT_VALUE_OPENERS = [
  "🚨 VALUE BET TESPİT EDİLDİ",
  "🚨 EDGE ALARMI",
  "🚨 PİYASA HATASI YAKALANDI",
  "🚨 İSTATİSTİKSEL FIRSAT",
  "🚨 DEĞER BETİ ALARM",
  "🚨 MODEL UYARISI",
];

const ALERT_EDGE_LINES = [
  (e: number) => `⚡ Piyasa %${e.toFixed(0)} düşük fiyatlamış!`,
  (e: number) => `⚡ %${e.toFixed(0)} EDGE — bu fırsat kaçmaz`,
  (e: number) => `⚡ Modelimiz ${e.toFixed(0)}%'lik avantaj buluyor`,
  (e: number) => `⚡ Piyasa hatası: %${e.toFixed(0)} mispricing`,
];

const ALERT_URGENCY = [
  "⏰ Maç saatine kısa süre kaldı!",
  "⏰ Son fırsat penceresi!",
  "⏰ Oranlar kapanmadan değerlendir!",
  "⏰ Zaman daralıyor — şimdi ya da hiç!",
];

const ALERT_CLOSERS = [
  "#valuebet #edge #fırsat",
  "#alarm #valuebet #bahis",
  "#mispricing #fırsat",
  "#edge #piyasa #bahis",
];

export function generateAlertTweet(data: PromptData): string {
  const edge = data.simEdge ?? 15;
  const lines: string[] = [];

  lines.push(pickRandom(ALERT_VALUE_OPENERS));
  lines.push("");
  lines.push(`⚽ ${data.homeTeam} vs ${data.awayTeam}`);
  lines.push(`📊 ${data.league ?? "Futbol"}`);
  lines.push("");
  lines.push(pickRandom(ALERT_EDGE_LINES)(edge));

  if (data.xgHome && data.xgAway) {
    lines.push(`📈 xG: ${data.xgHome.toFixed(1)} - ${data.xgAway.toFixed(1)}`);
  }

  if (data.simTopScoreline) {
    lines.push(`🎯 Skor: ${data.simTopScoreline} (%${data.simProbability ?? 0})`);
  }

  lines.push("");
  lines.push(`➜ ${data.pick} @${data.odds.toFixed(2)} (%${data.confidence})`);
  lines.push("");
  lines.push(pickRandom(ALERT_URGENCY));
  lines.push(pickRandom(ALERT_CLOSERS));

  return lines.join("\n");
}

// ============================================
// PERSONA 2b: CANLI GELİŞME — "In-Play Thread Reply"
// Maç içi kritik olay bildirimleri (thread altına reply)
// ============================================

interface LiveEventData {
  homeTeam: string;
  awayTeam: string;
  minute: number;
  currentScore: string;
  eventType: "red_card" | "goal" | "injury" | "var" | "momentum_shift";
  eventDescription: string;
  xgShift?: string; // "ev sahibi lehine %20 kaydı"
  originalPick?: string;
  impactAnalysis?: string;
}

const LIVE_RED_CARD_TEMPLATES = [
  (d: LiveEventData) => `🟥 GELİŞME (${d.minute}')\n\n${d.eventDescription}\n\n📊 ${d.impactAnalysis ?? "xG dengesi değişiyor"}\n\n⚽ ${d.homeTeam} ${d.currentScore} ${d.awayTeam}`,
  (d: LiveEventData) => `🟥 KIRMIZI KART! (${d.minute}')\n\n${d.eventDescription}\n\n${d.xgShift ? `📈 ${d.xgShift}` : ""}\n\n⚽ Skor: ${d.currentScore}`,
];

const LIVE_GOAL_TEMPLATES = [
  (d: LiveEventData) => `⚽ GOL! (${d.minute}')\n\n${d.homeTeam} ${d.currentScore} ${d.awayTeam}\n\n${d.eventDescription}\n${d.impactAnalysis ? `📊 ${d.impactAnalysis}` : ""}`,
  (d: LiveEventData) => `⚽ GOOOL! (${d.minute}')\n\n${d.currentScore}\n${d.eventDescription}\n\n${d.originalPick ? `🎯 Tahminimiz: ${d.originalPick}` : ""}`,
];

const LIVE_MOMENTUM_TEMPLATES = [
  (d: LiveEventData) => `📊 MOMENTUM DEĞİŞİMİ (${d.minute}')\n\n${d.homeTeam} ${d.currentScore} ${d.awayTeam}\n\n${d.eventDescription}\n${d.xgShift ? `📈 ${d.xgShift}` : ""}`,
  (d: LiveEventData) => `🔄 OYUN DENGESİ KAYDI (${d.minute}')\n\n${d.eventDescription}\n\n⚽ ${d.currentScore}`,
];

const LIVE_GENERIC_TEMPLATES = [
  (d: LiveEventData) => `📡 GÜNCELLEME (${d.minute}')\n\n${d.homeTeam} ${d.currentScore} ${d.awayTeam}\n\n${d.eventDescription}`,
];

export function generateLiveUpdateTweet(event: LiveEventData): string {
  let templates;

  switch (event.eventType) {
    case "red_card":
      templates = LIVE_RED_CARD_TEMPLATES;
      break;
    case "goal":
      templates = LIVE_GOAL_TEMPLATES;
      break;
    case "momentum_shift":
      templates = LIVE_MOMENTUM_TEMPLATES;
      break;
    default:
      templates = LIVE_GENERIC_TEMPLATES;
      break;
  }

  return pickRandom(templates)(event);
}

// ============================================
// PERSONA 3: RAPOR — "Şeffaf Performansçı"
// Sonuç odaklı, hesap veren persona
// ============================================

const OUTCOME_WON_TEMPLATES = [
  (d: PromptData) => `✅ TAHMİN TUTTU!\n\n⚽ ${d.homeTeam} ${d.actualScore} ${d.awayTeam}\n🎯 ${d.pick} @${d.odds.toFixed(2)} (%${d.confidence})\n\n💰 Bir daha isabet! Model çalışıyor.\n\n#başarılı #tahmin`,
  (d: PromptData) => `✅ İSABET!\n\n⚽ ${d.homeTeam} ${d.actualScore} ${d.awayTeam}\n🎯 Tahmin: ${d.pick} @${d.odds.toFixed(2)}\n\nVeri modeli bir kez daha doğrulandı.\n\n#win #analiz`,
  (d: PromptData) => `✅ KAZANAN TAHMİN\n\n${d.homeTeam} ${d.actualScore} ${d.awayTeam}\n\n📊 ${d.pick} @${d.odds.toFixed(2)} (%${d.confidence} güven)\nModel başarılı, istatistik yalan söylemez.\n\n#başarı #veri`,
  (d: PromptData) => `✅ BİR DAHA!\n\n⚽ ${d.actualScore}\n${d.homeTeam} vs ${d.awayTeam}\n\n🎯 ${d.pick} @${d.odds.toFixed(2)} → Bileti kesti!\n\n#tahmin #kazanç`,
];

const OUTCOME_LOST_TEMPLATES = [
  (d: PromptData) => `❌ Bu sefer olmadı.\n\n⚽ ${d.homeTeam} ${d.actualScore} ${d.awayTeam}\n📊 ${d.pick} @${d.odds.toFixed(2)} (%${d.confidence})\n\n🔧 Model güncellendi, veriden öğreniyoruz.\n\n#şeffaflık #analiz`,
  (d: PromptData) => `❌ Tutmadı.\n\n${d.homeTeam} ${d.actualScore} ${d.awayTeam}\n${d.pick} @${d.odds.toFixed(2)}\n\nFutbol sürprizlerle dolu — ama uzun vadede istatistik kazanır.\n\n#kayıp #transparanlık`,
  (d: PromptData) => `❌ Kaybettik.\n\n⚽ ${d.actualScore}\n${d.pick} tahminimiz tutmadı.\n\nLong-term ROI > tek maç. Analiz motoru öğreniyor.\n\n#şeffaf #gelişim`,
  (d: PromptData) => `❌ Bu kez hata.\n\n${d.homeTeam} ${d.actualScore} ${d.awayTeam}\n${d.pick} @${d.odds.toFixed(2)}\n\n📉 Her kaybı analiz ederek güçleniyoruz.\n\n#şeffaflık`,
];

export function generateOutcomeTweet(data: PromptData): string {
  if (data.result === "won") {
    return pickRandom(OUTCOME_WON_TEMPLATES)(data);
  }
  return pickRandom(OUTCOME_LOST_TEMPLATES)(data);
}

// ============================================
// PERSONA 3b: HAFTALIK RAPOR — Farklı açılardan performans
// ============================================

interface WeeklyReportData {
  totalPredictions: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
  streak?: number; // Pozitif = ardışık kazanç, negatif = ardışık kayıp
  bestLeague?: string;
  bestMarket?: string;
  valueBetRoi?: number;
  dashboardUrl?: string;
}

const WEEKLY_POSITIVE_OPENERS = [
  "🚀 HAFTALIK PERFORMANS",
  "📈 HAFTANIN ÖZETİ",
  "💰 HAFTALIK KARNE",
  "🎯 BU HAFTA DA KAZANDIRDIK",
];

const WEEKLY_NEGATIVE_OPENERS = [
  "📊 HAFTALIK ŞEFFAFLIK RAPORU",
  "📋 HAFTANIN ÖZETİ",
  "📉 ZOR HAFTA — AMA ÖĞRENDIK",
  "🔧 HAFTALIK ANALIZ & İYİLEŞTİRME",
];

const WEEKLY_INSIGHTS = shuffleArray([
  (d: WeeklyReportData) => d.bestMarket ? `🏆 En iyi pazar: ${d.bestMarket}` : null,
  (d: WeeklyReportData) => d.bestLeague ? `🌍 En başarılı lig: ${d.bestLeague}` : null,
  (d: WeeklyReportData) => d.valueBetRoi && d.valueBetRoi > 0 ? `💎 Value Bet ROI: +%${d.valueBetRoi.toFixed(0)}` : null,
  (d: WeeklyReportData) => d.streak && d.streak > 3 ? `🔥 ${d.streak} ardışık başarı!` : null,
]);

export function generateWeeklyReport(data: WeeklyReportData): string {
  const isPositive = data.roi >= 0;
  const opener = isPositive ? pickRandom(WEEKLY_POSITIVE_OPENERS) : pickRandom(WEEKLY_NEGATIVE_OPENERS);

  const lines: string[] = [];
  lines.push(opener);
  lines.push("");
  lines.push(`📋 ${data.totalPredictions} tahmin:`);
  lines.push(`✅ ${data.won} başarılı | ❌ ${data.lost} başarısız`);
  lines.push(`🎯 Başarı: %${data.winRate.toFixed(1)}`);
  lines.push(`💰 ROI: ${data.roi >= 0 ? "+" : ""}${data.roi.toFixed(1)}%`);

  // Dinamik insight satırları (her hafta farklı)
  const insights = WEEKLY_INSIGHTS
    .map((fn) => fn(data))
    .filter(Boolean)
    .slice(0, 2);

  if (insights.length > 0) {
    lines.push("");
    for (const insight of insights) {
      lines.push(insight!);
    }
  }

  if (data.dashboardUrl) {
    lines.push("");
    lines.push(`📊 Şeffaf sonuçlar: ${data.dashboardUrl}`);
  }

  lines.push("");
  lines.push(isPositive ? "#performans #kazanç #şeffaflık" : "#şeffaflık #gelişim #analiz");

  return lines.join("\n");
}

// ============================================
// GÜNLÜK THREAD BAŞLIKLARI — Her gün farklı açılış
// ============================================

const DAILY_THREAD_OPENERS = [
  (date: string) => `⚽ Günün Tahminleri | ${date}\n🤖 AI + Monte Carlo Analizi`,
  (date: string) => `⚽ ${date} Analiz Raporu\n📊 Data-Driven Tahminler`,
  (date: string) => `⚽ Bugünün İstatistik Haritası | ${date}\n🎲 10K Simülasyon Çıktısı`,
  (date: string) => `⚽ AI TAHMİN THREAD'İ | ${date}\n📈 xG + Monte Carlo + Form Analizi`,
  (date: string) => `⚽ Günün Veri Analizi | ${date}\n🤖 Motorumuz ${date} için çalıştı`,
];

export function generateDailyOpener(date: string): string {
  return pickRandom(DAILY_THREAD_OPENERS)(date);
}

// ============================================
// RATE LIMIT-SAFE: Tweet Önceliklendirme
// Cumartesi gibi yoğun günlerde hangi tweete öncelik vereceğini belirler
// ============================================

export interface TweetPriority {
  type: "daily_picks" | "live_alert" | "value_alert" | "outcome_reply" | "weekly_report";
  priority: number; // 1-10 (10 = en yüksek)
  maxPerHour: number;
}

export const TWEET_PRIORITIES: TweetPriority[] = [
  { type: "daily_picks", priority: 10, maxPerHour: 10 }, // Ana thread — limit yok
  { type: "value_alert", priority: 9, maxPerHour: 3 },   // Value bet — max 3/saat
  { type: "outcome_reply", priority: 7, maxPerHour: 5 },  // Sonuç reply
  { type: "live_alert", priority: 5, maxPerHour: 4 },     // Canlı — sınırlı
  { type: "weekly_report", priority: 8, maxPerHour: 1 },  // Haftalık
];

/**
 * Saatlik tweet bütçesi kontrolü
 * Rate limit'e çarpmadan kaç tweet atabileceğini hesapla
 */
export function getRemainingBudget(
  tweetType: TweetPriority["type"],
  tweetsThisHour: number
): { canTweet: boolean; remaining: number } {
  const config = TWEET_PRIORITIES.find((p) => p.type === tweetType);
  if (!config) return { canTweet: false, remaining: 0 };

  const remaining = Math.max(0, config.maxPerHour - tweetsThisHour);
  return { canTweet: remaining > 0, remaining };
}
