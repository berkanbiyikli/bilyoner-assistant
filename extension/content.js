// ============================================
// Bilyoner Assistant — Content Script v4
// Hibrit: Bülten'de ara → buton bulunamazsa
// maç kartı sayfasına git → oradan tıkla
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
    sendResponse({ matches: scanVisibleMatches() });
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
  "Over 9.5 Corners": ["9,5 Üst"], "Under 9.5 Corners": ["9,5 Alt"],
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
  "Over 9.5 Corners": 4, "Under 9.5 Corners": 4,
  "1/1": 5, "1/X": 5, "1/2": 5,
  "X/1": 5, "X/X": 5, "X/2": 5,
  "2/1": 5, "2/X": 5, "2/2": 5,
  "Over 3.5 Cards": 6, "Under 3.5 Cards": 6,
};

// ============================================
// Yardımcı fonksiyonlar
// ============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function norm(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ").trim()
    .replace(/\b(fc|cf|sc|ac|as|ss|us|afc|fk|sk|gk|bk|if|bsc|tsg|rb|sv|vfb|vfl|tsv|1\.|ud|cd|sd|se|ce|rcd|rc|real|sporting|atletico|deportivo)\b/gi, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
    .replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ń/g, "n").replace(/ś/g, "s").replace(/ć/g, "c")
    .replace(/ź|ż/g, "z").replace(/ł/g, "l").replace(/ą/g, "a")
    .replace(/ę/g, "e").replace(/ř/g, "r").replace(/ž/g, "z")
    .replace(/ě/g, "e").replace(/ů/g, "u").replace(/ď|đ/g, "d")
    .replace(/ť/g, "t").replace(/ň/g, "n").replace(/ã/g, "a")
    .replace(/ß/g, "ss").replace(/ä/g, "a")
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/á|à|â/g, "a").replace(/é|è|ê|ë/g, "e")
    .replace(/í|ì|î|ï/g, "i").replace(/ó|ò|ô|õ/g, "o")
    .replace(/ú|ù|û/g, "u").replace(/ñ/g, "n").replace(/ý/g, "y")
    .replace(/[''`\-_.()]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function getSearchKeyword(teamName) {
  let clean = teamName
    .replace(/^(FK|FC|SC|AC|AS|SS|US|AFC|BSC|TSG|RB|SV|VfB|VfL|1\.|CF|GD|CD|UD|SD|SE|CE|RCD|RC)\s+/i, "")
    .replace(/\s+(FC|SC|FK|SK|IF|BK|GK)$/i, "")
    .replace(/^F\./i, "")
    .trim();

  const words = clean.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return clean;
  if (words.length === 1) return words[0];
  return words.sort((a, b) => b.length - a.length)[0];
}

// ============================================
// Sayfa tipi tespiti
// ============================================
function getPageType() {
  const path = window.location.pathname;
  if (path.includes("/mac-karti/")) return "mac-karti";
  if (path.includes("/iddaa")) return "bulten";
  return "other";
}

function getMatchIdFromUrl() {
  const m = window.location.pathname.match(/\/mac-karti\/[^/]+\/(\d+)/);
  return m ? m[1] : null;
}

// ============================================
// Chrome storage işlemleri
// ============================================
function getTransferQueue() {
  return new Promise(resolve => {
    chrome.storage.local.get(["ba_queue", "ba_progress"], (data) => {
      resolve({ queue: data.ba_queue || [], progress: data.ba_progress || null });
    });
  });
}

function saveTransferQueue(queue, progress) {
  return new Promise(resolve => {
    chrome.storage.local.set({ ba_queue: queue, ba_progress: progress }, resolve);
  });
}

function clearTransferQueue() {
  return new Promise(resolve => {
    chrome.storage.local.remove(["ba_queue", "ba_progress"], resolve);
  });
}

// ============================================
// ARAMA KUTUSU — Bilyoner bülten
// ============================================
function findSearchInput() {
  const placeholders = document.querySelectorAll('input[placeholder*="Ara"], input[placeholder*="ara"], input[placeholder*="search"]');
  for (const inp of placeholders) {
    if (inp.offsetParent !== null) return inp;
  }
  const inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
  for (const inp of inputs) {
    if (inp.offsetParent !== null && inp.offsetWidth > 80) return inp;
  }
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]):not([type="email"]):not([type="number"])');
  for (const inp of allInputs) {
    if (inp.offsetParent !== null && inp.offsetWidth > 80) return inp;
  }
  return null;
}

async function openSearchInput() {
  const searchSelectors = [
    '[class*="search"] button', '[class*="search"] svg',
    '[class*="Search"] button', '[class*="Search"] svg',
    '[class*="arama"]', '[aria-label*="Ara"]', '[aria-label*="Search"]',
    '[title*="Ara"]', '[title*="Search"]',
  ];
  for (const sel of searchSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      (el.closest("button, div[role='button'], a, span") || el).click();
      await sleep(600);
      const inp = findSearchInput();
      if (inp) return inp;
    }
  }
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const btn of buttons) {
    if (btn.querySelector("svg") && btn.offsetWidth < 60 && btn.offsetWidth > 20) {
      const cls = (btn.className || "").toString().toLowerCase();
      const pCls = (btn.parentElement?.className || "").toString().toLowerCase();
      if (cls.includes("search") || pCls.includes("search") || pCls.includes("filter")) {
        btn.click();
        await sleep(600);
        const inp = findSearchInput();
        if (inp) return inp;
      }
    }
  }
  return null;
}

function setInputValue(input, value) {
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeSet.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: value.slice(-1) }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) }));
}

function clearInput(input) {
  setInputValue(input, "");
  const parent = input.parentElement;
  if (parent) {
    const clearBtn = parent.querySelector('button, [class*="clear"], [class*="close"], [class*="remove"]');
    if (clearBtn && clearBtn !== input) clearBtn.click();
  }
}

async function searchAndWait(searchInput, keyword) {
  console.log(`[BA] 🔍 Arama: "${keyword}"`);
  searchInput.focus();
  clearInput(searchInput);
  await sleep(300);
  setInputValue(searchInput, keyword);
  await sleep(1200);
  return scanVisibleMatches();
}

// ============================================
// Görünür maçları tara (bülten)
// ============================================
function scanVisibleMatches() {
  const matches = [];
  const seen = new Set();
  const links = document.querySelectorAll('a[href*="/mac-karti/"]');

  for (const link of links) {
    if (link.offsetParent === null) continue;
    const rect = link.getBoundingClientRect();
    if (rect.height === 0) continue;

    const href = link.getAttribute("href") || "";
    const idMatch = href.match(/\/mac-karti\/[^/]+\/(\d+)/);
    if (!idMatch) continue;
    if (seen.has(idMatch[1])) continue;
    seen.add(idMatch[1]);

    let home = "", away = "";

    let text = (link.textContent || "").replace(/\s+/g, " ").trim();
    text = text.replace(/\d+[.,]\d+/g, "").replace(/^\d{1,2}:\d{2}\s*/, "").trim();
    const parts = text.split(/\s*[-–]\s*/);
    if (parts.length >= 2 && parts[0].trim().length >= 2) {
      home = parts[0].trim();
      away = parts.slice(1).join("-").trim();
    }

    if (!home || !away) {
      const row = link.closest('[class*="event"], [class*="match"], [class*="row"], [class*="fixture"], tr, li');
      if (row) {
        const teamEls = row.querySelectorAll('[class*="team"], [class*="name"], [class*="participant"]');
        if (teamEls.length >= 2) {
          home = teamEls[0].textContent.trim();
          away = teamEls[1].textContent.trim();
        }
      }
    }

    if (home.length < 2 || away.length < 2) continue;
    matches.push({ bilyonerId: idMatch[1], homeTeam: home, awayTeam: away, linkElement: link });
  }
  return matches;
}

function findBestMatch(results, homeTeam, awayTeam) {
  const homeNorm = norm(homeTeam);
  const awayNorm = norm(awayTeam);
  const homeWords = homeNorm.split(" ").filter(w => w.length >= 3);
  const awayWords = awayNorm.split(" ").filter(w => w.length >= 3);

  let bestMatch = null;
  let bestScore = 0;

  for (const m of results) {
    const mHome = norm(m.homeTeam);
    const mAway = norm(m.awayTeam);
    const fullText = mHome + " " + mAway;

    if (mHome === homeNorm && mAway === awayNorm) return m;

    let homeHits = 0, awayHits = 0;
    for (const w of homeWords) { if (fullText.includes(w)) homeHits++; }
    for (const w of awayWords) { if (fullText.includes(w)) awayHits++; }

    const score = (homeHits / Math.max(homeWords.length, 1) + awayHits / Math.max(awayWords.length, 1)) / 2;
    if (score > bestScore) { bestScore = score; bestMatch = m; }
  }

  if (results.length === 1 && bestScore >= 0.25) return results[0];
  return bestScore >= 0.3 ? bestMatch : null;
}

// ============================================
// Bülten: Maç container ve oran butonu
// ============================================
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

function findOddsButton(container, pick) {
  const targets = PICK_TO_BILYONER[pick];
  if (!targets) return null;

  const els = container.querySelectorAll(
    'button, [role="button"], [class*="odd"], [class*="bet"], [class*="rate"], [class*="selection"], span[class], div[class]'
  );

  for (const el of els) {
    const text = (el.textContent || "").trim();
    if (text.startsWith("—") || text === "-" || text === "") continue;

    for (const target of targets) {
      if (text === target) return el.closest("button, [role='button']") || el;
      const re = new RegExp(`^\\d+[.,]\\d+\\s+${escapeRegex(target)}$`, "i");
      if (re.test(text)) return el.closest("button, [role='button']") || el;
    }
  }
  return null;
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

  const candidates = document.querySelectorAll("span, div, a, button, li");
  for (const el of candidates) {
    const t = (el.textContent || "").trim();
    if (tabIndex === 5) {
      if (t === "İY" || (t.startsWith("İY") && !t.includes("0,5") && !t.includes("1,5") && !t.includes("KG") && t.length <= 5)) {
        el.click(); currentTab = tabIndex; await sleep(500); return true;
      }
    } else if (t.includes(label) && t.length < 20) {
      el.click(); currentTab = tabIndex; await sleep(500); return true;
    }
  }
  return false;
}

// ============================================
// MAÇ KARTI: Oran butonu bulma
// ============================================
function findOddsButtonOnMacKarti(pick) {
  const targets = PICK_TO_BILYONER[pick];
  if (!targets) {
    console.warn(`[BA] Bilinmeyen pick: ${pick}`);
    return null;
  }

  // Mac-karti sayfasında tüm tıklanabilir elementleri tara
  const els = document.querySelectorAll(
    'button, [role="button"], [class*="odd"], [class*="bet"], [class*="rate"], [class*="selection"]'
  );

  for (const el of els) {
    const text = (el.textContent || "").trim();
    if (text.startsWith("—") || text === "-" || text === "") continue;
    // Çok uzun text'ler container olabilir, atla
    if (text.length > 30) continue;

    for (const target of targets) {
      // Tam eşleşme: "KG Var"
      if (text === target) {
        return el.closest("button, [role='button']") || el;
      }
      // Oran + etiket: "1.67 KG Var" (EXACT — başka prefix olmamalı)
      const re = new RegExp(`^\\d+[.,]\\d+\\s+${escapeRegex(target)}$`, "i");
      if (re.test(text)) {
        return el.closest("button, [role='button']") || el;
      }
    }
  }

  return null;
}

async function waitForMacKartiLoad() {
  // Mac-karti sayfasındaki oran butonlarının yüklenmesini bekle
  for (let i = 0; i < 30; i++) {
    const els = document.querySelectorAll('button, [role="button"]');
    const hasOdds = Array.from(els).some(el => {
      const t = (el.textContent || "").trim();
      return /^\d+[.,]\d+\s+\S/.test(t) && t.length < 30;
    });
    if (hasOdds) {
      console.log(`[BA] Mac-karti yüklendi (${i * 500}ms)`);
      return true;
    }
    await sleep(500);
  }
  console.warn("[BA] Mac-karti yüklenemedi (15s timeout)");
  return false;
}

// ============================================
// BÜLTEN: Tek bahis ekleme (arama tabanlı)
// ============================================
async function addBetOnBulten(prediction, searchInput, statusCallback) {
  const { homeTeam, awayTeam, pick } = prediction;
  const keyword = getSearchKeyword(homeTeam);

  statusCallback(`🔍 "${keyword}" aranıyor...`);

  let results = await searchAndWait(searchInput, keyword);
  console.log(`[BA] "${keyword}" → ${results.length} sonuç`);

  if (results.length === 0) {
    const keyword2 = getSearchKeyword(awayTeam);
    statusCallback(`🔍 "${keyword2}" aranıyor (alternatif)...`);
    results = await searchAndWait(searchInput, keyword2);
    console.log(`[BA] "${keyword2}" → ${results.length} sonuç`);
  }

  if (results.length === 0) {
    return { success: false, reason: "search_no_results", matchId: null };
  }

  const match = findBestMatch(results, homeTeam, awayTeam);
  if (!match) {
    console.log(`[BA] Sonuçlarda eşleşme yok:`, results.map(m => `${m.homeTeam} - ${m.awayTeam}`));
    return { success: false, reason: "match_not_found", matchId: null };
  }

  statusCallback(`✓ ${match.homeTeam} vs ${match.awayTeam} bulundu`);

  // Bülten'de oran butonunu dene
  const container = getMatchContainer(match.linkElement);
  let button = findOddsButton(container, pick);

  // Expand dene
  if (!button) {
    const expandBtns = Array.from(container.querySelectorAll("span, div, a, button"));
    const tumu = expandBtns.find(el => /^\+\d+\s*Tümü$/.test((el.textContent || "").trim()));
    if (tumu && !(tumu.tagName === "A" && tumu.getAttribute("href"))) {
      tumu.click();
      await sleep(800);
      button = findOddsButton(container, pick);
    }
  }

  if (button) {
    button.click();
    console.log(`[BA] ✓ Bülten'de kupona eklendi: ${homeTeam} vs ${awayTeam} → ${pick}`);
    await sleep(300);
    return { success: true, matchId: match.bilyonerId };
  }

  // Buton bulunamadı — matchId döndür (mac-karti fallback için)
  console.log(`[BA] ⚠ Buton bülten'de yok, mac-karti'ya yönlendirilecek: ${pick}`);
  return { success: false, reason: "button_not_found", matchId: match.bilyonerId };
}

