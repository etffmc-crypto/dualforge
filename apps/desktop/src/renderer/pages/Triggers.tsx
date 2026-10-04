import type { TriggerConfig } from '@dualforge/shared';
import { DualRangeSlider } from '../components/controls/DualRangeSlider';
import { RangeSlider } from '../components/controls/RangeSlider';
import { Segmented } from '../components/controls/Segmented';
import { PRESET_OPTIONS } from '../components/LiveCurve';
import { PanelSection, SettingsLayout, SideTabs } from '../components/SettingsLayout';
import { useStore } from '../store';
import { EffectSection } from './triggers/EffectSection';
import { TriggerStage } from './triggers/TriggerStage';

type HairMode = TriggerConfig['hairTrigger']['mode'];
const HAIR: { value: HairMode; label: string }[] = [
  { value: 'off', label: 'Off' }, { value: 'adaptive', label: 'Adaptive' }, { value: 'fixed', label: 'Fixed' },
];
const HAIR_DEFAULT_THRESHOLD = 30;
const MIN_TRAVEL = 0.05; // keeps the schema's `initial < max` true
const pct = (v: number) => `${Math.round(v * 100)}%`;

function HairTrigger({ cfg, edit }: { cfg: TriggerConfig; edit(fn: (t: TriggerConfig) => void): void }) {
  const ht = cfg.hairTrigger;
  return (
    <PanelSection title="Hair Trigger Mode">
      <Segmented
        label="Hair trigger mode" options={HAIR} value={ht.mode}
        onChange={(m) => edit((t) => { t.hairTrigger = m === 'adaptive' ? { mode: 'adaptive', value: HAIR_DEFAULT_THRESHOLD } : { mode: m }; })}
      />
      {ht.mode === 'fixed' && <p className="psec-hint">Any press past the initial deadzone counts as a full pull.</p>}
      {ht.mode === 'adaptive' && (
        <>
          <p className="psec-hint">Full pull once the trigger passes the threshold; it lets go 10% below it.</p>
          <RangeSlider
            ariaLabel="Hair trigger threshold" min={1} max={100} step={1} value={ht.value} format={(v) => `${v}%`}
            onChange={(v) => edit((t) => { t.hairTrigger = { mode: 'adaptive', value: v }; })}
          />
        </>
      )}
    </PanelSection>
  );
}

export function Triggers() {
  const side = useStore((s) => s.subTab.triggers);
  const cfg = useStore((s) => s.profile?.triggers[side] ?? null);
  const updateProfile = useStore((s) => s.updateProfile);
  if (!cfg) return null; // profile still loading
  const edit = (fn: (t: TriggerConfig) => void) => updateProfile((d) => fn(d.triggers[side]));
  const dz = cfg.deadzone;
  return (
    <SettingsLayout
      label="Trigger settings"
      panel={
        <>
          <SideTabs page="triggers" />
          <PanelSection title="Deadzone">
            <DualRangeSlider
              label="Deadzone" captions={['Initial', 'Max']} lo={dz.initial} hi={dz.max} minGap={MIN_TRAVEL}
              onChange={(initial, max) => edit((t) => { t.deadzone = { initial, max }; })}
            />
            <div className="psec-readout"><span>{pct(dz.initial)}</span><span>{pct(dz.max)}</span></div>
          </PanelSection>
          <HairTrigger cfg={cfg} edit={edit} />
          <PanelSection title="Response Curve">
            <Segmented label="Response curve" options={PRESET_OPTIONS} value={cfg.curve} onChange={(c) => edit((t) => { t.curve = c; })} />
          </PanelSection>
          <EffectSection cfg={cfg} edit={edit} />
        </>
      }
      stage={<TriggerStage side={side} cfg={cfg} />}
    />
  );
}
