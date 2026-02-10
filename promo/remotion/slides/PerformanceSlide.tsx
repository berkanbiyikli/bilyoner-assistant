import React from 'react';
import {
  SlideContainer, BgGlow, FadeIn, CountUp, AnimatedBar, SectionHeader,
  COLORS, GRADIENTS,
} from '../components';

const marketBars = [
  { label: 'MS', width: 72, color: 'linear-gradient(90deg, #6366f1, #818cf8)' },
  { label: '2.5 Üst', width: 78, color: 'linear-gradient(90deg, #10b981, #34d399)' },
  { label: 'KG Var', width: 68, color: 'linear-gradient(90deg, #a855f7, #c084fc)' },
  { label: 'İlk Yarı', width: 65, color: 'linear-gradient(90deg, #f59e0b, #fbbf24)' },
  { label: 'Handikap', width: 61, color: 'linear-gradient(90deg, #06b6d4, #22d3ee)' },
];

export const PerformanceSlide: React.FC = () => (
  <SlideContainer>
    <BgGlow color="#ec4899" x={-100} y={800} size={350} />

    <SectionHeader emoji="📈" gradient={GRADIENTS.emerald} title="Performans Takibi" subtitle="Şeffaf geçmiş, doğrulanmış başarı" />

    {/* Stats Grid */}
    <FadeIn delay={10} style={{ width: '100%', marginTop: 24 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 24,
      }}>
        {[
          { value: 73, suffix: '%', label: 'İsabet Oranı', gradient: GRADIENTS.emerald },
          { value: 18, suffix: '.4%', prefix: '+', label: 'ROI', color: '#10b981' },
          { value: 847, suffix: '', label: 'Toplam Tahmin', color: '#818cf8' },
          { value: 2340, suffix: '₺', prefix: '+', label: 'Net Kar', color: '#fbbf24' },
        ].map((stat, i) => (
          <FadeIn key={i} delay={15 + i * 8}>
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 20,
              padding: 24,
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.1 }}>
                {stat.gradient ? (
                  <span style={{
                    background: stat.gradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    <CountUp value={stat.value} suffix={stat.suffix} prefix={stat.prefix} delay={20 + i * 8} />
                  </span>
                ) : (
                  <span style={{ color: stat.color }}>
                    <CountUp value={stat.value} suffix={stat.suffix} prefix={stat.prefix} delay={20 + i * 8} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: 16, color: COLORS.muted, fontWeight: 500, marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </FadeIn>

    {/* Chart */}
    <FadeIn delay={50} style={{ width: '100%' }}>
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 20,
        padding: 28,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>📊 Pazar Bazlı Başarı</div>
        {marketBars.map((bar, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          }}>
            <span style={{ width: 100, fontSize: 14, color: COLORS.muted, textAlign: 'right' as const, flexShrink: 0 }}>
              {bar.label}
            </span>
            <div style={{ flex: 1 }}>
              <AnimatedBar
                width={bar.width}
                color={bar.color}
                delay={55 + i * 6}
                label={`${bar.width}%`}
              />
            </div>
          </div>
        ))}
      </div>
    </FadeIn>
  </SlideContainer>
);
