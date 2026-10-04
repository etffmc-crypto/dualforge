import type { GyroConfig } from '@dualforge/shared';
import { GYRO_LSB_PER_DPS } from '@dualforge/engine/gyro';
import { PanelSection } from '../../components/SettingsLayout';
import { useStore } from '../../store';
import { CALIBRATE_MS, useGyroCalibration } from './useGyroCalibration';

const dps = (lsb: number) => (lsb / GYRO_LSB_PER_DPS).toFixed(2);

/** Inline gyro calibration: a short still capture whose average becomes the bias, saved straight away. */
export function CalibrateSection({ bias }: { bias: GyroConfig['bias'] }) {
  const updateProfile = useStore((s) => s.updateProfile);
  const flushProfile = useStore((s) => s.flushProfile);
  const { state, start } = useGyroCalibration((b) => {
    if (updateProfile((d) => { d.gyro.bias = b; })) flushProfile();
  });
  const running = state.phase === 'running';
  return (
    <PanelSection title="Calibration">
      <p className="psec-hint">
        Lay the controller flat and keep it still for {CALIBRATE_MS / 1000} seconds. The resting drift it measures is subtracted from every motion reading.
      </p>
      {running ? (
        <div className="mcal-run">
          <div className="cal-meter" role="progressbar" aria-label="Calibrating" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}>
            <div style={{ width: `${state.progress * 100}%` }} />
          </div>
          <span className="psec-hint">Keep still…</span>
        </div>
      ) : (
        <button type="button" className="panel-btn" onClick={start}>Calibrate</button>
      )}
      {state.phase === 'error' && <p className="mcal-error" role="alert">{state.msg}</p>}
      <div className="psec-readout mcal-bias" aria-label="Current drift correction">
        <span>{state.phase === 'done' ? 'Calibrated · drift' : 'Drift correction'}</span>
        <span>{`${dps(bias.x)} / ${dps(bias.y)} / ${dps(bias.z)} °/s`}</span>
      </div>
    </PanelSection>
  );
}
