/**
 * Tweet Templates - Mühendislik Odaklı Profesyonel Şablonlar
 * 
 * TERMİNOLOJİ REHBERİ:
 * - "Tahmin" → "Model Çıktısı" / "Algoritma Çıktısı"
 * - "Kazanmak" → "Pozitif ROI" / "Doğrulandı (Validated)"
 * - "Yatmak" → "Veri Sapması" / "Model Hatası"
 * - "Kupon tuttu" → "Proje Doğrulandı"
 * - "Kupon yattı" → "Hata Analizi gerekli"
 * - "Şans" → "Varyans"
 * - "Bahis" → "Pozisyon"
 * 
 * Amaç: Profili "bahis sayfası"ndan "yazılım/analiz projesi"ne çevirmek
 */

import type { BotCoupon } from './types';

// ============ TERMİNOLOJİ SABİTLERİ ============

export const TERMINOLOGY = {
  prediction: 'Model Çıktısı',
  algorithmOutput: 'Algoritma Çıktısı',
  win: 'Doğrulandı',
  loss: 'Veri Sapması',
  couponWon: 'Proje Doğrulandı',
  couponLost: 'Hata Analizi',
  luck: 'Varyans',
  bet: 'Pozisyon',
  profit: 'Pozitif ROI',
  validated: 'Validated ✓',
};

// ============ GENEL YARDIMCI FONKSİYONLAR ============

/**
 * Güven sınıfı hesapla (A/B/C)
 */
export function getConfidenceClass(confidence: number): 'A' | 'B' | 'C' {
  if (confidence >= 85) return 'A';
  if (confidence >= 70) return 'B';
  return 'C';
}

/**
 * Kasa yüzdesi hesapla (sınıfa göre)
 */
export function getStakePercentage(confidenceClass: 'A' | 'B' | 'C'): number {
  switch (confidenceClass) {
    case 'A': return 7.5; // 1.5 birim / 20 birim * 100
    case 'B': return 5.0; // 1.0 birim
    case 'C': return 2.5; // 0.5 birim
  }
}

/**
 * Birim miktarı hesapla
 */
export function getUnits(confidenceClass: 'A' | 'B' | 'C'): number {
  switch (confidenceClass) {
    case 'A': return 1.5;
    case 'B': return 1.0;
    case 'C': return 0.5;
  }
}

// ============ VERİ ODAKLI MAÇ ÖNÜ ANALİZİ ============

export interface PreMatchAnalysisData {
  matchName: string;
  homeTeam: string;
  awayTeam: string;
  dataPoint1: string;  // Örn: "Son 3 maçta ceza sahasına girişlerde %20 artış"
  dataPoint2: string;  // Örn: "Duran toplarda %40 daha fazla açık veriyor"
  algorithmOutput: string;  // "KG Var" / "Üst 2.5" vs
  confidencePercent: number;
  suggestedUnits: number;
  reasoning: string;
}

export function formatPreMatchAnalysisTweet(data: PreMatchAnalysisData): string {
  return `🔍 Sistem Analizi: ${data.matchName}

Modelimiz bu maçta normalin dışında bir sapma tespit etti.

📊 Veri:
• ${data.homeTeam}: ${data.dataPoint1}
• ${data.awayTeam}: ${data.dataPoint2}

🎯 Algoritma Çıktısı: ${data.algorithmOutput}
📉 Güven Endeksi: %${data.confidencePercent}
🛠️ Önerilen Risk: ${data.suggestedUnits} Birim

#verianalizi #algoritma #futbol`;
}

// ============ CANLI TAKİP (xG ODAKLI) ============

export interface LiveTrackingData {
  matchName: string;
  minute: number;
  homeTeam: string;
  awayTeam: string;
  score: string;
  homeXg: number;
  awayXg: number;
  goalProbability: number;  // %88 gibi
  dominantTeam: string;
  pressureNote: string;
}

