/**
 * Backtesting API - Sonuç Kontrolü
 * Her gece yarısı çalışacak cron job için endpoint
 */

import { NextResponse } from 'next/server';
import { checkYesterdayResults } from '@/lib/backtesting/result-checker';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    // Cron secret kontrolü (güvenlik için)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Dünün sonuçlarını kontrol et
    await checkYesterdayResults();
    
    return NextResponse.json({
      success: true,
      message: 'Results checked successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Backtesting cron error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check results',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