// ============================================
// TOPLU AKTARIM — ANA MANTIK (Bülten)
// ============================================
async function handleTransfer(predictions) {
  let transferred = 0;
  const errors = [];
  const macKartiQueue = []; // {matchId, homeTeam, awayTeam, bets:[{pick, odds}]}

  const statusEl = document.getElementById("ba-status");
  const updateStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  // Arama kutusunu bul
  let searchInput = findSearchInput();
  if (!searchInput) searchInput = await openSearchInput();
  const useSearch = !!searchInput;
  console.log(useSearch ? "[BA] ✓ Arama kutusu bulundu" : "[BA] ⚠ Arama kutusu yok — legacy mode");

  // Sekme bazında grupla
  const groups = {};
  for (const p of predictions) {
    const tab = TAB_FOR_PICK[p.pick] ?? 0;
    (groups[tab] = groups[tab] || []).push(p);
  }

  for (const tabIdx of Object.keys(groups).map(Number).sort()) {
    if (tabIdx !== 0) {
      if (useSearch) clearInput(searchInput);
      await sleep(300);
      await switchTab(tabIdx);
    }

    for (const pred of groups[tabIdx]) {
      try {
        let r;
        if (useSearch) {
          r = await addBetOnBulten(pred, searchInput, updateStatus);
        } else {
          r = await addBetLegacy(pred);
        }

        if (r.success) {
          transferred++;
          updateStatus(`✓ ${transferred} bahis eklendi`);
        } else if (r.reason === "button_not_found" && r.matchId) {
          // Mac-karti queue'ya ekle
          let existing = macKartiQueue.find(q => q.matchId === r.matchId);
          if (!existing) {
            existing = { matchId: r.matchId, homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, bets: [] };
            macKartiQueue.push(existing);
          }
          existing.bets.push({ pick: pred.pick, odds: pred.odds });
          updateStatus(`⚠ ${pred.pick} → maç kartından eklenecek`);
        } else {
          const msg = {
            search_no_results: "Aramada bulunamadı",
            match_not_found: "Bilyoner'de bulunamadı",
            button_not_found: "Oran butonu bulunamadı",
          }[r.reason] || r.reason;
          errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${msg}`);
        }
        await sleep(300);
      } catch (err) {
        errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${err.message}`);
      }
    }
  }

  // Temizlik
  if (useSearch) clearInput(searchInput);
  if (currentTab !== 0) await switchTab(0);

  // Mac-karti fallback gerekiyor mu?
  if (macKartiQueue.length > 0) {
    const totalMkBets = macKartiQueue.reduce((sum, q) => sum + q.bets.length, 0);
    console.log(`[BA] 🔄 ${totalMkBets} bahis mac-karti'ya yönlendirilecek (${macKartiQueue.length} maç)`);

    const progress = {
      total: predictions.length,
      transferred: transferred,
      errors: [...errors],
    };

    await saveTransferQueue(macKartiQueue, progress);

    updateStatus(`✓ ${transferred} bülten'den eklendi · ${totalMkBets} bahis maç kartından eklenecek...`);
    if (statusEl) statusEl.style.color = "#60a5fa";
    await sleep(1500);

    // İlk maçın mac-karti sayfasına yönlendir
    window.location.href = `/mac-karti/futbol/${macKartiQueue[0].matchId}/oranlar`;
    return { success: true, transferred, total: predictions.length, errors };
  }

  // Hepsi bülten'de tamamlandı
  return { success: transferred > 0, transferred, total: predictions.length, errors };
}

