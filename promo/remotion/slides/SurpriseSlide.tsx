import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, SectionHeader, Badge,
  COLORS, GRADIENTS,
} from '../components';

const surprises = [
  {
    score: 87, scoreColor: GRADIENTS.amber,
    listBadge: '👑 ALTIN LİSTE', listBadgeStyle: { background: 'rgba(245,158,11,0.2)', color: '#fbbf24' },
    category: '📡 Oran Anomalisi', categoryVariant: 'amber' as const,
    teams: 'Lens vs Marseille',
    league: '🇫🇷 Ligue 1 • 22:00',
    bet: 'MS 2 • @3.40',
    quote: '"Marseille\'in deplasman formu piyasanın yansıttığından çok daha iyi"',
    cardStyle: {
      background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,179,8,0.06))',
      border: '1px solid rgba(245,158,11,0.3)',
    },
  },
  {
    score: 72, scoreColor: '#94a3b8',
    listBadge: '👁️ GÜMÜŞ LİSTE', listBadgeStyle: { background: 'rgba(148,163,184,0.2)', color: '#94a3b8' },
    category: '⚡ Ters Köşe', categoryVariant: 'purple' as const,
    teams: 'Sevilla vs Villarreal',
    league: '🇪🇸 La Liga • 20:00',
    bet: 'Beraberlik • @3.20',
    quote: null,
    cardStyle: {
      background: 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(100,116,139,0.06))',
      border: '1px solid rgba(148,163,184,0.3)',
    },
  },
  {
    score: 91, scoreColor: '#fb7185',
    listBadge: '💀 KIRMIZI LİSTE', listBadgeStyle: { background: 'rgba(244,63,94,0.2)', color: '#fb7185' },
    category: '🪤 Tuzak Maç', categoryVariant: 'rose' as const,
    teams: 'Juventus vs Napoli',
    league: '🇮🇹 Serie A • 21:45',
    bet: null,
    quote: '⚠️ Sakın oynama — veriler tuzağa işaret ediyor',
    quoteColor: '#fb7185',
    cardStyle: {
      background: 'linear-gradient(135deg, rgba(244,63,94,0.12), rgba(239,68,68,0.06))',
      border: '1px solid rgba(244,63,94,0.3)',
    },
  },
];

export const SurpriseSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#6366f1" x={680} y={-100} />

    <SectionHeader emoji="📡" gradient={GRADIENTS.amber} title="Sürpriz Radarı" subtitle="Oran anomalileri ve fırsat tespiti" />

    {surprises.map((s, i) => (
      <FadeIn key={i} delay={12 + i * 15} style={{ width: '100%', marginTop: 14 }}>
        <div style={{ borderRadius: 20, padding: 24, ...s.cardStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 32, fontWeight: 900, marginRight: 12,
              ...(typeof s.scoreColor === 'string' && !s.scoreColor.includes('gradient')
                ? { color: s.scoreColor }
                : {
                    background: s.scoreColor,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }),
            }}>
              {s.score}
            </span>
            <span style={{
              padding: '4px 12px', borderRadius: 8, fontWeight: 700,
              fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 1,
              ...s.listBadgeStyle,
            }}>
              {s.listBadge}
            </span>
            <div style={{ marginLeft: 'auto' }}>
              <Badge variant={s.categoryVariant}>{s.category}</Badge>
            </div>
          </div>

          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{s.teams}</div>
          <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 12 }}>{s.league}</div>

          {s.bet && (
            <div style={{
              display: 'inline-block',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, padding: '8px 16px',
              fontWeight: 700, color: '#818cf8', fontSize: 16,
            }}>
              {s.bet}
            </div>
          )}

          {s.quote && (
            <div style={{
              fontStyle: 'italic',
              color: (s as any).quoteColor || COLORS.muted,
              marginTop: 12, fontSize: 15,
            }}>
              {s.quote}
            </div>
          )}
        </div>
      </FadeIn>
    ))}
  </SlideContainer>
);