export function formatLiveTrackingTweet(data: LiveTrackingData): string {
  return `📡 Canlı Takip: ${data.matchName}

⏱️ ${data.minute}' | Skor: ${data.score}

Beklediğimiz baskı oluştu. ${data.dominantTeam}'nın xG (Gol Beklentisi) şu an ${data.homeXg.toFixed(2)}'e ulaştı.

📊 ${data.pressureNote}

Matematiksel olarak golün gelme olasılığı %${data.goalProbability}. 

Ekran başındayız, sistemin kendini doğrulamasını bekliyoruz. ⏳☕`;
}

export function formatLivePressureTweet(data: {
  matchName: string;
  minute: number;
  score: string;
  dominantTeam: string;
  xg: number;
  shotsOnTarget: number;
  possession: number;
}): string {
  return `⚡ ${data.matchName} - ${data.minute}'

${data.dominantTeam} baskısı devam ediyor:
• xG: ${data.xg.toFixed(2)}
• İsabetli şut: ${data.shotsOnTarget}
• Top kontrolü: %${data.possession}

Skor hala ${data.score}. Matematik gecikmeli de olsa kendini gösterir. 📈`;
}

// ============ 10:00 TSİ - GÜNLÜK BÜLTEN ============

export interface MorningBulletinData {
  date: string;
  totalMatches: number;
  topLeagueMatches: number;
  weakDefenseTeams: { team: string; concededLast5: number; league: string }[];
  weatherImpactMatches: { match: string; weather: string; impact: string }[];
  keyAbsences: { match: string; player: string; importance: string }[];
  expectedHighScoring: { match: string; avgGoals: number; reason: string }[];
}

export function formatMorningBulletinThread(data: MorningBulletinData): string[] {
  const tweets: string[] = [];
  
  // Ana tweet - otorite kurucu
  tweets.push(`📊 ${data.date} - GÜNLÜK ANALİZ BÜLTENİ

Bugün ${data.totalMatches} maç oynanıyor.
🏆 ${data.topLeagueMatches} maç top liglerden.

🔍 Modelimiz şu kritik faktörleri tespit etti:
• ${data.weakDefenseTeams.length} takım defans sorunu yaşıyor
• ${data.expectedHighScoring.length} maçta yüksek gol beklentisi

Detaylar için 👇

#bahis #analiz #futbol`);

  // Zayıf defans analizi
  if (data.weakDefenseTeams.length > 0) {
    let defenseText = `🚨 DEFANSI AKSAYAN TAKIMLAR

Bugün dikkat edilmesi gereken zayıf savunmalar:\n\n`;
    
    for (const team of data.weakDefenseTeams.slice(0, 4)) {
      defenseText += `⚠️ ${team.team} (${team.league})\n`;
      defenseText += `   Son 5 maçta ${team.concededLast5} gol yedi\n\n`;
    }
    
    defenseText += `💡 Bu takımlara karşı "Gol Olur" bahisleri değerlendirilebilir.`;
    tweets.push(defenseText);
  }

  // Yüksek gol beklentili maçlar
  if (data.expectedHighScoring.length > 0) {
    let highScoringText = `⚽ YÜKSEK GOL BEKLENTİLİ MAÇLAR\n\n`;
    
    for (const match of data.expectedHighScoring.slice(0, 3)) {
      highScoringText += `🔥 ${match.match}\n`;
      highScoringText += `   Ort. gol: ${match.avgGoals.toFixed(1)} | ${match.reason}\n\n`;
    }
    
    highScoringText += `📈 xG modeli bu maçlarda Üst 2.5 öngörüyor.`;
    tweets.push(highScoringText);
  }

  // Sakatlık/ceza etkileri
  if (data.keyAbsences.length > 0) {
    let absenceText = `🏥 KRİTİK EKSIKLER\n\n`;
    
    for (const absence of data.keyAbsences.slice(0, 3)) {
      absenceText += `❌ ${absence.match}\n`;
      absenceText += `   ${absence.player} - ${absence.importance}\n\n`;
    }
    
    absenceText += `⚠️ Bu eksikler oran değerlendirmelerini etkiliyor.`;
    tweets.push(absenceText);
  }

  return tweets;
}

// ============ 13:00 TSİ - ANA KUPON ============

export interface MainCouponData {
  coupon: BotCoupon;
  avgConfidence: number;
  confidenceClass: 'A' | 'B' | 'C';
  units: number;
  bankrollPercentage: number;
  matchReasons: { match: string; pick: string; why: string }[];
}

