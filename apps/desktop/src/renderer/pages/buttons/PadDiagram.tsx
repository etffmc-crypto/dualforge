import { memo, type CSSProperties, type ReactNode } from 'react';
import {
  BUTTON_LABELS,
  turboApplies,
  type DsButton,
  type Macro,
  type Mapping,
  type Profile,
} from '@dualforge/shared';
import { DualSenseTop } from '../../art/DualSenseTop';
import { useStore } from '../../store';
import {
  isDefaultMapping,
  mappingOf,
  summarize,
  summaryLine,
  turboModeName,
  turboText,
} from './targets';

/** Stage coordinates (16:9). The pad art (1000 × 640) is drawn at PAD_X/PAD_Y, scaled by PAD_S. */
const W = 1600,
  H = 900,
  PAD_S = 0.92,
  PAD_X = 340,
  PAD_Y = 185;
const ROW = (i: number) => 135 + i * 82;
const L_EDGE = 262,
  L_ELBOW = 300,
  R_EDGE = W - L_EDGE,
  R_ELBOW = W - L_ELBOW,
  TOP_Y = 58;

/** Where each leader line lands on the pad art (art coordinates). */
const ANCHOR: Record<DsButton, [number, number]> = {
  l2: [232, 58],
  l1: [196, 95],
  create: [322, 130],
  touchpad: [420, 150],
  dpadUp: [225, 168],
  dpadLeft: [178, 215],
  dpadRight: [272, 215],
  dpadDown: [225, 262],
  l3: [370, 318],
  r2: [768, 58],
  r1: [804, 95],
  options: [678, 130],
  triangle: [775, 163],
  square: [721, 215],
  circle: [829, 215],
  cross: [775, 267],
  r3: [630, 318],
  mic: [500, 360],
  ps: [500, 318],
};
const LEFT: DsButton[] = [
  'l2',
  'l1',
  'create',
  'touchpad',
  'dpadUp',
  'dpadLeft',
  'dpadRight',
  'dpadDown',
  'l3',
];
const RIGHT: DsButton[] = [
  'r2',
  'r1',
  'options',
  'triangle',
  'circle',
  'square',
  'cross',
  'r3',
  'mic',
];
type Side = 'left' | 'right' | 'top';
const PLACES: { b: DsButton; side: Side; y: number }[] = [
  ...LEFT.map((b, i) => ({ b, side: 'left' as const, y: ROW(i) })),
  ...RIGHT.map((b, i) => ({ b, side: 'right' as const, y: ROW(i) })),
  { b: 'ps', side: 'top', y: TOP_Y },
];

const FACE = new Set<DsButton>(['cross', 'circle', 'square', 'triangle']);
const stage = ([x, y]: [number, number]): [number, number] => [
  PAD_X + x * PAD_S,
  PAD_Y + y * PAD_S,
];
function linePoints(b: DsButton, side: Side, y: number): string {
  const [ax, ay] = stage(ANCHOR[b]);
  if (side === 'top') return `${W / 2},${y + 26} ${ax},${ay}`;
  return side === 'left'
    ? `${L_EDGE},${y} ${L_ELBOW},${y} ${ax},${ay}`
    : `${R_EDGE},${y} ${R_ELBOW},${y} ${ax},${ay}`;
}

const g = (d: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);
const GLYPH: Partial<Record<DsButton, ReactNode>> = {
  dpadUp: '↑',
  dpadDown: '↓',
  dpadLeft: '←',
  dpadRight: '→',
  create: g(
    <>
      <path d="M9 4.5v15" />
      <path d="M13 8l3-3M14.5 12h4M13 16l3 3" />
    </>,
  ),
  options: g(<path d="M5 7h14M5 12h14M5 17h14" />),
  touchpad: g(<rect x="3.5" y="6" width="17" height="12" rx="3" />),
  mic: g(
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3" />
    </>,
  ),
};

