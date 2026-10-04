import { CurveEditor } from '../../components/controls/CurveEditor';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { Toggle } from '../../components/controls/Toggle';
import { PanelSection } from '../../components/SettingsLayout';
import type { StickSectionProps } from './useStick';

const MODES = [{ value: 'basic', label: 'Basic' }, { value: 'advanced', label: 'Advanced' }] as const;

/** RC smoothing: one strength (Basic) or strength by stick speed (Advanced, 5 points, y in 0..100). */
export function SmoothingSection({ side, cfg, edit }: StickSectionProps) {
  const f = cfg.filter;
  return (
    <PanelSection title="Smoothing (RC)">
      <Toggle label="Enable smoothing" checked={f.enabled} onChange={(v) => edit((c) => { c.filter.enabled = v; })} />
      {f.enabled && (
        <>
          <Segmented label="Smoothing mode" options={[...MODES]} value={f.mode} onChange={(v) => edit((c) => { c.filter.mode = v; })} />
          {f.mode === 'basic' ? (
            <RangeSlider
              ariaLabel="Smoothing strength" min={0} max={100} step={1} value={f.strength} format={(v) => `${v}`}
              onChange={(v) => edit((c) => { c.filter.strength = v; })}
            />
          ) : (
            <>
              <p className="psec-hint">Stick speed (in) → smoothing strength (out). Smooth slow aim, keep fast flicks sharp.</p>
              <CurveEditor
                key={side} size={248} yMax={100} pointCount={5} points={f.curve}
                onChange={(curve) => edit((c) => { c.filter.curve = curve; })}
              />
            </>
          )}
        </>
      )}
    </PanelSection>
  );
}