export function formatMainCouponThread(data: MainCouponData): string[] {
  const tweets: string[] = [];
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  
  // Ana kupon tweeti - güven endeksi ile
  let mainTweet = `🎯 ${today} - GÜNÜN KUPONU

📊 Güven Endeksi: %${data.avgConfidence}
📈 Sınıf: ${data.confidenceClass}
💰 Önerilen Risk: ${data.units} Birim (Kasanın %${data.bankrollPercentage}'${data.bankrollPercentage >= 5 ? 'i' : 'u'})

`;

  for (const m of data.coupon.matches) {
    mainTweet += `${m.homeTeam} - ${m.awayTeam}\n`;
    mainTweet += `🎯 ${m.prediction.label} @${m.prediction.odds.toFixed(2)}\n\n`;
  }
  
  mainTweet += `💵 Toplam Oran: ${data.coupon.totalOdds.toFixed(2)}\n\n`;
  mainTweet += `⚠️ Bahis bir maratondur, 100 metre koşusu değil.`;
  
  tweets.push(mainTweet);

  // "Neden bu maçlar?" açıklama tweet'i - Veri odaklı
  let reasonTweet = `📝 MODEL DETAYLARI\n\n`;
  
  for (const mr of data.matchReasons) {
    reasonTweet += `🔍 ${mr.match}\n`;
    reasonTweet += `   ${mr.pick}: ${mr.why}\n\n`;
  }
  
  reasonTweet += `\n💻 Veri disiplinine sadık kalıyoruz.`;
  
  tweets.push(reasonTweet);

  return tweets;
}

// ============ PROJE DOĞRULANDI (KUPON TUTUNCA) ============

export interface ProjectValidatedData {
  projectId: string;
  matches: { name: string; result: 'OK' | 'FAIL' }[];
  netProfit: number;
  currentBankroll: number;
  totalOdds: number;
}

export function formatProjectValidatedTweet(data: ProjectValidatedData): string {
  let matchResults = '';
  for (const m of data.matches) {
    const icon = m.result === 'OK' ? '✓' : '✗';
    matchResults += `${m.name} - ${icon}\n`;
  }
  
  return `✅ Proje Doğrulandı: #${data.projectId}

${matchResults}
🚀 Net Kar: +${data.netProfit.toFixed(1)} Birim
📈 Güncel Kasa: ${data.currentBankroll.toFixed(1)} Birim

Varyansı ekarte ettiğimiz sürece kasa büyümeye devam eder.

Veri disiplinine sadık kalanlara tebrikler.
Bize mühendislik yeter. 💻📊`;
}

// ============ HATA ANALİZİ (KUPON YATINCA) ============

export interface ErrorAnalysisData {
  matchName: string;
  expectedOutcome: string;
  actualOutcome: string;
  errorReason: string;  // "15. dakikada kırmızı kart görünce oyun planı değişti"
  unitsLost: number;
  stopLossNote: string;
}

export function formatErrorAnalysisTweet(data: ErrorAnalysisData): string {
  return `⚠️ Hata Analizi (Post-Match Report)

${data.matchName} beklentimizin altında kaldı.

❓ Neden?
${data.errorReason}

📊 Beklenen: ${data.expectedOutcome}
📉 Gerçekleşen: ${data.actualOutcome}

Kasa yönetim protokolümüz (Stop-Loss) sayesinde sadece ${data.unitsLost.toFixed(1)} birim kayıpla günü kapattık.

${data.stopLossNote}

Disiplin, tek bir kupondan daha önemlidir. 🛡️`;
}

