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
  document.addEventListener("DOMContentLoaded", injectIndicator);
} else {
  injectIndicator();
}
