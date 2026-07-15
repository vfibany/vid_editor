import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

type BlurRegion = {
  id: string;
  start_ms: number;
  end_ms: number;
  points: [number, number][];
  blur_px: number;
};

type BlurMaskLayerProps = {
  src?: string;
  blurRegions: BlurRegion[];
  videoStyle: CSSProperties;
  children: ReactNode;
};

export function BlurMaskLayer({ blurRegions, videoStyle, children }: BlurMaskLayerProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const activeRegions = blurRegions.filter((region) => currentMs >= region.start_ms && currentMs <= region.end_ms);

  return (
    <AbsoluteFill>
      {activeRegions.map((region) => (
        <AbsoluteFill
          key={region.id}
          style={{
            clipPath: `polygon(${region.points.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(', ')})`,
            filter: `blur(${region.blur_px}px)`,
            transform: 'scale(1.03)',
            transformOrigin: 'center center',
            pointerEvents: 'none',
          }}
        >
          <div style={videoStyle}>
            {children}
          </div>
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
}