// Detaylı hata nedenleri
export const ERROR_REASONS = {
  redCard: (team: string, minute: number) => 
    `${team} ${minute}. dakikada kırmızı kart görünce tüm oyun planı ve modelin veri seti çöktü.`,
  injury: (player: string, minute: number) => 
    `${player}'ın ${minute}. dakikada sakatlanması modelin hesaplamadığı bir değişken oldu.`,
  tacticalChange: (team: string) => 
    `${team}'ın beklenmedik taktik değişikliği model varsayımlarını geçersiz kıldı.`,
  weatherImpact: () => 
    `Hava koşulları oyun stilini beklenenden fazla etkiledi.`,
  refereeDecision: (description: string) => 
    `Tartışmalı hakem kararı: ${description}`,
  unexpectedPerformance: (team: string, type: 'üstün' | 'düşük') => 
    `${team} normalin ${type} bir performans sergiledi.`,
  goalkeepingHeroics: (team: string) => 
    `${team} kalecisinin olağanüstü kurtarışları xG'yi geçersiz kıldı.`,
  varianceFactor: () => 
    `Bu, modelin %70 güven aralığında bile karşılaşılabilecek doğal bir varyans örneğiydi.`,
};

// ============ 16:00 TSİ - DERİN İSTATİSTİK ============

export interface DeepStatsData {
  stat: string;
  context: string;
  source: string;
  league: string;
  actionable: string;
}

export function formatDeepStatsTweet(data: DeepStatsData): string {
  return `📊 BİLİYOR MUYDUNUZ?

${data.stat}

📈 Bağlam: ${data.context}

💡 Uygulanabilirlik: ${data.actionable}

📖 Kaynak: ${data.source}

#futbol #istatistik #analiz #${data.league.toLowerCase().replace(/\s/g, '')}`;
}

// Dinamik istatistik şablonları
export interface DynamicStat {
  template: string;
  variables: Record<string, string | number>;
  context: string;
  actionable: string;
}

export function generateDynamicStat(stat: DynamicStat): string {
  let text = stat.template;
  for (const [key, value] of Object.entries(stat.variables)) {
    text = text.replace(`{${key}}`, String(value));
  }
  return text;
}

// ============ 17:00-02:00 - CANLI TAKİP ============

export interface LiveMomentData {
  match: string;
  minute: number;
  event: 'goal' | 'halftime' | 'fulltime' | 'pressure' | 'red_card';
  team?: string;
  score?: string;
  prediction?: string;
  wasCorrect?: boolean;
}

export function formatLiveGoalTweet(data: LiveMomentData): string {
  if (data.event === 'pressure') {
    return `⚡ ${data.match} - ${data.minute}'

${data.team} baskıyı kurdu. xG artışı görülüyor.

Matematiksel olarak gol olasılığı yükseliyor... 📈

#canli #analiz`;
  }
  
  if (data.event === 'goal') {
    const celebration = data.wasCorrect ? '✅ Sistem Doğrulandı!' : '⚽ GOL!';
    return `${celebration}

${data.match} - ${data.minute}'
Skor: ${data.score}

${data.wasCorrect ? `Model çıktısı tuttu: ${data.prediction}` : ''}

#canli #analiz`;
  }
  
  if (data.event === 'halftime') {
    return `⏸️ DEVRE ARASI ANALİZİ

${data.match}
Skor: ${data.score}

📊 İlk yarı verileri işleniyor...
İkinci yarı projeksiyonu 👇`;
  }
  
  if (data.event === 'fulltime') {
    const resultText = data.wasCorrect 
      ? '✅ Model Doğrulandı (Validated)' 
      : '📊 Veri sapması analiz edilecek';
    return `🏁 MAÇ SONU

${data.match}
Final: ${data.score}

${resultText}`;
  }
  
  return '';
}

// ============ 05:00 TSİ - GECE RAPORU ============

export interface NightReportData {
  date: string;
  totalCoupons: number;
  wonCoupons: number;
  lostCoupons: number;
  totalStaked: number;
  totalReturned: number;
  profit: number;
  roi: number;
  weeklyProfit: number;
  weeklyROI: number;
  bestPrediction?: { match: string; odds: number; reasoning: string };
  worstPrediction?: { match: string; odds: number; whatWentWrong: string };
}

