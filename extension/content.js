// ============================================
// Bilyoner Assistant — Content Script
// Bilyoner.com üzerinde kupon aktarımı yapar
// ============================================

// Mesaj dinleyicisi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TRANSFER_COUPON") {
    handleTransfer(message.predictions)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

/**
 * Bilyoner sayfasında bahisleri kupona ekle
 * Bilyoner'in DOM yapısına göre maçları bul ve tıkla
 */
async function handleTransfer(predictions) {
  let transferred = 0;
  const errors = [];

  for (const pred of predictions) {
    try {
      const success = await addBetToCoupon(pred);
      if (success) {
        transferred++;
      } else {
        errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: Bulunamadı`);
      }
      // Her bahis arası küçük bekleme (DOM güncellemesi için)
      await sleep(500);
    } catch (err) {
      errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${err.message}`);
    }
  }

  return {
    success: transferred > 0,
    transferred,
    total: predictions.length,
    errors,
  };
}

/**
 * Tek bir bahisi Bilyoner kuponuna ekle
 */
async function addBetToCoupon(prediction) {
  const { homeTeam, awayTeam, pick } = prediction;

  // 1. Maçı bul — takım isimlerini normalize ederek ara
  const matchElement = findMatchElement(homeTeam, awayTeam);
  if (!matchElement) {
    console.warn(`[BA] Maç bulunamadı: ${homeTeam} vs ${awayTeam}`);
    return false;
  }

  // 2. Pick tipine göre doğru butonu bul ve tıkla
  const betButton = findBetButton(matchElement, pick);
  if (!betButton) {
    console.warn(`[BA] Bahis butonu bulunamadı: ${pick} (${homeTeam} vs ${awayTeam})`);
    return false;
  }

  // 3. Tıkla
  betButton.click();
  console.log(`[BA] Kupona eklendi: ${homeTeam} vs ${awayTeam} → ${pick}`);
  return true;
}

/**
 * Bilyoner DOM'unda maç elementini bul
 * Takım isimlerini normalize ederek fuzzy eşleşme yapar
 */
function findMatchElement(homeTeam, awayTeam) {
  const normalize = (name) =>
    name
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      // Yaygın farklılıkları handle et
      .replace(/fc |cf |sc |ac |as |ss |us |afc /gi, "")
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u");

  const homeNorm = normalize(homeTeam);
  const awayNorm = normalize(awayTeam);

  // Bilyoner'daki maç satırlarını tara
  // Bilyoner genelde maçları event-row veya benzeri class'larla listeler
  const allMatchRows = document.querySelectorAll(
    '[class*="event"], [class*="match"], [class*="fixture"], [class*="game"], [data-testid*="event"], tr[class*="row"]'
  );

  for (const row of allMatchRows) {
    const text = normalize(row.textContent || "");
    if (text.includes(homeNorm) && text.includes(awayNorm)) {
      return row;
    }
  }

  // Fallback: tüm sayfada takım isimlerini ara
  const allElements = document.querySelectorAll("div, span, td, a, li");
  for (const el of allElements) {
    const text = normalize(el.textContent || "");
    if (text.includes(homeNorm) && text.includes(awayNorm)) {
      // En yakın parent container'ı bul
      const container = el.closest('[class*="event"], [class*="match"], tr') || el;
      return container;
    }
  }

  return null;
}

/**
 * Maç elementinde bahis butonunu bul
 * Bilyoner'in oran butonları genelde odds class'ı ile gösterilir
 */
function findBetButton(matchElement, pick) {
  // Pick tipini Bilyoner'in kullandığı formata çevir
  const pickMap = {
    "Home Win": { index: 0, text: ["1", "ms1", "ms 1"] },
    "Draw": { index: 1, text: ["x", "0", "beraberlik"] },
    "Away Win": { index: 2, text: ["2", "ms2", "ms 2"] },
    "Over 2.5": { index: null, text: ["üst", "ust", "over", "2.5 üst", "alt/üst üst"] },
    "Under 2.5": { index: null, text: ["alt", "under", "2.5 alt", "alt/üst alt"] },
    "Over 1.5": { index: null, text: ["1.5 üst", "üst 1.5"] },
    "Under 3.5": { index: null, text: ["3.5 alt", "alt 3.5"] },
    "Over 3.5": { index: null, text: ["3.5 üst", "üst 3.5"] },
    "BTTS Yes": { index: null, text: ["var", "kg var", "evet"] },
    "BTTS No": { index: null, text: ["yok", "kg yok", "hayır"] },
  };

  const pickConfig = pickMap[pick];
  if (!pickConfig) return null;

  // Tüm tıklanabilir oran butonlarını bul
  const buttons = matchElement.querySelectorAll(
    'button, [class*="odd"], [class*="bet"], [class*="rate"], [role="button"], [class*="selection"]'
  );

  // Maç sonucu (1-X-2) için index bazlı seçim
  if (pickConfig.index !== null && (pick === "Home Win" || pick === "Draw" || pick === "Away Win")) {
    // MS butonları genelde ilk 3 oran butonu olur
    const msButtons = Array.from(buttons).filter((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      // Oran butonlarını filtrele (sayısal değer içerenler)
      return /^\d+[.,]\d+$/.test(text) || /^[12x0]$/.test(text);
    });

    if (msButtons.length >= 3) {
      return msButtons[pickConfig.index];
    }
  }

  // Text bazlı eşleşme (diğer pazarlar)
  for (const btn of buttons) {
    const btnText = (btn.textContent || "").trim().toLowerCase();
    for (const keyword of pickConfig.text) {
      if (btnText.includes(keyword)) {
        return btn;
      }
    }

    // data-attribute bazlı eşleşme
    const dataMarket = btn.getAttribute("data-market") || btn.getAttribute("data-type") || "";
    for (const keyword of pickConfig.text) {
      if (dataMarket.toLowerCase().includes(keyword)) {
        return btn;
      }
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Floating Indicator
// Bilyoner sayfasında aktif uzantı göstergesi
// ============================================

function injectIndicator() {
  if (document.getElementById("ba-indicator")) return;

  const indicator = document.createElement("div");
  indicator.id = "ba-indicator";
  indicator.innerHTML = "⚽ BA";
  indicator.title = "Bilyoner Assistant aktif";
  document.body.appendChild(indicator);
}

// Sayfa yüklenince indicator ekle
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectIndicator);
} else {
  injectIndicator();
}
