// ============================================
// Bilyoner Assistant — Content Script v4.1
//
// AKIŞ:
//  [Bülten] Scroll yaparak maç ID'lerini topla
//         ↓
//  Her tahmin için mac-karti/futbol/{id}/oranlar'a git
//         ↓
//  [Mac-karti] Tüm marketler açık — butona tıkla
//         ↓

// Hash'i HEMEN yakala — Bilyoner SPA kendi router'ı için hash'i siliyor.
// document_start'ta çalıştığımız için SPA'dan önce okuyoruz.
const INITIAL_HASH = window.location.hash;
//  Sonraki maç varsa yönlendir, yoksa tamamlama overlay'i göster
// ============================================

// ============================================
// Mesaj Dinleyicisi
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TRANSFER_COUPON") {
    handleTransferFromMessage(message.predictions)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ============================================
// Pick → Bilyoner maç kart buton etiketleri
// ============================================
const PICK_TO_BILYONER = {
  // Maç Sonucu
  "1": ["MS 1"], "X": ["MS X"], "2": ["MS 2"],
  "Home Win": ["MS 1"], "Draw": ["MS X"], "Away Win": ["MS 2"],
  // Toplam Gol
  "Over 1.5": ["1,5 Üst"], "Under 1.5": ["1,5 Alt"],
  "Over 2.5": ["2,5 Üst"], "Under 2.5": ["2,5 Alt"],
  "Over 3.5": ["3,5 Üst"], "Under 3.5": ["3,5 Alt"],
  "Over 4.5": ["4,5 Üst"], "Under 4.5": ["4,5 Alt"],
  // Karşılıklı Gol
  "BTTS Yes": ["KG Var"], "BTTS No": ["KG Yok"],
  // Çifte Şans
  "1X": ["ÇŞ 1-X"], "X2": ["ÇŞ X-2"], "12": ["ÇŞ 1-2"],
  // İlk Yarı Gol
  "HT Over 0.5": ["İY 0,5 Üst"], "HT Under 0.5": ["İY 0,5 Alt"],
  "HT Over 1.5": ["İY 1,5 Üst"], "HT Under 1.5": ["İY 1,5 Alt"],
  "HT BTTS Yes": ["İY KG Var"], "HT BTTS No": ["İY KG Yok"],
  // İY/MS
  "1/1": ["1/1"], "1/X": ["1/X"], "1/2": ["1/2"],
  "X/1": ["X/1"], "X/X": ["X/X"], "X/2": ["X/2"],
  "2/1": ["2/1"], "2/X": ["2/X"], "2/2": ["2/2"],
  // Kombo
  "1 & Over 1.5": ["MS 1 ve 1,5 Üst"], "2 & Over 1.5": ["MS 2 ve 1,5 Üst"],
  "1 & Over 2.5": ["MS 1 ve 2,5 Üst"], "2 & Over 2.5": ["MS 2 ve 2,5 Üst"],
  "1 & BTTS Yes": ["MS 1 ve Var"], "2 & BTTS Yes": ["MS 2 ve Var"],
  "1 & BTTS No":  ["MS 1 ve Yok"],  "2 & BTTS No":  ["MS 2 ve Yok"],
  // Korner
  "Over 7.5 Corners": ["7,5 Üst"], "Under 7.5 Corners": ["7,5 Alt"],
  "Over 8.5 Corners": ["8,5 Üst"], "Under 8.5 Corners": ["8,5 Alt"],
  "Over 9.5 Corners": ["9,5 Üst"], "Under 9.5 Corners": ["9,5 Alt"],
  // Kart
  "Over 3.5 Cards": ["3,5 Üst"], "Under 3.5 Cards": ["3,5 Alt"],
  "Over 4.5 Cards": ["4,5 Üst"], "Under 4.5 Cards": ["4,5 Alt"],
};