export function formatNightReportThread(data: NightReportData): string[] {
  const tweets: string[] = [];
  
  const profitEmoji = data.profit >= 0 ? '📈' : '📉';
  const profitSign = data.profit >= 0 ? '+' : '';
  const statusText = data.profit >= 0 ? 'Pozitif ROI' : 'Negatif ROI';
  
  // Ana özet - Mühendislik diliyle
  tweets.push(`🌙 ${data.date} - GÜNLÜK PERFORMANS RAPORU

${profitEmoji} ${statusText}:
• Projeler: ${data.wonCoupons}/${data.totalCoupons} doğrulandı
• Giriş: ${data.totalStaked.toFixed(0)} Birim
• Çıkış: ${data.totalReturned.toFixed(0)} Birim
• Net: ${profitSign}${data.profit.toFixed(1)} Birim
• ROI: ${profitSign}${data.roi.toFixed(1)}%

📊 Haftalık ROI: ${profitSign}${data.weeklyROI.toFixed(1)}%

Varyansı minimize ettiğimiz sürece kasa büyür.
Matematik yalan söylemez. 💻`);

  // Doğrulanan proje analizi
  if (data.bestPrediction && data.wonCoupons > 0) {
    tweets.push(`✅ DOĞRULANAN MODEL ÇIKTISI

${data.bestPrediction.match}
@${data.bestPrediction.odds.toFixed(2)}

🔍 Neden doğrulandı?
${data.bestPrediction.reasoning}

Model bu tür kalıpları tanımlıyor ve katalogluyor. 📊`);
  }

  // Hata analizi (şeffaflık - güven oluşturur)
  if (data.worstPrediction && data.lostCoupons > 0) {
    tweets.push(`⚠️ VERİ SAPMASI ANALİZİ

${data.worstPrediction.match}

❓ Model burada neden yanıldı?
${data.worstPrediction.whatWentWrong}

🔄 Bu veri noktası modeli güçlendirecek.

(Hataları analiz etmek, başarıdan daha öğreticidir.)
Yarın sabah yeni verilerle devam. 🛡️`);
  }

  return tweets;
}

// ============ KASA YÖNETİM TWEET'LERİ ============

export function formatBankrollIntroTweet(): string {
  return `📢 DUYURU: Kasa Yönetimi Protokolü

Kuponun tutması başarıdır ama kasanın büyümesi disiplindir.

Bugün itibariyle "20 Birimlik Kasa Yönetimi"ne geçiyoruz:

📊 Günlük Risk: Max %10 (2 Birim)
📈 A Sınıfı (%85+): 1.5 Birim
📊 B Sınıfı (%70-85): 1 Birim  
📉 C Sınıfı (Sürpriz): 0.5 Birim

⚖️ Stop-Loss: -2 Birim/gün
🎯 Hedef: +2 Birim/gün

Mühendislik bunu gerektirir. 💻`;
}

export function formatROITweet(
  daysCount: number,
  totalInvested: number,
  totalReturned: number,
  roi: number
): string {
  return `📊 ${daysCount} GÜNLÜK PERFORMANS RAPORU

Toplam Yatırım: ${totalInvested.toFixed(0)} Birim
Toplam Getiri: ${totalReturned.toFixed(1)} Birim
Net Kar: ${(totalReturned - totalInvested).toFixed(1)} Birim

ROI (Yatırım Getirisi): %${roi.toFixed(1)}

${roi > 0 ? '✅ Sistem pozitif çalışıyor.' : '📈 Model optimizasyonu devam ediyor.'}

Matematik yalan söylemez. 💻📊`;
}

// ============ MİLESTONE TWEET'LERİ ============

export function formatMilestoneTweet(
  type: 'streak' | 'profit' | 'accuracy' | 'coupon_count',
  value: number,
  context: string
): string {
  const templates: Record<string, string> = {
    streak: `🔥 ${value} KUPON SERİSİ!

Art arda ${value} kupon tutturuldu.

${context}

Disiplin + Model = Sonuç 💻`,
    profit: `📈 +${value} BİRİM HEDEFE ULAŞILDI!

${context}

Küçük adımlar, büyük hedefler.
Matematik yalan söylemez. 💻`,
    accuracy: `🎯 %${value} DOĞRULUK ORANI!

${context}

Model kalibrasyonu başarılı. 📊`,
    coupon_count: `📊 ${value}. KUPON TAMAMLANDI!

${context}

Her kupon, modeli güçlendiren bir veri noktası. 💻`
  };
  
  return templates[type] || '';
}

