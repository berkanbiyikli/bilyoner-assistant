import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

/* ===== DESIGN TOKENS ===== */
export const COLORS = {
  bg: '#0a0a0f',
  card: '#12121a',
  cardBorder: '#1e1e2e',
  text: '#f0f0f5',
  muted: '#8888aa',
  primary: '#6366f1',
  primaryLight: '#818cf8',
  emerald: '#10b981',
  emeraldLight: '#34d399',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  rose: '#f43f5e',
  roseLight: '#fb7185',
  purple: '#a855f7',
  purpleLight: '#c084fc',
  cyan: '#06b6d4',
};

export const GRADIENTS = {
  primary: 'linear-gradient(135deg, #6366f1, #a855f7)',
  primaryPink: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
  emerald: 'linear-gradient(135deg, #10b981, #06b6d4)',
  amber: 'linear-gradient(135deg, #f59e0b, #f43f5e)',
  rose: 'linear-gradient(135deg, #be123c, #f43f5e)',
  purple: 'linear-gradient(135deg, #a855f7, #ec4899)',
  live: 'linear-gradient(135deg, #ef4444, #f97316)',
  blue: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
};

/* ===== ANIMATED COMPONENTS ===== */

export const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  style?: React.CSSProperties;
}> = ({ children, delay = 0, direction = 'up', style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const offset = interpolate(progress, [0, 1], [35, 0]);

  const transforms: Record<string, string> = {
    up: `translateY(${offset}px)`,
    down: `translateY(${-offset}px)`,
    left: `translateX(${offset}px)`,
    right: `translateX(${-offset}px)`,
    none: 'none',
  };

  return (
    <div style={{ opacity, transform: transforms[direction], ...style }}>
      {children}
    </div>
  );
};

export const ScaleIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, mass: 0.5 },
    durationInFrames: 25,
  });

  const scale = interpolate(progress, [0, 1], [0.5, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div style={{ opacity, transform: `scale(${scale})`, ...style }}>
      {children}
    </div>
  );
};

export const CountUp: React.FC<{
  value: number;
  suffix?: string;
  prefix?: string;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ value, suffix = '', prefix = '', delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 40,
  });

  const current = Math.round(interpolate(progress, [0, 1], [0, value]));

  return <span style={style}>{prefix}{current}{suffix}</span>;
};

export const AnimatedBar: React.FC<{
  width: number; // 0-100
  color: string;
  delay?: number;
  height?: number;
  label?: string;
}> = ({ width, color, delay = 0, height = 28, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 35,
  });

  const barWidth = interpolate(progress, [0, 1], [0, width]);

  return (
    <div style={{
      height,
      background: '#1a1a2a',
      borderRadius: 8,
      overflow: 'hidden',
      width: '100%',
    }}>
      <div style={{
        height: '100%',
        width: `${barWidth}%`,
        background: color,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: 12,
        fontSize: 13,
        fontWeight: 700,
        color: 'white',
      }}>
        {barWidth > 15 && label}
      </div>
    </div>
  );
};

export const PulsingDot: React.FC<{ color?: string; size?: number }> = ({
  color = '#ef4444',
  size = 12,
}) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      opacity: pulse,
      flexShrink: 0,
    }} />
  );
};

export const GlowingBox: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, color = COLORS.primary, style }) => {
  const frame = useCurrentFrame();
  const glow = Math.sin(frame * 0.08) * 15 + 25;

  return (
    <div style={{
      boxShadow: `0 0 ${glow}px ${color}40`,
      ...style,
    }}>
      {children}
    </div>
  );
};

/* ===== SHARED UI COMPONENTS ===== */

export const GradientText: React.FC<{
  children: React.ReactNode;
  gradient?: string;
  style?: React.CSSProperties;
}> = ({ children, gradient = GRADIENTS.primaryPink, style }) => (
  <span style={{
    background: gradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    ...style,
  }}>
    {children}
  </span>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'emerald' | 'amber' | 'rose' | 'purple';
  style?: React.CSSProperties;
}> = ({ children, variant = 'primary', style }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'rgba(99,102,241,0.15)', text: '#818cf8' },
    emerald: { bg: 'rgba(16,185,129,0.15)', text: '#34d399' },
    amber: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
    rose: { bg: 'rgba(244,63,94,0.15)', text: '#fb7185' },
    purple: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      borderRadius: 999,
      fontSize: 14,
      fontWeight: 600,
      background: colors[variant].bg,
      color: colors[variant].text,
      ...style,
    }}>
      {children}
    </span>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  glow?: boolean;
}> = ({ children, style, glow }) => (
  <div style={{
    background: COLORS.card,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    ...(glow && { boxShadow: `0 8px 32px ${COLORS.primary}25` }),
    ...style,
  }}>
    {children}
  </div>
);

export const IconCircle: React.FC<{
  emoji: string;
  gradient: string;
  size?: number;
}> = ({ emoji, gradient, size = 64 }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: size * 0.31,
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.44,
    flexShrink: 0,
  }}>
    {emoji}
  </div>
);

export const SlideContainer: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div style={{
    position: 'absolute',
    top: 0, left: 0,
    width: 1080, height: 1920,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    fontFamily: 'Inter, system-ui, sans-serif',
    color: COLORS.text,
    ...style,
  }}>
    {children}
  </div>
);

export const BgGlow: React.FC<{
  color: string;
  x: number;
  y: number;
  size?: number;
}> = ({ color, x, y, size = 400 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame * 0.02) * 10;

  return (
    <div style={{
      position: 'absolute',
      width: size, height: size,
      borderRadius: '50%',
      background: color,
      filter: 'blur(120px)',
      opacity: 0.15,
      top: y + drift,
      left: x,
      pointerEvents: 'none',
    }} />
  );
};

export const SectionHeader: React.FC<{
  emoji: string;
  gradient: string;
  title: string;
  subtitle: string;
  delay?: number;
}> = ({ emoji, gradient, title, subtitle, delay = 0 }) => (
  <FadeIn delay={delay} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, width: '100%' }}>
    <IconCircle emoji={emoji} gradient={gradient} />
    <div>
      <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>{title}</div>
      <div style={{ color: COLORS.muted, fontSize: 16 }}>{subtitle}</div>
    </div>
  </FadeIn>
);
