import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, SectionHeader, Badge, GradientText,
  COLORS, GRADIENTS,
} from '../components';

const picks = [
  {
    league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • 22:00',
    teams: 'Arsenal vs Chelsea',
    score: 92,
    bet: 'MS 1 • @1.65',
    models: [
      { name: 'Poisson', agree: true },
      { name: 'ML', agree: true },
      { name: 'Form', agree: true },
      { name: 'H2H', agree: true },
    ],
    borderGrad: 'linear-gradient(180deg, #6366f1, #a855f7)',
  },
  {
    league: '🇩🇪 Bundesliga • 20:30',
    teams: 'Bayern vs Dortmund',
    score: 87,
    bet: '2.5 Üst • @1.45',
    models: [
      { name: 'Poisson', agree: true },
      { name: 'ML', agree: true },
      { name: 'Form', agree: true },
      { name: 'H2H', agree: false },
    ],
    borderGrad: 'linear-gradient(180deg, #a855f7, #ec4899)',
  },
  {
    league: '🇪🇸 La Liga • 21:00',
    teams: 'Real Madrid vs Atletico',
    score: 84,
    bet: 'KG Var • @1.72',
    models: [
      { name: 'Poisson', agree: true },
      { name: 'ML', agree: true },
      { name: 'Form', agree: false },
      { name: 'H2H', agree: true },
    ],
    borderGrad: 'linear-gradient(180deg, #ec4899, #f43f5e)',
  },
];

export const AIPicksSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#6366f1" x={680} y={-100} />

    <SectionHeader emoji="✨" gradient={GRADIENTS.primary} title="Asistanın Radarı" subtitle="4 AI modelin uyumlu olduğu maçlar" />

    {picks.map((pick, i) => (
      <FadeIn key={i} delay={15 + i * 15} style={{ width: '100%', marginTop: 16 }}>
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 20,
          padding: 24,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Left accent */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: 5, height: '100%',
            background: pick.borderGrad,
            borderRadius: 999,
          }} />

          <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 8, paddingLeft: 12 }}>
            {pick.league}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{pick.teams}</div>
            <div style={{ textAlign: 'right' as const }}>
              <GradientText style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
                {pick.score}
              </GradientText>
              <div style={{ fontSize: 11, color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                Ensemble
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 12, paddingLeft: 12, gap: 12,
          }}>
            <div style={{
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, padding: '8px 16px',
              fontWeight: 700, color: '#818cf8', fontSize: 16,
            }}>
              {pick.bet}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              {pick.models.map((m, j) => (
                <span key={j} style={{
                  fontSize: 11, padding: '4px 8px', borderRadius: 6, fontWeight: 600,
                  background: m.agree ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: m.agree ? '#34d399' : '#fbbf24',
                }}>
                  {m.agree ? '✓' : '~'} {m.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </FadeIn>
    ))}
  </SlideContainer>
);
