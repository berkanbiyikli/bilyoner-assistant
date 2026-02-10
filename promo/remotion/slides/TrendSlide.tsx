import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, SectionHeader, Badge,
  COLORS, GRADIENTS,
} from '../components';

const trends = [
  {
    icon: '🔥', team: 'Galatasaray', badge: 'Hot Streak', badgeVariant: 'emerald' as const,
    text: 'Son 5 maçta 4 galibiyet, 12 gol attı. Ev sahibi olarak yenilmez.',
    bet: 'MS 1 • @1.55', confidence: '%82 Güven',
  },
  {
    icon: '⚡', team: 'Liverpool', badge: 'Gol Makinesi', badgeVariant: 'amber' as const,
    text: 'Son 6 maçta ortalama 3.5 gol. Tüm maçlarda 2.5 üst gerçekleşti.',
    bet: '2.5 Üst • @1.40', confidence: '%78 Güven',
  },
  {
    icon: '🛡️', team: 'Hatayspor', badge: 'Savunma Zaafı', badgeVariant: 'rose' as const,
    text: 'İlk yarıda son 7 maçta 6 kez gol yedi. Deplasmanda çok zayıf.',
    bet: 'İY 1.5 Üst • @1.60', confidence: '%71 Güven',
  },
  {
    icon: '🎯', team: 'Inter', badge: 'KG Var Pattern', badgeVariant: 'purple' as const,
    text: "Son 8 maçın 7'sinde karşılıklı gol. Her iki taraf da atar.",
    bet: 'KG Var • @1.65', confidence: '%75 Güven',
  },
];

export const TrendSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#a855f7" x={-50} y={1420} size={300} />

    <SectionHeader emoji="🔥" gradient={GRADIENTS.purple} title="Seri Yakalayanlar" subtitle="Takım trendlerini otomatik tespit" />

    {trends.map((trend, i) => (
      <FadeIn key={i} delay={12 + i * 12} style={{ width: '100%', marginTop: 14 }}>
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 20,
          padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 24, marginRight: 10 }}>{trend.icon}</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{trend.team}</span>
            <div style={{ marginLeft: 'auto' }}>
              <Badge variant={trend.badgeVariant}>{trend.badge}</Badge>
            </div>
          </div>
          <div style={{ fontSize: 18, color: '#e0e0f0', lineHeight: 1.4 }}>{trend.text}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' as const }}>
            <Badge variant="primary">{trend.bet}</Badge>
            <Badge variant="emerald">{trend.confidence}</Badge>
          </div>
        </div>
      </FadeIn>
    ))}
  </SlideContainer>
);
