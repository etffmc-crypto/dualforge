import { useEffect, useRef, useState } from 'react';
import type { GyroConfig } from '@dualforge/shared';
import { useStore } from '../../store';

/** How long the controller has to sit still while raw gyro samples are averaged. */
export const CALIBRATE_MS = 2000;
const TICK_MS = 50;

export type Bias = GyroConfig['bias'];
export type CalibrationState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: number }
  | { phase: 'done' }
  | { phase: 'error'; msg: string };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Averages `snapshot.raw.gyro` (raw int16 LSB) over CALIBRATE_MS of connected snapshots and hands the mean to `onDone`.
 * A capture that saw no connected snapshot ends in an error instead.
 */
export function useGyroCalibration(onDone: (bias: Bias) => void) {
  const [state, setState] = useState<CalibrationState>({ phase: 'idle' });
  const done = useRef(onDone);
  done.current = onDone;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = () => {
    stop.current?.();
    const sum = { x: 0, y: 0, z: 0 };
    let n = 0;
    const unsub = useStore.subscribe((s, prev) => {
      const snap = s.snapshot;
      if (snap === prev.snapshot || !snap?.connected) return;
      sum.x += snap.raw.gyro.x;
      sum.y += snap.raw.gyro.y;
      sum.z += snap.raw.gyro.z;
      n++;
    });
    const t0 = Date.now();
    const tick = setInterval(
      () => setState({ phase: 'running', progress: Math.min(1, (Date.now() - t0) / CALIBRATE_MS) }),
      TICK_MS,
    );
    const finish = setTimeout(() => {
      end();
      if (n === 0) {
        setState({
          phase: 'error',
          msg: 'No motion data came in. Connect the controller and try again.',
        });
        return;
      }
      done.current({ x: r3(sum.x / n), y: r3(sum.y / n), z: r3(sum.z / n) });
      setState({ phase: 'done' });
    }, CALIBRATE_MS);
    const end = () => {
      unsub();
      clearInterval(tick);
      clearTimeout(finish);
      stop.current = null;
    };
    stop.current = end;
    setState({ phase: 'running', progress: 0 });
  };

  return { state, start };
}
