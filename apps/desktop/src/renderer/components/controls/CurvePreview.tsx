export interface CurvePreviewProps {
  points: [number, number][];
  size?: number;
}

/** Read-only square curve thumbnail (x right, y up, both 0..1). */
export function CurvePreview({ points, size = 120 }: CurvePreviewProps) {
  const p = (v: number) => Math.round(v * size * 100) / 100;
  const poly = points.map(([x, y]) => `${p(x)},${p(1 - y)}`).join(' ');
  const q = [0.25, 0.5, 0.75].map((f) => p(f));
  return (
    <svg
      className="curve-preview"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} className="cp-frame" />
      {q.map((v) => (
        <g key={v} className="cp-grid">
          <line x1={v} y1="0" x2={v} y2={size} />
          <line x1="0" y1={v} x2={size} y2={v} />
        </g>
      ))}
      <polyline className="curve" points={poly} fill="none" />
    </svg>
  );
}
