import type { GyroConfig } from '@dualforge/shared';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { Toggle } from '../../components/controls/Toggle';
import { PRESET_OPTIONS } from '../../components/LiveCurve';
import { PanelSection } from '../../components/SettingsLayout';
import type { GyroEdit } from './MotionRows';

export const SENS_MIN = 0.1;
export const SENS_MAX = 10;
const tidy = (v: number) => Math.round(v * 100) / 100;
export const times = (v: number) => `${v.toFixed(2)}×`;

/** Deadzone, curve, X/Y sensitivity and invert: everything that shapes how rotation becomes aim. */
export function MotionSections({ gyro, edit }: { gyro: GyroConfig; edit: GyroEdit }) {
  return (
    <>
      <PanelSection title="Deadzone">
        <RangeSlider
          ariaLabel="Gyro deadzone" min={0} max={50} step={0.5} value={gyro.deadzoneDps} format={(v) => `${v} °/s`}
          onChange={(v) => edit((g) => { g.deadzoneDps = v; })}
        />
        <p className="psec-hint">Turns slower than this are ignored, so a resting hand doesn't drift the aim.</p>
      </PanelSection>
      <PanelSection title="Curve Adjustment">
        <Segmented label="Motion curve" options={PRESET_OPTIONS} value={gyro.curve} onChange={(c) => edit((g) => { g.curve = c; })} />
      </PanelSection>
      <PanelSection title="X/Y Sensitivity Scale">
        <div className="msens">
          <span className="rs-label">Horizontal</span>
          <RangeSlider
            ariaLabel="Horizontal sensitivity" min={SENS_MIN} max={SENS_MAX} step={0.05} value={gyro.sensitivityX} format={times}
            onChange={(v) => edit((g) => { g.sensitivityX = tidy(v); })}
          />
          <span className="rs-label">Vertical</span>
          <RangeSlider
            ariaLabel="Vertical sensitivity" min={SENS_MIN} max={SENS_MAX} step={0.05} value={gyro.sensitivityY} format={times}
            onChange={(v) => edit((g) => { g.sensitivityY = tidy(v); })}
          />
        </div>
      </PanelSection>
      <div className="psec-toggles">
        <Toggle label="Invert X" checked={gyro.invertX} onChange={(v) => edit((g) => { g.invertX = v; })} />
        <Toggle label="Invert Y" checked={gyro.invertY} onChange={(v) => edit((g) => { g.invertY = v; })} />
      </div>
    </>
  );
}
