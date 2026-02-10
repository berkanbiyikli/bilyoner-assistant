import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { IntroSlide } from './slides/IntroSlide';
import { ProblemSlide } from './slides/ProblemSlide';
import { AIPicksSlide } from './slides/AIPicksSlide';
import { TrendSlide } from './slides/TrendSlide';
import { SurpriseSlide } from './slides/SurpriseSlide';
import { QuickBuildSlide } from './slides/QuickBuildSlide';
import { CouponSlide } from './slides/CouponSlide';
import { PerformanceSlide } from './slides/PerformanceSlide';
import { LiveSlide } from './slides/LiveSlide';
import { FeaturesSlide } from './slides/FeaturesSlide';
import { CTASlide } from './slides/CTASlide';

const SLIDE_DURATION = 150; // 5 seconds per slide at 30fps
const TRANSITION = 15; // 0.5s transition

export const PromoVideo: React.FC<{ landscape?: boolean }> = ({ landscape }) => {
  const slides = [
    IntroSlide,
    ProblemSlide,
    AIPicksSlide,
    TrendSlide,
    SurpriseSlide,
    QuickBuildSlide,
    CouponSlide,
    PerformanceSlide,
    LiveSlide,
    FeaturesSlide,
    CTASlide,
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0f' }}>
      {slides.map((SlideComponent, i) => (
        <Sequence
          key={i}
          from={i * SLIDE_DURATION}
          durationInFrames={SLIDE_DURATION + TRANSITION}
        >
          <SlideTransition>
            <SlideComponent />
          </SlideTransition>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const SlideTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterOpacity = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const enterScale = interpolate(
    spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 }),
    [0, 1],
    [0.92, 1]
  );
  const enterY = interpolate(
    spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 }),
    [0, 1],
    [40, 0]
  );

  // Exit
  const exitStart = SLIDE_DURATION - TRANSITION;
  const exitOpacity = frame > exitStart
    ? interpolate(frame, [exitStart, exitStart + TRANSITION], [1, 0], { extrapolateRight: 'clamp' })
    : 1;
  const exitScale = frame > exitStart
    ? interpolate(frame, [exitStart, exitStart + TRANSITION], [1, 1.08], { extrapolateRight: 'clamp' })
    : 1;

  return (
    <AbsoluteFill
      style={{
        opacity: enterOpacity * exitOpacity,
        transform: `scale(${enterScale * exitScale}) translateY(${enterY}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
