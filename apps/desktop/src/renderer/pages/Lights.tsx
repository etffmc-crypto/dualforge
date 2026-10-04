import { useState } from 'react';
import { DualSenseTop } from '../art/DualSenseTop';
import { SubTabs } from '../components/controls/SubTabs';
import { SettingsLayout } from '../components/SettingsLayout';
import { useShoulderNav } from '../hooks/useGamepadNav';
import { useStore } from '../store';
import { MicTab, PlayerLedsTab } from './lights/LedTabs';
import { LightbarTab, type Lights as LightsCfg, type LightsEdit } from './lights/LightbarTab';
import { useLightPreview } from './lights/useLightPreview';
import '../styles/lights.css';

type Tab = 'lightbar' | 'leds' | 'mic';
const TABS: { value: Tab; label: string }[] = [
  { value: 'lightbar', label: 'Lightbar' }, { value: 'leds', label: 'Player LEDs' }, { value: 'mic', label: 'Mic' },
];

/** The pad render with the lightbar previewed live (same animation as the controller) and the LED bitmask. */
function LightsStage({ lights }: { lights: LightsCfg }) {
  const s = useStore((st) => st.snapshot);
  const lightbar = useLightPreview(lights);
  return (
    <div className="stage">
      <div className="stage-pad lt-pad">
        <DualSenseTop
          pressed={s?.raw.buttons ?? {}} lightbar={lightbar}
          sticks={s ? { lx: s.raw.lx, ly: s.raw.ly, rx: s.raw.rx, ry: s.raw.ry } : undefined} playerLeds={lights.playerLeds}
        />
      </div>
    </div>
  );
}

/** Lights page (GameSir ss5): Lightbar · Player LEDs · Mic sub-tabs; LT / RT on the pad step between them. */
export function Lights() {
  const lights = useStore((s) => s.profile?.lights ?? null);
  const updateProfile = useStore((s) => s.updateProfile);
  const [tab, setTab] = useState<Tab>('lightbar');
  const step = (d: number) => setTab((t) => TABS[Math.max(0, Math.min(TABS.length - 1, TABS.findIndex((x) => x.value === t) + d))]!.value);
  useShoulderNav(() => step(-1), () => step(1));
  if (!lights) return null; // profile still loading
  const edit: LightsEdit = (fn) => { updateProfile((d) => fn(d.lights)); };
  return (
    <SettingsLayout
      label="Light settings"
      panel={
        <>
          <SubTabs<Tab> tabs={TABS} value={tab} onChange={(t) => setTab(t)} pills={['LT', 'RT']} />
          {tab === 'lightbar' && <LightbarTab lights={lights} edit={edit} />}
          {tab === 'leds' && <PlayerLedsTab lights={lights} edit={edit} />}
          {tab === 'mic' && <MicTab lights={lights} edit={edit} />}
        </>
      }
      stage={<LightsStage lights={lights} />}
    />
  );
}
