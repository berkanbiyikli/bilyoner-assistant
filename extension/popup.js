// ============================================
// Bilyoner Assistant — Popup Script
// Tahminleri getir, kupona aktar
// ============================================

let predictions = [];
let selectedCategory = "safe";

// DOM elementleri
const apiUrlInput = document.getElementById("apiUrl");
const fetchBtn = document.getElementById("fetchBtn");
const transferBtn = document.getElementById("transferBtn");
const content = document.getElementById("content");
const totalBar = document.getElementById("totalBar");
const totalOddsEl = document.getElementById("totalOdds");
const statusEl = document.getElementById("status");

// Kategori butonları
document.querySelectorAll(".cat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCategory = btn.dataset.cat;
    renderPredictions();
  });
});

// Kayıtlı API URL'ini yükle
chrome.storage.local.get(["apiUrl"], (result) => {
  if (result.apiUrl) {
    apiUrlInput.value = result.apiUrl;
  }
});

// API URL değişince kaydet
apiUrlInput.addEventListener("change", () => {
  chrome.storage.local.set({ apiUrl: apiUrlInput.value.trim() });
});

// Tahminleri getir
fetchBtn.addEventListener("click", async () => {
  const apiUrl = apiUrlInput.value.trim();
  if (!apiUrl) {
    showStatus("API adresi giriniz", "error");
    return;
  }

  // URL sanitization - only allow HTTPS
  if (!apiUrl.startsWith("https://")) {
    showStatus("Sadece HTTPS adresleri desteklenir", "error");
    return;
  }

  showLoading();
  fetchBtn.disabled = true;

  try {
    const response = await fetch(`${apiUrl}/api/coupon/generate?category=${selectedCategory}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.coupon && data.coupon.items) {
      predictions = data.coupon.items;
      renderPredictions();
      showStatus(`${predictions.length} tahmin yüklendi`, "success");
    } else {
      showStatus("Kupon boş döndü", "info");
    }
  } catch (err) {
    showStatus(`Hata: ${err.message}`, "error");
    content.innerHTML = '<div class="empty">Bağlantı hatası. API adresini kontrol edin.</div>';
  } finally {
    fetchBtn.disabled = false;
  }
});

// Bilyoner'e aktar
transferBtn.addEventListener("click", async () => {
  if (predictions.length === 0) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !tab.url.includes("bilyoner.com")) {
    showStatus("Bilyoner.com sayfasında olmanız gerekiyor!", "error");
    return;
  }

  // Bülten sayfasında olduğundan emin ol
  if (!tab.url.includes("/iddaa/") && !tab.url.includes("/mac-karti/")) {
    showStatus("Bilyoner İddaa bülten sayfasına gidin! (iddaa/futbol)", "error");
    return;
  }

  transferBtn.disabled = true;
  showStatus("Kupon aktarılıyor...", "info");

  try {
    // Content script'e kuponu gönder
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "TRANSFER_COUPON",
      predictions: predictions.map(p => ({
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        pick: p.pick,
        odds: p.odds,
      })),
    });

    if (response && response.success) {
      const msg = response.transferred === predictions.length
        ? `${response.transferred} bahis kupona eklendi!`
        : `${response.transferred}/${predictions.length} bahis eklendi`;
      showStatus(msg, "success");
      if (response.errors && response.errors.length > 0) {
        console.warn("[BA] Transfer hataları:", response.errors);
      }
    } else {
      showStatus(response?.errors?.[0] || "Aktarım başarısız — bülten sayfasını kontrol edin", "error");
    }
  } catch (err) {
    showStatus("Content script bağlantı hatası. Sayfayı yenileyin.", "error");
  } finally {
    transferBtn.disabled = false;
  }
});

// ============================================
// Render
// ============================================

function renderPredictions() {
  if (predictions.length === 0) {
    content.innerHTML = '<div class="empty">Tahmin bulunamadı</div>';
    totalBar.style.display = "none";
    transferBtn.disabled = true;
    return;
  }

  let html = "";
  let totalOdds = 1;

  for (const item of predictions) {
    totalOdds *= item.odds;
    html += `
      <div class="coupon-item">
        <div class="match">${item.homeTeam} vs ${item.awayTeam}</div>
        <div class="details">
          <span class="pick">${formatPick(item.pick)}</span>
          <span class="odds">@${item.odds.toFixed(2)}</span>
          <span class="confidence">%${item.confidence}</span>
        </div>
      </div>
    `;
  }

  content.innerHTML = html;
  totalBar.style.display = "flex";
  totalOddsEl.textContent = totalOdds.toFixed(2);
  transferBtn.disabled = false;
}

function formatPick(pick) {
  const map = {
    "Home Win": "MS 1",
    "Away Win": "MS 2",
    "Draw": "Beraberlik",
    "Over 2.5": "Üst 2.5",
    "Under 2.5": "Alt 2.5",
    "Over 1.5": "Üst 1.5",
    "Under 3.5": "Alt 3.5",
    "Over 3.5": "Üst 3.5",
    "BTTS Yes": "KG Var",
    "BTTS No": "KG Yok",
  };
  return map[pick] || pick;
}

function showLoading() {
  content.innerHTML = '<div class="loading"><div class="spinner"></div><p style="margin-top:8px">Yükleniyor...</p></div>';
}

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  setTimeout(() => { statusEl.textContent = ""; }, 5000);
}