// ============================================
// LEGACY FALLBACK — Arama olmadan (bülten)
// ============================================
async function addBetLegacy(prediction) {
  const matches = scanVisibleMatches();
  const homeNorm = norm(prediction.homeTeam);
  const awayNorm = norm(prediction.awayTeam);
  const homeWords = homeNorm.split(" ").filter(w => w.length >= 3);
  const awayWords = awayNorm.split(" ").filter(w => w.length >= 3);

  let found = null;
  for (const m of matches) {
    const fullText = norm(m.homeTeam + " " + m.awayTeam);
    const homeOk = homeWords.some(w => fullText.includes(w));
    const awayOk = awayWords.some(w => fullText.includes(w));
    if (homeOk && awayOk) { found = m; break; }
  }

  if (!found) return { success: false, reason: "match_not_found", matchId: null };

  const container = getMatchContainer(found.linkElement);
  const button = findOddsButton(container, prediction.pick);
  if (!button) return { success: false, reason: "button_not_found", matchId: found.bilyonerId };

  button.click();
  console.log(`[BA] ✓ Legacy: ${prediction.homeTeam} vs ${prediction.awayTeam} → ${prediction.pick}`);
  await sleep(300);
  return { success: true, matchId: found.bilyonerId };
}

// ============================================
// MAÇ KARTI QUEUE İŞLEME
// ============================================
async function processMacKartiQueue() {
  const { queue, progress } = await getTransferQueue();
  if (!queue || queue.length === 0 || !progress) return;

  const currentMatchId = getMatchIdFromUrl();
  if (!currentMatchId) return;

  // Mevcut maçı queue'da bul
  const idx = queue.findIndex(q => q.matchId === currentMatchId);
  if (idx === -1) {
    console.log(`[BA] Mac-karti ${currentMatchId} queue'da yok`);
    return;
  }

  const current = queue[idx];
  console.log(`[BA] 🎯 Mac-karti işleniyor: ${current.homeTeam} vs ${current.awayTeam} (${current.bets.length} bahis)`);

  // Durum göstergesi
  showMacKartiStatus(current, progress, queue.length);

  // Sayfanın yüklenmesini bekle
  await waitForMacKartiLoad();

  const statusEl = document.getElementById("ba-mk-status");
  const updateStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  // Her bet için oran butonunu bul ve tıkla
  for (const bet of current.bets) {
    updateStatus(`🔍 ${bet.pick} butonu aranıyor...`);
    await sleep(300);

    const button = findOddsButtonOnMacKarti(bet.pick);

    if (button) {
      button.click();
      progress.transferred++;
      updateStatus(`✓ ${bet.pick} kupona eklendi`);
      console.log(`[BA] ✓ Mac-karti: ${current.homeTeam} vs ${current.awayTeam} → ${bet.pick}`);
    } else {
      progress.errors.push(`${current.homeTeam} vs ${current.awayTeam}: ${bet.pick} butonu bulunamadı`);
      updateStatus(`✗ ${bet.pick} butonu bulunamadı`);
      console.warn(`[BA] ✗ Mac-karti: ${bet.pick} bulunamadı`);
    }
    await sleep(500);
  }

  // Bu maçı queue'dan çıkar
  queue.splice(idx, 1);

  if (queue.length > 0) {
    // Sonraki maça geç
    await saveTransferQueue(queue, progress);
    updateStatus(`➡ Sonraki maça yönlendiriliyor...`);
    await sleep(1000);
    window.location.href = `/mac-karti/futbol/${queue[0].matchId}/oranlar`;
  } else {
    // Tüm maçlar tamamlandı
    await clearTransferQueue();
    showCompletionOverlay(progress);
  }
}

