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
    matches = [{
      home: 'Liverpool', away: 'Arsenal', score: '1-0', minute: 55,
      league: 'Premier League', pick: 'Üst 2.5', odds: 1.85, confidence: 78,
      reasoning: '7 isabetli şut, tempolu maç',
    }];
  }
  
  if (matches.length === 0) {
    matches = [{
      home: 'Liverpool', away: 'Arsenal', score: '1-0', minute: 55,
      league: 'Premier League', pick: 'Üst 2.5', odds: 1.85, confidence: 78,
      reasoning: 'Demo veri',
    }];
  }
  
  const title = isResult ? 'SONUÇ' : 'CANLI ANALİZ';
  const displayMatches = matches.slice(0, 3);
  
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          backgroundColor: '#09090b',
          padding: '40px',
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
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '36px', fontWeight: 700, color: 'white', marginRight: '12px' }}>
              {isResult ? '📊' : '🔴'}
            </span>
            <span style={{ fontSize: '36px', fontWeight: 700, color: 'white' }}>
              {title}
            </span>
          </div>
          <span style={{ fontSize: '20px', color: '#71717a' }}>
            🤖 Bilyoner Bot
          </span>
        </div>
        
        {/* Matches */}
        {displayMatches.map((match, i) => {
          const isWon = match.result === 'won';
          const isLost = match.result === 'lost';
          const borderColor = isWon ? '#22c55e' : isLost ? '#ef4444' : '#27272a';
          const confColor = match.confidence >= 75 ? '#22c55e' : match.confidence >= 60 ? '#eab308' : '#a1a1aa';
          const oddsStr = typeof match.odds === 'number' ? match.odds.toFixed(2) : String(match.odds);
          
          return (
            <div
              key={String(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#18181b',
                borderRadius: '16px',
                padding: '20px 24px',
                marginBottom: '12px',
                borderLeft: `4px solid ${borderColor}`,
              }}
            >
              {/* Number circle */}
              <div
                style={{
                  display: 'flex',
                  width: '40px',
                  height: '40px',
                  borderRadius: '20px',
                  backgroundColor: isWon ? '#22c55e' : isLost ? '#ef4444' : '#3b82f6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '18px',
                  marginRight: '20px',
                }}
              >
                {isWon ? '✓' : isLost ? '✗' : String(i + 1)}
              </div>

              {/* Match content */}
              <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                <span style={{ color: 'white', fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>
                  {match.home} {match.score} {match.away}
                </span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600, marginRight: '12px' }}>
                    {match.minute}&apos;
                  </span>
                  <span style={{ color: '#71717a', fontSize: '14px', marginRight: '12px' }}>
                    {match.league}
                  </span>
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }}>
                    {match.reasoning}
                  </span>
                </div>
              </div>

              {/* Pick + Odds */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: '16px', marginRight: '16px' }}>
                <div
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#3b82f620',
                    borderRadius: '8px',
                    border: '1px solid #3b82f6',
                    color: '#60a5fa',
                    fontWeight: 700,
                    fontSize: '15px',
                    marginBottom: '4px',
                  }}
                >
                  {match.pick}
                </div>
                <span style={{ color: '#fbbf24', fontSize: '20px', fontWeight: 700 }}>
                  @{oddsStr}
                </span>
              </div>

              {/* Confidence */}
              <div
                style={{
                  display: 'flex',
                  width: '56px',
                  height: '56px',
                  borderRadius: '28px',
                  border: `3px solid ${confColor}`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: confColor,
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                %{match.confidence}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto',
            padding: '12px 20px',
            backgroundColor: '#18181b',
            borderRadius: '12px',
          }}
        >
          <span style={{ color: '#a1a1aa', fontSize: '14px' }}>
            📊 AI Destekli Canlı Analiz
          </span>
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
  const streakText = perf.streak > 0 
    ? `🔥 ${perf.streak} maç kazanma serisi` 
    : perf.streak < 0 
    ? `💪 ${Math.abs(perf.streak)} maç kayıp serisi`
    : '';
  
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          backgroundColor: '#09090b',
          padding: '50px',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '42px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>
          📊 GÜNLÜK PERFORMANS
        </span>
        <span style={{ fontSize: '20px', color: '#a1a1aa', marginBottom: '40px' }}>
          {perf.date || new Date().toISOString().split('T')[0]}
        </span>
        
        {/* Stats Row */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          {/* Win Rate Circle */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '180px',
              height: '180px',
              borderRadius: '90px',
              border: `6px solid ${rateColor}`,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '40px',
            }}
          >
            <span style={{ fontSize: '52px', fontWeight: 700, color: rateColor }}>
              %{perf.winRate}
            </span>
            <span style={{ fontSize: '14px', color: '#a1a1aa' }}>İsabet</span>
          </div>
          
          {/* Number Stats */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', marginRight: '40px' }}>
                <span style={{ color: '#a1a1aa', fontSize: '15px' }}>Toplam</span>
                <span style={{ color: 'white', fontSize: '36px', fontWeight: 700 }}>{total}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginRight: '40px' }}>
                <span style={{ color: '#a1a1aa', fontSize: '15px' }}>Kazanan</span>
                <span style={{ color: '#22c55e', fontSize: '36px', fontWeight: 700 }}>{perf.won}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#a1a1aa', fontSize: '15px' }}>Kaybeden</span>
                <span style={{ color: '#ef4444', fontSize: '36px', fontWeight: 700 }}>{perf.lost}</span>
              </div>
            </div>
            {streakText ? (
              <span style={{ color: '#a1a1aa', fontSize: '18px' }}>{streakText}</span>
            ) : null}
          </div>
        </div>
        
        <span style={{ color: '#52525b', fontSize: '15px' }}>
          🤖 Bilyoner Bot • bilyoner-assistant.vercel.app
        </span>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
