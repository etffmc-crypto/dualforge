import type { StickConfig } from '@dualforge/shared';

export type CurvePoint = [number, number];
type Preset = Extract<StickConfig['curve'], { kind: 'preset' }>['preset'];

const sample = (f: (t: number) => number): CurvePoint[] =>
  Array.from({ length: 8 }, (_, i) => {
    const t = (i + 1) / 8;
    return [t, Math.min(1, Math.max(0, f(t)))];
  });

export function presetPoints(preset: Preset): CurvePoint[] {
  switch (preset) {
    case 'linear':
      return sample((t) => t);
    case 'aggressive':
      return sample((t) => Math.pow(t, 0.6));
    case 'precise':
      return sample((t) => Math.pow(t, 1.8));
    case 'scurve':
      return sample((t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
  }
}

export function evaluateCurve(points: readonly CurvePoint[], input: number): number {
  const v = Math.max(0, Math.min(1, input));
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  let [px, py] = [0, 0];
  for (const [x, y] of pts) {
    if (v <= x) {
      if (x === px) return Math.max(0, Math.min(1, y));
      return Math.max(0, Math.min(1, py + ((v - px) / (x - px)) * (y - py)));
    }
    px = x;
    py = y;
  }
  return Math.max(0, Math.min(1, py)); // past last point: hold
}

export function applyStickCurve(
  x: number,
  y: number,
  curve: StickConfig['curve'],
): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag === 0) return { x: 0, y: 0 };
  const pts = curve.kind === 'preset' ? presetPoints(curve.preset) : curve.points;
  const out = evaluateCurve(pts, Math.min(1, mag));
  return { x: (x / mag) * out, y: (y / mag) * out };
}

export const LUT_SIZE = 1024;

export function buildCurveLut(points: readonly CurvePoint[]): Float32Array {
  const lut = new Float32Array(LUT_SIZE + 1);
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i <= LUT_SIZE; i++) lut[i] = evaluateCurve(sorted, i / LUT_SIZE);
  return lut;
}

export function evaluateLut(lut: Float32Array, v: number): number {
  const x = Math.max(0, Math.min(1, v)) * LUT_SIZE;
  const i = Math.floor(x);
  const f = x - i;
  const a = lut[i] ?? 0;
  const b = lut[Math.min(LUT_SIZE, i + 1)] ?? a;
  return a + (b - a) * f;
}

export function applyStickLut(x: number, y: number, lut: Float32Array): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag === 0) return { x: 0, y: 0 };
  const out = evaluateLut(lut, Math.min(1, mag));
  return { x: (x / mag) * out, y: (y / mag) * out };
}
