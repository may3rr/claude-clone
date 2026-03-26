'use client';

import { useEffect, useRef } from 'react';
import {
  THINKING_FRAME_COUNT,
  THINKING_DEFAULT_FPS,
  THINKING_VIEWBOX_HEIGHT,
  THINKING_VIEWBOX_SIZE,
} from '@/lib/frames';
import {
  THINKING_SPRITE_PATH,
  THINKING_SPRITE_VIEWBOX,
} from '@/lib/generated-thinking-sprite';

interface ThinkingLoaderProps {
  isThinking: boolean;
  size?: number;
  className?: string;
}

export default function ThinkingLoader({
  isThinking,
  size = 24,
  className = '',
}: ThinkingLoaderProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let animationFrameId = 0;

    const setFrame = (frame: number) => {
      svg.style.transform = `translateY(-${frame * size}px)`;
    };

    if (!isThinking) {
      setFrame(0);
      return;
    }

    let frame = 0;
    let last = 0;
    const interval = 1000 / THINKING_DEFAULT_FPS;

    const tick = (timestamp: number) => {
      if (last === 0) {
        last = timestamp;
      }

      if (timestamp - last >= interval) {
        setFrame(frame);
        frame = (frame + 1) % THINKING_FRAME_COUNT;
        last = timestamp;
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    setFrame(0);
    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      setFrame(0);
    };
  }, [isThinking, size]);

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <svg
        ref={svgRef}
        viewBox={THINKING_SPRITE_VIEWBOX}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: size,
          height: size * (THINKING_VIEWBOX_HEIGHT / THINKING_VIEWBOX_SIZE),
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          willChange: isThinking ? 'transform' : 'auto',
        }}
      >
        <path d={THINKING_SPRITE_PATH} fill="hsl(15 63.1% 59.6%)" />
      </svg>
    </div>
  );
}
