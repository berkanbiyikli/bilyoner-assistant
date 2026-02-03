/**
 * Kupon OG Image - Profesyonel Kupon Görseli
 * 
 * @vercel/og ile dinamik infografik oluşturur
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Stil renkleri
const STYLE_COLORS: Record<string, string> = {
  OFFENSIVE: '#ef4444',
  COUNTER: '#eab308',
  DEFENSIVE: '#3b82f6',
  CHAOTIC: '#a855f7',
};

const STYLE_EMOJIS: Record<string, string> = {
  OFFENSIVE: '⚔️',
  COUNTER: '🎯',
  DEFENSIVE: '🛡️',
  CHAOTIC: '🎲',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Query params'dan veri al
  const couponId = searchParams.get('id') || 'BOT-DEMO';
  const isResult = searchParams.get('result') === 'true';
  const isWon = searchParams.get('won') === 'true';
  
  // Demo veriler (gerçekte API'den gelecek)
  const matches = [
    {
      home: 'Manchester United',
      away: 'Liverpool',
      prediction: 'MS 1',
      odds: 2.10,
      confidence: 75,
      homeStyle: 'OFFENSIVE',
      awayStyle: 'COUNTER',
      result: isResult ? { home: 2, away: 1, won: true } : null,
    },
    {
      home: 'Real Madrid',
      away: 'Barcelona',
      prediction: 'Ü2.5',
      odds: 1.85,
      confidence: 82,
      homeStyle: 'OFFENSIVE',
      awayStyle: 'OFFENSIVE',
      result: isResult ? { home: 3, away: 2, won: true } : null,
    },
    {
      home: 'Bayern',
      away: 'Dortmund',
      prediction: 'KG Var',
      odds: 1.65,
      confidence: 78,
      homeStyle: 'OFFENSIVE',
      awayStyle: 'COUNTER',
      result: isResult ? { home: 2, away: 2, won: true } : null,
    },
  ];
  
  const totalOdds = matches.reduce((acc, m) => acc * m.odds, 1);
  const stake = 25;
  const potentialWin = stake * totalOdds;
  const bankroll = 500;
  
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#09090b',
          padding: '40px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div
              style={{
                fontSize: '36px',
                fontWeight: 'bold',
                color: 'white',
              }}
            >
              🤖 Bilyoner Bot
            </div>
            {isResult && (
              <div
                style={{
                  padding: '8px 20px',
                  borderRadius: '20px',
                  backgroundColor: isWon ? '#22c55e' : '#ef4444',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '20px',
                }}
              >
                {isWon ? '✅ KAZANDI' : '❌ KAYBETTİ'}
              </div>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ color: '#a1a1aa', fontSize: '16px' }}>Kasa</div>
            <div style={{ color: '#22c55e', fontSize: '32px', fontWeight: 'bold' }}>
              {bankroll.toFixed(0)} TL
            </div>
          </div>
        </div>

        {/* Matches */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            flex: 1,
          }}
        >
          {matches.map((match, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#18181b',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #27272a',
              }}
            >
              {/* Match Number */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '20px',
                  marginRight: '20px',
                }}
              >
                {i + 1}
              </div>

              {/* Teams */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>
                    {STYLE_EMOJIS[match.homeStyle]}
                  </span>
                  <span style={{ color: 'white', fontSize: '20px', fontWeight: '600' }}>
                    {match.home}
                  </span>
                  <span style={{ color: '#71717a', fontSize: '16px' }}>vs</span>
                  <span style={{ color: 'white', fontSize: '20px', fontWeight: '600' }}>
                    {match.away}
                  </span>
                  <span style={{ fontSize: '20px' }}>
                    {STYLE_EMOJIS[match.awayStyle]}
                  </span>
                </div>
                
                {/* Result Score */}
                {match.result && (
                  <div style={{ color: '#a1a1aa', fontSize: '16px' }}>
                    Skor: {match.result.home} - {match.result.away}
                  </div>
                )}
              </div>

              {/* Prediction */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginRight: '20px',
                }}
              >
                <div
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    borderRadius: '8px',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '16px',
                  }}
                >
                  {match.prediction}
                </div>
                <div style={{ color: '#a1a1aa', fontSize: '14px', marginTop: '5px' }}>
                  Güven: %{match.confidence}
                </div>
              </div>

              {/* Odds */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ color: '#fbbf24', fontSize: '28px', fontWeight: 'bold' }}>
                  {match.odds.toFixed(2)}
                </div>
                {match.result && (
                  <div style={{ fontSize: '24px' }}>
                    {match.result.won ? '✅' : '❌'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '30px',
            padding: '20px',
            backgroundColor: '#18181b',
            borderRadius: '16px',
            border: '1px solid #27272a',
          }}
        >
          <div style={{ display: 'flex', gap: '40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: '#a1a1aa', fontSize: '14px' }}>Toplam Oran</div>
              <div style={{ color: '#fbbf24', fontSize: '28px', fontWeight: 'bold' }}>
                {totalOdds.toFixed(2)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: '#a1a1aa', fontSize: '14px' }}>Yatırılan</div>
              <div style={{ color: 'white', fontSize: '28px', fontWeight: 'bold' }}>
                {stake} TL
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: '#a1a1aa', fontSize: '14px' }}>
                {isResult ? 'Kazanç' : 'Potansiyel'}
              </div>
              <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: 'bold' }}>
                {potentialWin.toFixed(2)} TL
              </div>
            </div>
          </div>
          
          <div style={{ color: '#52525b', fontSize: '16px' }}>
            {couponId} • AI Destekli Analiz
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
