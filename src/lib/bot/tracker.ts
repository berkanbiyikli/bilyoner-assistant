// ============================================
// Match Thread Tracker — "The Threader"
// Bir maçın tüm yaşam döngüsünü aynı thread'de tutar
//
// Yaşam Döngüsü:
//   1. tweet-picks → Ana tahmin tweeti (SEED)
//   2. live-scores → Maç içi kritik olaylar (REPLY)
//   3. settle-bets → ✅/❌ Sonuç yanıtı (REPLY)
//
// DB'de tweets tablosu fixture_id + reply_to_tweet_id ile zincirlenir
// ============================================

import { createAdminSupabase } from "@/lib/supabase/admin";

// ---- Types ----

export interface ThreadSeed {
  fixtureId: number;
  tweetId: string;      // Ana tahmin tweet'inin ID'si
  homeTeam: string;
  awayTeam: string;
  pick: string;
  odds: number;
  confidence: number;
}

export interface ThreadChain {
  seedTweetId: string;    // İlk tweet (tahmin)
  lastTweetId: string;    // Son reply (zincirin ucu)
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  replyCount: number;
}

// ---- Seed: Ana Tweeti DB'ye Mühürle ----

/**
 * tweet-picks cron'undan çağrılır.
 * Gönderilen tweet_id'yi fixture_id ile eşleştirir.
 * Böylece live-scores ve settle-bets bu tweet'in altına reply atabilir.
 */
export async function seedThread(seed: ThreadSeed): Promise<void> {
  const supabase = createAdminSupabase();

  // tweets tablosuna fixture_id ile kaydet (daily_picks tipinde)
  await supabase.from("tweets").insert({
    tweet_id: seed.tweetId,
    type: "daily_picks" as const,
    content: `[THREAD SEED] ${seed.homeTeam} vs ${seed.awayTeam} — ${seed.pick} @${seed.odds.toFixed(2)} (%${seed.confidence})`,
    fixture_id: seed.fixtureId,
    reply_to_tweet_id: null, // Bu seed tweet — zincilin başı
  });
}

/**
 * Birden fazla fixture'ı tek bir thread tweet'ine bağla
 * tweet-picks birden çok maçı tek tweet'te paylaşıyorsa kullanılır
 */
export async function seedThreadBulk(
  tweetId: string,
  fixtures: Array<{ fixtureId: number; homeTeam: string; awayTeam: string; pick: string; odds: number; confidence: number }>
): Promise<void> {
  const supabase = createAdminSupabase();

  // Her fixture için ayrı bir eşleştirme kaydı
  const inserts = fixtures.map((f) => ({
    tweet_id: tweetId,
    type: "daily_picks" as const,
    content: `[THREAD SEED] ${f.homeTeam} vs ${f.awayTeam} — ${f.pick} @${f.odds.toFixed(2)} (%${f.confidence})`,
    fixture_id: f.fixtureId,
    reply_to_tweet_id: null,
  }));

  // Upsert ile tekrar kaydı engelle
  for (const insert of inserts) {
    const { error } = await supabase.from("tweets").insert(insert);
    if (error) {
      console.error(`[TRACKER] Seed error for fixture ${insert.fixture_id}:`, error.message);
    }
  }
}

// ---- Find: Fixture'a Ait Thread Zincirini Bul ----

/**
 * Verilen fixture_id için aktif thread zincirini bulur.
 * En son reply'ın tweet_id'sini döner — yeni reply buraya yapılacak.
 */
export async function findThreadChain(fixtureId: number): Promise<ThreadChain | null> {
  const supabase = createAdminSupabase();

  // 1. Bu fixture'a ait seed tweet'i bul
  const { data: seedTweets } = await supabase
    .from("tweets")
    .select("*")
    .eq("fixture_id", fixtureId)
    .eq("type", "daily_picks")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!seedTweets || seedTweets.length === 0) return null;

  const seed = seedTweets[0];

  // 2. Bu seed tweet'e yapılmış tüm reply'ları bul
  const { data: replies } = await supabase
    .from("tweets")
    .select("*")
    .eq("fixture_id", fixtureId)
    .in("type", ["live_alert", "outcome_reply"])
    .order("created_at", { ascending: false })
    .limit(1);

  const lastReply = replies?.[0];
  const replyCount = replies?.length ?? 0;

  // Parse home/away from seed content
  const match = seed.content.match(/\[THREAD SEED\] (.+?) vs (.+?) —/);

  return {
    seedTweetId: seed.tweet_id,
    lastTweetId: lastReply?.tweet_id ?? seed.tweet_id, // Son reply yoksa seed'e reply at
    fixtureId,
    homeTeam: match?.[1] ?? "",
    awayTeam: match?.[2] ?? "",
    pick: seed.content.split("— ")[1]?.split(" @")[0] ?? "",
    replyCount,
  };
}

/**
 * Bugün tahmin edilen ve tweet atılmış tüm fixture'ları listele.
 * live-scores cron'u bunu kullanarak hangi maçlara reply atabileceğini bilir.
 */
export async function getTrackedFixtures(): Promise<Map<number, ThreadChain>> {
  const supabase = createAdminSupabase();

  // Son 24 saatteki seed tweetleri
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: seeds } = await supabase
    .from("tweets")
    .select("*")
    .eq("type", "daily_picks")
    .not("fixture_id", "is", null)
    .gte("created_at", oneDayAgo);

  if (!seeds || seeds.length === 0) return new Map();

  const fixtureIds = [...new Set(seeds.map((s) => s.fixture_id as number))];
  const result = new Map<number, ThreadChain>();

  // Her fixture için chain bul
  for (const fid of fixtureIds) {
    const chain = await findThreadChain(fid);
    if (chain) {
      result.set(fid, chain);
    }
  }

  return result;
}

// ---- Reply Kayıt ----

/**
 * Bir thread'e atılan reply'ı kaydet (live_alert veya outcome_reply)
 */
export async function recordThreadReply(
  tweetId: string,
  fixtureId: number,
  replyToTweetId: string,
  type: "live_alert" | "outcome_reply",
  content: string
): Promise<void> {
  const supabase = createAdminSupabase();

  await supabase.from("tweets").insert({
    tweet_id: tweetId,
    type,
    content,
    fixture_id: fixtureId,
    reply_to_tweet_id: replyToTweetId,
  });
}

// ---- Rate Limit Guard ----

/**
 * Son 1 saatte kaç canlı alert tweet'i atıldığını say.
 * Twitter V2 Free tier: ~50 tweet/gün, 17/3h sınırı.
 * Bu yüzden saat başına sınırlıyoruz.
 */
export async function getLiveAlertCount(lastHours = 1): Promise<number> {
  const supabase = createAdminSupabase();

  const since = new Date(Date.now() - lastHours * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("tweets")
    .select("*", { count: "exact", head: true })
    .eq("type", "live_alert")
    .gte("created_at", since);

  return count ?? 0;
}

/**
 * Bu fixture'a daha önce reply atılmış mı? (aynı olay için)
 * Cache key pattern: "live-{fixtureId}-{eventKey}" şeklinde content'te saklanır
 */
export async function hasRecentReply(
  fixtureId: number,
  eventKey: string
): Promise<boolean> {
  const supabase = createAdminSupabase();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("tweets")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("type", "live_alert")
    .ilike("content", `%${eventKey}%`)
    .gte("created_at", oneHourAgo)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
