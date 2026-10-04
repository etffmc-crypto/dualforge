import { useEffect, useState } from 'react';
import type { Profile } from '@dualforge/shared';
import { computeLightbar } from '@dualforge/engine/lights';
import { useStore } from '../../store';

type Lights = Profile['lights'];
const FRAME_MS = 1000 / 30;
/** On-screen stand-in for the DualSense brightness levels (0 = high). */
const LEVEL = [1, 0.72, 0.45] as const;

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isAnimated = (l: Lights, charging: boolean) => l.mode === 'breathing' || l.mode === 'rainbow' || (l.mode === 'battery' && charging);

/**
 * The lightbar colour the controller shows right now, computed with the engine's own light function so the
 * preview animates exactly like the pad (30 fps, paused when the user prefers reduced motion).
 */
export function useLightPreview(lights: Lights): { r: number; g: number; b: number } {
  // primitives only: a fresh object per selector call would re-render forever
  const percent = useStore((s) => s.snapshot?.battery.percent ?? 100);
  const state = useStore((s) => s.snapshot?.battery.state ?? 'unknown');
  const battery = { percent, state };
  const animate = isAnimated(lights, battery.state === 'charging') && !reducedMotion();
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const t0 = Date.now();
    const id = setInterval(() => setT(Date.now() - t0), FRAME_MS);
    return () => clearInterval(id);
  }, [animate]);
  const f = computeLightbar(lights, animate ? t : 0, battery);
  const k = LEVEL[f.brightness] ?? 1;
  return { r: Math.round(f.r * k), g: Math.round(f.g * k), b: Math.round(f.b * k) };
}
