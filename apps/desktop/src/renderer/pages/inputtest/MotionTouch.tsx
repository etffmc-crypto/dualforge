import type { EngineSnapshot } from '@dualforge/shared';
import { GYRO_LSB_PER_DPS } from '@dualforge/engine/gyro';

/** ± range of the gyro bars in °/s. */
export const GYRO_RANGE_DPS = 500;
const TOUCH_W = 1920,
  TOUCH_H = 1080;
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtDps = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} °/s`;

function GyroBar({ label, raw }: { label: string; raw: number }) {
  const dps = Math.round(raw / GYRO_LSB_PER_DPS);
  const v = Math.max(-GYRO_RANGE_DPS, Math.min(GYRO_RANGE_DPS, dps));
  const half = Math.abs(v) / GYRO_RANGE_DPS / 2; // share of the full track, drawn from the centre line
  return (
    <div className="it-gyro-row">
      <span className="it-gyro-label">{label}</span>
      <div
        className="it-gyro-track"
        role="meter"
        aria-label={label}
        aria-valuemin={-GYRO_RANGE_DPS}
        aria-valuemax={GYRO_RANGE_DPS}
        aria-valuenow={v}
        aria-valuetext={fmtDps(dps)}
      >
        <div
          className="it-gyro-fill"
          style={{ left: pct(v < 0 ? 0.5 - half : 0.5), width: pct(half) }}
        />
        <div className="it-gyro-mid" />
      </div>
      <span className="it-gyro-value">{fmtDps(dps)}</span>
    </div>
  );
}

/** Raw angular rate per axis (no drift correction): yaw = turn left/right, pitch = tilt up/down, roll = twist. */
export function GyroBars({ gyro }: { gyro: EngineSnapshot['raw']['gyro'] }) {
  return (
    <div className="it-gyro">
      <GyroBar label="Yaw" raw={gyro.y} />
      <GyroBar label="Pitch" raw={gyro.x} />
      <GyroBar label="Roll" raw={gyro.z} />
      <div className="it-caption">
        Raw rate, ±{GYRO_RANGE_DPS} °/s. A still controller shows only its small drift.
      </div>
    </div>
  );
}

/** The touchpad at its true 16:9 shape with a numbered dot per finger. */
export function Touchpad({
  touch,
  pressed,
}: {
  touch: EngineSnapshot['raw']['touch'];
  pressed: boolean;
}) {
  // two live fingers always carry different tracking ids; a repeated id is a blank (all-zero) report slot
  const down = touch.filter(
    (t, i) => t.active && touch.findIndex((o) => o.active && o.id === t.id) === i,
  );
  return (
    <div className="it-touch-wrap">
      <div className={`it-touch${pressed ? ' pressed' : ''}`} aria-label="Touchpad" role="img">
        {down.map((t) => (
          <span
            key={t.id}
            className="it-finger"
            style={{ left: pct(t.x / TOUCH_W), top: pct(t.y / TOUCH_H) }}
          >
            {t.id}
          </span>
        ))}
      </div>
      <div className="it-caption">
        {down.length === 0 ? 'No fingers' : `${down.length} finger${down.length > 1 ? 's' : ''}`}
        {pressed ? ' · clicked' : ''}
      </div>
    </div>
  );
}
