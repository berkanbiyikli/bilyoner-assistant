import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  SlideContainer, BgGlow, FadeIn, ScaleIn, GradientText, Badge, GlowingBox,
  COLORS, GRADIENTS,
} from '../components';

export const IntroSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const float = Math.sin(frame * 0.04) * 10;

  return (
    <SlideContainer style={{ textAlign: 'center' as const, background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 70%)' }}>
      <BgGlow color="#6366f1" x={680} y={-100} />
      <BgGlow color="#a855f7" x={-50} y={1420} size={300} />
      
      <ScaleIn delay={5}>
        <GlowingBox style={{
          width: 160, height: 160,
          background: GRADIENTS.primary,
          borderRadius: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 40,
          transform: `translateY(${float}px)`,
        }}>
          <span style={{ fontSize: 72 }}>⚽</span>
        </GlowingBox>
      </ScaleIn>

      <FadeIn delay={15}>
        <h1 style={{ fontSize: 64, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>
          <GradientText>Bilyoner{'\n'}Assistant</GradientText>
        </h1>
      </FadeIn>

      <FadeIn delay={30} style={{ maxWidth: 700, marginTop: 16 }}>
        <p style={{ fontSize: 26, color: COLORS.muted, lineHeight: 1.5, margin: 0 }}>
          Yapay zeka destekli futbol analiz asistanınız.
          <br />Veriye dayalı tahminler, akıllı kuponlar.
        </p>
      </FadeIn>

      <FadeIn delay={45} style={{ display: 'flex', gap: 16, marginTop: 48 }}>
        <Badge variant="primary">🤖 AI Powered</Badge>
        <Badge variant="emerald">📊 Data-Driven</Badge>
        <Badge variant="purple">⚡ Real-Time</Badge>
      </FadeIn>
    </SlideContainer>
  );
};
