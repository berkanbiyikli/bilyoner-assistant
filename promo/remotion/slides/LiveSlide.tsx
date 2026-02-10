import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import {
  SlideContainer, BgGlow, FadeIn, SectionHeader, AnimatedBar, PulsingDot, Badge,
  COLORS, GRADIENTS,
} from '../components';

export const LiveSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const glowIntensity = Math.sin(frame * 0.1) * 10 + 20;

  return (
    <SlideContainer>
      <BgGlow color="#6366f1" x={680} y={-100} />

      <SectionHeader emoji="📻" gradient={GRADIENTS.live} title="Canlı Maç Avcısı" subtitle="Momentum analizi & anlık fırsat tespiti" />

      {/* Match 1 - Active opportunity */}
      <FadeIn delay={12} style={{ width: '100%', marginTop: 24 }}>
        <div style={{
          background: COLORS.card,
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 20,
          padding: 24,
          boxShadow: `0 0 ${glowIntensity}px rgba(239,68,68,0.1)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PulsingDot />
              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 14 }}>CANLI</span>
            </div>
            <Badge variant="rose">63&apos;</Badge>
          </div>

          <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 8 }}>
            🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League
          </div>

          <div style={{ textAlign: 'center' as const, fontSize: 36, fontWeight: 900, margin: '16px 0' }}>
            <span>Man City</span>
            <span style={{ color: '#ef4444', margin: '0 16px' }}>1 - 1</span>
            <span>Man United</span>
          </div>

          {/* Momentum */}
          <div style={{ margin: '16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>Momentum</span>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>🔥 78%</span>
            </div>
            <AnimatedBar width={78} color="linear-gradient(90deg, #10b981, #f59e0b, #ef4444)" delay={25} height={12} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
              <span>Düşük</span>
              <span>Orta</span>
              <span>🔥 GOL KAPIDA!</span>
            </div>
          </div>

          {/* Opportunity */}
          <FadeIn delay={40}>
            <div style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 14,
              padding: 16,
              marginTop: 12,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>
                🎯 FIRSAT TESPİT EDİLDİ
              </div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Sonraki Gol: Man City • @1.75</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
                xG farkı 0.8 — City baskısı devam ediyor
              </div>
            </div>
          </FadeIn>
        </div>
      </FadeIn>

      {/* Match 2 */}
      <FadeIn delay={50} style={{ width: '100%', marginTop: 16 }}>
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 20,
          padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PulsingDot />
              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 14 }}>CANLI</span>
            </div>
            <Badge variant="amber">41&apos;</Badge>
          </div>
          <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 8 }}>🇹🇷 Süper Lig</div>
          <div style={{ textAlign: 'center' as const, fontSize: 36, fontWeight: 900, margin: '16px 0' }}>
            <span>Fenerbahçe</span>
            <span style={{ color: '#10b981', margin: '0 16px' }}>2 - 0</span>
            <span>Beşiktaş</span>
          </div>
          <div style={{ margin: '16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>Momentum</span>
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>52%</span>
            </div>
            <AnimatedBar width={52} color="linear-gradient(90deg, #10b981, #f59e0b, #ef4444)" delay={60} height={12} />
          </div>
        </div>
      </FadeIn>
    </SlideContainer>
  );
};
