/**
 * Tweet Validator - 280 Karakter Yönetimi & Akıllı Bölme
 *
 * Her tweet gönderilmeden önce buradan geçer.
 * Thread'e bölme, truncation ve sanitization işlemleri.
 */

/** Twitter karakter limiti */
export const TWEET_MAX_LENGTH = 280;

/** Thread devam işareti için ayrılan karakter */
const THREAD_INDICATOR_LENGTH = 6; // " 🧵1/5" gibi

// ============ VALIDATION ============

export interface TweetValidation {
  valid: boolean;
  length: number;
  overflow: number;
}

/**
 * Tweet metnini doğrula
 */
export function validateTweet(text: string): TweetValidation {
  const length = text.length;
  return {
    valid: length <= TWEET_MAX_LENGTH,
    length,
    overflow: Math.max(0, length - TWEET_MAX_LENGTH),
  };
}

// ============ TRUNCATION ============

/**
 * Tweet'i güvenli şekilde kısalt
 * Son satırı kesip "..." ekler — hiçbir zaman kelime ortasından kesmez
 */
export function truncateTweet(
  text: string,
  maxLength: number = TWEET_MAX_LENGTH
): string {
  if (text.length <= maxLength) return text;

  const cutoff = maxLength - 3; // "..." için
  const truncated = text.substring(0, cutoff);

  // Son boşlukta kes (kelime ortasını önle)
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const breakPoint = Math.max(lastSpace, lastNewline);

  if (breakPoint > cutoff * 0.6) {
    return truncated.substring(0, breakPoint) + '...';
  }

  return truncated + '...';
}

// ============ SANITIZATION ============

/**
 * Tweet metnini temizle
 * - Ardışık boş satırları teke indir
 * - Baş/son boşlukları sil
 * - Invisible characters temizle
 */
export function sanitizeTweet(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
    .replace(/\n{3,}/g, '\n\n')             // 3+ newline → 2
    .replace(/[ \t]+$/gm, '')               // Trailing spaces per line
    .trim();
}

// ============ THREAD SPLITTING ============

/**
 * Uzun metni tweet thread'ine böl
 *
 * Strateji:
 * 1. Eğer metin 280 karaktere sığıyorsa → tek tweet döndür
 * 2. Paragraf bazlı bölmeyi dene (boş satırlardan)
 * 3. Paragraflar sınırı aşarsa → cümle bazlı böl
 * 4. Her parçanın sonuna thread numarası ekle
 */
export function splitIntoThread(
  text: string,
  options: { addIndicator?: boolean; maxTweets?: number } = {}
): string[] {
  const { addIndicator = true, maxTweets = 10 } = options;
  const maxLen = addIndicator
    ? TWEET_MAX_LENGTH - THREAD_INDICATOR_LENGTH
    : TWEET_MAX_LENGTH;

  // Tek tweet'e sığıyorsa
  if (text.length <= TWEET_MAX_LENGTH) {
    return [text];
  }

  // Paragrafları al
  const paragraphs = text.split(/\n{2,}/);
  const tweets: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    // Paragraf tek başına sınırı aşıyorsa → cümle bazlı böl
    if (para.length > maxLen) {
      // Önce mevcut biriktirmeyi flush et
      if (current.trim()) {
        tweets.push(current.trim());
        current = '';
      }
      // Cümle bazlı böl
      const sentences = splitBySentences(para, maxLen);
      tweets.push(...sentences);
      continue;
    }

    // Mevcut tweet'e eklemeyi dene
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      // Mevcut tweet'i kaydet, yeni başla
      if (current.trim()) tweets.push(current.trim());
      current = para;
    }
  }

  // Son parçayı ekle
  if (current.trim()) tweets.push(current.trim());

  // Limit uygula
  const limited = tweets.slice(0, maxTweets);

  // Thread numaraları ekle
  if (addIndicator && limited.length > 1) {
    return limited.map((t, i) => {
      const indicator = `\n\n🧵${i + 1}/${limited.length}`;
      // Eğer indicator eklince taşıyorsa, metni biraz kısalt
      if (t.length + indicator.length > TWEET_MAX_LENGTH) {
        return truncateTweet(t, TWEET_MAX_LENGTH - indicator.length) + indicator;
      }
      return t + indicator;
    });
  }

  return limited;
}

/**
 * Uzun paragrafı cümle bazlı parçalara böl
 */
function splitBySentences(text: string, maxLen: number): string[] {
  // Türkçe cümle sonu: . ! ? ve ardından boşluk veya metin sonu
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current + sentence;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current.trim()) parts.push(current.trim());
      // Tek cümle bile sınırı aşıyorsa → hard truncate
      current = sentence.length > maxLen
        ? truncateTweet(sentence, maxLen)
        : sentence;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ============ SAFE FORMAT ============

/**
 * Formatlanmış tweet metnini güvenli hale getir
 * 1. Sanitize  2. Validate  3. Truncate (if needed)
 */
export function safeTweet(text: string): string {
  const clean = sanitizeTweet(text);
  if (clean.length <= TWEET_MAX_LENGTH) return clean;
  return truncateTweet(clean);
}
