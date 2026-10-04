export interface StickCalibration { cx: number; cy: number; radius: number }

export interface StickLiveProps {
  raw: { x: number; y: number };
  out: { x: number; y: number };
  deadzone: { center: number; outer: number };
  /**
   * The stick's calibration. When given, the raw dot is drawn in calibrated space — ((raw − centre) / radius) — the same
   * space the deadzone rings live in, so a resting stick sits in the middle of the inner ring.
   */
  calibration?: StickCalibration;
  size?: number;
  label?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Keeps a wildly off-calibration dot just outside the gate instead of off the drawing. */
const MAX_REACH = 1.1;

export function calibrated(p: { x: number; y: number }, c: StickCalibration): { x: number; y: number } {
  const x = (p.x - c.cx) / c.radius, y = (p.y - c.cy) / c.radius;
  const m = Math.hypot(x, y);
  return m > MAX_REACH ? { x: (x / m) * MAX_REACH, y: (y / m) * MAX_REACH } : { x, y };
}

/** Live stick view: grey raw dot, accent processed dot, dashed deadzone rings (inner = center, outer = 1 - outer). */
export function StickLive({ raw, out, deadzone, calibration, size = 160, label }: StickLiveProps) {
  const C = size / 2, R = (size * 70) / 160;
  const px = (v: number) => r2(C + v * R), py = (v: number) => r2(C - v * R);
  const dot = calibration ? calibrated(raw, calibration) : raw;
  return (
    <div className="stick-live">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={C} cy={C} r={R} className="sl-gate" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} className="sl-axis" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} className="sl-axis" />
        <circle data-testid="dz-outer" cx={C} cy={C} r={r2((1 - deadzone.outer) * R)} className="sl-dz outer" />
        <circle data-testid="dz-inner" cx={C} cy={C} r={r2(deadzone.center * R)} className="sl-dz inner" />
        <circle className="dot-raw" cx={px(dot.x)} cy={py(dot.y)} r="4" />
        <circle className="dot-out" cx={px(out.x)} cy={py(out.y)} r="6" />
      </svg>
      {label && <div className="stick-label">{label}</div>}
      <div className="mono">X {out.x.toFixed(3)}</div>
      <div className="mono">Y {out.y.toFixed(3)}</div>
    </div>
  );
}
