import { useEffect, useRef, useState } from 'react';
import { DS_BUTTONS, type DsButton, type EngineSnapshot } from '@dualforge/shared';
import { Modal } from '../../components/Modal';
import { useStore } from '../../store';
import { targetText } from '../buttons/targets';
import { MAX_STEPS, pressesToSteps, recordTarget, type MacroStep, type Press } from './ops';

export const RECORD_LIMIT_MS = 60_000;

export interface RecordDialogProps { open: boolean; onClose(): void; onUse(steps: MacroStep[]): void }

/**
 * Records DualSense presses from the live snapshot while open: each press becomes a step whose output is what that button
 * is mapped to now. Stops on Stop, after 60 s, or at 64 presses.
 */
export function RecordDialog({ open, onClose, onUse }: RecordDialogProps) {
  const [take, setTake] = useState(0);   // bumps on "Record again"
  const [recording, setRecording] = useState(true);
  const [presses, setPresses] = useState<Press[]>([]);
  const [count, setCount] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const stop = useRef<() => void>(() => {});
  const profile = useStore((s) => s.profile);

  useEffect(() => {
    if (!open) return;
    setRecording(true); setPresses([]); setCount(0); setSeconds(0);
    const first = useStore.getState().snapshot;
    let prev: Record<string, boolean> = { ...(first?.raw.buttons ?? {}) };   // already-held buttons are not presses
    let t0: number | null = first?.t ?? null, last = t0 ?? 0;
    const down = new Map<DsButton, number>();
    const done: Press[] = [];
    let live = true;
    const finish = () => {
      if (!live) return;
      live = false;
      for (const [button, start] of down) done.push({ button, start, end: last });
      setPresses([...done]); setRecording(false);
      off(); clearTimeout(timer); clearInterval(tick);
    };
    const onSnap = (s: EngineSnapshot | null) => {
      if (!s || !live) return;
      if (t0 === null) t0 = s.t;
      last = s.t;
      for (const b of DS_BUTTONS) {
        const on = !!s.raw.buttons[b], was = !!prev[b];
        if (on && !was) down.set(b, s.t);
        else if (!on && was && down.has(b)) { done.push({ button: b, start: down.get(b)!, end: s.t }); down.delete(b); }
      }
      prev = { ...s.raw.buttons };
      setCount(done.length);
      if (done.length >= MAX_STEPS || s.t - t0 >= RECORD_LIMIT_MS) finish();
    };
    const off = useStore.subscribe((st, before) => { if (st.snapshot !== before.snapshot) onSnap(st.snapshot); });
    const timer = setTimeout(finish, RECORD_LIMIT_MS);
    const tick = setInterval(() => setSeconds((v) => v + 1), 1000);
    stop.current = finish;
    return () => { live = false; off(); clearTimeout(timer); clearInterval(tick); };
  }, [open, take]);

  const steps = profile ? pressesToSteps(presses, (b) => recordTarget(profile, b)) : [];
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <Modal open={open} title="Record macro" onClose={onClose} width={520} className="rec-modal">
      {recording ? (
        <div className="rec-live" aria-live="polite">
          <span className="rec-dot" aria-hidden="true" />
          <div>
            <p className="rec-status">Recording <span className="rec-clock">{clock}</span> · <strong>{count} press{count === 1 ? '' : 'es'}</strong></p>
            <p className="modal-text">Press buttons on the controller. Each press becomes a step that sends what the button is mapped to now, with the timing you played. Stops after 60 s.</p>
          </div>
        </div>
      ) : (
        <div className="rec-result">
          <p className="modal-text">{steps.length === 0 ? 'No presses were recorded.' : `${steps.length} step${steps.length === 1 ? '' : 's'} recorded:`}</p>
          {steps.length > 0 && (
            <ol className="rec-steps">
              {steps.map((s, i) => (
                <li key={i}><span className="rec-target">{targetText(s.target, [])}</span><span className="rec-ms">{s.holdMs} ms{s.delayMs ? ` · wait ${s.delayMs} ms` : ''}</span></li>
              ))}
            </ol>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="panel-btn" onClick={onClose}>Cancel</button>
        {recording ? (
          <button type="button" className="panel-btn primary" onClick={() => stop.current()}>Stop</button>
        ) : (
          <>
            <button type="button" className="panel-btn" onClick={() => setTake((n) => n + 1)}>Record again</button>
            <button type="button" className="panel-btn primary" disabled={steps.length === 0} onClick={() => onUse(steps)}>
              Use {steps.length} step{steps.length === 1 ? '' : 's'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
