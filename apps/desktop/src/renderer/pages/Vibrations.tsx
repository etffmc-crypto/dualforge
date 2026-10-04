import { useEffect, useRef, useState } from 'react';
import { DualSenseTop } from '../art/DualSenseTop';
import { RangeSlider } from '../components/controls/RangeSlider';
import { Toggle } from '../components/controls/Toggle';
import { PanelSection, SettingsLayout } from '../components/SettingsLayout';
import { useStore, type Side } from '../store';
import { MotorWaves } from './vibrations/MotorWaves';
import '../styles/vibrations.css';

/** How long a Test press plays its motor. */
export const TEST_MS = 500;

const MOTORS: { side: Side; title: string; hint: string }[] = [
  { side: 'left', title: 'Left Motor', hint: 'The large motor: a heavy, low rumble for impacts and engines.' },
  { side: 'right', title: 'Right Motor', hint: 'The small motor: a light, fast buzz for footsteps and gunfire.' },
];

/** Vibrations page: the rumble-motors switch (a per-controller setting) and per-motor strength with a Test pulse. */
export function Vibrations() {
  const vibration = useStore((s) => s.profile?.vibration ?? null);
  const hasRumble = useStore((s) => s.settings?.hasRumble ?? false);
  const updateProfile = useStore((s) => s.updateProfile);
  const updateSettings = useStore((s) => s.updateSettings);
  const s = useStore((st) => st.snapshot);
  const lights = useStore((st) => st.profile?.lights);
  const [playing, setPlaying] = useState<Side | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!vibration) return null; // profile still loading

  const test = (side: Side) => {
    const level = vibration[side] / 100;
    window.dualforge.engine.testRumble({ left: side === 'left' ? level : 0, right: side === 'right' ? level : 0, ms: TEST_MS })
      .catch((err: unknown) => useStore.setState({ lastError: { code: 'E_RUMBLE_TEST', msg: String(err) } }));
    setPlaying(side);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(null), TEST_MS);
  };

  return (
    <SettingsLayout
      label="Vibration settings"
      panel={
        <>
          <Toggle
            label="This controller has rumble motors" checked={hasRumble} onChange={(v) => { void updateSettings({ hasRumble: v }); }}
            hint="Turn this off for a controller without motors; games then can't ask it to rumble."
          />
          {!hasRumble && <p className="vib-note">Rumble is off for this controller. Turn it on above to set how strong each motor feels.</p>}
          {MOTORS.map(({ side, title, hint }) => (
            <PanelSection key={side} title={title}>
              <p className="psec-hint">{hint}</p>
              <div className="vib-row">
                <RangeSlider
                  ariaLabel={`${side === 'left' ? 'Left' : 'Right'} motor strength`} min={0} max={100} step={1} value={vibration[side]}
                  format={(v) => `${v}%`} disabled={!hasRumble}
                  onChange={(v) => updateProfile((d) => { d.vibration[side] = v; })}
                />
                <button data-nav
                  type="button" className="panel-btn" disabled={!hasRumble || vibration[side] === 0}
                  aria-label={`Test ${side} motor`} title={`Play the ${side} motor for half a second`} onClick={() => test(side)}
                >
                  Test
                </button>
              </div>
            </PanelSection>
          ))}
        </>
      }
      stage={
        <div className="stage">
          <div className="vib-motors">
            {MOTORS.map(({ side }) => (
              <MotorWaves key={side} side={side} strength={vibration[side]} playing={playing === side} muted={!hasRumble} />
            ))}
          </div>
          <div className="stage-pad">
            <DualSenseTop
              pressed={s?.raw.buttons ?? {}} lightbar={lights ?? { r: 0, g: 80, b: 255 }}
              sticks={s ? { lx: s.raw.lx, ly: s.raw.ly, rx: s.raw.rx, ry: s.raw.ry } : undefined} playerLeds={lights?.playerLeds ?? 0}
            />
          </div>
        </div>
      }
    />
  );
}
