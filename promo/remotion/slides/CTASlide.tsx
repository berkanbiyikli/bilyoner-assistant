import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  SlideContainer, BgGlow, FadeIn, ScaleIn, GradientText, GlowingBox,
  COLORS,
} from '../components';

export const CTASlide: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.06) * 0.03 + 1;

  return (
    <SlideContainer
      style={{
        textAlign: 'center' as const,
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 70%)',
      }}
    >
      <BgGlow color="#6366f1" x={680} y={-100} />
      <BgGlow color="#a855f7" x={-50} y={1420} size={300} />

      <ScaleIn delay={0}>
        <span style={{ fontSize: 80 }}>⚽</span>
      </ScaleIn>

      <FadeIn delay={10}>
        <h1 style={{
          fontSize: 56, fontWeight: 900,
          textAlign: 'center' as const,
          lineHeight: 1.2,
          margin: '24px 0 16px',
        }}>
          <GradientText>Verinle Oyna,{'\n'}Akıllıca Kazan</GradientText>
        </h1>
      </FadeIn>

      <FadeIn delay={25} style={{ maxWidth: 700 }}>
        <p style={{ fontSize: 22, color: COLORS.muted, textAlign: 'center' as const, lineHeight: 1.5, margin: 0 }}>
          Yapay zeka analizleri • Otomatik seri tespiti
          <br />Hazır kupon stratejileri • Şeffaf performans takibi
        </p>
      </FadeIn>

      <ScaleIn delay={40}>
        <GlowingBox color="#6366f1" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          color: 'white',
          fontSize: 24,
          fontWeight: 700,
          padding: '20px 48px',
          borderRadius: 16,
          marginTop: 32,
          transform: `scale(${pulse})`,
        }}>
          ✨ Hemen Başla — Ücretsiz
        </GlowingBox>
      </ScaleIn>

      <FadeIn delay={55} style={{ display: 'flex', gap: 32, marginTop: 32 }}>
        {[
          { value: '73%', label: 'İsabet Oranı', color: '#10b981' },
          { value: '4', label: 'AI Modeli', color: '#818cf8' },
          { value: '10K+', label: 'Simülasyon', color: '#fbbf24' },
          { value: '24/7', label: 'Canlı Takip', color: '#c084fc' },
        ].map((stat, i) => (
          <FadeIn key={i} delay={60 + i * 6} style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 14, color: COLORS.muted }}>{stat.label}</div>
          </FadeIn>
        ))}
      </FadeIn>
    </SlideContainer>
  );
};
