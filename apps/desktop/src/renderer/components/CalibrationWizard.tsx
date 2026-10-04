import { useEffect, useRef, useState } from 'react';
import type { EngineSnapshot } from '@dualforge/shared';
import { assessRest, computeRadiusFromReach } from '@dualforge/engine/calibration';
import { applyStickShaping } from '@dualforge/engine/shape';
import { StickLive } from './controls/StickLive';
import { useStore, type Side } from '../store';
import { Modal } from './Modal';

const CENTER_FRAMES = 120;
const CENTER_MS = 2000;
const MIN_EDGE_SAMPLES = 200;
const BINS = 36; // 10° sectors for the edge-coverage trace
const MIN_COVERED = 27; // 3/4 of the sectors must reach past half travel, so Next can't produce a bogus tiny radius

type Pt = { x: number; y: number };
const STEPS = ['Center', 'Edge', 'Verify'] as const;
const fmt = (v: number) => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(3)}`;
const pick = (s: EngineSnapshot, side: Side): Pt => (side === 'left' ? { x: s.raw.lx, y: s.raw.ly } : { x: s.raw.rx, y: s.raw.ry });

/** Polygon of the farthest reach per 10° sector — fills in as the user rotates the stick. */
function EdgeTrace({ reach }: { reach: number[] }) {
  const C = 80, R = 64;
  const pts = reach.map((r, i) => {
    const a = ((i + 0.5) / BINS) * 2 * Math.PI;
    return `${(C + Math.cos(a) * r * R).toFixed(1)},${(C - Math.sin(a) * r * R).toFixed(1)}`;
  });
  return (
    <svg className="cal-trace" width={160} height={160} viewBox="0 0 160 160" aria-hidden="true">
      <circle cx={C} cy={C} r={R} className="sl-gate" />
      <polygon points={pts.join(' ')} className="cal-reach" />
      <circle cx={C} cy={C} r={3} className="dot-raw" />
    </svg>
  );
}

/** Three-step stick calibration (center → edge → verify). Nothing reaches the profile until Apply. */
export function CalibrationWizard({ side, onClose }: { side: Side; onClose(): void }) {
  const snapshot = useStore((s) => s.snapshot);
  const cfg = useStore((s) => s.profile?.sticks[side]);
  const updateProfile = useStore((s) => s.updateProfile);
  const flushProfile = useStore((s) => s.flushProfile);
  const [step, setStep] = useState(0);
  const [center, setCenter] = useState<Pt | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [restFail, setRestFail] = useState<'off-center' | 'moving' | null>(null);
  const [count, setCount] = useState(0);
  const [reach, setReach] = useState<number[]>(() => Array<number>(BINS).fill(0));
  const samples = useRef<Pt[]>([]);
  const started = useRef(performance.now());
  const seen = useRef<EngineSnapshot | null>(snapshot); // only frames that arrive after a step starts count
  useEffect(() => {
    if (!snapshot || snapshot === seen.current) return;
    seen.current = snapshot;
    const p = pick(snapshot, side);
    if (step === 0 && !center && !restFail) {
      samples.current.push(p);
      setCount(samples.current.length);
      if (samples.current.length >= CENTER_FRAMES || performance.now() - started.current >= CENTER_MS) {
        const a = assessRest(samples.current);
        if (a.ok) setCenter({ x: a.cx, y: a.cy }); else setRestFail(a.reason!);
      }
    } else if (step === 1 && center) {
      samples.current.push(p);
      setCount(samples.current.length);
      const dx = p.x - center.x, dy = p.y - center.y;
      const bin = Math.floor(((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * BINS) % BINS;
      const r = Math.hypot(dx, dy);
      setReach((prev) => (r > prev[bin]! ? prev.map((v, i) => (i === bin ? Math.min(1.2, r) : v)) : prev));
    }
  }, [snapshot, side, step, center, restFail]);

  const restartCenter = () => { samples.current = []; started.current = performance.now(); seen.current = snapshot; setCount(0); setCenter(null); setRestFail(null); };
  const next = () => {
    if (step === 0) { samples.current = []; seen.current = snapshot; setCount(0); setStep(1); }
    else if (step === 1 && center) { setRadius(computeRadiusFromReach(reach)); setStep(2); }
  };
  const apply = () => {
    if (!center || radius === null) return;
    updateProfile((d) => { d.sticks[side].calibration = { cx: center.x, cy: center.y, radius }; });
    flushProfile();
    onClose();
  };

  const covered = reach.filter((r) => r > 0.5).length;
  const canNext = step === 0 ? center !== null : step === 1 && count >= MIN_EDGE_SAMPLES && covered >= MIN_COVERED;
  const raw = snapshot ? pick(snapshot, side) : { x: 0, y: 0 };
  const proposed = cfg && center && radius !== null
    ? applyStickShaping(raw.x, raw.y, { ...cfg, calibration: { cx: center.x, cy: center.y, radius } })
    : raw;
  const name = side === 'left' ? 'left stick' : 'right stick';

  return (
    <Modal open title={`Calibrate ${name}`} onClose={onClose}>
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="stepper-n">{i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="cal-body">
          <p>Release the stick and keep the controller still.</p>
          <div className="cal-meter"><div style={{ width: `${Math.min(100, (count / CENTER_FRAMES) * 100)}%` }} /></div>
          {center
            ? <p className="cal-result">Rest position <span className="mono" data-testid="cal-center">X {fmt(center.x)} · Y {fmt(center.y)}</span></p>
            : restFail
              ? <p className="cal-result" role="alert" data-testid="cal-rest-error">{restFail === 'moving' ? "Stick isn't at rest - release it and try again" : 'Stick is off-center - release it fully'}</p>
              : <p className="cal-result muted">{snapshot ? 'Measuring…' : 'Waiting for the controller…'}</p>}
        </div>
      )}
      {step === 1 && center && (
        <div className="cal-body cal-split">
          <EdgeTrace reach={reach} />
          <div>
            <p>Rotate the stick slowly around its full edge, twice.</p>
            <p className="cal-result muted">{count} samples · {covered}/{BINS} directions</p>
          </div>
        </div>
      )}
      {step === 2 && center && radius !== null && (
        <div className="cal-body cal-split">
          <StickLive raw={raw} out={proposed} deadzone={cfg?.deadzone ?? { center: 0, outer: 0 }} size={160} />
          <div>
            <p>Move the stick: the red dot shows the result with the new calibration.</p>
            <p className="cal-result">Center <span className="mono">X {fmt(center.x)} · Y {fmt(center.y)}</span></p>
            <p className="cal-result">Radius <span className="mono" data-testid="cal-radius">{radius.toFixed(3)}</span></p>
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button data-nav type="button" className="panel-btn" onClick={onClose}>Cancel</button>
        {step === 0 && (center || restFail) && <button data-nav type="button" className="panel-btn" onClick={restartCenter}>Measure again</button>}
        {step < 2
          ? <button data-nav type="button" className="panel-btn primary" disabled={!canNext} onClick={next}>Next</button>
          : <button data-nav type="button" className="panel-btn primary" onClick={apply}>Apply</button>}
      </div>
    </Modal>
  );
}
