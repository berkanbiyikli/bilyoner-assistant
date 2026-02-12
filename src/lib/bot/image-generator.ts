// ============================================
// Image Generator — "Visual Proof"
// SVG tabanlı görsel üretimi → Base64 PNG
// Canvas/Sharp kullanmadan, pure SVG → Buffer
//
// 1. Simülasyon Çıktısı (Top 5 Skor tablosu)
// 2. Haftalık ROI Kartı (Performans grafiği)
// 3. Maç Analiz Kartı (xG, form, tahmin özeti)
// ============================================

// ---- Types ----

interface ScorelineRow {
  score: string;
  probability: number;
}

interface SimulationCardData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  topScores: ScorelineRow[]; // max 5
  pick: string;
  odds: number;
  confidence: number;
  simRuns: number;
  xgHome?: number;
  xgAway?: number;
}

interface ROICardData {
  period: string; // "Bu Hafta" | "Son 30 Gün"
  totalPredictions: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
  dailyResults?: Array<{ day: string; profit: number }>; // Son 7 gün
  topMarket?: string;
  valueBetRoi?: number;
}

interface MatchCardData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  pick: string;
  odds: number;
  confidence: number;
  xgHome: number;
  xgAway: number;
  homeForm: number;
  awayForm: number;
  simTopScore?: string;
  simProb?: number;
}

// ---- SVG Helpers ----

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function confidenceColor(c: number): string {
  if (c >= 70) return "#22c55e"; // green
  if (c >= 55) return "#eab308"; // yellow
  return "#ef4444"; // red
}

function roiColor(roi: number): string {
  return roi >= 0 ? "#22c55e" : "#ef4444";
}

// ============================================
// 1. SİMÜLASYON ÇIKTI KARTI
// Top 5 skor dağılımı — şık bar chart
// ============================================

export function generateSimulationCard(data: SimulationCardData): string {
  const W = 600;
  const H = 400;
  const maxProb = Math.max(...data.topScores.map((s) => s.probability), 1);

  const barRows = data.topScores.slice(0, 5).map((s, i) => {
    const barWidth = (s.probability / maxProb) * 280;
    const y = 155 + i * 42;
    const barColor = i === 0 ? "#3b82f6" : i === 1 ? "#60a5fa" : "#93c5fd";

    return `
      <text x="40" y="${y + 16}" fill="#e2e8f0" font-size="14" font-family="monospace">${escapeXml(s.score)}</text>
      <rect x="120" y="${y}" width="${barWidth}" height="28" rx="4" fill="${barColor}" opacity="0.9"/>
      <text x="${125 + barWidth}" y="${y + 18}" fill="#94a3b8" font-size="12" font-family="monospace">%${s.probability}</text>
    `;
  }).join("");

  const xgLine = data.xgHome && data.xgAway
    ? `<text x="300" y="${H - 25}" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">xG: ${data.xgHome.toFixed(1)} - ${data.xgAway.toFixed(1)}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:#0f172a"/>
        <stop offset="100%" style="stop-color:#1e293b"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" rx="16" fill="none" stroke="#334155" stroke-width="1"/>

    <!-- Header -->
    <text x="30" y="35" fill="#f8fafc" font-size="18" font-weight="bold" font-family="sans-serif">🎲 Simülasyon Çıktısı</text>
    <text x="30" y="58" fill="#94a3b8" font-size="12" font-family="sans-serif">${escapeXml(data.league)} | ${data.simRuns.toLocaleString()} iterasyon</text>

    <!-- Teams -->
    <text x="30" y="90" fill="#e2e8f0" font-size="16" font-weight="bold" font-family="sans-serif">${escapeXml(data.homeTeam)} vs ${escapeXml(data.awayTeam)}</text>

    <!-- Divider -->
    <line x1="30" y1="105" x2="${W - 30}" y2="105" stroke="#334155" stroke-width="1"/>

    <!-- Header Row -->
    <text x="40" y="135" fill="#64748b" font-size="11" font-family="sans-serif">SKOR</text>
    <text x="120" y="135" fill="#64748b" font-size="11" font-family="sans-serif">OLASILIK</text>

    <!-- Score Bars -->
    ${barRows}

    <!-- Footer -->
    <rect x="30" y="${H - 55}" width="${W - 60}" height="35" rx="8" fill="#1e3a5f" opacity="0.6"/>
    <text x="45" y="${H - 32}" fill="#60a5fa" font-size="13" font-weight="bold" font-family="sans-serif">➜ ${escapeXml(data.pick)} @${data.odds.toFixed(2)}</text>
    <circle cx="${W - 85}" cy="${H - 38}" r="10" fill="${confidenceColor(data.confidence)}"/>
    <text x="${W - 65}" y="${H - 33}" fill="#e2e8f0" font-size="12" font-family="monospace">%${data.confidence}</text>

    ${xgLine}
  </svg>`;

  // SVG → Base64
  return Buffer.from(svg).toString("base64");
}

