import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Türkiye Saati (TSİ) - Europe/Istanbul timezone
const TURKEY_TIMEZONE = 'Europe/Istanbul';

/**
 * Timestamp'ı Türkiye saatine çevir
 * @param timestamp - Unix timestamp (saniye veya milisaniye)
 * @returns Türkiye saatinde Date objesi
 */
export function toTurkeyTime(timestamp: number | string | Date): Date {
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }
  // Unix timestamp saniye cinsinden ise milisaniyeye çevir
  const ms = typeof timestamp === 'number' && timestamp < 10000000000 
    ? timestamp * 1000 
    : timestamp;
  return new Date(ms as number);
}

/**
 * Tarihi Türkiye formatında string olarak döndür (GG.AA.YYYY)
 */
export function formatTurkeyDate(timestamp: number | string | Date): string {
  const date = toTurkeyTime(timestamp);
  return date.toLocaleDateString('tr-TR', { 
    timeZone: TURKEY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Saati Türkiye formatında string olarak döndür (SS:DD)
 */
export function formatTurkeyTime(timestamp: number | string | Date): string {
  const date = toTurkeyTime(timestamp);
  return date.toLocaleTimeString('tr-TR', { 
    timeZone: TURKEY_TIMEZONE,
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

/**
 * Tarih ve saati birlikte Türkiye formatında döndür
 */
export function formatTurkeyDateTime(timestamp: number | string | Date): { date: string; time: string } {
  return {
    date: formatTurkeyDate(timestamp),
    time: formatTurkeyTime(timestamp),
  };
}
