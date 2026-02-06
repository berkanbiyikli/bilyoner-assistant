/**
 * Canlı Fırsat OG Image - Tweet'lere eklenecek profesyonel görsel
 * 
 * Query params:
 * - matches: JSON encoded array of { home, away, score, minute, league, pick, odds, confidence, reasoning }
 * - type: "opportunity" | "result" | "performance"
 * 
 * Örnek: /api/og/live?type=opportunity&matches=[...]
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

interface MatchData {
  home: string;
  away: string;
  score: string;
  minute: number;
  league: string;
  pick: string;
  odds: number;
  confidence: number;
  reasoning: string;
  result?: 'won' | 'lost' | 'void';
  finalScore?: string;
}

interface PerformanceData {
  date: string;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  streak: number;
  bestPick?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'opportunity';
  
  try {
    if (type === 'performance') {
      return renderPerformance(searchParams);
    }
    return renderOpportunity(searchParams, type === 'result');
  } catch {
    // Fallback - basit hata görseli
    return new ImageResponse(
      (
        <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'white', fontSize: 32 }}>🤖 Bilyoner Bot</div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}

function renderOpportunity(searchParams: URLSearchParams, isResult: boolean) {
  let matches: MatchData[] = [];
  
  try {
    const matchesParam = searchParams.get('matches');
    if (matchesParam) {
      matches = JSON.parse(matchesParam);
    }
  } catch {
    // Demo data
    matches = [{
      home: 'Liverpool', away: 'Arsenal', score: '1-0', minute: 55,
      league: 'Premier League', pick: 'Üst 2.5', odds: 1.85, confidence: 78,
      reasoning: '7 isabetli şut, tempolu maç',
    }];
  }
  
  const title = isResult ? '📊 SONUÇ' : '🔴 CANLI ANALİZ';
  const subtitle = isResult ? 'Pick Sonuçları' : 'Fırsat Tespiti';
  
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
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '36px', fontWeight: 'bold', color: 'white' }}>
                {title}
              </span>
            </div>
            <span style={{ fontSize: '18px', color: '#a1a1aa', marginTop: '4px' }}>
              {subtitle}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px', color: '#71717a' }}>🤖</span>
            <span style={{ fontSize: '20px', color: '#52525b', fontWeight: '600' }}>
              Bilyoner Bot
            </span>
          </div>
        </div>
        
        {/* Matches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          {matches.slice(0, 3).map((match, i) => {
            const resultColor = match.result === 'won' ? '#22c55e' : match.result === 'lost' ? '#ef4444' : '#fbbf24';
            
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#18181b',
                  borderRadius: '16px',
                  padding: '20px 24px',
                  border: `1px solid ${match.result ? resultColor + '40' : '#27272a'}`,
                }}
              >
                {/* Match Number */}
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: match.result ? resultColor : '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '20px',
                    marginRight: '20px',
                    flexShrink: 0,
                  }}
                >
                  {match.result ? (match.result === 'won' ? '✓' : '✗') : String(i + 1)}
                </div>

                {/* Teams & Info */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'white', fontSize: '22px', fontWeight: '700' }}>
                      {match.home} {match.result ? match.finalScore || match.score : match.score} {match.away}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: '#ef4444', fontSize: '15px', fontWeight: '600' }}>
                      ⏱️ {match.minute}&apos;
                    </span>
                    <span style={{ color: '#71717a', fontSize: '15px' }}>
                      {match.league}
                    </span>
                    <span style={{ color: '#a1a1aa', fontSize: '14px' }}>
                      {match.reasoning}
                    </span>
                  </div>
                </div>

                {/* Pick Badge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: '16px' }}>
                  <div
                    style={{
                      padding: '8px 18px',
                      backgroundColor: match.result ? resultColor + '20' : '#3b82f620',
                      borderRadius: '10px',
                      border: `1px solid ${match.result ? resultColor : '#3b82f6'}`,
                      color: match.result ? resultColor : '#60a5fa',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      marginBottom: '4px',
                    }}
                  >
                    🎯 {match.pick}
                  </div>
                  <span style={{ color: '#fbbf24', fontSize: '22px', fontWeight: 'bold' }}>
                    @{match.odds.toFixed(2)}
                  </span>
                </div>

                {/* Confidence */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    marginLeft: '20px',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      border: `3px solid ${match.confidence >= 75 ? '#22c55e' : match.confidence >= 60 ? '#eab308' : '#a1a1aa'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: match.confidence >= 75 ? '#22c55e' : match.confidence >= 60 ? '#eab308' : '#a1a1aa',
                      fontWeight: 'bold',
                      fontSize: '18px',
                    }}
                  >
                    %{match.confidence}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
            padding: '16px 24px',
            backgroundColor: '#18181b',
            borderRadius: '12px',
            border: '1px solid #27272a',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#3b82f6', fontSize: '16px' }}>📊</span>
            <span style={{ color: '#a1a1aa', fontSize: '15px' }}>
              AI Destekli Canlı Analiz • İstatistik Tabanlı Tahmin
            </span>
          </div>
          <span style={{ color: '#52525b', fontSize: '14px' }}>
            bilyoner-assistant.vercel.app
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

function renderPerformance(searchParams: URLSearchParams) {
  let perf: PerformanceData = {
    date: new Date().toISOString().split('T')[0],
    won: 0, lost: 0, pending: 0, winRate: 0, streak: 0,
  };
  
  try {
    const perfParam = searchParams.get('data');
    if (perfParam) {
      perf = JSON.parse(perfParam);
    }
  } catch {
    // fallback
  }
  
  const total = perf.won + perf.lost;
  const rateColor = perf.winRate >= 70 ? '#22c55e' : perf.winRate >= 50 ? '#eab308' : '#ef4444';
  
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#09090b',
          padding: '50px',
          fontFamily: 'system-ui, sans-serif',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Title */}
        <div style={{ fontSize: '42px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
          📊 GÜNLÜK PERFORMANS
        </div>
        <div style={{ fontSize: '20px', color: '#a1a1aa', marginBottom: '40px' }}>
          {perf.date} • Bilyoner Bot AI
        </div>
        
        {/* Stats Grid */}
        <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
          {/* Win Rate Circle */}
          <div
            style={{
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              border: `6px solid ${rateColor}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '56px', fontWeight: 'bold', color: rateColor }}>
              %{perf.winRate}
            </span>
            <span style={{ fontSize: '16px', color: '#a1a1aa' }}>İsabet Oranı</span>
          </div>
          
          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '40px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#a1a1aa', fontSize: '16px' }}>Toplam</span>
                <span style={{ color: 'white', fontSize: '36px', fontWeight: 'bold' }}>{total}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#a1a1aa', fontSize: '16px' }}>Kazanan</span>
                <span style={{ color: '#22c55e', fontSize: '36px', fontWeight: 'bold' }}>{perf.won}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#a1a1aa', fontSize: '16px' }}>Kaybeden</span>
                <span style={{ color: '#ef4444', fontSize: '36px', fontWeight: 'bold' }}>{perf.lost}</span>
              </div>
            </div>
            
            {perf.streak !== 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>{perf.streak > 0 ? '🔥' : '💪'}</span>
                <span style={{ color: perf.streak > 0 ? '#22c55e' : '#ef4444', fontSize: '20px', fontWeight: 'bold' }}>
                  {Math.abs(perf.streak)} maç {perf.streak > 0 ? 'kazanma' : 'kayıp'} serisi
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div style={{ color: '#52525b', fontSize: '16px' }}>
          AI Destekli Canlı Analiz • bilyoner-assistant.vercel.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
