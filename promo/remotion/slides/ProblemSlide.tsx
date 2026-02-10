import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, GradientText, COLORS,
} from '../components';

const problems = [
  'Yüzlerce maç, hangisini seçeceğini bilmiyorsun',
  'Analiz yapmak saatlerini alıyor',
  'Hislerle değil, veriyle oynamak istiyorsun',
  'Hazır kupon önerileri güvenilir değil',
  'Geçmiş performansı takip edemiyorsun',
];

export const ProblemSlide: React.FC = () => (
  <SlideContainer style={{ textAlign: 'center' as const }}>
    <BgGlow color="#ec4899" x={-100} y={800} size={350} />
    
    <FadeIn delay={0}>
      <span style={{ fontSize: 100 }}>🤔</span>
    </FadeIn>

    <FadeIn delay={10}>
      <h2 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.2, margin: '32px 0 0', textAlign: 'center' as const }}>
        Bahis yaparken<br />
        <GradientText gradient="linear-gradient(135deg, #f59e0b, #f43f5e)">
          zorlanıyor musun?
        </GradientText>
      </h2>
    </FadeIn>

    <div style={{ textAlign: 'left' as const, maxWidth: 800, width: '100%', marginTop: 40 }}>
      {problems.map((problem, i) => (
        <FadeIn key={i} delay={20 + i * 10} direction="left">
          <div style={{
            fontSize: 24,
            padding: '20px 0',
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: COLORS.muted,
          }}>
            <div style={{
              width: 36, height: 36,
              background: 'rgba(244,63,94,0.15)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fb7185',
              fontWeight: 700,
              fontSize: 18,
              flexShrink: 0,
            }}>✕</div>
            {problem}
          </div>
        </FadeIn>
      ))}
    </div>
  </SlideContainer>
);
