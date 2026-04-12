// ============================================
// Bilyoner Assistant — Content Script
// Bilyoner.com üzerinde kupon aktarımı yapar
// Gerçek Bilyoner DOM yapısına göre çalışır
// ============================================

// Mesaj dinleyicisi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TRANSFER_COUPON") {
    handleTransfer(message.predictions)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.action === "SCAN_MATCHES") {
    const matches = scanBilyonerMatches();
    sendResponse({ matches });
    return true;
  }
});

// ============================================
// Pick tipi → Bilyoner buton text eşleme
// Bilyoner'de oranlar şu formatta gösterilir:
//   "3.12 MS 1", "3.38 MS X", "1.70 MS 2"
//   "2.21 2,5 Alt", "1.33 2,5 Üst"
//   "KG Var", "KG Yok"
// ============================================

const PICK_TO_BILYONER = {
  // Maç Sonucu
  "1":          ["MS 1"],
  "X":          ["MS X"],
  "2":          ["MS 2"],
  "Home Win":   ["MS 1"],
  "Draw":       ["MS X"],
  "Away Win":   ["MS 2"],

  // Alt/Üst
  "Over 1.5":   ["1,5 Üst"],
  "Under 1.5":  ["1,5 Alt"],
  "Over 2.5":   ["2,5 Üst"],
  "Under 2.5":  ["2,5 Alt"],
  "Over 3.5":   ["3,5 Üst"],
  "Under 3.5":  ["3,5 Alt"],

  // Karşılıklı Gol
  "BTTS Yes":   ["KG Var"],
  "BTTS No":    ["KG Yok"],

  // Çifte Şans
  "1X":         ["ÇŞ 1-X", "1-X"],
  "X2":         ["ÇŞ X-2", "X-2"],
  "12":         ["ÇŞ 1-2", "1-2"],

  // İlk Yarı
  "HT Over 0.5":   ["İY 0,5 Üst"],
  "HT Under 0.5":  ["İY 0,5 Alt"],
  "HT Over 1.5":   ["İY 1,5 Üst"],
  "HT Under 1.5":  ["İY 1,5 Alt"],
  "HT BTTS Yes":   ["İY KG Var"],
  "HT BTTS No":    ["İY KG Yok"],

  // Kombine
  "1 & Over 1.5":  ["MS 1 ve 1,5 Üst"],
  "2 & Over 1.5":  ["MS 2 ve 1,5 Üst"],
  "1 & Over 2.5":  ["MS 1 ve 2,5 Üst"],
  "2 & Over 2.5":  ["MS 2 ve 2,5 Üst"],
};