// ============================================
// Mac-karti durum göstergesi
// ============================================
function showMacKartiStatus(currentMatch, progress, remaining) {
  const el = document.createElement("div");
  el.id = "ba-mk-overlay";
  el.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:99999;
    background:#1e293b; border:1px solid #334155; border-radius:12px;
    padding:16px 20px; color:#e2e8f0; font-family:-apple-system,sans-serif;
    min-width:300px; box-shadow:0 8px 32px rgba(0,0,0,0.4);
  `;
  el.innerHTML = `
    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">⚽ Bilyoner Assistant v4</div>
    <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">${progress.transferred} eklendi · ${remaining} maç kaldı</div>
    <div style="font-size:13px; font-weight:600; color:#60a5fa; margin-bottom:4px;">${currentMatch.homeTeam} vs ${currentMatch.awayTeam}</div>
    <div style="font-size:12px; color:#a78bfa; margin-bottom:8px;">${currentMatch.bets.map(b => b.pick).join(", ")}</div>
    <div id="ba-mk-status" style="font-size:12px; color:#34d399;">Sayfa yükleniyor...</div>
  `;
  document.body.appendChild(el);
}

// ============================================
// Tamamlanma overlay'i
// ============================================
function showCompletionOverlay(progress) {
  const mkOverlay = document.getElementById("ba-mk-overlay");
  if (mkOverlay) mkOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "ba-completion-overlay";
  overlay.style.cssText = `
    position:fixed; top:0; left:0; right:0; bottom:0;
    background:rgba(0,0,0,0.7); z-index:99999;
    display:flex; align-items:center; justify-content:center;
  `;

  const success = progress.transferred > 0;
  const errHtml = progress.errors.length > 0
    ? `<div style="text-align:left; max-height:150px; overflow-y:auto; margin-bottom:12px;">
        ${progress.errors.map(e => `<div style="font-size:11px; color:#f87171; margin-bottom:4px;">• ${e}</div>`).join("")}
       </div>`
    : "";

  overlay.innerHTML = `
    <div style="background:#1e293b; border-radius:16px; padding:24px 32px; max-width:400px; width:90%; color:#e2e8f0; font-family:-apple-system,sans-serif; text-align:center;">
      <div style="font-size:48px; margin-bottom:12px;">${success ? "✅" : "❌"}</div>
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">Aktarım ${success ? "Tamamlandı" : "Başarısız"}</h2>
      <p style="font-size:16px; color:${success ? "#34d399" : "#f87171"}; font-weight:600; margin-bottom:12px;">
        ${progress.transferred}/${progress.total} bahis kupona eklendi
      </p>
      ${errHtml}
      <button id="ba-done" style="padding:10px 24px; border:none; border-radius:8px; background:linear-gradient(135deg,#059669,#10b981); color:white; font-weight:600; font-size:14px; cursor:pointer;">Tamam</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById("ba-done").addEventListener("click", () => overlay.remove());
}

