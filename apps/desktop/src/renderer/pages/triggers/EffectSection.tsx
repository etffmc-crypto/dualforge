import type { TriggerConfig, TriggerEffect } from '@dualforge/shared';
import { DualRangeSlider } from '../../components/controls/DualRangeSlider';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { PanelSection } from '../../components/SettingsLayout';

type Mode = TriggerEffect['mode'];
const MODES: { value: Mode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'resistance', label: 'Resistance' },
  { value: 'section', label: 'Section' },
  { value: 'vibration', label: 'Vibration' },
];
/** What each mode starts from when picked. */
export const EFFECT_DEFAULTS: Record<Mode, TriggerEffect> = {
  off: { mode: 'off' },
  resistance: { mode: 'resistance', start: 2, force: 6 },
  section: { mode: 'section', start: 2, end: 6, force: 8 },
  vibration: { mode: 'vibration', frequency: 20, force: 5 },
};
const HINTS: Record<Mode, string> = {
  off: 'The trigger moves freely.',
  resistance: 'Constant push-back from the start zone to full pull.',
  section: 'A stiff band between the start and end zones, like a gun trigger’s break point.',
  vibration: 'The trigger buzzes from the start zone onward.',
};
const int = (v: number) => `${v}`;

/** DualSense adaptive-trigger effect picker with per-mode integer parameters (zones 0–9, force 0–8, 1–255 Hz). */
export function EffectSection({
  cfg,
  edit,
}: {
  cfg: TriggerConfig;
  edit(fn: (t: TriggerConfig) => void): void;
}) {
  const fx = cfg.effect;
  const set = (patch: Partial<Record<'start' | 'end' | 'force' | 'frequency', number>>) =>
    edit((t) => {
      t.effect = { ...t.effect, ...patch } as TriggerEffect;
    });
  return (
    <PanelSection title="Adaptive Trigger Effect">
      <Segmented
        label="Adaptive trigger effect"
        options={MODES}
        value={fx.mode}
        onChange={(m) =>
          edit((t) => {
            t.effect = { ...EFFECT_DEFAULTS[m] };
          })
        }
      />
      <p className="psec-hint">{HINTS[fx.mode]}</p>
      {fx.mode === 'resistance' && (
        <RangeSlider
          label="Start zone"
          min={0}
          max={9}
          step={1}
          value={fx.start}
          format={int}
          onChange={(v) => set({ start: v })}
        />
      )}
      {fx.mode === 'section' && (
        <DualRangeSlider
          label="Section"
          captions={['Start', 'End']}
          min={0}
          max={9}
          step={1}
          minGap={1}
          lo={fx.start}
          hi={fx.end}
          onChange={(start, end) => set({ start, end })}
        />
      )}
      {fx.mode === 'section' && (
        <div className="psec-readout">
          <span>Zone {fx.start}</span>
          <span>Zone {fx.end}</span>
        </div>
      )}
      {fx.mode === 'vibration' && (
        <RangeSlider
          label="Frequency"
          min={1}
          max={255}
          step={1}
          value={fx.frequency}
          format={(v) => `${v} Hz`}
          onChange={(v) => set({ frequency: v })}
        />
      )}
      {fx.mode !== 'off' && (
        <RangeSlider
          label="Force"
          min={0}
          max={8}
          step={1}
          value={fx.force}
          format={int}
          onChange={(v) => set({ force: v })}
        />
      )}
    </PanelSection>
  );
}
