import type { GyroConfig } from '@dualforge/shared';
import { GYRO_LSB_PER_DPS } from '@dualforge/engine/gyro';
import { DualSenseTop } from '../../art/DualSenseTop';
import { CurvePreview } from '../../components/controls/CurvePreview';
import { PRESET_LABELS, presetPreview } from '../../components/LiveCurve';
import { useStore } from '../../store';

/** The meter spans ±METER_DPS; the engine's stick output is at full deflection at 200 °/s × sensitivity 1. */
export const METER_DPS = 200;

const signed = (v: number) => { const r = Math.round(v); return r > 0 ? `+${r}` : String(r); };
const frac = (v: number) => Math.max(-1, Math.min(1, v / METER_DPS));

/** One centred bar: fill grows from the middle; the shaded band is the deadzone. */
function MeterBar({ id, label, dps, deadzone }: { id: string; label: string; dps: number; deadzone: number }) {
  const f = frac(dps);
  const band = Math.min(1, deadzone / METER_DPS) * 50;
  const live = Math.abs(dps) >= deadzone;
  return (
    <div className="gm-row">
      <span className="gm-label">{label}</span>
      <div className="gm-track" aria-hidden="true">
        <span className="gm-dz" style={{ left: `${50 - band}%`, width: `${band * 2}%` }} />
        <span className={`gm-fill${live ? '' : ' idle'}`} style={{ left: `${50 + Math.min(0, f) * 50}%`, width: `${Math.abs(f) * 50}%` }} />
        <span className="gm-mid" />
      </div>
      <span className="gm-value" data-testid={`meter-${id}`}>{`${signed(dps)} °/s`}</span>
    </div>
  );
}

/** Right-hand render area for Motion: curve square, live rotation meter (raw − bias) and the controller. */
export function MotionStage({ gyro }: { gyro: GyroConfig }) {
  const s = useStore((st) => st.snapshot);
  const lights = useStore((st) => st.profile?.lights);
  const g = s?.raw.gyro ?? { x: 0, y: 0, z: 0 };
  const yaw = (g.y - gyro.bias.y) / GYRO_LSB_PER_DPS;
  const pitch = (g.x - gyro.bias.x) / GYRO_LSB_PER_DPS;
  const off = gyro.output === 'off';
  return (
    <div className="stage">
      <div className="stage-top">
        <figure className="live-curve">
          <CurvePreview points={presetPreview(gyro.curve)} size={128} />
          <figcaption>{PRESET_LABELS[gyro.curve]} motion curve</figcaption>
        </figure>
        <div className="stage-bars gyro-meter" role="group" aria-label="Live rotation">
          <div className="gm-head"><span>Live rotation</span><span className="gm-scale">±{METER_DPS} °/s</span></div>
          <MeterBar id="yaw" label="Yaw" dps={yaw} deadzone={gyro.deadzoneDps} />
          <MeterBar id="pitch" label="Pitch" dps={pitch} deadzone={gyro.deadzoneDps} />
          <div className="stage-caption">
            {off
              ? 'Motion aim is off. The meter still shows the sensor, so you can check the calibration.'
              : 'Turn the controller left or right for yaw, tilt it up or down for pitch. Inside the shaded band nothing moves.'}
          </div>
        </div>
      </div>
      <div className="stage-pad">
        <DualSenseTop
          pressed={s?.raw.buttons ?? {}} lightbar={lights ?? { r: 0, g: 80, b: 255 }}
          sticks={s ? { lx: s.raw.lx, ly: s.raw.ly, rx: s.raw.rx, ry: s.raw.ry } : undefined} playerLeds={lights?.playerLeds ?? 0}
        />
      </div>
    </div>
  );
}
