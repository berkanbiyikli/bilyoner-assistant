import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, GradientText,
  COLORS, GRADIENTS,
} from '../components';

const features = [
  { num: 1, name: 'AI Tahmin Motoru', desc: 'Poisson, ML, Form, H2H — 4 model ensemble', gradient: GRADIENTS.primary },
  { num: 2, name: 'Seri Yakalayanlar', desc: 'Otomatik trend tespiti ve bahis önerisi', gradient: GRADIENTS.purple },
  { num: 3, name: 'Sürpriz Radarı', desc: 'Oran anomalisi, value bomb ve tuzak tespiti', gradient: GRADIENTS.amber },
  { num: 4, name: 'Kombine Sihirbazı', desc: 'Tek tıkla 4 farklı kupon stratejisi', gradient: GRADIENTS.blue },
  { num: 5, name: 'Backtesting & ROI', desc: 'Şeffaf performans takibi — %73 isabet', gradient: GRADIENTS.emerald },
  { num: 6, name: 'Canlı Maç Avcısı', desc: 'Momentum analizi ve anlık fırsat bildirimi', gradient: GRADIENTS.live },
  { num: 7, name: 'Monte Carlo Simülasyonu', desc: '10.000 simülasyon ile olasılık analizi', gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)' },
];

export const FeaturesSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#a855f7" x={-50} y={1420} size={300} />

    <FadeIn delay={0} style={{ textAlign: 'center' as const, marginBottom: 40 }}>
      <h2 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
        <GradientText>Tüm Özellikler</GradientText>
        <br />Tek Platform
      </h2>
    </FadeIn>

    <div style={{ width: '100%' }}>
      {features.map((f, i) => (
        <FadeIn key={i} delay={10 + i * 8} direction="left">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '20px 0',
            borderBottom: i < features.length - 1 ? `1px solid ${COLORS.cardBorder}` : 'none',
          }}>
            <div style={{
              width: 48, height: 48,
              borderRadius: 14,
              background: f.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: 'white',
              flexShrink: 0,
            }}>
              {f.num}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{f.name}</div>
              <div style={{ fontSize: 15, color: COLORS.muted }}>{f.desc}</div>
            </div>
          </div>
        </FadeIn>
      ))}
    </div>
  </SlideContainer>
);
