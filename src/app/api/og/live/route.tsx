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
      league: 'Premier League', pick: 'Üst 2.5 Gol', odds: 1.85, confidence: 78,
      reasoning: '7 isabetli şut, xG: 2.1, açık maç',
    }];
  }
  
  if (matches.length === 0) {
    matches = [{
      home: 'Liverpool', away: 'Arsenal', score: '1-0', minute: 55,
      league: 'Premier League', pick: 'Üst 2.5 Gol', odds: 1.85, confidence: 78,
      reasoning: 'Demo veri',
    }];
  }
  
  const displayMatches = matches.slice(0, 3);
  const matchCount = displayMatches.length;
  
  function parseReasoning(r: string): string[] {
    if (!r) return [];
    return r.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 4);
  }
  
  function getConfColor(c: number): string {
    if (c >= 80) return '#22c55e';
    if (c >= 70) return '#f59e0b';
    if (c >= 60) return '#3b82f6';
    return '#a1a1aa';
  }
  
  function getPickStyle(pick: string): { bg: string; border: string; text: string; icon: string } {
    const p = (pick || '').toLowerCase();
    if (p.includes('kart')) return { bg: 'rgba(251,191,36,0.1)', border: '#fbbf24', text: '#fbbf24', icon: '🟨' };
    if (p.includes('korner')) return { bg: 'rgba(249,115,22,0.1)', border: '#f97316', text: '#fb923c', icon: '🚩' };
    if (p.includes('kg') || p.includes('karşılıklı')) return { bg: 'rgba(168,85,247,0.1)', border: '#a855f7', text: '#c084fc', icon: '⚽' };
    return { bg: 'rgba(59,130,246,0.1)', border: '#3b82f6', text: '#60a5fa', icon: '📈' };
  }

  const titleFontSize = matchCount === 1 ? 26 : 20;
  const scoreFontSize = matchCount === 1 ? 24 : 18;
  const oddsFontSize = matchCount === 1 ? 28 : 22;
  const cardPad = matchCount === 1 ? 28 : matchCount === 2 ? 20 : 16;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          backgroundColor: '#0a0a0f',
        }}
      >
        {/* Rainbow top accent */}
        <div style={{
          display: 'flex',
          width: '1200px',
          height: '4px',
          backgroundImage: 'linear-gradient(90deg, #ef4444, #f97316, #3b82f6, #8b5cf6, #ec4899)',
        }} />

        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 20,
          paddingBottom: 14,
          paddingLeft: 40,
          paddingRight: 40,
        }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              width: '12px',
              height: '12px',
              borderRadius: '6px',
              backgroundColor: '#ef4444',
              marginRight: 12,
            }} />
            <span style={{ fontSize: 28, fontWeight: 800, color: 'white' }}>
              {isResult ? 'SONUÇ ANALİZİ' : 'CANLI VERİ ANALİZİ'}
            </span>
          </div>
          <span style={{ fontSize: 15, color: '#71717a', fontWeight: 600 }}>Bilyoner Bot</span>
        </div>

        {/* Cards container */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 32,
          paddingRight: 32,
          flex: 1,
        }}>
          {displayMatches.map((match, idx) => {
            const won = match.result === 'won';
            const lost = match.result === 'lost';
            const confColor = getConfColor(match.confidence);
            const ps = getPickStyle(match.pick);
            const oddsText = typeof match.odds === 'number' ? match.odds.toFixed(2) : String(match.odds || '');
            const reasons = parseReasoning(match.reasoning);
            const accent = won ? '#22c55e' : lost ? '#ef4444' : ps.border;
            const scoreParts = (match.score || '0-0').split('-');
            
            return (
              <div
                key={String(idx)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  backgroundColor: '#13131a',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: '#1e1e2a',
                  marginBottom: 10,
                }}
              >
                {/* Left color accent */}
                <div style={{
                  display: 'flex',
                  width: 4,
                  backgroundColor: accent,
                  borderTopLeftRadius: 16,
                  borderBottomLeftRadius: 16,
                }} />

                {/* Main content */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flex: 1,
                  padding: cardPad,
                }}>
                  {/* Left - Match details */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    justifyContent: 'center',
                  }}>
                    {/* League + Minute */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        borderRadius: 6,
                        paddingTop: 3,
                        paddingBottom: 3,
                        paddingLeft: 10,
                        paddingRight: 10,
                        marginRight: 10,
                      }}>
                        <div style={{ display: 'flex', width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444', marginRight: 5 }} />
                        <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 700 }}>{match.minute || 0}{'\''}</span>
                      </div>
                      <span style={{ color: '#71717a', fontSize: 13, fontWeight: 500 }}>{match.league || ''}</span>
                    </div>
                    
                    {/* Teams + Score */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ color: 'white', fontSize: titleFontSize, fontWeight: 800, marginRight: 14 }}>
                        {match.home || ''}
                      </span>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.07)',
                        borderRadius: 8,
                        paddingTop: 3,
                        paddingBottom: 3,
                        paddingLeft: 12,
                        paddingRight: 12,
                        marginRight: 14,
                      }}>
                        <span style={{ color: 'white', fontSize: scoreFontSize, fontWeight: 800 }}>{scoreParts[0] || '0'}</span>
                        <span style={{ color: '#52525b', fontSize: 14, marginLeft: 6, marginRight: 6 }}>-</span>
                        <span style={{ color: 'white', fontSize: scoreFontSize, fontWeight: 800 }}>{scoreParts[1] || '0'}</span>
                      </div>
                      <span style={{ color: 'white', fontSize: titleFontSize, fontWeight: 800 }}>
                        {match.away || ''}
                      </span>
                    </div>

                    {/* Reasoning tags */}
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                      {reasons.map((reason, ri) => (
                        <div
                          key={String(ri)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            paddingTop: 2,
                            paddingBottom: 2,
                            paddingLeft: 10,
                            paddingRight: 10,
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            borderRadius: 6,
                            borderWidth: 1,
                            borderStyle: 'solid',
                            borderColor: 'rgba(255,255,255,0.06)',
                            marginRight: 6,
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ color: '#a1a1aa', fontSize: 12, fontWeight: 500 }}>
                            {reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right - Pick + Odds + Confidence */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    marginLeft: 16,
                  }}>
                    {/* Pick badge */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingTop: 7,
                      paddingBottom: 7,
                      paddingLeft: 16,
                      paddingRight: 16,
                      backgroundColor: ps.bg,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor: ps.border,
                      marginBottom: 8,
                    }}>
                      <span style={{ fontSize: 14, marginRight: 8 }}>{ps.icon}</span>
                      <span style={{ color: ps.text, fontWeight: 700, fontSize: 15 }}>
                        {match.pick || ''}
                      </span>
                    </div>
                    
                    {/* Odds - sadece canlı oran varsa göster */}
                    {match.odds > 0 && (
                      <span style={{ color: '#fbbf24', fontSize: oddsFontSize, fontWeight: 800, marginBottom: 8 }}>
                        @{oddsText}
                      </span>
                    )}
                    {match.odds === 0 && (
                      <span style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                        📊 İstatistik Bazlı
                      </span>
                    )}

                    {/* Confidence bar */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <div style={{
                        display: 'flex',
                        width: 72,
                        height: 5,
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        marginRight: 8,
                      }}>
                        <div style={{
                          display: 'flex',
                          width: Math.round(72 * (match.confidence || 0) / 100),
                          height: 5,
                          backgroundColor: confColor,
                          borderRadius: 3,
                        }} />
                      </div>
                      <span style={{ color: confColor, fontSize: 14, fontWeight: 700 }}>
                        %{match.confidence || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 12,
          paddingBottom: 16,
          paddingLeft: 40,
          paddingRight: 40,
        }}>
          <span style={{ color: '#52525b', fontSize: 13 }}>
            Veri analizi ile tespit edildi
          </span>
          <span style={{ color: '#3f3f46', fontSize: 13 }}>
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
