const R = 70, C = 80;
export function StickCircle({ label, raw, out }: { label: string; raw: { x: number; y: number }; out: { x: number; y: number } }) {
  const px = (v: number) => C + v * R, py = (v: number) => C - v * R;
  return (
    <div className="stick-circle">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--card-border)" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="var(--card-border)" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="var(--card-border)" />
        <circle className="dot-raw" cx={px(raw.x)} cy={py(raw.y)} r="4" fill="var(--muted)" />
        <circle className="dot-out" cx={px(out.x)} cy={py(out.y)} r="6" fill="var(--accent)" />
      </svg>
      <div className="stick-label">{label}</div>
      <div className="mono">X {out.x.toFixed(3)}</div>
      <div className="mono">Y {out.y.toFixed(3)}</div>
    </div>
  );
}