// ============================================
// 2. HAFTALIK ROI KARTI
// Performans grafiği — bar chart + metrikler
// ============================================

export function generateROICard(data: ROICardData): string {
  const W = 600;
  const H = 380;

  // Mini bar chart (son 7 gün)
  let barsSection = "";
  if (data.dailyResults && data.dailyResults.length > 0) {
    const maxVal = Math.max(...data.dailyResults.map((d) => Math.abs(d.profit)), 1);
    const barAreaWidth = 300;
    const barW = Math.min(30, barAreaWidth / data.dailyResults.length - 4);
    const midY = 240;

    barsSection = data.dailyResults.map((d, i) => {
      const barH = (Math.abs(d.profit) / maxVal) * 60;
      const x = 50 + i * (barW + 8);
      const isPositive = d.profit >= 0;
      const y = isPositive ? midY - barH : midY;
      const color = isPositive ? "#22c55e" : "#ef4444";

      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${color}" opacity="0.8"/>
        <text x="${x + barW / 2}" y="${midY + 20}" fill="#64748b" font-size="9" text-anchor="middle" font-family="sans-serif">${escapeXml(d.day)}</text>
      `;
    }).join("");

    // Baseline
    barsSection += `<line x1="45" y1="${midY}" x2="${50 + data.dailyResults.length * (barW + 8)}" y2="${midY}" stroke="#475569" stroke-width="1" stroke-dasharray="4"/>`;
  }

  const winRateBar = (data.winRate / 100) * 200;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="roibg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:#0f172a"/>
        <stop offset="100%" style="stop-color:#1a1a2e"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="${W}" height="${H}" rx="16" fill="url(#roibg)"/>
    <rect width="${W}" height="${H}" rx="16" fill="none" stroke="#334155" stroke-width="1"/>

    <!-- Header -->
    <text x="30" y="35" fill="#f8fafc" font-size="18" font-weight="bold" font-family="sans-serif">📊 ${escapeXml(data.period)} Performans</text>
    <text x="30" y="55" fill="#94a3b8" font-size="12" font-family="sans-serif">${data.totalPredictions} tahmin analiz edildi</text>

    <!-- Stats Grid -->
    <rect x="30" y="70" width="130" height="60" rx="8" fill="#1e293b"/>
    <text x="95" y="92" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="sans-serif">BAŞARI</text>
    <text x="95" y="118" fill="${confidenceColor(data.winRate)}" font-size="22" font-weight="bold" text-anchor="middle" font-family="monospace">%${data.winRate.toFixed(1)}</text>

    <rect x="170" y="70" width="130" height="60" rx="8" fill="#1e293b"/>
    <text x="235" y="92" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="sans-serif">ROI</text>
    <text x="235" y="118" fill="${roiColor(data.roi)}" font-size="22" font-weight="bold" text-anchor="middle" font-family="monospace">${data.roi >= 0 ? "+" : ""}${data.roi.toFixed(1)}%</text>

    <rect x="310" y="70" width="130" height="60" rx="8" fill="#1e293b"/>
    <text x="375" y="92" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="sans-serif">W / L</text>
    <text x="375" y="118" fill="#e2e8f0" font-size="20" font-weight="bold" text-anchor="middle" font-family="monospace">${data.won}/${data.lost}</text>

    <!-- Win Rate Bar -->
    <text x="30" y="160" fill="#94a3b8" font-size="11" font-family="sans-serif">Başarı Çubuğu</text>
    <rect x="130" y="148" width="200" height="14" rx="7" fill="#1e293b"/>
    <rect x="130" y="148" width="${winRateBar}" height="14" rx="7" fill="${confidenceColor(data.winRate)}" opacity="0.8"/>
    <text x="340" y="159" fill="#94a3b8" font-size="10" font-family="monospace">%${data.winRate.toFixed(0)}</text>

    <!-- Daily Chart -->
    ${barsSection}

    <!-- Footer -->
    <text x="30" y="${H - 20}" fill="#475569" font-size="10" font-family="sans-serif">🤖 AI Prediction Bot — Şeffaf Sonuçlar</text>
    ${data.topMarket ? `<text x="${W - 30}" y="${H - 20}" fill="#64748b" font-size="10" text-anchor="end" font-family="sans-serif">🏆 ${escapeXml(data.topMarket)}</text>` : ""}
  </svg>`;

  return Buffer.from(svg).toString("base64");
}

// ============================================
// 3. MAÇ ANALİZ KARTI
// Mini infographic — xG, form ve prediksiyon
// ============================================

export function generateMatchCard(data: MatchCardData): string {
  const W = 500;
  const H = 300;

  const homeFormBar = (data.homeForm / 100) * 120;
  const awayFormBar = (data.awayForm / 100) * 120;

  const xgHomeBar = (data.xgHome / Math.max(data.xgHome, data.xgAway, 1)) * 100;
  const xgAwayBar = (data.xgAway / Math.max(data.xgHome, data.xgAway, 1)) * 100;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="mcbg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:#0f172a"/>
        <stop offset="100%" style="stop-color:#1e293b"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="${W}" height="${H}" rx="12" fill="url(#mcbg)"/>

    <!-- League Tag -->
    <rect x="15" y="12" width="${Math.min(data.league.length * 7 + 20, 180)}" height="22" rx="11" fill="#1e3a5f"/>
    <text x="25" y="27" fill="#60a5fa" font-size="10" font-family="sans-serif">${escapeXml(data.league)}</text>

    <!-- Teams -->
    <text x="30" y="65" fill="#f8fafc" font-size="16" font-weight="bold" font-family="sans-serif">${escapeXml(data.homeTeam)}</text>
    <text x="${W / 2}" y="65" fill="#475569" font-size="14" text-anchor="middle" font-family="sans-serif">vs</text>
    <text x="${W - 30}" y="65" fill="#f8fafc" font-size="16" font-weight="bold" text-anchor="end" font-family="sans-serif">${escapeXml(data.awayTeam)}</text>

    <!-- xG comparison -->
    <text x="30" y="100" fill="#94a3b8" font-size="11" font-family="sans-serif">xG</text>
    <rect x="55" y="88" width="${xgHomeBar}" height="14" rx="7" fill="#3b82f6" opacity="0.7"/>
    <text x="${60 + xgHomeBar}" y="99" fill="#94a3b8" font-size="10" font-family="monospace">${data.xgHome.toFixed(1)}</text>

    <rect x="${W - 55 - xgAwayBar}" y="88" width="${xgAwayBar}" height="14" rx="7" fill="#ef4444" opacity="0.7"/>
    <text x="${W - 65 - xgAwayBar}" y="99" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace">${data.xgAway.toFixed(1)}</text>

    <!-- Form -->
    <text x="30" y="135" fill="#94a3b8" font-size="11" font-family="sans-serif">Form</text>
    <rect x="70" y="123" width="${homeFormBar}" height="14" rx="7" fill="#22c55e" opacity="0.6"/>
    <text x="${75 + homeFormBar}" y="134" fill="#94a3b8" font-size="10" font-family="monospace">%${data.homeForm}</text>

    <rect x="${W - 70 - awayFormBar}" y="123" width="${awayFormBar}" height="14" rx="7" fill="#f59e0b" opacity="0.6"/>
    <text x="${W - 75 - awayFormBar}" y="134" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace">%${data.awayForm}</text>

    <!-- Divider -->
    <line x1="30" y1="155" x2="${W - 30}" y2="155" stroke="#334155" stroke-width="1"/>

    <!-- Prediction -->
    <rect x="30" y="165" width="${W - 60}" height="50" rx="10" fill="#1e3a5f" opacity="0.5"/>
    <text x="${W / 2}" y="185" fill="#60a5fa" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif">➜ ${escapeXml(data.pick)} @${data.odds.toFixed(2)}</text>
    <circle cx="${W / 2 - 50}" cy="200" r="6" fill="${confidenceColor(data.confidence)}"/>
    <text x="${W / 2 - 38}" y="204" fill="#e2e8f0" font-size="11" font-family="sans-serif">Güven: %${data.confidence}</text>

    ${data.simTopScore ? `<text x="${W / 2 + 30}" y="204" fill="#94a3b8" font-size="10" font-family="sans-serif">🎯 ${escapeXml(data.simTopScore)} (%${data.simProb ?? 0})</text>` : ""}

    <!-- Kickoff -->
    <text x="${W / 2}" y="${H - 25}" fill="#475569" font-size="10" text-anchor="middle" font-family="sans-serif">⏰ ${escapeXml(data.kickoff)}</text>

    <!-- Branding -->
    <text x="${W - 20}" y="${H - 12}" fill="#334155" font-size="8" text-anchor="end" font-family="sans-serif">🤖 AI Prediction Bot</text>
  </svg>`;

  return Buffer.from(svg).toString("base64");
}
