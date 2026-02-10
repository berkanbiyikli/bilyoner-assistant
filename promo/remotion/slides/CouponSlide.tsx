import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, SectionHeader,
  COLORS, GRADIENTS,
} from '../components';

const couponItems = [
  { time: '22:00 • Premier League', teams: 'Arsenal vs Chelsea', pick: 'MS 1', odds: '1.65', borderColor: '#10b981' },
  { time: '20:30 • Bundesliga', teams: 'Bayern vs Dortmund', pick: '2.5 Üst', odds: '1.45', borderColor: '#6366f1' },
  { time: '21:00 • La Liga', teams: 'Real Madrid vs Atletico', pick: 'KG Var', odds: '1.72', borderColor: '#a855f7' },
];

export const CouponSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#6366f1" x={680} y={-100} />

    <SectionHeader emoji="🎫" gradient={GRADIENTS.primary} title="Akıllı Kupon Paneli" subtitle="Seçimlerini yönet, kazancını hesapla" />

    <FadeIn delay={12} style={{ width: '100%', marginTop: 24 }}>
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 24,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: GRADIENTS.primary,
          padding: '20px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🎫</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>Kuponum</span>
            <span style={{
              background: 'white', color: '#6366f1',
              fontWeight: 800, padding: '2px 10px',
              borderRadius: 999, fontSize: 14,
            }}>3</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Kombine</span>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {couponItems.map((item, i) => (
            <FadeIn key={i} delay={25 + i * 10} direction="left">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                background: '#1a1a2a',
                borderRadius: 14,
                marginBottom: 10,
                borderLeft: `4px solid ${item.borderColor}`,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 2 }}>{item.time}</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{item.teams}</div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#818cf8' }}>{item.pick}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace' }}>{item.odds}</div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: 20, borderTop: `1px solid ${COLORS.cardBorder}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: COLORS.muted, fontSize: 14 }}>Toplam Oran</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#818cf8', fontFamily: 'monospace' }}>x4.12</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: COLORS.muted, fontSize: 14 }}>Yatırım</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>100₺</span>
          </div>
          <FadeIn delay={60}>
            <div style={{
              background: GRADIENTS.primary,
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)' }}>💰 Potansiyel Kazanç</span>
              <span style={{ fontSize: 32, fontWeight: 900, color: 'white' }}>412₺</span>
            </div>
          </FadeIn>
        </div>
      </div>
    </FadeIn>
  </SlideContainer>
);
