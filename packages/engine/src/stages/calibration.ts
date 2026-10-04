export function computeCenter(samples: readonly { x: number; y: number }[]): { cx: number; cy: number } {
  if (samples.length === 0) return { cx: 0, cy: 0 };
  const sx = samples.reduce((a, p) => a + p.x, 0);
  const sy = samples.reduce((a, p) => a + p.y, 0);
  return { cx: sx / samples.length, cy: sy / samples.length };
}

export function computeRadius(samples: readonly { x: number; y: number }[], c: { cx: number; cy: number }): number {
  if (samples.length === 0) return 1;
  const m = samples.map((p) => Math.hypot(p.x - c.cx, p.y - c.cy)).sort((a, b) => a - b);
  const r = m[Math.min(m.length - 1, Math.floor(m.length * 0.95))] ?? 1;
  return Math.max(0.5, Math.min(1.5, r));
}
