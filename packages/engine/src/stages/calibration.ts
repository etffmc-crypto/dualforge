export function computeCenter(samples: readonly { x: number; y: number }[]): {
  cx: number;
  cy: number;
} {
  if (samples.length === 0) return { cx: 0, cy: 0 };
  const sx = samples.reduce((a, p) => a + p.x, 0);
  const sy = samples.reduce((a, p) => a + p.y, 0);
  return { cx: sx / samples.length, cy: sy / samples.length };
}

export function computeRadius(
  samples: readonly { x: number; y: number }[],
  c: { cx: number; cy: number },
): number {
  if (samples.length === 0) return 1;
  const m = samples.map((p) => Math.hypot(p.x - c.cx, p.y - c.cy)).sort((a, b) => a - b);
  const r = m[Math.min(m.length - 1, Math.floor(m.length * 0.95))] ?? 1;
  return Math.max(0.5, Math.min(1.5, r));
}

export interface RestAssessment {
  ok: boolean;
  reason?: 'off-center' | 'moving';
  cx: number;
  cy: number;
  spread: number;
}
const REST_MAX_OFFSET = 0.15;
const REST_MAX_SPREAD = 0.05;

/** Is the stick at rest? Rejects a centre measured while deflected or moving. */
export function assessRest(samples: readonly { x: number; y: number }[]): RestAssessment {
  const { cx, cy } = computeCenter(samples);
  const spread = samples.reduce((m, p) => Math.max(m, Math.hypot(p.x - cx, p.y - cy)), 0);
  if (Math.hypot(cx, cy) > REST_MAX_OFFSET)
    return { ok: false, reason: 'off-center', cx, cy, spread };
  if (spread > REST_MAX_SPREAD) return { ok: false, reason: 'moving', cx, cy, spread };
  return { ok: true, cx, cy, spread };
}

/** Radius = median of the per-sector max reach (sectors never reached are ignored); 1 when coverage is too sparse. */
export function computeRadiusFromReach(reach: readonly number[]): number {
  const r = reach.filter((v) => v > 0).sort((a, b) => a - b);
  if (r.length < 8) return 1;
  const mid = r.length >> 1;
  const med = r.length % 2 ? r[mid]! : (r[mid - 1]! + r[mid]!) / 2;
  return Math.max(0.5, Math.min(1.5, med));
}
