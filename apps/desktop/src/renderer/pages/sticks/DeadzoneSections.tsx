import { DualRangeSlider } from '../../components/controls/DualRangeSlider';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { PanelSection } from '../../components/SettingsLayout';
import { pct, tidy, type StickSectionProps } from './useStick';

/** Gap between the inner deadzone and the outer edge; keeps the schema's `center < 1 - outer` true. */
const MIN_LIVE_RANGE = 0.05;

export function DeadzoneSections({ cfg, edit }: Omit<StickSectionProps, 'side'>) {
  const dz = cfg.deadzone;
  return (
    <>
      <PanelSection title="Deadzone">
        <DualRangeSlider
          label="Deadzone"
          captions={['Initial', 'Max']}
          lo={dz.center}
          hi={tidy(1 - dz.outer)}
          minGap={MIN_LIVE_RANGE}
          onChange={(lo, hi) =>
            edit((c) => {
              c.deadzone.center = lo;
              c.deadzone.outer = tidy(1 - hi);
            })
          }
        />
        <div className="psec-readout">
          <span>{pct(dz.center)}</span>
          <span>{pct(1 - dz.outer)}</span>
        </div>
      </PanelSection>
      <PanelSection title="Anti-Deadzone">
        <RangeSlider
          ariaLabel="Anti-Deadzone"
          min={0}
          max={0.5}
          step={0.01}
          value={dz.anti}
          format={pct}
          onChange={(v) =>
            edit((c) => {
              c.deadzone.anti = v;
            })
          }
        />
      </PanelSection>
    </>
  );
}
