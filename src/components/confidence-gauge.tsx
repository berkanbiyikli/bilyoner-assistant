"use client";

import { cn } from "@/lib/utils";

interface ConfidenceGaugeProps {
  confidence: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

/**
 * Halka şeklinde güven göstergesi — renk yeşilden kırmızıya döner
 * SVG arc ile çizilir, animasyonlu
 */
export function ConfidenceGauge({
  confidence,
  size = "md",
  showLabel = true,
}: ConfidenceGaugeProps) {
  const dimensions = {
    sm: { width: 48, stroke: 4, fontSize: "text-xs", labelSize: "text-[8px]" },
    md: { width: 72, stroke: 5, fontSize: "text-lg", labelSize: "text-[10px]" },
    lg: { width: 96, stroke: 6, fontSize: "text-2xl", labelSize: "text-xs" },
  };

  const { width, stroke, fontSize, labelSize } = dimensions[size];
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (confidence / 100) * circumference;

  // Renk: kırmızı → sarı → yeşil
  const getColor = (c: number) => {
    if (c >= 75) return { ring: "#22c55e", glow: "rgba(34,197,94,0.2)" };
    if (c >= 60) return { ring: "#84cc16", glow: "rgba(132,204,22,0.15)" };
    if (c >= 50) return { ring: "#eab308", glow: "rgba(234,179,8,0.15)" };
    if (c >= 40) return { ring: "#f97316", glow: "rgba(249,115,22,0.15)" };
    return { ring: "#ef4444", glow: "rgba(239,68,68,0.2)" };
  };

  const { ring, glow } = getColor(confidence);

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg
        width={width}
        height={width}
        className="transform -rotate-90"
        style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
      >
        {/* Background track */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          opacity={0.3}
        />
        {/* Progress arc */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke={ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-bold", fontSize)} style={{ color: ring }}>
          {confidence}
        </span>
        {showLabel && (
          <span className={cn("text-muted-foreground", labelSize)}>güven</span>
        )}
      </div>
    </div>
  );
}
