// ============================================
// Bilyoner Assistant — Content Script v2
// Bilyoner.com üzerinde kupon aktarımı yapar
// ============================================

// Mesaj dinleyicisi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TRANSFER_COUPON") {
    handleTransfer(message.predictions)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === "SCAN_MATCHES") {
    sendResponse({ matches: scanBilyonerMatches() });
    return true;
  }
});

// ============================================
// Pick → Bilyoner buton etiketleri
// ============================================
const PICK_TO_BILYONER = {
  "1": ["MS 1"], "X": ["MS X"], "2": ["MS 2"],
  "Home Win": ["MS 1"], "Draw": ["MS X"], "Away Win": ["MS 2"],
  "Over 1.5": ["1,5 Üst"], "Under 1.5": ["1,5 Alt"],
  "Over 2.5": ["2,5 Üst"], "Under 2.5": ["2,5 Alt"],
  "Over 3.5": ["3,5 Üst"], "Under 3.5": ["3,5 Alt"],
  "BTTS Yes": ["KG Var"], "BTTS No": ["KG Yok"],
  "1X": ["ÇŞ 1-X"], "X2": ["ÇŞ X-2"], "12": ["ÇŞ 1-2"],
  "HT Over 0.5": ["İY 0,5 Üst"], "HT Under 0.5": ["İY 0,5 Alt"],
  "HT Over 1.5": ["İY 1,5 Üst"], "HT Under 1.5": ["İY 1,5 Alt"],
  "HT BTTS Yes": ["İY KG Var"], "HT BTTS No": ["İY KG Yok"],
  "1/1": ["1/1", "1-1"], "1/X": ["1/X", "1-0"], "1/2": ["1/2", "1-2"],
  "X/1": ["X/1", "0-1"], "X/X": ["X/X", "0-0"], "X/2": ["X/2", "0-2"],
  "2/1": ["2/1", "2-1"], "2/X": ["2/X", "2-0"], "2/2": ["2/2", "2-2"],
  "1 & Over 1.5": ["MS 1 ve 1,5 Üst"], "2 & Over 1.5": ["MS 2 ve 1,5 Üst"],
  "1 & Over 2.5": ["MS 1 ve 2,5 Üst"], "2 & Over 2.5": ["MS 2 ve 2,5 Üst"],
  "Over 8.5 Corners": ["8,5 Üst"], "Under 8.5 Corners": ["8,5 Alt"],
  "Over 3.5 Cards": ["3,5 Üst"], "Under 3.5 Cards": ["3,5 Alt"],
};

// ============================================
// Bülten sekme indexleri
// ============================================
const TAB_FOR_PICK = {
  "1": 0, "X": 0, "2": 0, "Home Win": 0, "Draw": 0, "Away Win": 0,
  "Over 2.5": 0, "Under 2.5": 0,
  "Over 1.5": 1, "Under 1.5": 1, "Over 3.5": 1, "Under 3.5": 1,
  "1X": 2, "X2": 2, "12": 2, "BTTS Yes": 2, "BTTS No": 2,
  "HT Over 0.5": 3, "HT Under 0.5": 3, "HT Over 1.5": 3, "HT Under 1.5": 3,
  "HT BTTS Yes": 3, "HT BTTS No": 3,
  "Over 8.5 Corners": 4, "Under 8.5 Corners": 4,
  "1/1": 5, "1/X": 5, "1/2": 5,
  "X/1": 5, "X/X": 5, "X/2": 5,
  "2/1": 5, "2/X": 5, "2/2": 5,
  "Over 3.5 Cards": 6, "Under 3.5 Cards": 6,
};

