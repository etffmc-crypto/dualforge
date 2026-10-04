import { Segmented } from '../../components/controls/Segmented';
import { PanelSection } from '../../components/SettingsLayout';
import type { Lights, LightsEdit } from './LightbarTab';

const LEDS = [0, 1, 2, 3, 4];
const MIC: { value: '0' | '1' | '2'; label: string }[] = [{ value: '0', label: 'Off' }, { value: '1', label: 'On' }, { value: '2', label: 'Pulse' }];

/** Player LEDs sub-tab: the five lamps under the touchpad as switches laid out like the strip itself (left = bit 0). */
export function PlayerLedsTab({ lights, edit }: { lights: Lights; edit: LightsEdit }) {
  return (
    <PanelSection title="Player LEDs">
      <p className="psec-hint">Choose which of the five lamps under the touchpad are lit.</p>
      <div className="led-strip">
        {LEDS.map((i) => {
          const on = ((lights.playerLeds >> i) & 1) === 1;
          return (
            <button
              key={i} type="button" role="switch" aria-checked={on} aria-label={`Player LED ${i + 1}`}
              className={`led-switch${on ? ' on' : ''}${i === 2 ? ' centre' : ''}`}
              onClick={() => edit((l) => { l.playerLeds ^= 1 << i; })}
            >
              <span className="led-lamp" />
              <span className="led-n">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

/** Mic sub-tab: the orange LED on the mute button. */
export function MicTab({ lights, edit }: { lights: Lights; edit: LightsEdit }) {
  return (
    <PanelSection title="Mic LED">
      <Segmented label="Mic LED" options={MIC} value={String(lights.micLed) as '0' | '1' | '2'} onChange={(v) => edit((l) => { l.micLed = Number(v); })} />
      <p className="psec-hint">The light on the mute button. This only changes the light; the microphone itself is untouched.</p>
    </PanelSection>
  );
}