// ============================================
// BA göstergesi
// ============================================
function injectIndicator() {
  if (document.getElementById("ba-indicator")) return;
  const el = document.createElement("div");
  el.id = "ba-indicator";
  el.innerHTML = "⚽ BA v4";
  el.title = "Bilyoner Assistant v4 (Mac-Karti Fallback)";
  document.body.appendChild(el);
}

// ============================================
// Hash kupon aktarımı (bülten sayfası)
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
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">Bilyoner Assistant v4</h2>
      <p style="font-size:14px; color:#94a3b8; margin-bottom:4px;">${couponData.length} bahis kupona aktarılacak</p>
      <p style="font-size:11px; color:#60a5fa; margin-bottom:16px;">Bülten'de buton yoksa maç kartına gider</p>
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
    const hasSearch = !!findSearchInput();
    if (links.length > 0 || hasSearch) {
      ready = true;
      clearInterval(poll);
      statusEl.textContent = hasSearch
        ? "✓ Arama kutusu bulundu — aktarıma hazır"
        : `✓ ${links.length} maç bulundu — aktarıma hazır`;
      statusEl.style.color = "#34d399";
    }
  }, 500);

  setTimeout(() => {
    if (!ready) {
      clearInterval(poll);
      statusEl.textContent = "⚠ Sayfa yüklenemedi — yine de deneyin";
      statusEl.style.color = "#fbbf24";
      ready = true;
    }
  }, 15000);

  document.getElementById("ba-start").addEventListener("click", async () => {
    if (!ready) return;

    const btn = document.getElementById("ba-start");
    btn.disabled = true;
    btn.textContent = "Aktarılıyor...";
    btn.style.opacity = "0.6";

    const predictions = couponData.map(item => ({
      homeTeam: item.h,
      awayTeam: item.a,
      pick: item.p,
      odds: item.o,
    }));

    const result = await handleTransfer(predictions);

    // Mac-karti'ya yönlendirildiyse overlay zaten kaldırılacak (sayfa değişecek)
    // Burada sadece bülten'de tamamlanan durumu göster
    if (result && !macKartiQueueActive(predictions, result)) {
      statusEl.textContent = result.success
        ? `✓ ${result.transferred}/${result.total} bahis kupona eklendi!`
        : "✗ Hiçbir maç aktarılamadı";
      statusEl.style.color = result.success ? "#34d399" : "#f87171";
      btn.textContent = "Tamamlandı";

      if (result.errors && result.errors.length > 0) {
        const errDiv = document.createElement("div");
        errDiv.style.cssText = "margin-top:8px; font-size:11px; color:#f87171; text-align:left; max-height:100px; overflow-y:auto;";
        errDiv.innerHTML = result.errors.map(e => `• ${e}`).join("<br>");
        statusEl.parentElement.insertBefore(errDiv, statusEl.nextSibling);
      }
    }
  });

  document.getElementById("ba-close").addEventListener("click", () => overlay.remove());
}

function macKartiQueueActive(predictions, result) {
  // Mac-karti'ya yönlendirme yapıldıysa true
  return result.transferred < predictions.length && result.success;
}

