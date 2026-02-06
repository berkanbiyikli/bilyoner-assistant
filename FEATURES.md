# 🎯 Bilyoner Assistant - Yeni Özellikler

Bu güncellemede beş ana yeni özellik eklendi:

## 📊 1. Asistanın Radarına Takılanlar (High Confidence Picks)

**Nedir?** Tüm tahmin algoritmalarının (Poisson, Machine Learning, Form Analizi, H2H) aynı fikri paylaştığı en güvenilir 3 maç.

**Nasıl Çalışır?**
- Ensemble scoring sistemi: Kaç model aynı sonucu öngörüyorsa skor o kadar yüksek
- Minimum %75 güven skoru gerekir
- Form, H2H ve tahmin güveni birleştirilerek sıralama yapılır

**Gösterim:**
- 3 büyük kart halinde
- Her birinde ensemble skoru, uyumlu modeller ve detaylı reasoning
- Direkt kupona ekleme butonu

---

## 🔥 2. Seri Yakalayanlar (Trend Tracker)

**Nedir?** Takım trendlerini otomatik tespit eden akıllı analiz. "Hatayspor son 5 maçta ilk yarı gol yiyor" gibi bilgileri otomatik çıkarıp bahis önerisi sunuyor.

**Tespit Edilen Trendler:**
- **Hot Streak**: Son 5'te 4+ galibiyet
- **Cold Streak**: Son 5'te 3+ mağlubiyet
- **Defensive Issues**: İlk yarı sık gol yeme
- **Offensive Power**: Yüksek gol ortalaması (3.2+)
- **BTTS Pattern**: Her iki takım da hem atar hem yer

**Kullanım:**
- En güçlü 5 trend ekrana gösterilir
- Her trend için confidence level ve ikon
- Otomatik bahis önerisi (MS, 2.5 Üst, KG Var)

---

## 💎 3. Sürpriz / Oran Avcısı (High Odds Picks)

**Nedir?** Risk sevenler için yüksek oranlı (%45-70 güven arası) fırsatlar.

**Stratejiler:**
- Deplasman galibiyeti (2.5-3.5 oran)
- İlk yarı sonucu (2.2 oran)
- Çifte şans + Üst 2.5 (2.8-3.5 oran)
- Over 3.5 (3.2 oran)
- Beraberlik (3.4 oran)

**Risk Seviyeleri:**
- 🟡 Orta Risk (50-60% güven)
- 🟠 Yüksek Risk (45-50% güven)
- 🔴 Çok Yüksek Risk (<45% güven, çok yüksek oran)

**Gösterim:**
- Potansiyel kazanç hesaplaması (100 birim üzerinden)
- Risk seviyesi badge'i
- Uyarı disclaimer'ı

---

## 🪄 4. Kombine Sihirbazı (Quick Build)

**Nedir?** Tek tıkla hazır kupon stratejileri oluşturan sistem.

**Hazır Stratejiler:**

### 1️⃣ 1.5 Üst Kombinesi
- En güvenilir 3 tahmin
- Düşük oranlı ama yüksek kazanma şansı
- Min %75 güven
- @1.30-1.80 oran aralığı

### 2️⃣ Akşamın Bankoları
- Saat 20:00 sonrası maçlar
- En güvenilir 2-3 maç
- Min %70 güven
- @1.40-2.00 oran aralığı

### 3️⃣ Gol Şöleni
- Çok gol beklenen 3-4 maç
- 2.5 Üst kombinesi
- Min %65 güven
- @1.60-2.20 oran aralığı

### 4️⃣ KG Var Kombinesi
- Her iki takımın gol atması beklenen 3 maç
- Hem atar hem yiyen takımlar
- Min %60 güven
- @1.70-2.00 oran aralığı

**Özellikler:**
- Otomatik maç seçimi
- Toplam oran hesaplaması
- Potansiyel kazanç gösterimi
- Alert ile bilgilendirme

---

## 📈 5. Backtesting & Performans Takibi

**Nedir?** Geçmiş tahminlerin başarısını otomatik ölçen ve raporlayan sistem.

### Veri Kaydı
Her tahmin şunları kaydeder:
- Tahmin detayları (maç, sonuç, güven)
- Kullanılan model (Poisson, ML, Ensemble)
- Bahis önerisi (pazar, pick, oran)
- Gerçek sonuç ve kar/zarar

### Metrikler

**Genel Metrikler:**
- Win Rate (Kazanma Oranı %)
- ROI (Return on Investment %)
- Yield (Verimlilik %)
- Net Kar/Zarar

**Detaylı Breakdown:**
- Model bazlı performans (Poisson vs ML vs Ensemble)
- Pazar bazlı performans (MS vs 2.5 Üst vs KG Var)
- Güven aralığı bazlı (50-59%, 60-69%, etc.)
- Günlük performans (son 7-30 gün)

### Otomatik Sonuç Kontrolü

**API Route:** `/api/backtesting`
- Her gece yarısı (00:00) otomatik çalışır
- Dünün bitmiş maçlarını API'den çeker
- Store'daki tahminleri günceller
- Kar/zarar hesaplar

**Cron Job:**
```json
{
  "path": "/api/backtesting",
  "schedule": "0 0 * * *"
}
```

### UI Components

**PerformanceCard:**
- Ana sayfada "Dünün Performansı" kartı
- Win rate, ROI, form göstergesi
- En başarılı pazar bilgisi
- Eğer tahmin yoksa gizlenir