// ============ TWEET VALİDASYON ============

export function validateTweetLength(text: string): { valid: boolean; length: number; overflow: number } {
  const length = text.length;
  return {
    valid: length <= 280,
    length,
    overflow: Math.max(0, length - 280)
  };
}

export function truncateTweet(text: string, maxLength: number = 280): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============ 1. CANLI MAÇ KEŞFİ (RADAR) ============

export interface LiveRadarData {
  homeTeam: string;
  awayTeam: string;
  minute: number;
  deviation: string;  // "ani sapma", "momentum değişimi" vs
  parameter: string;  // "Son 10 dakikada baskıyı %30 artırdı"
  xgNote: string;     // "xG (Gol Beklentisi) eşiği aşıldı"
  suggestion: string; // "Sıradaki Gol" / "0.5 Üst" / "Korner"
  confidencePercent: number;
  matchTag?: string;
}

export function formatLiveRadarTweet(data: LiveRadarData): string {
  const matchTag = data.matchTag || `${data.homeTeam}vs${data.awayTeam}`.replace(/\s/g, '');
  
  return `📡 [SİSTEM RADARI: CANLI ANALİZ]

🏟 Maç: ${data.homeTeam} vs ${data.awayTeam}
⏱ Dakika: ${data.minute}'
📉 Durum: Veri setinde ${data.deviation} tespit edildi.
📊 Parametre: ${data.parameter}. ${data.xgNote}

🎯 Öneri: ${data.suggestion}
🛠 Güven Skoru: %${data.confidencePercent}

#CanlıAnaliz #${matchTag}`;
}

// ============ 2. KUPON DURUMU (ARA RAPOR) ============

export interface CouponStatusData {
  batchNumber: string;  // "01", "02" vs
  matches: {
    name: string;
    status: 'validated' | 'in_progress' | 'pending' | 'failed';
    progressPercent?: number;  // Sadece in_progress için
    note?: string;
  }[];
  instantSuccessRate: number;
  modelStatus: string;  // "stabil", "güncelleniyor", "analiz ediliyor"
}

export function formatCouponStatusReport(data: CouponStatusData): string {
  const statusIcons = {
    validated: '🟢',
    in_progress: '🟡',
    pending: '🔵',
    failed: '🔴'
  };
  
  const statusLabels = {
    validated: 'Sistem Doğrulandı',
    in_progress: 'Süreç devam ediyor',
    pending: 'Beklemede',
    failed: 'Veri Sapması'
  };
  
  let matchLines = '';
  for (const match of data.matches) {
    const icon = statusIcons[match.status];
    let statusText = statusLabels[match.status];
    
    if (match.status === 'in_progress' && match.progressPercent) {
      statusText = `Momentumun %${match.progressPercent}'i tamamlandı. ${statusText}`;
    }
    if (match.note) {
      statusText += ` (${match.note})`;
    }
    
    matchLines += `${icon} ${match.name}: ${statusText}\n`;
  }
  
  return `🔄 [KUPON DURUM RAPORU - BATCH #${data.batchNumber}]

${matchLines.trim()}

💹 Anlık Başarı Oranı: %${data.instantSuccessRate}
💻 Model ${data.modelStatus}, veri akışını takip ediyoruz.`;
}

// ============ 3. GÜNÜN KUPONU (LANSMAN) ============

export interface DailyCouponLaunchData {
  date: string;  // "05.02.2026"
  filteredCount: number;  // Kaç maçtan filtrelendi
  matches: {
    homeTeam: string;
    awayTeam: string;
    prediction: string;
    odds: number;
  }[];
  totalOdds: number;
  units: number;
  bankrollPercent: number;
  analysisNote: string;  // Ana çıkış noktası
}

