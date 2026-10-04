export interface StickLiveProps {
  raw: { x: number; y: number };
  out: { x: number; y: number };
  deadzone: { center: number; outer: number };
  size?: number;
  label?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Live stick view: grey raw dot, accent processed dot, dashed deadzone rings (inner = center, outer = 1 - outer). */
export function StickLive({ raw, out, deadzone, size = 160, label }: StickLiveProps) {
  const C = size / 2, R = (size * 70) / 160;
  const px = (v: number) => r2(C + v * R), py = (v: number) => r2(C - v * R);
  return (
    <div className="stick-live">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={C} cy={C} r={R} className="sl-gate" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} className="sl-axis" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} className="sl-axis" />
        <circle data-testid="dz-outer" cx={C} cy={C} r={r2((1 - deadzone.outer) * R)} className="sl-dz outer" />
        <circle data-testid="dz-inner" cx={C} cy={C} r={r2(deadzone.center * R)} className="sl-dz inner" />
        <circle className="dot-raw" cx={px(raw.x)} cy={py(raw.y)} r="4" />
        <circle className="dot-out" cx={px(out.x)} cy={py(out.y)} r="6" />
      </svg>
      {label && <div className="stick-label">{label}</div>}
      <div className="mono">X {out.x.toFixed(3)}</div>
      <div className="mono">Y {out.y.toFixed(3)}</div>
    </div>
  );
}
