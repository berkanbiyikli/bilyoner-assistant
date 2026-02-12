# Bilyoner Assistant v2

AI destekli futbol tahmin, kupon oluşturma ve bankroll yönetim sistemi.

## Özellikler

- **🏆 Maç Tahminleri** — API-Football verileriyle AI analiz ve tahmin
- **📊 Value Bet Bulucu** — Fair odds vs bahisçi oranları karşılaştırması
- **🎫 Kupon Oluşturucu** — Otomatik ve manuel kupon builder (Güvenli/Dengeli/Riskli/Value)
- **📻 Canlı Skor** — Gerçek zamanlı maç takibi (30sn güncelleme)
- **💰 Bankroll Yönetimi** — Kelly Criterion, ROI takibi, para yönetimi
- **🐦 Twitter Bot** — Otomatik tahmin ve kupon paylaşımı

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Auth + Database)
- **Zustand** (State Management)
- **API-Football** (Veri kaynağı)
- **Vercel** (Deploy + Cron Jobs)

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Development
npm run dev

# Build
npm run build
```

## Env Variables

`.env.local` dosyasında şu değişkenler gerekli:

```env
API_FOOTBALL_KEY=...
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
CRON_SECRET=...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
```

## Proje Yapısı

```
src/
├── app/                  # Next.js App Router
│   ├── api/              # API Routes
│   │   ├── predictions/  # Tahmin endpointi
│   │   ├── live/         # Canlı skor
│   │   ├── value-bets/   # Value bet'ler
│   │   ├── coupon/       # Kupon oluşturma
│   │   ├── match/[id]/   # Tekil maç analizi
│   │   └── cron/         # Scheduled jobs
│   ├── live/             # Canlı skor sayfası
│   ├── coupons/          # Kupon sayfası
│   ├── value-bets/       # Value bet sayfası
│   ├── bankroll/         # Bankroll sayfası
│   └── stats/            # İstatistik sayfası
├── components/           # React bileşenleri
├── lib/                  # Core modüller
│   ├── api-football/     # API-Football client
│   ├── prediction/       # Tahmin motoru
│   ├── coupon/           # Kupon builder
│   ├── bankroll/         # Bankroll yönetimi
│   ├── value-bet/        # Value bet bulma
│   ├── supabase/         # Supabase client
│   ├── store.ts          # Zustand store
│   └── utils.ts          # Utility fonksiyonlar
└── types/                # TypeScript tanımları
```
