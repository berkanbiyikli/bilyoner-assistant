/**
 * Bot Bankroll API - Kasa Durumu
 */

import { NextRequest, NextResponse } from 'next/server';

// State paylaşımı (production'da Redis/KV kullanılacak)
// Şimdilik basit in-memory
let bankrollState = {
  balance: 500,
  initialBalance: 500,
  totalBets: 0,
  wonBets: 0,
  lostBets: 0,
  totalStaked: 0,
  totalWon: 0,
  profitLoss: 0,
  winRate: 0,
  roi: 0,
};

export async function GET() {
  return NextResponse.json({
    success: true,
    data: bankrollState,
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Sadece izin verilen alanları güncelle
    if (typeof body.balance === 'number') {
      bankrollState.balance = body.balance;
    }
    
    // İstatistikleri yeniden hesapla
    bankrollState.profitLoss = bankrollState.balance - bankrollState.initialBalance;
    bankrollState.winRate = bankrollState.totalBets > 0 
      ? (bankrollState.wonBets / bankrollState.totalBets) * 100 
      : 0;
    bankrollState.roi = bankrollState.totalStaked > 0
      ? ((bankrollState.totalWon - bankrollState.totalStaked) / bankrollState.totalStaked) * 100
      : 0;
    
    return NextResponse.json({
      success: true,
      data: bankrollState,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid request body',
    }, { status: 400 });
  }
}

// Kasayı sıfırla
export async function DELETE() {
  bankrollState = {
    balance: 500,
    initialBalance: 500,
    totalBets: 0,
    wonBets: 0,
    lostBets: 0,
    totalStaked: 0,
    totalWon: 0,
    profitLoss: 0,
    winRate: 0,
    roi: 0,
  };
  
  return NextResponse.json({
    success: true,
    message: 'Bankroll reset to 500 TL',
    data: bankrollState,
  });
}
