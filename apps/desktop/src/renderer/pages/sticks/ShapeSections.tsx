import type { ReactNode } from 'react';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { Toggle } from '../../components/controls/Toggle';
import { PanelSection } from '../../components/SettingsLayout';
import { signed, type StickSectionProps } from './useStick';

const TRAJECTORY = [{ value: 'raw', label: 'Raw' }, { value: 'circle', label: 'Circle' }] as const;
const OFFSET = 0.1;

/** Trajectory, invert toggles and the manual centre offset (`extra` slots the Calibrate button in). */
export function ShapeSections({ cfg, edit, extra }: Omit<StickSectionProps, 'side'> & { extra?: ReactNode }) {
  return (
    <>
      <PanelSection title="Stick Trajectory">
        <Segmented
          label="Stick trajectory" options={[...TRAJECTORY]} value={cfg.circular ? 'circle' : 'raw'}
          onChange={(v) => edit((c) => { c.circular = v === 'circle'; })}
        />
      </PanelSection>
      <div className="psec-toggles">
        <Toggle label="Invert X" checked={cfg.invertX} onChange={(v) => edit((c) => { c.invertX = v; })} />
        <Toggle label="Invert Y" checked={cfg.invertY} onChange={(v) => edit((c) => { c.invertY = v; })} />
      </div>
      <PanelSection title="Center Offset">
        {(['cx', 'cy'] as const).map((k) => (
          <div className="offset-row" key={k}>
            <span className="offset-axis" aria-hidden="true">{k === 'cx' ? 'X' : 'Y'}</span>
            <RangeSlider
              ariaLabel={`Center offset ${k === 'cx' ? 'X' : 'Y'}`} min={-OFFSET} max={OFFSET} step={0.005}
              value={cfg.calibration[k]} format={signed} onChange={(v) => edit((c) => { c.calibration[k] = v; })}
            />
          </div>
        ))}
        {extra}
      </PanelSection>
    </>
  );
}