// ============================================
// Yardımcılar
// ============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function norm(name) {
  return name
    .toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/\b(fc|cf|sc|ac|as|ss|us|afc|fk|sk|gk|bk|if|bsc|tsg|rb|sv|vfb|vfl|tsv|1\.|ud|cd|sd|se|ce|rcd|rc|real|sporting|atletico|deportivo)\b/gi, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ń/g, "n").replace(/ś/g, "s").replace(/ć/g, "c").replace(/ź|ż/g, "z").replace(/ł/g, "l")
    .replace(/ą/g, "a").replace(/ę/g, "e").replace(/ř/g, "r").replace(/ž/g, "z").replace(/ě/g, "e")
    .replace(/ů/g, "u").replace(/ď|đ/g, "d").replace(/ť/g, "t").replace(/ň/g, "n").replace(/ã/g, "a")
    .replace(/ß/g, "ss").replace(/ä/g, "a")
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/á|à|â/g, "a").replace(/é|è|ê|ë/g, "e").replace(/í|ì|î|ï/g, "i")
    .replace(/ó|ò|ô|õ/g, "o").replace(/ú|ù|û/g, "u").replace(/ñ/g, "n").replace(/ý/g, "y")
    .replace(/[''`\-_.()]/g, " ").replace(/\s+/g, " ").trim();
}

function teamScore(apiName, bilyonerName) {
  const a = norm(apiName);
  const b = norm(bilyonerName);
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const wa = a.split(" ").filter(w => w.length >= 3);
  const wb = b.split(" ").filter(w => w.length >= 3);
  if (!wa.length || !wb.length) return 0;
  let hits = 0;
  for (const w of wa) { if (wb.some(x => x === w || x.includes(w) || w.includes(x))) hits++; }
  return hits / Math.max(wa.length, wb.length);
}

function findBestMatch(matches, homeTeam, awayTeam) {
  let best = null, bestScore = 0;
  for (const m of matches) {
    const hs = teamScore(homeTeam, m.homeTeam);
    const as = teamScore(awayTeam, m.awayTeam);
    const score = (hs + as) / 2;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  // Tek sonuç varsa düşük skorla da kabul et
  if (matches.length === 1 && bestScore >= 0.2) return matches[0];
  return bestScore >= 0.35 ? best : null;
}

// ============================================
// Chrome Storage
// ============================================
const storageGet = (keys) => new Promise(r => chrome.storage.local.get(keys, r));
const storageSet = (data) => new Promise(r => chrome.storage.local.set(data, r));
const storageClear = () => new Promise(r => chrome.storage.local.remove(["ba_queue", "ba_progress"], r));

// ============================================
// BÜLTEN: Scroll yaparak maç ID'lerini topla
// ============================================

/** "Saat" tab'ına tıkla → tüm maçlar kronolojik sırayla gelir */
async function clickSaatTab() {
  const candidates = document.querySelectorAll("span, button, div, a, li");
  for (const el of candidates) {
    const t = (el.textContent || "").trim();
    if (t === "Saat" && el.offsetParent !== null) {
      el.click();
      await sleep(800);
      console.log("[BA] ✓ Saat tab'ı tıklandı");
      return true;
    }
  }
  console.log("[BA] ⚠ Saat tab'ı bulunamadı");
  return false;
}

/** Sayfadaki scroll edilebilir inner container'ı bul */
function findScrollContainer() {
  // Bilyoner'in bülten listesi genelde overflow:auto olan bir div içinde
  const candidates = document.querySelectorAll("div, section, main, ul");
  let best = null;
  let bestHeight = 0;
  for (const el of candidates) {
    if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 300) {
      const style = window.getComputedStyle(el);
      if (style.overflow === "auto" || style.overflow === "scroll" ||
          style.overflowY === "auto" || style.overflowY === "scroll") {
        if (el.scrollHeight > bestHeight) {
          bestHeight = el.scrollHeight;
          best = el;
        }
      }
    }
  }
  return best;
}

async function discoverMatchIds(predictions, onProgress) {
  const collected = [];
  const seen = new Set();

  function scanDOM() {
    let added = 0;
    for (const link of document.querySelectorAll('a[href*="/mac-karti/"]')) {
      const href = link.getAttribute("href") || "";
      const idMatch = href.match(/\/mac-karti\/[^/]+\/(\d+)/);
      if (!idMatch) continue;
      const id = idMatch[1];
      if (seen.has(id)) continue;
      seen.add(id);

      // Link içindeki text'i temizle
      let text = (link.textContent || "").replace(/\s+/g, " ").trim();
      text = text.replace(/\d+[.,]\d+/g, " ");    // Oranları sil
      text = text.replace(/\+\d+\s*Tümü/g, " ");  // "+40 Tümü" sil
      text = text.replace(/\b(MS|Alt|Üst|KG|ÇŞ|İY|Tümü|Canlı|Bugün|Yarın)\b/g, " "); // Bilyoner etiketlerini sil
      text = text.replace(/^\d{1,2}:\d{2}\s*/, ""); // Saat sil
      text = text.replace(/^\d+\s*/, "");            // Baştaki sayı sil
      text = text.replace(/\s{2,}/g, " ").trim();

      const parts = text.split(/\s*[-–]\s*/);
      if (parts.length >= 2) {
        const home = parts[0].trim();
        const away = parts.slice(1).join(" - ").trim();
        if (home.length >= 2 && away.length >= 2 && home.length <= 50 && away.length <= 50) {
          collected.push({ bilyonerId: id, homeTeam: home, awayTeam: away });
          added++;
        }
      }
    }
    return added;
  }

  function allPredictionsFound() {
    return predictions.every(p => !!findBestMatch(collected, p.homeTeam, p.awayTeam));
  }

  // "Saat" tab'ına tıkla — tüm maçları göster
  await clickSaatTab();

  // İlk tarama
  scanDOM();
  console.log(`[BA] İlk tarama: ${collected.length} maç | İlk 5:`, collected.slice(0,5).map(m => `${m.homeTeam}-${m.awayTeam}`));
  if (allPredictionsFound()) return collected;

  // Hem window hem de inner container'ı scroll et
  const scrollContainer = findScrollContainer();
  console.log(`[BA] Scroll container: ${scrollContainer ? scrollContainer.tagName + " (h:" + scrollContainer.scrollHeight + ")" : "window"}`);

  const maxMs = 30000;
  const start = Date.now();
  let noNewCount = 0;

  while (Date.now() - start < maxMs) {
    // Her ikisini de scroll et
    window.scrollBy(0, 800);
    if (scrollContainer) scrollContainer.scrollBy(0, 800);
    await sleep(400);
    const added = scanDOM();

    if (onProgress) onProgress(collected.length, seen.size);

    if (added === 0) {
      noNewCount++;
      if (noNewCount >= 6) break; // 6 kez yeni maç gelmezse dur
    } else {
      noNewCount = 0;
    }

    if (allPredictionsFound()) {
      console.log("[BA] ✓ Tüm tahminler bulundu, tarama tamamlandı");
      break;
    }

    // Sayfanın en altına geldik mi?
    const winBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 200);
    const contBottom = scrollContainer
      ? scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 200
      : true;
    if (winBottom && contBottom && noNewCount >= 2) break;
  }

  window.scrollTo(0, 0);
  if (scrollContainer) scrollContainer.scrollTo(0, 0);
  await sleep(200);

  console.log(`[BA] Tarama bitti: ${collected.length} maç | Tümü:`, collected.map(m => `${m.homeTeam}-${m.awayTeam}`));
  return collected;
}

// ============================================
// BÜLTEN: Aktarım başlatma
// ============================================
async function handleTransfer(predictions, setStatus, setProgress) {
  setStatus = setStatus || ((msg) => { const el = document.getElementById("ba-status"); if (el) el.textContent = msg; });
  setProgress = setProgress || (() => {});

  setStatus("🔍 Maçlar taranıyor...");
  setProgress(20);

  const allMatches = await discoverMatchIds(predictions, (found, scanned) => {
    setStatus(`🔍 Taranıyor... ${found} maç bulundu (${scanned} link)`);
    setProgress(20 + Math.min(40, found * 2));
  });

  console.log(`[BA] Keşfedilen maçlar (${allMatches.length}):`, allMatches.map(m => `${m.homeTeam} - ${m.awayTeam} [${m.bilyonerId}]`));

  const queue = [];
  const errors = [];

  for (const pred of predictions) {
    const match = findBestMatch(allMatches, pred.homeTeam, pred.awayTeam);
    if (match) {
      let entry = queue.find(q => q.matchId === match.bilyonerId);
      if (!entry) {
        entry = { matchId: match.bilyonerId, homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, bets: [] };
        queue.push(entry);
      }
      entry.bets.push({ pick: pred.pick, odds: pred.odds });
      console.log(`[BA] ✓ Eşleşti: "${pred.homeTeam}" → "${match.homeTeam}" [${match.bilyonerId}]`);
    } else {
      errors.push(`${pred.homeTeam} vs ${pred.awayTeam}: Bilyoner bülteninde bulunamadı`);
      console.warn(`[BA] ✗ Eşleşme yok: "${pred.homeTeam}" vs "${pred.awayTeam}"`);
    }
  }

  setProgress(70);

  if (queue.length === 0) {
    setStatus("✗ Hiçbir maç bulunamadı. Bülten sayfasında olduğunuzdan emin olun.", "#f87171");
    return { success: false, transferred: 0, total: predictions.length, errors };
  }

  const progress = { total: predictions.length, transferred: 0, errors: [...errors] };
  await storageSet({ ba_queue: queue, ba_progress: progress });

  const totalBets = queue.reduce((s, q) => s + q.bets.length, 0);
  setStatus(`✓ ${queue.length} maç bulundu (${totalBets} bahis). Maç kartına gidiliyor...`, "#34d399");
  setProgress(90);
  await sleep(800);

  window.location.href = `/mac-karti/futbol/${queue[0].matchId}/oranlar`;
  return { success: true, transferred: 0, total: predictions.length, errors };
}

// ============================================
// MAC-KARTI: Sayfanın yüklenmesini bekle
// ============================================
async function waitForMacKartiOdds(timeoutMs = 25000) {
  // Bilyoner'in bilinen market etiketleri — bunlardan biri görününce sayfa hazırdır
  const SIGNALS = ["MS 1", "MS X", "MS 2", "2,5 Üst", "2,5 Alt", "KG Var", "KG Yok", "ÇŞ 1-X", "İY 0,5"];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const bodyText = document.body?.textContent || "";
    const found = SIGNALS.find(s => bodyText.includes(s));
    if (found) {
      console.log(`[BA] ✓ Oran sayfası hazır ("${found}" bulundu)`);
      await sleep(600);
      return true;
    }
    // Fallback: 10'dan fazla buton + herhangi birinde decimal sayı varsa
    const btns = document.querySelectorAll('button, [role="button"]');
    if (btns.length > 10) {
      const hasNums = Array.from(btns).some(b => {
        const t = (b.textContent || "").replace(/\s+/g, " ").trim();
        return t.length < 40 && /\d+[.,]\d+/.test(t);
      });
      if (hasNums) {
        console.log("[BA] ✓ Oran sayfası hazır (butonlarda sayılar bulundu)");
        await sleep(600);
        return true;
      }
    }
    await sleep(400);
  }
  console.warn("[BA] ✗ waitForMacKartiOdds timeout. Başlık:", document.title, "| body:", (document.body?.textContent || "").slice(0, 200));
  return false;
}

// ============================================
// MAC-KARTI: Oran butonu bul ve tıkla
// ============================================
function findAndClickOddsButton(pick) {
  const targets = PICK_TO_BILYONER[pick];
  if (!targets) {
    console.warn(`[BA] Bilinmeyen pick: ${pick}`);
    return false;
  }

  const els = document.querySelectorAll(
    'button, [role="button"], [class*="odd"], [class*="rate"], [class*="selection"], [class*="bet-button"], [class*="betButton"]'
  );

  for (const el of els) {
    // Whitespace'i normalleştir
    const rawText = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!rawText || rawText === "-" || rawText === "—") continue;
    if (rawText.length > 60) continue;

    for (const target of targets) {
      const esc = escapeRegex(target);
      // 1. Tam eşleşme: "KG Var"
      if (rawText === target) {
        (el.closest("button, [role='button']") || el).click();
        console.log(`[BA] ✓ Click (exact): "${pick}" → "${rawText}"`);
        return true;
      }
      // 2. Oran önce: "1.82 MS 1" veya "1,82 KG Var"
      if (new RegExp(`^\\d+[.,]\\d+\\s+${esc}$`, "i").test(rawText)) {
        (el.closest("button, [role='button']") || el).click();
        console.log(`[BA] ✓ Click (odds-first): "${pick}" → "${rawText}"`);
        return true;
      }
      // 3. Oran sonra: "MS 1 1.82" veya "KG Var 1,82"
      if (new RegExp(`^${esc}\\s+\\d+[.,]\\d+$`, "i").test(rawText)) {
        (el.closest("button, [role='button']") || el).click();
        console.log(`[BA] ✓ Click (label-first): "${pick}" → "${rawText}"`);
        return true;
      }
      // 4. Kelime sınırıyla içinde geçiyor: "MS 1" in "Bugün MS 1 1.82"
      if (new RegExp(`(^|\\s)${esc}(\\s|$)`, "i").test(rawText)) {
        (el.closest("button, [role='button']") || el).click();
        console.log(`[BA] ✓ Click (contains): "${pick}" → "${rawText}"`);
        return true;
      }
      // 5. Çocuk elementlerde etiket ara
      for (const child of el.querySelectorAll("span, div, p")) {
        if ((child.textContent || "").trim() === target) {
          (el.closest("button, [role='button']") || el).click();
          console.log(`[BA] ✓ Click (child): "${pick}" → "${target}"`);
          return true;
        }
      }
    }
  }

  // Debug: hangi butonlar var?
  console.warn(
    `[BA] ✗ "${pick}" için buton bulunamadı. Targets: ${JSON.stringify(targets)}`,
    "\nİlk 20 buton:",
    Array.from(els).slice(0, 20).map(e => (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30))
  );
  return false;
}

// ============================================
// MAC-KARTI: Queue işle
// ============================================
async function processMacKartiQueue() {
  const currentId = (window.location.pathname.match(/\/mac-karti\/[^/]+\/(\d+)/) || [])[1];
  if (!currentId) return;

  const { ba_queue: queue, ba_progress: progress } = await storageGet(["ba_queue", "ba_progress"]);
  if (!queue || !queue.length || !progress) return;

  const idx = queue.findIndex(q => q.matchId === currentId);
  if (idx === -1) {
    console.log(`[BA] Mac-karti ${currentId} queue'da yok`);
    return;
  }

  const current = queue[idx];
  console.log(`[BA] 🎯 ${current.homeTeam} vs ${current.awayTeam} | ${current.bets.map(b => b.pick).join(", ")}`);

  // Durum widget'ı göster
  const widget = createStatusWidget(current, progress, queue.length - 1);
  const setWidgetStatus = widget.setStatus;

  setWidgetStatus("⏳ Sayfa yükleniyor...");
  const loaded = await waitForMacKartiOdds();

  if (!loaded) {
    setWidgetStatus("⚠ Sayfa yüklenemedi!");
    progress.errors.push(`${current.homeTeam} vs ${current.awayTeam}: Sayfa yüklenemedi`);
    await sleep(2000);
  } else {
    for (const bet of current.bets) {
      setWidgetStatus(`🔍 "${bet.pick}" aranıyor...`);
      await sleep(400);

      // İlk dene — buton hemen görünür alanda olabilir
      let found = findAndClickOddsButton(bet.pick);

      // Bulunamazsa: sayfayı aşağı scroll et ve tekrar dene (İY/MS gibi alt bölümler için)
      if (!found) {
        const scrollStep = 600;
        const maxScrolls = 10;
        for (let i = 0; i < maxScrolls && !found; i++) {
          window.scrollBy(0, scrollStep);
          await sleep(350);
          found = findAndClickOddsButton(bet.pick);
        }
        // Bulunan/bulunmadan scroll'u başa al
        window.scrollTo(0, 0);
        await sleep(200);
      }

      if (found) {
        progress.transferred++;
        setWidgetStatus(`✅ ${bet.pick} eklendi`);
        console.log(`[BA] ✓ ${current.homeTeam} vs ${current.awayTeam} → ${bet.pick}`);
      } else {
        progress.errors.push(`${current.homeTeam} vs ${current.awayTeam}: "${bet.pick}" butonu bulunamadı`);
        setWidgetStatus(`✗ ${bet.pick} bulunamadı`);
        console.warn(`[BA] ✗ ${current.homeTeam} vs ${current.awayTeam} → ${bet.pick} yok`);
      }
      await sleep(600);
    }
  }

  // Bu maçı queue'dan çıkar
  queue.splice(idx, 1);

  if (queue.length > 0) {
    await storageSet({ ba_queue: queue, ba_progress: progress });
    setWidgetStatus(`➡ Sonraki maça gidiliyor... (${queue.length} kaldı)`);
    await sleep(1000);
    window.location.href = `/mac-karti/futbol/${queue[0].matchId}/oranlar`;
  } else {
    await storageClear();
    setWidgetStatus("✅ Aktarım tamamlandı!");
    await sleep(500);
    showCompletionOverlay(progress);
  }
}

