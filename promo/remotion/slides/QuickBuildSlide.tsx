import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, ScaleIn, SectionHeader, GradientText,
  COLORS, GRADIENTS,
} from '../components';

const strategies = [
  {
    icon: '🛡️', name: 'Üst\nKombinesi', desc: 'Düşük risk, yüksek isabet',
    odds: 'Min %75 • @1.30-1.80',
    bg: 'linear-gradient(135deg, #059669, #10b981)',
  },
  {
    icon: '🌙', name: 'Akşamın\nBankoları', desc: '20:00+ en güvenilir 3 maç',
    odds: 'Min %70 • @1.40-2.00',
    bg: 'linear-gradient(135deg, #4338ca, #6366f1)',
  },
  {
    icon: '⚡', name: 'Gol\nŞöleni', desc: 'Çok gol beklenen 4 maç',
    odds: 'Min %65 • @1.60-2.20',
    bg: 'linear-gradient(135deg, #d97706, #f59e0b)',
  },
  {
    icon: '🎯', name: 'KG Var\nUzmanı', desc: 'Her iki takım da gol atar',
    odds: 'Min %60 • @1.70-2.00',
    bg: 'linear-gradient(135deg, #be123c, #f43f5e)',
  },
];

export const QuickBuildSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#a855f7" x={-50} y={1420} size={300} />

    <SectionHeader emoji="🪄" gradient={GRADIENTS.blue} title="Kombine Sihirbazı" subtitle="Tek tıkla hazır kupon stratejileri" delay={0} />

    <FadeIn delay={15} style={{ width: '100%', marginTop: 24 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        width: '100%',
      }}>
        {strategies.map((s, i) => (
          <ScaleIn key={i} delay={20 + i * 8}>
            <div style={{
              borderRadius: 24,
              padding: 28,
              textAlign: 'center' as const,
              background: s.bg,
              minHeight: 220,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, whiteSpace: 'pre-line' as const }}>{s.name}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>{s.desc}</div>
              <div style={{
                fontSize: 14, fontWeight: 600,
                padding: '4px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.15)',
              }}>
                {s.odds}
              </div>
            </div>
          </ScaleIn>
        ))}
      </div>
    </FadeIn>

    <FadeIn delay={55} style={{ width: '100%', marginTop: 16 }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(59,130,246,0.1))',
        border: '1px solid rgba(6,182,212,0.3)',
        borderRadius: 24,
        padding: 28,
        textAlign: 'center' as const,
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          🎰 Toplam Oran: <GradientText style={{ fontSize: 28 }}>x7.24</GradientText>
        </div>
        <div style={{ fontSize: 18, color: COLORS.muted }}>
          100₺ yatırım → <span style={{ color: '#10b981', fontWeight: 700 }}>724₺ potansiyel kazanç</span>
        </div>
      </div>
    </FadeIn>
  </SlideContainer>
);
