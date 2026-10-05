import { CurveEditor } from '../../components/controls/CurveEditor';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { Toggle } from '../../components/controls/Toggle';
import { PanelSection } from '../../components/SettingsLayout';
import { hasNegative, jitterRateReadout, strengthReadout } from './smoothing';
import type { StickSectionProps } from './useStick';

const MODES = [
  { value: 'basic', label: 'Basic' },
  { value: 'advanced', label: 'Advanced' },
] as const;

/**
 * RC smoothing: one strength (Basic) or strength by stick speed (Advanced, 5 points). Both run -100..100:
 * above 0 smooths, below 0 adds a small oscillation while the stick moves (negative smoothing / jitter),
 * with a jitter rate control and a risk notice.
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
            <>
              <RangeSlider
                label="Jitter rate"
                min={10}
                max={60}
                step={1}
                value={f.jitterHz}
                format={jitterRateReadout}
                onChange={(v) =>
                  edit((c) => {
                    c.filter.jitterHz = v;
                  })
                }
              />
              <p className="psec-hint">
                37 Hz avoids lining up with 60/120 fps polling; raise it if the wobble is visible on
                screen, lower it if aim assist doesn&rsquo;t engage.
              </p>
              <div className="smooth-risk" role="note" aria-labelledby={`smooth-risk-${side}`}>
                <p className="smooth-risk-title" id={`smooth-risk-${side}`}>
                  Negative smoothing
                </p>
                <p className="psec-hint">
                  Negative smoothing adds a small oscillation to your aim input while the stick is
                  moving (the HyperStrike &lsquo;RC filter&rsquo; jitter technique) to keep aim
                  assist engaged. Apex Legends treats it as a bannable exploit; Call of Duty has not
                  published a policy. Use at your own risk.
                </p>
                <p className="psec-hint">
                  Keep a center deadzone of at least 2–3 % so the stick reads exactly zero at rest;
                  sensor noise that gets past the deadzone counts as movement and starts the wobble.
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
            </>
          )}
        </>
      )}
    </PanelSection>
  );
}