// ============================================
// MAC-KARTI: Durum widget'ı
// ============================================
function createStatusWidget(currentMatch, progress, remaining) {
  const el = document.createElement("div");
  el.id = "ba-widget";
  el.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:99999;
    background:#1e293b; border:1px solid #334155; border-radius:12px;
    padding:14px 18px; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    min-width:280px; max-width:340px; box-shadow:0 8px 32px rgba(0,0,0,0.5);
    font-size:13px;
  `;
  el.innerHTML = `
    <div style="font-weight:700; font-size:13px; color:#60a5fa; margin-bottom:6px;">⚽ Bilyoner Assistant v4</div>
    <div style="font-weight:600; color:#f1f5f9; margin-bottom:2px;">${currentMatch.homeTeam}</div>
    <div style="color:#94a3b8; margin-bottom:6px;">vs ${currentMatch.awayTeam}</div>
    <div style="color:#a78bfa; margin-bottom:8px; font-size:11px;">${currentMatch.bets.map(b => b.pick).join(" · ")}</div>
    <div id="ba-widget-status" style="color:#34d399; font-size:12px;"></div>
    ${remaining > 0 ? `<div style="color:#64748b; font-size:11px; margin-top:4px;">${remaining} maç daha kaldı</div>` : ""}
  `;
  document.body.appendChild(el);

  return {
    setStatus: (msg) => {
      const s = document.getElementById("ba-widget-status");
      if (s) s.textContent = msg;
    },
  };
}

// ============================================
// Tamamlama Overlay'i
// ============================================
function showCompletionOverlay(progress) {
  document.getElementById("ba-widget")?.remove();

  const ok = progress.transferred > 0;
  const errHtml = progress.errors.length
    ? `<div style="text-align:left;max-height:120px;overflow-y:auto;margin-bottom:12px;border-top:1px solid #334155;padding-top:8px;">
        ${progress.errors.map(e => `<div style="font-size:11px;color:#f87171;margin-bottom:3px;">• ${e}</div>`).join("")}
       </div>`
    : "";

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div style="background:#1e293b;border-radius:16px;padding:28px 32px;max-width:380px;width:90%;color:#e2e8f0;font-family:-apple-system,sans-serif;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">${ok ? "✅" : "❌"}</div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Aktarım ${ok ? "Tamamlandı!" : "Başarısız"}</h2>
      <p style="font-size:22px;font-weight:700;color:${ok ? "#34d399" : "#f87171"};margin-bottom:12px;">${progress.transferred}/${progress.total}</p>
      <p style="font-size:13px;color:#94a3b8;margin-bottom:16px;">bahis kupona eklendi</p>
      ${errHtml}
      <button id="ba-done-btn" style="padding:10px 28px;border:none;border-radius:8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;font-weight:600;font-size:14px;cursor:pointer;">Tamam</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("ba-done-btn").addEventListener("click", () => overlay.remove());
}

// ============================================
// BA Göstergesi
// ============================================
function injectIndicator() {
  if (document.getElementById("ba-indicator")) return;
  if (!document.body) return; // document_start'ta body henüz yok olabilir
  const el = document.createElement("div");
  el.id = "ba-indicator";
  el.innerHTML = "⚽ BA";
  el.title = "Bilyoner Assistant v4.1";
  document.body.appendChild(el);
}

// ============================================
// Hash Kupon (Bülten → Hash okunur)
// ============================================
function checkHashCoupon() {
  // INITIAL_HASH: document_start'ta yakalandı, SPA silmeden önce.
  // window.location.hash burada artık boş olabilir.
  const hash = INITIAL_HASH || window.location.hash;
  if (!hash.startsWith("#ba-coupon=")) return;

  let data;
  try {
    data = JSON.parse(decodeURIComponent(hash.slice("#ba-coupon=".length)));
  } catch (e) {
    console.error("[BA] Hash parse hatası:", e);
    return;
  }

  if (!Array.isArray(data) || data.length === 0) return;
  // Hash'i URL'den temizle (SPA zaten sildi ama temiz olsun)
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  console.log(`[BA] Hash kupon: ${data.length} tahmin`);
  showBultenOverlay(data);
}

// ============================================
// Bülten Overlay — Otomatik başlar
// ============================================
function showBultenOverlay(couponData) {
  const overlay = document.createElement("div");
  overlay.id = "ba-bulten-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;";

  const listHtml = couponData.map(item => `
    <div style="padding:6px 8px;margin-bottom:4px;background:#0f172a;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:600;color:#f1f5f9;font-size:12px;">${item.h} - ${item.a}</div>
        <div style="color:#a78bfa;font-size:11px;">${item.p} <span style="color:#34d399">@${item.o}</span></div>
      </div>
      <div id="ba-item-${item.h.replace(/\s/g,'')}" style="font-size:16px;">⏳</div>
    </div>
  `).join("");

  overlay.innerHTML = `
    <div style="background:#1e293b;border-radius:16px;padding:24px 28px;max-width:420px;width:92%;color:#e2e8f0;font-family:-apple-system,sans-serif;">
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:28px;margin-bottom:6px;">⚽</div>
        <div style="font-size:16px;font-weight:700;">Bilyoner Assistant</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${couponData.length} bahis aktarılıyor</div>
      </div>
      <div style="text-align:left;max-height:220px;overflow-y:auto;margin-bottom:14px;">${listHtml}</div>
      <div id="ba-progress-bar-wrap" style="background:#0f172a;border-radius:6px;height:6px;margin-bottom:10px;">
        <div id="ba-progress-bar" style="background:#10b981;height:6px;border-radius:6px;width:0%;transition:width 0.3s;"></div>
      </div>
      <div id="ba-status" style="font-size:12px;color:#60a5fa;text-align:center;min-height:16px;">⏳ Sayfa yükleniyor...</div>
      <div style="text-align:center;margin-top:10px;">
        <button id="ba-cancel-btn" style="padding:6px 18px;border:1px solid #334155;border-radius:6px;background:transparent;color:#64748b;cursor:pointer;font-size:12px;">İptal</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const statusEl = document.getElementById("ba-status");
  const progressBar = document.getElementById("ba-progress-bar");
  const setStatus = (msg, color = "#60a5fa") => {
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color; }
  };
  const setProgress = (pct) => {
    if (progressBar) progressBar.style.width = Math.min(100, pct) + "%";
  };

  document.getElementById("ba-cancel-btn").addEventListener("click", () => overlay.remove());

  // Sayfa yüklenip maç linkleri çıkınca otomatik başlat
  let started = false;
  setProgress(5);

  const tryStart = async () => {
    if (started) return;
    const links = document.querySelectorAll('a[href*="/mac-karti/"]');
    if (links.length > 0) {
      started = true;
      setStatus(`✓ ${links.length} maç linki bulundu. Tarama başlıyor...`, "#34d399");
      setProgress(15);
      await sleep(400);

      const predictions = couponData.map(item => ({
        homeTeam: item.h, awayTeam: item.a, pick: item.p, odds: item.o,
      }));

      await handleTransfer(predictions, setStatus, setProgress);
    }
  };

  // Hemen dene, sonra 500ms'de bir tekrar dene (SPA lazy-render için)
  tryStart();
  const poll = setInterval(async () => {
    if (started) { clearInterval(poll); return; }
    await tryStart();
  }, 500);

  // 15 saniye sonra hala başlamamışsa zorla başlat
  setTimeout(async () => {
    if (started) return;
    clearInterval(poll);
    started = true;
    setStatus("⚠ Bülten tam yüklenemedi, yine de deneniyor...", "#fbbf24");
    const predictions = couponData.map(item => ({
      homeTeam: item.h, awayTeam: item.a, pick: item.p, odds: item.o,
    }));
    await handleTransfer(predictions, setStatus, setProgress);
  }, 15000);
}

// ============================================
// BAŞLATICI
// ============================================
async function init() {
  injectIndicator();
  const path = window.location.pathname;

  if (path.includes("/mac-karti/")) {
    // Mac-karti sayfasındayız: queue işle
    await processMacKartiQueue();
  } else {
    // Bülten veya başka sayfa: hash coupon kontrol et
    checkHashCoupon();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}