// ============================================
// BAŞLATMA
// ============================================
async function init() {
  injectIndicator();

  // Önce mac-karti queue kontrol et (sayfa yönlendirmesinden gelmiş olabilir)
  if (getPageType() === "mac-karti") {
    await processMacKartiQueue();
  }

  // Hash kupon kontrol et (bülten'den gelmiş olabilir)
  checkHashCoupon();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
// ============================================
// Bilyoner Assistant — Content Script v3
// Arama tabanlı: takım ismini arama kutusuna yazar,
// filtrelenmiş sonuçtan oran butonunu tıklar
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
    sendResponse({ matches: scanVisibleMatches() });
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
// Yardımcı fonksiyonlar
// ============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function norm(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ").trim()
    .replace(/\b(fc|cf|sc|ac|as|ss|us|afc|fk|sk|gk|bk|if|bsc|tsg|rb|sv|vfb|vfl|tsv|1\.|ud|cd|sd|se|ce|rcd|rc|real|sporting|atletico|deportivo)\b/gi, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
    .replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ń/g, "n").replace(/ś/g, "s").replace(/ć/g, "c")
    .replace(/ź|ż/g, "z").replace(/ł/g, "l").replace(/ą/g, "a")
    .replace(/ę/g, "e").replace(/ř/g, "r").replace(/ž/g, "z")
    .replace(/ě/g, "e").replace(/ů/g, "u").replace(/ď|đ/g, "d")
    .replace(/ť/g, "t").replace(/ň/g, "n").replace(/ã/g, "a")
    .replace(/ß/g, "ss").replace(/ä/g, "a")
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/á|à|â/g, "a").replace(/é|è|ê|ë/g, "e")
    .replace(/í|ì|î|ï/g, "i").replace(/ó|ò|ô|õ/g, "o")
    .replace(/ú|ù|û/g, "u").replace(/ñ/g, "n").replace(/ý/g, "y")
    .replace(/[''`\-_.()]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/**
 * Takım isminden arama kelimesi çıkar
 * "Lechia Gdansk" → "Lechia"  (en uzun ayırt edici kelime)
 * "Konyaspor" → "Konyaspor"
 * "F.Karagümrük" → "Karagümrük"
 */
function getSearchKeyword(teamName) {
  let clean = teamName
    .replace(/^(FK|FC|SC|AC|AS|SS|US|AFC|BSC|TSG|RB|SV|VfB|VfL|1\.|CF|GD|CD|UD|SD|SE|CE|RCD|RC)\s+/i, "")
    .replace(/\s+(FC|SC|FK|SK|IF|BK|GK)$/i, "")
    .replace(/^F\./i, "")
    .trim();

  const words = clean.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return clean;
  if (words.length === 1) return words[0];

  // En uzun kelimeyi döndür (genelde en ayırt edici)
  return words.sort((a, b) => b.length - a.length)[0];
}

// ============================================
// ARAMA KUTUSU — Bilyoner bülten sayfası
// ============================================

/**
 * Bilyoner arama kutusunu bul
 */
function findSearchInput() {
  // Strateji 1: placeholder ile
  const placeholders = document.querySelectorAll('input[placeholder*="Ara"], input[placeholder*="ara"], input[placeholder*="search"], input[placeholder*="Search"]');
  for (const inp of placeholders) {
    if (inp.offsetParent !== null) return inp;
  }

  // Strateji 2: type=text veya type=search
  const inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
  for (const inp of inputs) {
    if (inp.offsetParent !== null && inp.offsetWidth > 80) return inp;
  }

  // Strateji 3: Tüm input'lar
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]):not([type="email"]):not([type="number"])');
  for (const inp of allInputs) {
    if (inp.offsetParent !== null && inp.offsetWidth > 80) return inp;
  }

  return null;
}

/**
 * Arama ikonunu bul ve tıkla → arama input'u açma denemesi
 */
async function openSearchInput() {
  // Arama butonu/ikonu bul
  const searchSelectors = [
    '[class*="search"] button', '[class*="search"] svg',
    '[class*="Search"] button', '[class*="Search"] svg',
    '[class*="arama"]', '[aria-label*="Ara"]', '[aria-label*="Search"]',
    '[title*="Ara"]', '[title*="Search"]',
  ];

  for (const sel of searchSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const clickTarget = el.closest('button, div[role="button"], a, span') || el;
      clickTarget.click();
      await sleep(600);
      const inp = findSearchInput();
      if (inp) return inp;
    }
  }

  // SVG ikonlu butonları dene
  const buttons = document.querySelectorAll('button, [role="button"]');
  for (const btn of buttons) {
    if (btn.querySelector('svg') && btn.offsetWidth < 60 && btn.offsetWidth > 20) {
      const cls = (btn.className || "").toString().toLowerCase();
      const pCls = (btn.parentElement?.className || "").toString().toLowerCase();
      if (cls.includes("search") || pCls.includes("search") || pCls.includes("filter")) {
        btn.click();
        await sleep(600);
        const inp = findSearchInput();
        if (inp) return inp;
      }
    }
  }

  return null;
}

/**
 * Input'a değer yaz (React/Angular/Vue uyumlu)
 */
function setInputValue(input, value) {
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSet.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value.slice(-1) }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
}

/**
 * Input'u temizle
 */
function clearInput(input) {
  setInputValue(input, '');
  // X/Clear butonunu da dene
  const parent = input.parentElement;
  if (parent) {
    const clearBtn = parent.querySelector('button, [class*="clear"], [class*="close"], [class*="remove"]');
    if (clearBtn && clearBtn !== input) {
      clearBtn.click();
    }
  }
}

/**
 * Arama yap ve sonuçları bekle
 */
async function searchAndWait(searchInput, keyword) {
  console.log(`[BA] 🔍 Arama: "${keyword}"`);

  searchInput.focus();
  clearInput(searchInput);
  await sleep(300);

  setInputValue(searchInput, keyword);
  await sleep(1200); // Debounce + API/filter bekleme

  return scanVisibleMatches();
}

// ============================================
// Görünür maçları tara
// ============================================
function scanVisibleMatches() {
  const matches = [];
  const seen = new Set();
  const links = document.querySelectorAll('a[href*="/mac-karti/"]');

  for (const link of links) {
    // Gizli elementleri atla
    if (link.offsetParent === null) continue;
    const rect = link.getBoundingClientRect();
    if (rect.height === 0) continue;

    const href = link.getAttribute("href") || "";
    const idMatch = href.match(/\/mac-karti\/[^/]+\/(\d+)/);
    if (!idMatch) continue;
    if (seen.has(idMatch[1])) continue;
    seen.add(idMatch[1]);

    let home = "", away = "";

    // Strateji 1: Link text parse
    let text = (link.textContent || "").replace(/\s+/g, " ").trim();
    text = text.replace(/\d+[.,]\d+/g, "").replace(/^\d{1,2}:\d{2}\s*/, "").trim();
    const parts = text.split(/\s*[-–]\s*/);
    if (parts.length >= 2 && parts[0].trim().length >= 2) {
      home = parts[0].trim();
      away = parts.slice(1).join("-").trim();
    }

    // Strateji 2: class bazlı span'lar
    if (!home || !away) {
      const row = link.closest('[class*="event"], [class*="match"], [class*="row"], [class*="fixture"], tr, li');
      if (row) {
        const teamEls = row.querySelectorAll('[class*="team"], [class*="name"], [class*="participant"]');
        if (teamEls.length >= 2) {
          home = teamEls[0].textContent.trim();
          away = teamEls[1].textContent.trim();
        }
      }
    }

    if (home.length < 2 || away.length < 2) continue;

    matches.push({
      bilyonerId: idMatch[1],
      homeTeam: home,
      awayTeam: away,
      linkElement: link,
    });
  }
  return matches;
}

// ============================================
// Maç container ve oran butonu
// ============================================
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

function findOddsButton(container, pick) {
  const targets = PICK_TO_BILYONER[pick];
  if (!targets) return null;

  const els = container.querySelectorAll(
    'button, [role="button"], [class*="odd"], [class*="bet"], [class*="rate"], [class*="selection"], span[class], div[class]'
  );

  for (const el of els) {
    const text = (el.textContent || "").trim();
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
      if (t === "İY" || (t.startsWith("İY") && !t.includes("0,5") && !t.includes("1,5") && !t.includes("KG") && t.length <= 5)) {
        el.click(); currentTab = tabIndex; await sleep(500); return true;
      }
    } else if (t.includes(label) && t.length < 20) {
      el.click(); currentTab = tabIndex; await sleep(500); return true;
    }
  }
  return false;
}

// ============================================
// TEK BAHİS EKLEME — ARAMA TABANLI
// ============================================
async function addBetWithSearch(prediction, searchInput, statusCallback) {
  const { homeTeam, awayTeam, pick } = prediction;
  const keyword = getSearchKeyword(homeTeam);

  statusCallback(`🔍 "${keyword}" aranıyor...`);

  // Arama yap
  let results = await searchAndWait(searchInput, keyword);
  console.log(`[BA] "${keyword}" → ${results.length} sonuç`);

  // Sonuç yoksa deplasman takımıyla dene
  if (results.length === 0) {
    const keyword2 = getSearchKeyword(awayTeam);
    statusCallback(`🔍 "${keyword2}" aranıyor (alternatif)...`);
    results = await searchAndWait(searchInput, keyword2);
    console.log(`[BA] "${keyword2}" → ${results.length} sonuç`);
  }

  if (results.length === 0) {
    return { success: false, reason: "search_no_results" };
  }

  // Sonuçlardan doğru maçı bul
  const match = findBestMatch(results, homeTeam, awayTeam);
  if (!match) {
    console.log(`[BA] Sonuçlarda eşleşme yok:`, results.map(m => `${m.homeTeam} - ${m.awayTeam}`));
    return { success: false, reason: "match_not_found" };
  }

  statusCallback(`✓ ${match.homeTeam} vs ${match.awayTeam} bulundu`);

  // Oran butonu
  const container = getMatchContainer(match.linkElement);
  let button = findOddsButton(container, pick);

  // Expand dene
  if (!button) {
    const expandBtns = Array.from(container.querySelectorAll('span, div, a, button'));
    const tumu = expandBtns.find(el => /^\+\d+\s*Tümü$/.test((el.textContent || "").trim()));
    if (tumu && !(tumu.tagName === "A" && tumu.getAttribute("href"))) {
      tumu.click();
      await sleep(800);
      button = findOddsButton(container, pick);
    }
  }

  if (!button) {
    return { success: false, reason: "button_not_found" };
  }

  button.click();
  console.log(`[BA] ✓ Kupona eklendi: ${homeTeam} vs ${awayTeam} → ${pick}`);
  await sleep(300);
  return { success: true };
}

/**
 * Sonuçlardan en iyi eşleşen maçı bul
 */
function findBestMatch(results, homeTeam, awayTeam) {
  const homeNorm = norm(homeTeam);
  const awayNorm = norm(awayTeam);
  const homeWords = homeNorm.split(" ").filter(w => w.length >= 3);
  const awayWords = awayNorm.split(" ").filter(w => w.length >= 3);

  let bestMatch = null;
  let bestScore = 0;

  for (const m of results) {
    const mHome = norm(m.homeTeam);
    const mAway = norm(m.awayTeam);
    const fullText = mHome + " " + mAway;

    // Tam eşleşme
    if (mHome === homeNorm && mAway === awayNorm) return m;

    // Her iki takımın kelimeleri sonuçta var mı?
    let homeHits = 0, awayHits = 0;
    for (const w of homeWords) {
      if (fullText.includes(w)) homeHits++;
    }
    for (const w of awayWords) {
      if (fullText.includes(w)) awayHits++;
    }

    const score = (homeHits / Math.max(homeWords.length, 1) + awayHits / Math.max(awayWords.length, 1)) / 2;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = m;
    }
  }

  // Tek sonuçsa ve en az bir takım eşleşiyorsa kabul et
  if (results.length === 1 && bestScore >= 0.25) {
    return results[0];
  }

  return bestScore >= 0.3 ? bestMatch : null;
}

// ============================================
// TOPLU AKTARIM — ANA MANTIK
// ============================================
async function handleTransfer(predictions) {
  let transferred = 0;
  const errors = [];
  const results = [];

  // Arama kutusunu bul
  let searchInput = findSearchInput();
  if (!searchInput) {
    searchInput = await openSearchInput();
  }

  const useSearch = !!searchInput;
  console.log(useSearch ? "[BA] ✓ Arama kutusu bulundu" : "[BA] ⚠ Arama kutusu yok — legacy mode");

  // Sekme bazında grupla
  const groups = {};
  for (const p of predictions) {
    const tab = TAB_FOR_PICK[p.pick] ?? 0;
    (groups[tab] = groups[tab] || []).push(p);
  }

  const statusEl = document.getElementById("ba-status");
  const updateStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  for (const tabIdx of Object.keys(groups).map(Number).sort()) {
    if (tabIdx !== 0) {
      // Aramayı temizle sonra sekme değiştir
      if (useSearch) clearInput(searchInput);
      await sleep(300);
      await switchTab(tabIdx);
    }

    for (const pred of groups[tabIdx]) {
      try {
        let r;
        if (useSearch) {
          r = await addBetWithSearch(pred, searchInput, updateStatus);
        } else {
          r = await addBetLegacy(pred);
        }

        if (r.success) {
          transferred++;
          results.push({ ...pred, status: "ok" });
          updateStatus(`✓ ${transferred} bahis eklendi`);
        } else {
          const msg = {
            search_no_results: "Aramada bulunamadı",
            match_not_found: "Bilyoner'de bulunamadı",
            button_not_found: "Oran butonu bulunamadı (market kapalı?)",
          }[r.reason] || r.reason;
          errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${msg}`);
          results.push({ ...pred, status: r.reason });
        }
        await sleep(300);
      } catch (err) {
        errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: ${err.message}`);
        results.push({ ...pred, status: "error" });
      }
    }
  }

  // Temizlik
  if (useSearch) clearInput(searchInput);
  if (currentTab !== 0) await switchTab(0);

  return { success: transferred > 0, transferred, total: predictions.length, errors, results };
}

// ============================================
// LEGACY FALLBACK — Arama olmadan
// ============================================
async function addBetLegacy(prediction) {
  const matches = scanVisibleMatches();
  const homeNorm = norm(prediction.homeTeam);
  const awayNorm = norm(prediction.awayTeam);
  const homeWords = homeNorm.split(" ").filter(w => w.length >= 3);
  const awayWords = awayNorm.split(" ").filter(w => w.length >= 3);

  let found = null;
  for (const m of matches) {
    const fullText = norm(m.homeTeam + " " + m.awayTeam);
    const homeOk = homeWords.some(w => fullText.includes(w));
    const awayOk = awayWords.some(w => fullText.includes(w));
    if (homeOk && awayOk) { found = m; break; }
  }

  if (!found) return { success: false, reason: "match_not_found" };

  const container = getMatchContainer(found.linkElement);
  const button = findOddsButton(container, prediction.pick);
  if (!button) return { success: false, reason: "button_not_found" };

  button.click();
  console.log(`[BA] ✓ Legacy: ${prediction.homeTeam} vs ${prediction.awayTeam} → ${prediction.pick}`);
  await sleep(300);
  return { success: true };
}

// ============================================
// BA göstergesi
// ============================================
function injectIndicator() {
  if (document.getElementById("ba-indicator")) return;
  const el = document.createElement("div");
  el.id = "ba-indicator";
  el.innerHTML = "⚽ BA v3";
  el.title = "Bilyoner Assistant v3 (Arama Tabanlı)";
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
      <h2 style="font-size:18px; font-weight:700; margin-bottom:8px;">Bilyoner Assistant v3</h2>
      <p style="font-size:14px; color:#94a3b8; margin-bottom:4px;">${couponData.length} bahis kupona aktarılacak</p>
      <p style="font-size:11px; color:#60a5fa; margin-bottom:16px;">Her maç için Bilyoner araması kullanılır</p>
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
    const hasSearch = !!findSearchInput();
    if (links.length > 0 || hasSearch) {
      ready = true;
      clearInterval(poll);
      statusEl.textContent = hasSearch
        ? "✓ Arama kutusu bulundu — aktarıma hazır"
        : `✓ ${links.length} maç bulundu — aktarıma hazır`;
      statusEl.style.color = "#34d399";
    }
  }, 500);

  setTimeout(() => {
    if (!ready) {
      clearInterval(poll);
      statusEl.textContent = "⚠ Sayfa yüklenemedi — bülten sayfasında olduğunuzdan emin olun";
      statusEl.style.color = "#fbbf24";
      ready = true;
    }
  }, 15000);

  document.getElementById("ba-start").addEventListener("click", async () => {
    if (!ready) return;

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
      : "✗ Hiçbir maç aktarılamadı";
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
