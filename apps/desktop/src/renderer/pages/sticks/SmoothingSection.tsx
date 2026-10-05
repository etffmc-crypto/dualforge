import { CurveEditor } from '../../components/controls/CurveEditor';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { Toggle } from '../../components/controls/Toggle';
import { PanelSection } from '../../components/SettingsLayout';
import { hasNegative, strengthReadout } from './smoothing';
import type { StickSectionProps } from './useStick';

const MODES = [
  { value: 'basic', label: 'Basic' },
  { value: 'advanced', label: 'Advanced' },
] as const;

/**
 * RC smoothing: one strength (Basic) or strength by stick speed (Advanced, 5 points). Both run -100..100:
 * above 0 smooths, below 0 overshoots each change (negative smoothing / jitter), with a risk notice.
 */
export function SmoothingSection({ side, cfg, edit }: StickSectionProps) {
  const f = cfg.filter;
  return (
    <PanelSection title="Smoothing (RC)">
      <Toggle
        label="Enable smoothing"
        checked={f.enabled}
        onChange={(v) =>
          edit((c) => {
            c.filter.enabled = v;
          })
        }
      />
      {f.enabled && (
        <>
          <Segmented
            label="Smoothing mode"
            options={[...MODES]}
            value={f.mode}
            onChange={(v) =>
              edit((c) => {
                c.filter.mode = v;
              })
            }
          />
          {f.mode === 'basic' ? (
            <RangeSlider
              ariaLabel="Smoothing strength"
              min={-100}
              max={100}
              step={1}
              fillFrom={0}
              detent={2}
              ends={['Negative (jitter)', 'Smoothing']}
              value={f.strength}
              format={strengthReadout}
              onChange={(v) =>
                edit((c) => {
                  c.filter.strength = v;
                })
              }
            />
          ) : (
            <>
              <p className="psec-hint">
                Stick speed (in) → smoothing strength (out). Smooth slow aim, keep fast flicks
                sharp. Points below the dashed zero line add jitter instead.
              </p>
              <CurveEditor
                key={side}
                size={248}
                yMin={-100}
                yMax={100}
                pointCount={5}
                points={f.curve}
                onChange={(curve) =>
                  edit((c) => {
                    c.filter.curve = curve;
                  })
                }
              />
            </>
          )}
          {hasNegative(f) && (
            <div className="smooth-risk" role="note" aria-labelledby={`smooth-risk-${side}`}>
              <p className="smooth-risk-title" id={`smooth-risk-${side}`}>
                Negative smoothing
              </p>
              <p className="psec-hint">
                Negative smoothing adds micro-jitter to keep aim assist engaged (the HyperStrike
                &lsquo;RC filter&rsquo; technique). Apex Legends treats it as a bannable exploit;
                Call of Duty has not published a policy. Use at your own risk.
              </p>
              <p className="psec-hint">
                Keep a center deadzone of at least 2–3 % so the stick reads exactly zero at rest; at
                −100 the filter amplifies sensor noise up to ~39×.
              </p>
              <button
                data-nav
                type="button"
                className="panel-btn"
                onClick={() =>
                  edit((c) => {
                    if (c.filter.mode === 'basic') c.filter.strength = 0;
                    else c.filter.curve = c.filter.curve.map(([x, y]) => [x, Math.max(0, y)]);
                  })
                }
              >
                {f.mode === 'basic' ? 'Set to Off' : 'Remove jitter'}
              </button>
            </div>
          )}
        </>
      )}
    </PanelSection>
  );
}