/**
 * Takım ismi normalize — Türkçe karakter, prefix temizleme, fuzzy matching
 */
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(fc|cf|sc|ac|as|ss|us|afc|fk|sk|gk|bk|if|bsc|tsg|rb|sv|vfb|vfl|tsv|1\.)[\s.]*/gi, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[''`]/g, "")
    .trim();
}

/**
 * İki string arasında benzerlik skoru (0-1)
 * Levenshtein yerine kelime örtüşme kullanır — daha hızlı
 */
function similarity(a, b) {
  const wordsA = normalize(a).split(" ").filter(w => w.length >= 3);
  const wordsB = normalize(b).split(" ").filter(w => w.length >= 3);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let matchCount = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa === wb || wa.includes(wb) || wb.includes(wa)) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / Math.max(wordsA.length, wordsB.length);
}

/**
 * Bilyoner sayfasındaki maç satırlarını tara
 * Link href'inden matchId, link text'inden takım isimleri çıkar
 */
function scanBilyonerMatches() {
  const matches = [];
  // Bilyoner maç linkleri: /mac-karti/futbol/{id}/oranlar
  const links = document.querySelectorAll('a[href*="/mac-karti/"]');

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const idMatch = href.match(/\/mac-karti\/[^/]+\/(\d+)\//);
    if (!idMatch) continue;

    const bilyonerId = idMatch[1];
    const text = (link.textContent || "").trim();

    // "Perth Glory - Macarthur" formatını parse et
    const teamParts = text.split(/\s*[-–]\s*/);
    if (teamParts.length < 2) continue;

    matches.push({
      bilyonerId,
      homeTeam: teamParts[0].trim(),
      awayTeam: teamParts.slice(1).join("-").trim(),
      linkElement: link,
    });
  }

  return matches;
}

/**
 * Bilyoner sayfasında maç satırını bul — link text bazlı eşleme
 * Önce link'ler aranır, sonra genel DOM taranır
 */
function findMatchRow(homeTeam, awayTeam) {
  const homeNorm = normalize(homeTeam);
  const awayNorm = normalize(awayTeam);

  // 1. Maç kartı linkleri üzerinden bul
  const links = document.querySelectorAll('a[href*="/mac-karti/"]');
  let bestLink = null;
  let bestScore = 0;

  for (const link of links) {
    const text = normalize(link.textContent || "");
    if (text.includes(homeNorm) && text.includes(awayNorm)) {
      // Tam eşleşme: parent container döndür
      return getMatchContainer(link);
    }

    // Fuzzy: benzerlik skoru hesapla
    const homeSim = similarity(homeTeam, link.textContent || "");
    const awaySim = similarity(awayTeam, link.textContent || "");
    const score = (homeSim + awaySim) / 2;
    if (score > bestScore && score > 0.4) {
      bestScore = score;
      bestLink = link;
    }
  }

  if (bestLink) {
    console.log(`[BA] Fuzzy eşleşme (skor: ${bestScore.toFixed(2)}): ${homeTeam} vs ${awayTeam}`);
    return getMatchContainer(bestLink);
  }

  // 2. Tüm sayfada takım isimlerini ara (fallback)
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null
  );

  while (walker.nextNode()) {
    const el = walker.currentNode;
    const text = normalize(el.textContent || "");
    const ownText = normalize(
      Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join("")
    );

    // Kendi text'i veya direkt çocuk text'i eşleşiyorsa
    if ((ownText.includes(homeNorm) && ownText.includes(awayNorm)) ||
        (el.children.length < 20 && text.includes(homeNorm) && text.includes(awayNorm))) {
      return getMatchContainer(el);
    }
  }

  return null;
}

/**
 * Bir element'ten maç container'ını (satır) bul
 * Bilyoner'de oran butonları ve takım info'su aynı container'da
 */
function getMatchContainer(el) {
  // Yukarı doğru çık, oran butonlarını içeren en yakın container'ı bul
  let current = el;
  let maxDepth = 10;

  while (current && maxDepth-- > 0) {
    // Bu container'da oran butonları var mı?
    const hasOdds = current.querySelector &&
      current.textContent &&
      /MS [12X]/i.test(current.textContent) &&
      current.querySelectorAll('button, [role="button"], [class*="odd"], [class*="bet"]').length >= 3;

    if (hasOdds) return current;

    current = current.parentElement;
  }

  // Bulamadıysa en yakın row/container döndür
  return el.closest('div[class*="event"], div[class*="match"], div[class*="row"], tr') || el.parentElement;
}

/**
 * Container içinde Bilyoner oran butonunu bul
 * Buton text'i: "3.12 MS 1" veya "MS 1" formatında olabilir
 */
function findOddsButton(container, pick) {
  const bilyonerTexts = PICK_TO_BILYONER[pick];
  if (!bilyonerTexts) {
    console.warn(`[BA] Bilinmeyen pick tipi: ${pick}`);
    return null;
  }

  // Tüm tıklanabilir elementleri topla
  const clickables = container.querySelectorAll(
    'button, [role="button"], [class*="odd"], [class*="bet"], [class*="rate"], [class*="selection"], [class*="outcome"], span[class], div[class]'
  );

  for (const el of clickables) {
    const text = (el.textContent || "").trim();

    for (const target of bilyonerTexts) {
      // Tam metin eşleşme: "MS 1", "2,5 Üst" vs
      if (text.endsWith(target) || text === target) {
        // Bu oran butonunun tıklanabilir olduğunu doğrula
        if (el.tagName === "BUTTON" || el.getAttribute("role") === "button" ||
            el.onclick || el.style.cursor === "pointer" ||
            el.closest("button, [role='button']")) {
          return el.closest("button, [role='button']") || el;
        }
        return el;
      }

      // "3.12 MS 1" formatı — oran sayısı + market adı
      const pattern = new RegExp(`\\d+[.,]\\d+\\s+${escapeRegex(target)}$`, "i");
      if (pattern.test(text)) {
        return el.closest("button, [role='button']") || el;
      }
    }
  }

  return null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tek bir bahisi Bilyoner kuponuna ekle
 */
async function addBetToCoupon(prediction) {
  const { homeTeam, awayTeam, pick } = prediction;

  // 1. Maç satırını bul
  const container = findMatchRow(homeTeam, awayTeam);
  if (!container) {
    console.warn(`[BA] Maç bulunamadı: ${homeTeam} vs ${awayTeam}`);
    return { success: false, reason: "match_not_found" };
  }

  // 2. Oran butonunu bul
  const button = findOddsButton(container, pick);
  if (!button) {
    // Ana sayfadaki bülten görünümünde market gösterilmiyor olabilir
    // +N Tümü butonuna tıklamayı dene
    const expandBtn = container.querySelector('[class*="more"], [class*="all"]');
    if (expandBtn) {
      expandBtn.click();
      await sleep(800);
      // Tekrar dene
      const retryBtn = findOddsButton(container, pick);
      if (retryBtn) {
        retryBtn.click();
        console.log(`[BA] Kupona eklendi (expand sonrası): ${homeTeam} vs ${awayTeam} → ${pick}`);
        return { success: true };
      }
    }

    console.warn(`[BA] Oran butonu bulunamadı: ${pick} (${homeTeam} vs ${awayTeam})`);
    return { success: false, reason: "button_not_found" };
  }

  // 3. Tıkla — sadece oran butonuna, kupona ekleme yapar
  button.click();
  console.log(`[BA] Kupona eklendi: ${homeTeam} vs ${awayTeam} → ${pick}`);

  // Kupona eklendiğini doğrula — Bilyoner alttaki kupon çubuğunu günceller
  await sleep(300);
  return { success: true };
}

/**
 * Bilyoner sayfasında bahisleri kupona ekle
 */
async function handleTransfer(predictions) {
  let transferred = 0;
  const errors = [];
  const results = [];

  for (const pred of predictions) {
    try {
      const result = await addBetToCoupon(pred);
      if (result.success) {
        transferred++;
        results.push({ ...pred, status: "ok" });
      } else {
        errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${result.reason === "match_not_found" ? "Maç bulunamadı" : "Buton bulunamadı"}`);
        results.push({ ...pred, status: result.reason });
      }
      // Her bahis arası bekleme (DOM güncellemesi + rate limit)
      await sleep(600);
    } catch (err) {
      errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${err.message}`);
      results.push({ ...pred, status: "error" });
    }
  }

  return {
    success: transferred > 0,
    transferred,
    total: predictions.length,
    errors,
    results,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Floating Panel — Bilyoner sayfasında aktif gösterge
// ============================================

function injectIndicator() {
  if (document.getElementById("ba-indicator")) return;

  const indicator = document.createElement("div");
  indicator.id = "ba-indicator";
  indicator.innerHTML = "⚽ BA";
  indicator.title = "Bilyoner Assistant aktif — extension popup'ından tahminleri yükleyin";
  document.body.appendChild(indicator);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectIndicator();
    checkHashCoupon();
  });
} else {
  injectIndicator();
  checkHashCoupon();
}

// ============================================
// Hash-based Coupon Auto-Transfer
// Site'den gelen #ba-coupon={json} hash'ini okur
// ve otomatik olarak Bilyoner kuponuna ekler
// ============================================

function checkHashCoupon() {
  const hash = window.location.hash;
  if (!hash.startsWith("#ba-coupon=")) return;

  try {
    const encoded = hash.replace("#ba-coupon=", "");
    const couponData = JSON.parse(decodeURIComponent(encoded));

    if (!Array.isArray(couponData) || couponData.length === 0) return;

    // Hash'i temizle (tekrar tetiklemesin)
    history.replaceState(null, "", window.location.pathname + window.location.search);

    // Sayfa yüklenene kadar bekle, sonra kuponu aktar
    console.log(`[BA] Hash kupon algılandı: ${couponData.length} bahis`);
    showTransferOverlay(couponData);
  } catch (err) {
    console.error("[BA] Hash kupon parse hatası:", err);
  }
}

/**
 * Bilyoner sayfasında overlay göster ve kuponu aktar
 */
function showTransferOverlay(couponData) {
  const overlay = document.createElement("div");
  overlay.id = "ba-transfer-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background:#1e293b; border-radius:16px; padding:24px 32px; max-width:400px; width:90%; color:#e2e8f0; font-family:-apple-system,sans-serif; text-align:center;">
      <div style="font-size:32px; margin-bottom:12px;">⚽</div>
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">Bilyoner Assistant</h2>
      <p style="font-size:14px; color:#94a3b8; margin-bottom:16px;">${couponData.length} bahis kupona aktarılacak</p>
      <div id="ba-transfer-list" style="text-align:left; max-height:200px; overflow-y:auto; margin-bottom:16px;"></div>
      <div id="ba-transfer-status" style="font-size:13px; color:#60a5fa; margin-bottom:12px;">Sayfa yükleniyor...</div>
      <div style="display:flex; gap:8px;">
        <button id="ba-transfer-start" style="flex:1; padding:10px; border:none; border-radius:8px; background:linear-gradient(135deg,#059669,#10b981); color:white; font-weight:600; font-size:14px; cursor:pointer;">Aktarımı Başlat</button>
        <button id="ba-transfer-close" style="padding:10px 16px; border:1px solid #334155; border-radius:8px; background:transparent; color:#94a3b8; cursor:pointer; font-size:14px;">Kapat</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Kupon listesini göster
  const listEl = document.getElementById("ba-transfer-list");
  for (const item of couponData) {
    const div = document.createElement("div");
    div.style.cssText = "padding:6px 8px; margin-bottom:4px; background:#0f172a; border-radius:6px; font-size:12px;";
    div.innerHTML = `
      <div style="font-weight:600; color:#f1f5f9;">${item.h} - ${item.a}</div>
      <div style="color:#a78bfa; font-weight:500;">${item.p} <span style="color:#34d399;">@${item.o}</span></div>
    `;
    listEl.appendChild(div);
  }

  // Sayfa yüklenmesini bekle (Bilyoner SPA, maçlar geç yükleniyor)
  const statusEl = document.getElementById("ba-transfer-status");
  let ready = false;

  const waitForMatches = setInterval(() => {
    const matchLinks = document.querySelectorAll('a[href*="/mac-karti/"]');
    if (matchLinks.length > 0) {
      ready = true;
      clearInterval(waitForMatches);
      statusEl.textContent = `✓ ${matchLinks.length} maç bulundu — aktarıma hazır`;
      statusEl.style.color = "#34d399";
    }
  }, 500);

  // 15 saniye timeout
  setTimeout(() => {
    if (!ready) {
      clearInterval(waitForMatches);
      statusEl.textContent = "⚠ Maçlar yüklenemedi — bülten sayfasında olduğunuzdan emin olun";
      statusEl.style.color = "#fbbf24";
    }
  }, 15000);

  // Aktarım butonu
  document.getElementById("ba-transfer-start").addEventListener("click", async () => {
    if (!ready) {
      statusEl.textContent = "⚠ Maçlar henüz yüklenmedi, bekleyin...";
      statusEl.style.color = "#fbbf24";
      return;
    }

    const startBtn = document.getElementById("ba-transfer-start");
    startBtn.disabled = true;
    startBtn.textContent = "Aktarılıyor...";
    startBtn.style.opacity = "0.6";

    const predictions = couponData.map((item) => ({
      homeTeam: item.h,
      awayTeam: item.a,
      pick: item.p,
      odds: item.o,
    }));

    const result = await handleTransfer(predictions);

    statusEl.textContent = result.success
      ? `✓ ${result.transferred}/${result.total} bahis kupona eklendi!`
      : "✗ Aktarım başarısız — maçlar bülten sayfasında bulunamadı";
    statusEl.style.color = result.success ? "#34d399" : "#f87171";

    startBtn.textContent = "Tamamlandı";

    if (result.errors.length > 0) {
      const errDiv = document.createElement("div");
      errDiv.style.cssText = "margin-top:8px; font-size:11px; color:#f87171; text-align:left;";
      errDiv.innerHTML = result.errors.map((e) => `• ${e}`).join("<br>");
      statusEl.parentElement.insertBefore(errDiv, statusEl.nextSibling);
    }
  });

  // Kapat butonu
  document.getElementById("ba-transfer-close").addEventListener("click", () => {
    overlay.remove();
  });
}