export function formatDailyCouponLaunch(data: DailyCouponLaunchData): string {
  let matchLines = '';
  data.matches.forEach((match, index) => {
    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'][index] || `${index + 1}.`;
    matchLines += `${emoji} ${match.homeTeam} - ${match.awayTeam}: ${match.prediction} (Odds: ${match.odds.toFixed(2)})\n`;
  });
  
  return `🚀 [GÜNLÜK VERİ SETİ: #${data.date}]

Toplam bültenden filtrelenen ${data.filteredCount} yüksek olasılıklı çıktı:

${matchLines.trim()}

📊 Toplam Oran: ${data.totalOdds.toFixed(2)}
🛡 Kasa Yönetimi: ${data.units.toFixed(1)} Birim (Kasa %${data.bankrollPercent})
🔑 Analiz Notu: ${data.analysisNote}

#GününKuponu #KuponMühendisi`;
}

// ============ 4. GECE SEANSI (GLOBAL VERİ) ============

export interface NightSessionData {
  sportType: 'football' | 'basketball';  // ⚽ veya 🏀
  matchName: string;
  prediction: string;
  algorithmNote: string;  // "Deplasman takımının 'yorgunluk indeksi' yüksek"
  region: string;  // "SouthAmerica", "NBA", "MLS" vs
}

export function formatNightSessionTweet(data: NightSessionData): string {
  const sportIcon = data.sportType === 'basketball' ? '🏀' : '⚽';
  
  return `🌑 [NIGHT SHIFT: GECE ANALİZİ]

Yerel bülten kapandı, modelimiz okyanus ötesi verilere odaklandı.

${sportIcon} Maç: ${data.matchName}
🎯 Tahmin: ${data.prediction}
🔬 Algoritma Notu: ${data.algorithmNote}

#${data.region} #GeceSeansi #BahisAnaliz`;
}

// ============ 5. HAFTALIK VERİMLİLİK RAPORU ============

export interface WeeklyPerformanceData {
  dateRange: { start: string; end: string };  // "29.01.2026" - "05.02.2026"
  successfulPredictions: number;
  failedPredictions: number;
  roiPercent: number;
  bankrollChange: number;  // Birim cinsinden (+2.5, -1.0 gibi)
  nextWeekFocus: string;  // Algoritma güncellemesi notu
}

export function formatWeeklyPerformanceReport(data: WeeklyPerformanceData): string {
  const changeSign = data.bankrollChange >= 0 ? '+' : '';
  const totalPredictions = data.successfulPredictions + data.failedPredictions;
  const hitRate = totalPredictions > 0 
    ? ((data.successfulPredictions / totalPredictions) * 100).toFixed(1)
    : '0.0';
  
  return `📈 [HAFTALIK SİSTEM PERFORMANSI]

Tarih Aralığı: ${data.dateRange.start} - ${data.dateRange.end}

✅ Başarılı Tahmin: ${data.successfulPredictions}
❌ Hatalı Tahmin: ${data.failedPredictions}
🎯 İsabet Oranı: %${hitRate}
📊 ROI (Yatırım Getirisi): %${data.roiPercent.toFixed(1)}
💰 Kasa Değişimi: ${changeSign}${data.bankrollChange.toFixed(1)} Birim

🛠 Gelecek Hafta Odağı: ${data.nextWeekFocus}

Şeffaflık, mühendisliğin temelidir. 💻📉`;
}

// ============ YARDIMCI: BATCH NUMARASI HESAPLA ============

export function getBatchNumber(hour: number): string {
  // Günde kaç batch olduğunu takip et
  // 17:00-02:00 arası her saat bir batch
  if (hour >= 17) return String(hour - 16).padStart(2, '0');
  if (hour <= 2) return String(hour + 8).padStart(2, '0');
  return '01';
}

// ============ EXPORT: TÜM ŞABLONLAR ============

export const TWEET_TEMPLATES = {
  liveRadar: formatLiveRadarTweet,
  couponStatus: formatCouponStatusReport,
  dailyCouponLaunch: formatDailyCouponLaunch,
  nightSession: formatNightSessionTweet,
  weeklyPerformance: formatWeeklyPerformanceReport,
  preMatchAnalysis: formatPreMatchAnalysisTweet,
  liveTracking: formatLiveTrackingTweet,
  projectValidated: formatProjectValidatedTweet,
  errorAnalysis: formatErrorAnalysisTweet,
  deepStats: formatDeepStatsTweet,
  morningBulletin: formatMorningBulletinThread,
  mainCoupon: formatMainCouponThread,
};
