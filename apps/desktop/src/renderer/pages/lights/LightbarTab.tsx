import type { Profile } from '@dualforge/shared';
import { HueSlider } from '../../components/controls/HueSlider';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { PanelSection } from '../../components/SettingsLayout';
import { hueOf, rgbOfHue } from '../overview/format';

export type Lights = Profile['lights'];
export type LightsEdit = (fn: (l: Lights) => void) => void;

const MODES: { value: Lights['mode']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'static', label: 'Static' },
  { value: 'breathing', label: 'Breathing' },
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'battery', label: 'Battery' },
];
const BRIGHTNESS: { value: '2' | '1' | '0'; label: string }[] = [
  { value: '2', label: 'Low' },
  { value: '1', label: 'Medium' },
  { value: '0', label: 'High' }, // DualSense: 0 is brightest
];
const COLOR_NOTE: Partial<Record<Lights['mode'], string>> = {
  off: 'The lightbar is dark.',
  rainbow: 'Rainbow cycles through every colour on its own.',
  battery: 'Green above 60%, orange above 20%, red below. It blinks while charging.',
};

/** Lightbar sub-tab (ss5 "Light Strip"): animation, colour, brightness and speed. */
export function LightbarTab({ lights, edit }: { lights: Lights; edit: LightsEdit }) {
  const usesColor = lights.mode === 'static' || lights.mode === 'breathing';
  const usesSpeed = lights.mode === 'breathing' || lights.mode === 'rainbow';
  const swatch = `rgb(${lights.r}, ${lights.g}, ${lights.b})`;
  return (
    <>
      <PanelSection title="Animations">
        <div className="lt-modes">
          <Segmented
            label="Light animation"
            options={MODES}
            value={lights.mode}
            onChange={(mode) =>
              edit((l) => {
                l.mode = mode;
              })
            }
          />
        </div>
      </PanelSection>
      <PanelSection title="Color">
        <div className={`lt-color${usesColor ? '' : ' disabled'}`}>
          <HueSlider
            ariaLabel="Light color"
            value={hueOf(lights)}
            disabled={!usesColor}
            onChange={(h) =>
              edit((l) => {
                Object.assign(l, rgbOfHue(h));
              })
            }
          />
          <span
            className="lt-swatch"
            style={{ background: swatch }}
            title={swatch}
            aria-hidden="true"
          />
        </div>
        {COLOR_NOTE[lights.mode] && <p className="psec-hint">{COLOR_NOTE[lights.mode]}</p>}
      </PanelSection>
      <PanelSection title="Brightness">
        <Segmented
          label="Light brightness"
          options={BRIGHTNESS}
          value={String(lights.brightness) as '0' | '1' | '2'}
          onChange={(v) =>
            edit((l) => {
              l.brightness = Number(v);
            })
          }
        />
      </PanelSection>
      <PanelSection title="Speed">
        <RangeSlider
          ariaLabel="Animation speed"
          min={0}
          max={100}
          step={1}
          value={lights.speed}
          format={(v) => `${v}%`}
          disabled={!usesSpeed}
          onChange={(v) =>
            edit((l) => {
              l.speed = v;
            })
          }
        />
        {!usesSpeed && <p className="psec-hint">Speed applies to Breathing and Rainbow.</p>}
      </PanelSection>
    </>
  );
}
