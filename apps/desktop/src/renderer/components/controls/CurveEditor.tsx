import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { DraftNumber } from './DraftNumber';

export type CurvePoints = [number, number][];

export interface CurveEditorProps {
  /** x in 0..1 (non-decreasing), y in yMin..yMax */
  points: CurvePoints;
  onChange(points: CurvePoints): void;
  size?: number;
  /** top of the y axis; numeric inputs show y scaled to 0..100 (yMax = 100 shows raw values) */
  yMax?: number;
  /** bottom of the y axis (default 0); below 0 the plot shades the negative band and dashes the zero line */
  yMin?: number;
  pointCount?: number;
}

const PAD = 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const tidy = (v: number) => Math.round(v * 1e6) / 1e6;

/** Draggable multi-point response curve with a dashed linear reference and per-point numeric inputs. */
export function CurveEditor({
  points,
  onChange,
  size = 280,
  yMax = 1,
  yMin = 0,
  pointCount = 8,
}: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const pts = points.slice(0, pointCount);
  const plot = size - PAD * 2;
  const ySpan = yMax - yMin;
  const sx = (x: number) => PAD + x * plot;
  const sy = (y: number) => PAD + (1 - (y - yMin) / ySpan) * plot;
  const yScale = 100 / yMax;
  const signed = yMin < 0;

  const setPoint = (i: number, x: number, y: number) => {
    const lo = i > 0 ? pts[i - 1]![0] : 0;
    const hi = i < pts.length - 1 ? pts[i + 1]![0] : 1;
    const next = pts.map((p) => [p[0], p[1]] as [number, number]);
    next[i] = [clamp(tidy(x), lo, hi), clamp(tidy(y), yMin, yMax)];
    onChange(next);
  };

  const onDown = (i: number) => (e: PointerEvent) => {
    drag.current = i;
    setActive(i);
    const svg = svgRef.current;
    if (svg && typeof svg.setPointerCapture === 'function') {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    }
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = drag.current;
    if (i === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width ? rect.width / size : 1;
    const x = ((e.clientX - rect.left) / scale - PAD) / plot;
    const y = yMin + (1 - ((e.clientY - rect.top) / scale - PAD) / plot) * ySpan;
    setPoint(i, x, y);
  };
  const onUp = () => {
    drag.current = null;
    setActive(null);
  };

  const onKey = (i: number) => (e: KeyboardEvent) => {
    const [x, y] = pts[i]!;
    const dy = yMax / 100;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [x - 0.01, y],
      ArrowRight: [x + 0.01, y],
      ArrowUp: [x, y + dy],
      ArrowDown: [x, y - dy],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setPoint(i, m[0], m[1]);
  };

  const grid = [0.25, 0.5, 0.75];
  return (
    <div className="curve-editor">
      <svg
        ref={svgRef}
        data-testid="curve-svg"
        className="ce-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <rect x={PAD} y={PAD} width={plot} height={plot} className="cp-frame" />
        {signed && (
          <rect className="ce-neg" x={PAD} y={sy(0)} width={plot} height={PAD + plot - sy(0)} />
        )}
        {grid.map((g) => (
          <g key={g} className="cp-grid">
            <line x1={sx(g)} y1={PAD} x2={sx(g)} y2={PAD + plot} />
            <line x1={PAD} y1={sy(yMin + g * ySpan)} x2={PAD + plot} y2={sy(yMin + g * ySpan)} />
          </g>
        ))}
        {signed ? (
          <line
            data-testid="ce-zero"
            className="ce-ref"
            x1={sx(0)}
            y1={sy(0)}
            x2={sx(1)}
            y2={sy(0)}
          />
        ) : (
          <line className="ce-ref" x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(yMax)} />
        )}
        <polyline
          className="curve"
          fill="none"
          points={pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')}
        />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            data-testid={`handle-${i}`}
            cx={sx(x)}
            cy={sy(y)}
            r={7}
            tabIndex={0}
            role="button"
            aria-label={`Point ${i + 1}: input ${Math.round(x * 100)}, output ${Math.round(y * yScale)}`}
            className={`ce-handle${active === i ? ' active' : ''}`}
            onPointerDown={onDown(i)}
            onKeyDown={onKey(i)}
          />
        ))}
      </svg>
      <div className="ce-inputs" style={{ gridTemplateColumns: `auto repeat(${pts.length}, 1fr)` }}>
        <span className="ce-axis">In</span>
        {pts.map(([x], i) => (
          <DraftNumber
            key={`x${i}`}
            min={0}
            max={100}
            step={1}
            value={Math.round(x * 100)}
            label={`Point ${i + 1} input`}
            onCommit={(v) => setPoint(i, v / 100, pts[i]![1])}
          />
        ))}
        <span className="ce-axis">Out</span>
        {pts.map(([, y], i) => (
          <DraftNumber
            key={`y${i}`}
            min={Math.round(yMin * yScale)}
            max={100}
            step={1}
            value={Math.round(y * yScale)}
            label={`Point ${i + 1} output`}
            onCommit={(v) => setPoint(i, pts[i]![0], v / yScale)}
          />
        ))}
      </div>
    </div>
  );
}