// ============================================
// Takım ismi normalize
// ============================================
function norm(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ").trim()
    // Yaygın prefix/suffix'leri kaldır
    .replace(/\b(fc|cf|sc|ac|as|ss|us|afc|fk|sk|gk|bk|if|bsc|tsg|rb|sv|vfb|vfl|tsv|1\.|ud|cd|sd|se|ce|rcd|rc|real|sporting|atletico|deportivo)\b/gi, "")
    // Türkçe karakter normalize
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
    .replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/á|à|â|ã/g, "a").replace(/é|è|ê|ë/g, "e")
    .replace(/í|ì|î|ï/g, "i").replace(/ó|ò|ô|õ/g, "o")
    .replace(/ú|ù|û/g, "u").replace(/ñ/g, "n").replace(/ý/g, "y")
    // Noktalama kaldır
    .replace(/[''`\-_.()]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/**
 * Levenshtein mesafesi
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * Tek takım benzerlik skoru (0-1)
 */
function teamSimilarity(apiName, bilyonerName) {
  const a = norm(apiName);
  const b = norm(bilyonerName);

  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  // Kelime örtüşme + Levenshtein
  const wordsA = a.split(" ").filter(w => w.length >= 3);
  const wordsB = b.split(" ").filter(w => w.length >= 3);

  if (wordsA.length === 0 || wordsB.length === 0) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    return Math.max(0, 1 - levenshtein(a, b) / maxLen);
  }

  let matchCount = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa === wb || (wa.length >= 4 && wb.length >= 4 && (wa.includes(wb) || wb.includes(wa)))) {
        matchCount++;
        break;
      }
      const tol = Math.min(wa.length, wb.length) <= 5 ? 1 : 2;
      if (levenshtein(wa, wb) <= tol) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / Math.max(wordsA.length, wordsB.length);
}

// ============================================
// Bülten tarama — maç index'i
// ============================================
function scanBilyonerMatches() {
  const matches = [];
  const links = document.querySelectorAll('a[href*="/mac-karti/"]');

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const idMatch = href.match(/\/mac-karti\/[^/]+\/(\d+)\//);
    if (!idMatch) continue;

    const text = (link.textContent || "").trim();
    const parts = text.split(/\s*[-–]\s*/);
    if (parts.length < 2) continue;

    matches.push({
      bilyonerId: idMatch[1],
      homeTeam: parts[0].trim(),
      awayTeam: parts.slice(1).join("-").trim(),
      linkElement: link,
    });
  }
  return matches;
}

/**
 * Maç bul — HER İKİ TAKIM ayrı ayrı eşleşmeli
 */
function findMatch(homeTeam, awayTeam) {
  const matches = scanBilyonerMatches();
  if (matches.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const m of matches) {
    const homeSim = teamSimilarity(homeTeam, m.homeTeam);
    const awaySim = teamSimilarity(awayTeam, m.awayTeam);

    // Her iki takım en az 0.5 olmalı
    if (homeSim < 0.5 || awaySim < 0.5) continue;

    // Geometrik ortalama (her ikisi de yüksek olmalı)
    const score = Math.sqrt(homeSim * awaySim);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = m;
    }
  }

  if (bestScore < 0.6) {
    console.log(`[BA] Eşleşme yok (en iyi skor: ${bestScore.toFixed(2)}): "${homeTeam}" vs "${awayTeam}"`);
    if (bestMatch) {
      console.log(`[BA]   En yakın: "${bestMatch.homeTeam}" vs "${bestMatch.awayTeam}"`);
    }
    return null;
  }

  console.log(`[BA] ✓ Eşleşme (${bestScore.toFixed(2)}): "${homeTeam}" vs "${awayTeam}" → "${bestMatch.homeTeam}" vs "${bestMatch.awayTeam}"`);
  return bestMatch;
}

/**
 * Maç satır container'ı (oran butonlarını içeren)
 */
function getMatchContainer(linkEl) {
  let current = linkEl;
  for (let i = 0; i < 10 && current; i++) {
    if (current.querySelectorAll) {
      const btns = current.querySelectorAll('button, [role="button"]');
      if (btns.length >= 3) return current;
    }
    current = current.parentElement;
  }
  return linkEl.closest('div[class*="event"], div[class*="match"], div[class*="row"], tr') || linkEl.parentElement;
}

/**
 * Oran butonunu bul
 */
function findOddsButton(container, pick) {
  const targets = PICK_TO_BILYONER[pick];
  if (!targets) {
    console.warn(`[BA] Bilinmeyen pick: ${pick}`);
    return null;
  }

  const els = container.querySelectorAll(
    'button, [role="button"], [class*="odd"], [class*="bet"], [class*="rate"], [class*="selection"], span[class], div[class]'
  );

  for (const el of els) {
    const text = (el.textContent || "").trim();
    // Kapalı/oran yok butonlarını atla
    if (text.startsWith("—") || text === "-" || text === "") continue;

    for (const target of targets) {
      if (text === target || text.endsWith(" " + target)) {
        return el.closest("button, [role='button']") || el;
      }
      const re = new RegExp(`\\d+[.,]\\d+\\s+${escapeRegex(target)}$`, "i");
      if (re.test(text)) {
        return el.closest("button, [role='button']") || el;
      }
    }
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================
// Bülten sekme yönetimi
// ============================================
let currentTab = 0;

async function switchTab(tabIndex) {
  if (tabIndex === currentTab) return true;

  const tabLabels = ["MS", "1,5", "ÇŞ", "İY 0,5", "Korner", "İY", "TG"];
  const label = tabLabels[tabIndex];
  if (!label) return false;

  const candidates = document.querySelectorAll('span, div, a, button, li');
  for (const el of candidates) {
    const t = (el.textContent || "").trim();
    if (tabIndex === 5) {
      // "İY" sekmesi — "İY 0,5", "İY 1,5", "İY KG" ile karışmasın
      if (t === "İY" || (t.startsWith("İY") && !t.includes("0,5") && !t.includes("1,5") && !t.includes("KG") && t.length <= 5)) {
        el.click();
        currentTab = tabIndex;
        await sleep(500);
        return true;
      }
    } else if (t.includes(label) && t.length < 20) {
      el.click();
      currentTab = tabIndex;
      await sleep(500);
      return true;
    }
  }

  console.warn(`[BA] Sekme bulunamadı: ${label}`);
  return false;
}

// ============================================
// Tek bahis ekleme — Mac-karti fallback YOK
// ============================================
async function addBetToCoupon(prediction) {
  const { homeTeam, awayTeam, pick } = prediction;

  // 1. Maçı bul (kesin eşleşme)
  const match = findMatch(homeTeam, awayTeam);
  if (!match) {
    return { success: false, reason: "match_not_found" };
  }

  // 2. Container'ı al
  const container = getMatchContainer(match.linkElement);

  // 3. Oran butonunu bul
  let button = findOddsButton(container, pick);

  // 4. Bulunamazsa inline expand dene (sayfa DEĞİŞTİRMEDEN)
  if (!button) {
    const expandBtns = Array.from(container.querySelectorAll('span, div, a, button'));
    const tumu = expandBtns.find(el => /^\+\d+\s*Tümü$/.test((el.textContent || "").trim()));
    if (tumu) {
      // Sadece inline expand — navigasyon yapan link'lere DOKUNMA
      const isLink = tumu.tagName === "A" && tumu.getAttribute("href");
      if (!isLink) {
        tumu.click();
        await sleep(800);
        button = findOddsButton(container, pick);
      }
    }
  }

  if (!button) {
    console.warn(`[BA] ✗ Buton bulunamadı: ${pick} — ${homeTeam} vs ${awayTeam}`);
    return { success: false, reason: "button_not_found" };
  }

  // 5. Tıkla
  button.click();
  console.log(`[BA] ✓ Kupona eklendi: ${homeTeam} vs ${awayTeam} → ${pick}`);
  await sleep(300);
  return { success: true };
}

// ============================================
// Toplu aktarım
// ============================================
async function handleTransfer(predictions) {
  let transferred = 0;
  const errors = [];
  const results = [];

  // Sekme bazında grupla
  const groups = {};
  for (const p of predictions) {
    const tab = TAB_FOR_PICK[p.pick] ?? 0;
    (groups[tab] = groups[tab] || []).push(p);
  }

  for (const tabIdx of Object.keys(groups).map(Number).sort()) {
    if (tabIdx !== 0) await switchTab(tabIdx);

    for (const pred of groups[tabIdx]) {
      try {
        const r = await addBetToCoupon(pred);
        if (r.success) {
          transferred++;
          results.push({ ...pred, status: "ok" });
        } else {
          const msg = r.reason === "match_not_found"
            ? "Bilyoner'de bulunamadı"
            : "Oran butonu bulunamadı (bu market kapalı olabilir)";
          errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${msg}`);
          results.push({ ...pred, status: r.reason });
        }
        await sleep(500);
      } catch (err) {
        errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${err.message}`);
        results.push({ ...pred, status: "error" });
      }
    }
  }

  if (currentTab !== 0) await switchTab(0);

  return { success: transferred > 0, transferred, total: predictions.length, errors, results };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================
// BA göstergesi
// ============================================
function injectIndicator() {
  if (document.getElementById("ba-indicator")) return;
  const el = document.createElement("div");
  el.id = "ba-indicator";
  el.innerHTML = "⚽ BA";
  el.title = "Bilyoner Assistant aktif";
  document.body.appendChild(el);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { injectIndicator(); checkHashCoupon(); });
} else {
  injectIndicator();
  checkHashCoupon();
}

// ============================================
// Hash kupon aktarımı
// ============================================
function checkHashCoupon() {
  const hash = window.location.hash;
  if (!hash.startsWith("#ba-coupon=")) return;

  try {
    const data = JSON.parse(decodeURIComponent(hash.replace("#ba-coupon=", "")));
    if (!Array.isArray(data) || data.length === 0) return;

    history.replaceState(null, "", window.location.pathname + window.location.search);
    console.log(`[BA] Hash kupon: ${data.length} bahis`);
    showTransferOverlay(data);
  } catch (err) {
    console.error("[BA] Hash parse hatası:", err);
  }
}

function showTransferOverlay(couponData) {
  const overlay = document.createElement("div");
  overlay.id = "ba-transfer-overlay";
  overlay.style.cssText = `
    position:fixed; top:0; left:0; right:0; bottom:0;
    background:rgba(0,0,0,0.7); z-index:99999;
    display:flex; align-items:center; justify-content:center;
  `;
  overlay.innerHTML = `
    <div style="background:#1e293b; border-radius:16px; padding:24px 32px; max-width:400px; width:90%; color:#e2e8f0; font-family:-apple-system,sans-serif; text-align:center;">
      <div style="font-size:32px; margin-bottom:12px;">⚽</div>
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">Bilyoner Assistant</h2>
      <p style="font-size:14px; color:#94a3b8; margin-bottom:16px;">${couponData.length} bahis kupona aktarılacak</p>
      <div id="ba-list" style="text-align:left; max-height:200px; overflow-y:auto; margin-bottom:16px;"></div>
      <div id="ba-status" style="font-size:13px; color:#60a5fa; margin-bottom:12px;">Sayfa yükleniyor...</div>
      <div style="display:flex; gap:8px;">
        <button id="ba-start" style="flex:1; padding:10px; border:none; border-radius:8px; background:linear-gradient(135deg,#059669,#10b981); color:white; font-weight:600; font-size:14px; cursor:pointer;">Aktarımı Başlat</button>
        <button id="ba-close" style="padding:10px 16px; border:1px solid #334155; border-radius:8px; background:transparent; color:#94a3b8; cursor:pointer; font-size:14px;">Kapat</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const listEl = document.getElementById("ba-list");
  for (const item of couponData) {
    const d = document.createElement("div");
    d.style.cssText = "padding:6px 8px; margin-bottom:4px; background:#0f172a; border-radius:6px; font-size:12px;";
    d.innerHTML = `
      <div style="font-weight:600; color:#f1f5f9;">${item.h} - ${item.a}</div>
      <div style="color:#a78bfa; font-weight:500;">${item.p} <span style="color:#34d399;">@${item.o}</span></div>
    `;
    listEl.appendChild(d);
  }

  const statusEl = document.getElementById("ba-status");
  let ready = false;

  const poll = setInterval(() => {
    const links = document.querySelectorAll('a[href*="/mac-karti/"]');
    if (links.length > 0) {
      ready = true;
      clearInterval(poll);
      statusEl.textContent = `✓ ${links.length} maç bulundu — aktarıma hazır`;
      statusEl.style.color = "#34d399";
    }
  }, 500);

  setTimeout(() => {
    if (!ready) {
      clearInterval(poll);
      statusEl.textContent = "⚠ Maçlar yüklenemedi — bülten sayfasında olduğunuzdan emin olun";
      statusEl.style.color = "#fbbf24";
    }
  }, 15000);

  document.getElementById("ba-start").addEventListener("click", async () => {
    if (!ready) {
      statusEl.textContent = "⚠ Maçlar henüz yüklenmedi...";
      statusEl.style.color = "#fbbf24";
      return;
    }

    const btn = document.getElementById("ba-start");
    btn.disabled = true;
    btn.textContent = "Aktarılıyor...";
    btn.style.opacity = "0.6";

    const predictions = couponData.map((item) => ({
      homeTeam: item.h,
      awayTeam: item.a,
      pick: item.p,
      odds: item.o,
    }));

    const result = await handleTransfer(predictions);

    statusEl.textContent = result.success
      ? `✓ ${result.transferred}/${result.total} bahis kupona eklendi!`
      : "✗ Eşleşen maç bulunamadı — Bilyoner'de farklı isimlendirme olabilir";
    statusEl.style.color = result.success ? "#34d399" : "#f87171";
    btn.textContent = "Tamamlandı";

    if (result.errors.length > 0) {
      const errDiv = document.createElement("div");
      errDiv.style.cssText = "margin-top:8px; font-size:11px; color:#f87171; text-align:left; max-height:100px; overflow-y:auto;";
      errDiv.innerHTML = result.errors.map((e) => `• ${e}`).join("<br>");
      statusEl.parentElement.insertBefore(errDiv, statusEl.nextSibling);
    }
  });

  document.getElementById("ba-close").addEventListener("click", () => overlay.remove());
}