---

## 🧪 Nasıl Test Edilir?

### 1. Development Environment

```bash
npm install
npm run dev
```

Ana sayfada "Oneriler" tab'ına git ve yeni bileşenleri gör.

### 2. Backtesting Manuel Test

```typescript
// Console'da test et
import { useBacktestStore } from '@/lib/backtesting';

const store = useBacktestStore.getState();

// Örnek tahmin ekle
store.addPrediction({
  fixtureId: 12345,
  date: '2026-02-05',
  homeTeam: 'Arsenal',
  awayTeam: 'Chelsea',
  league: 'Premier League',
  leagueId: 39,
  predictedResult: 'home',
  confidence: 82,
  modelUsed: 'ensemble',
  market: 'MS',
  pick: 'MS 1',
  suggestedOdds: 1.65,
});

// Sonuç güncelle
store.settlePrediction(12345, {
  actualResult: 'home',
  actualScore: { home: 2, away: 1 }
});

// Metrikleri gör
const metrics = store.getMetrics('yesterday');
console.log(metrics);
```

### 3. Cron Job Test (Local)

API route'u manuel çağır:
```bash
curl http://localhost:3000/api/backtesting
```

veya tarayıcıdan:
```
http://localhost:3000/api/backtesting
```

### 4. Result Checker Test

```typescript
import { checkResultsForDate } from '@/lib/backtesting/result-checker';

// Belirli bir günü kontrol et
await checkResultsForDate('2026-02-05');

// Son 7 günü kontrol et
import { checkRecentResults } from '@/lib/backtesting/result-checker';
await checkRecentResults(7);
```

---

## 🔧 Environment Variables

Backtesting için yeni environment variable gerekmiyor. Mevcut `NEXT_PUBLIC_API_FOOTBALL_KEY` kullanılıyor.

Opsiyonel olarak Vercel'de cron job güvenliği için:
```
CRON_SECRET=your-secret-key
```

---

## 📦 Yeni Dosyalar

```
src/
├── lib/
│   └── backtesting/
│       ├── index.ts
│       ├── types.ts
│       ├── store.ts
│       └── result-checker.ts
├── components/
│   ├── high-confidence-picks.tsx
│   ├── trend-tracker.tsx
│   ├── high-odds-picks.tsx
│   ├── quick-build.tsx
│   └── performance-card.tsx
└── app/
    └── api/
        └── backtesting/
            └── route.ts
```

---

## 🚀 Deployment

1. **GitHub'a push et:**
```bash
git add .
git commit -m "feat: Add backtesting & new opportunity features"
git push origin master
```

2. **Vercel otomatik deploy eder**

3. **Cron job Vercel tarafından otomatik kurulur** (vercel.json'dan)

---

## 📊 Performans İyileştirmeleri

### Backtesting Store
- `zustand` + `persist` kullanıyor
- LocalStorage'da saklanıyor
- Otomatik eski kayıtları temizleme (30+ gün)

### API Calls
- Result checker rate limiting (500ms delay)
- Batch processing
- Error handling

### UI Performance
- Lazy rendering
- Conditional visibility (tahmin yoksa gösterme)
- Memoization

---

## 💡 Kullanım İpuçları

### Kullanıcılar İçin

1. **"Oneriler" tab'ı** artık ana yıldız. Her gün ilk buraya bak.

2. **Performans Kartı** dünkü başarı oranını gösterir. Eğer %70+ win rate varsa, o günkü tavsiyelere daha çok güvenebilirsin.

3. **Kombine Sihirbazı** acele edenler için. Tek tıkla kupon hazır.

4. **Oran Avcısı** riskli ama yüksek kazançlı. Sadece küçük miktarlar oyna.

5. **Seri Yakalayanlar** özel durumları yakalar. "Son 5'te 4G" gibi bilgiler gerçek edge verebilir.

### Geliştiriciler İçin

1. Backtesting store'u manuel temizlemek için:
```typescript
useBacktestStore.getState().clearOldPredictions(30); // 30 günden eski kayıtlar silinir
```

2. Özel metrik hesaplamak için `getMetrics()` fonksiyonunu extend edebilirsin.

3. Yeni "Quick Build" stratejisi eklemek için `templates` array'ine yeni obje ekle.

---

## 🐛 Bilinen Sınırlamalar

1. **Backtesting** sadece bitmiş maçları takip eder. Canlı bahisleri takip etmez.

2. **API Rate Limit**: Günde 100 request limiti var (API-Football Free plan). Result checker bunu aşmayacak şekilde tasarlandı.

3. **LocalStorage**: Tarayıcı 5-10MB limit koyar. Çok eski kayıtlar otomatik silinir.

4. **Odds**: Gerçek bahis sitelerinden çekilmiyor, algoritmik tahmin ediliyor. Gerçek oranlar farklı olabilir.

---

## 📞 Destek

Sorular için GitHub Issues kullanın.

---

## 🎉 Başarı Ölçütleri

Bu özellikler şunları hedefliyor:

- ✅ %70+ Win Rate (Backtesting ile doğrulanmış)
- ✅ Pozitif ROI (Uzun vadede karlı)
- ✅ Kullanıcı engagement artışı (Günlük dönüş oranı)
- ✅ Şeffaflık (Başarı/başarısızlık görünür)
- ✅ Kullanım kolaylığı (Tek tıkla kupon)

İyi şanslar! 🍀
