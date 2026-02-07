/**
 * Surprise Coupon OG Image - Dinamik Kupon Görseli
 * 
 * Query params ile veri alır, güzel infografik üretir
 * @vercel/og ile edge runtime'da çalışır
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const STRATEGY_STYLES: Record<string, { bg: string; accent: string; emoji: string }> = {
  gol: { bg: '#1a1a2e', accent: '#e94560', emoji: '⚽' },
  favori: { bg: '#1a1a2e', accent: '#ffd700', emoji: '🏆' },
  surpriz: { bg: '#1a1a2e', accent: '#a855f7', emoji: '🎲' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const strategy = searchParams.get('strategy') || 'gol';
  const title = searchParams.get('title') || '⚽ GOL KUPONU';
  const description = searchParams.get('desc') || '';
  const totalOdds = searchParams.get('odds') || '3.50';
  const avgConf = searchParams.get('conf') || '65';
  const matchCount = parseInt(searchParams.get('count') || '3');
  const index = searchParams.get('index') || '1';

  // Maçları parse et (format: home|away|prediction|odds|statLine;...)
  const matchesRaw = searchParams.get('matches') || '';
  const matches = matchesRaw.split(';').filter(Boolean).map(m => {
    const [home, away, prediction, odds, statLine, league] = m.split('|');
    return { home, away, prediction, odds, statLine: statLine || '', league: league || '' };
  });

  const style = STRATEGY_STYLES[strategy] || STRATEGY_STYLES.gol;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: style.bg,
          padding: '36px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: style.accent,
              }}
            >
              {title}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              color: '#94a3b8',
              backgroundColor: '#ffffff10',
              padding: '6px 14px',
              borderRadius: '20px',
            }}
          >
            📊 Kupon {index}/3
          </div>
        </div>

        {/* Description */}
        {description && (
          <div
            style={{
              display: 'flex',
              fontSize: '14px',
              color: '#94a3b8',
              marginBottom: '20px',
            }}
          >
            {description}
          </div>
        )}

        {/* Matches */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1,
          }}
        >
          {matches.slice(0, 5).map((match, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#ffffff08',
                borderRadius: '12px',
                padding: '14px 18px',
                borderLeft: `3px solid ${style.accent}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#f1f5f9',
                  }}
                >
                  {match.home} vs {match.away}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: '14px',
                    color: style.accent,
                    fontWeight: 'bold',
                    backgroundColor: `${style.accent}20`,
                    padding: '3px 10px',
                    borderRadius: '6px',
                  }}
                >
                  {match.prediction} @{match.odds}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#64748b',
                }}
              >
                <span>{match.league}</span>
                <span>📈 {match.statLine}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Stats */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid #ffffff15',
          }}
        >
          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Toplam Oran
              </div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: 'bold',
                  color: style.accent,
                }}
              >
                {totalOdds}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Güven
              </div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: 'bold',
                  color: '#f1f5f9',
                }}
              >
                %{avgConf}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Maç
              </div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: 'bold',
                  color: '#f1f5f9',
                }}
              >
                {matchCount}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              color: '#94a3b8',
            }}
          >
            🤖 Bilyoner Asistan · Veri Analizi
          </div>
        </div>
      </div>
    ),
    {
      width: 800,
      height: 420 + Math.max(0, (matches.length - 3)) * 70,
    }
  );
}