/** Which pad buttons are held, as a stable string so the diagram only re-renders when it changes. */
const heldKey = (s: ReturnType<typeof useStore.getState>) =>
  Object.entries(s.snapshot?.raw.buttons ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(',');

interface PillContent {
  cls: string;
  /** Text for the accessible name and tooltip. */
  line: string;
  dst: ReactNode;
}
/** Buttons page pill: the output, plus multi / turbo / continuous markers. */
function mapPill(b: DsButton, m: Mapping, macros: readonly Macro[]): PillContent {
  const s = summarize(m, macros);
  return {
    cls: isDefaultMapping(b, m) ? '' : 'remapped',
    line: summaryLine(s),
    dst: (
      <>
        {s.macro && <span className="bpill-macro">macro</span>}
        <span className="bpill-text">{s.text}</span>
        {s.more > 0 && <span className="bpill-flag">+{s.more}</span>}
        {s.turbo && (
          <span className="bpill-flag" title="Turbo">
            ⟳
          </span>
        )}
        {s.continuous && (
          <span className="bpill-flag" title="Continuous">
            ∞
          </span>
        )}
      </>
    ),
  };
}
/** Turbo page pill: a mode tag and the speed, or Off. */
function turboPill(m: Mapping): PillContent {
  const t = m.turbo;
  if (!turboApplies(m))
    return {
      cls: 'tpill',
      line: 'Macro (no turbo)',
      dst: <span className="bpill-text">Macro</span>,
    };
  const on = t.mode !== 'off';
  return {
    cls: `tpill${on ? ' turbo-on' : ''}`,
    line: turboText(t),
    dst: on ? (
      <>
        <span className="tpill-mode">{turboModeName(t)}</span>
        <span className="tpill-hz">{t.hz}</span>
        <span className="tpill-unit">Hz</span>
      </>
    ) : (
      <span className="bpill-text">Off</span>
    ),
  };
}

export interface PadDiagramProps {
  mappings: Profile['mappings'];
  macros: readonly Macro[];
  lights: Profile['lights'];
  onEdit(b: DsButton): void;
  /** `map` (Buttons page): pills show the output; `turbo` (Turbo page): pills show the turbo mode and speed. */
  variant?: 'map' | 'turbo';
}

/** GameSir ss3: the pad in the middle, every button led out to a labelled pill showing what it sends. */
export const PadDiagram = memo(function PadDiagram({
  mappings,
  macros,
  lights,
  onEdit,
  variant = 'map',
}: PadDiagramProps) {
  const held = useStore(heldKey);
  const pressed = Object.fromEntries(held ? held.split(',').map((k) => [k, true]) : []);
  return (
    <div className="pad-stage">
      <div className="pad-art">
        <DualSenseTop pressed={pressed} lightbar={lights} playerLeds={lights.playerLeds} />
      </div>
      <svg
        className="pad-lines"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {PLACES.map(({ b, side, y }) => {
          const [ax, ay] = stage(ANCHOR[b]);
          return (
            <g key={b} className={pressed[b] ? 'on' : undefined}>
              <polyline className="lead-line" points={linePoints(b, side, y)} />
              <circle className="lead-dot" cx={ax} cy={ay} r="5" />
            </g>
          );
        })}
      </svg>
      {PLACES.map(({ b, side, y }) => {
        const m = mappingOf(mappings, b);
        const style: CSSProperties =
          side === 'left'
            ? { right: `${100 - (L_EDGE / W) * 100}%`, top: `${(y / H) * 100}%` }
            : side === 'right'
              ? { left: `${(R_EDGE / W) * 100}%`, top: `${(y / H) * 100}%` }
              : { left: '50%', top: `${(y / H) * 100}%` };
        const p = variant === 'turbo' ? turboPill(m) : mapPill(b, m, macros);
        return (
          <div
            key={b}
            className={`bpill side-${side}${pressed[b] ? ' pressed' : ''} ${p.cls}`}
            style={style}
          >
            <button
              data-nav
              type="button"
              className="bpill-btn"
              aria-label={`${variant === 'turbo' ? 'Turbo' : 'Map'} ${BUTTON_LABELS[b]}: ${p.line}`}
              title={`${BUTTON_LABELS[b]} ${variant === 'turbo' ? 'turbo:' : '→'} ${p.line}`}
              onClick={() => onEdit(b)}
            >
              <span className={`bpill-src${FACE.has(b) ? ' face' : ''}`} aria-hidden="true">
                {GLYPH[b] ?? BUTTON_LABELS[b]}
              </span>
              <span className="bpill-dst" aria-hidden="true">
                {p.dst}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
});
