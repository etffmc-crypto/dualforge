import { useRef, useState } from 'react';
import { CURVE_PRESETS } from '@dualforge/shared';
import { presetPoints } from '@dualforge/engine/curve';
import { CurveEditor, type CurvePoints } from '../../components/controls/CurveEditor';
import { Segmented } from '../../components/controls/Segmented';
import { PanelSection } from '../../components/SettingsLayout';
import type { Side } from '../../store';
import type { StickSectionProps } from './useStick';

type Preset = (typeof CURVE_PRESETS)[number];
type Choice = Preset | 'custom';

export const PRESET_LABELS: Record<Preset, string> = { linear: 'Linear', aggressive: 'Aggressive', precise: 'Precise', scurve: 'S-Curve' };
const OPTIONS: { value: Choice; label: string }[] = [
  ...CURVE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] })),
  { value: 'custom', label: 'Custom' },
];

const copy = (pts: readonly (readonly [number, number])[]): CurvePoints => pts.map(([x, y]) => [x, y]);

/**
 * Preset picker plus the 8-point editor for Custom. Leaving Custom stashes its points here (the profile keeps only
 * the preset); coming straight back restores them, otherwise Custom is seeded from the preset it starts from.
 */
export function CurveSection({ side, cfg, edit }: StickSectionProps) {
  const stash = useRef<Partial<Record<Side, { points: CurvePoints; leftTo: Preset }>>>({});
  const [epoch, setEpoch] = useState(0); // remounts the editor so its draft inputs never outlive a preset switch
  const curve = cfg.curve;
  const value: Choice = curve.kind === 'custom' ? 'custom' : curve.preset;

  const choose = (next: Choice) => {
    if (next === value) return;
    setEpoch((e) => e + 1);
    if (next === 'custom') {
      const from = curve.kind === 'preset' ? curve.preset : 'linear';
      const kept = stash.current[side];
      const points = kept && kept.leftTo === from ? kept.points : copy(presetPoints(from));
      edit((c) => { c.curve = { kind: 'custom', points: copy(points) }; });
    } else {
      if (curve.kind === 'custom') stash.current[side] = { points: copy(curve.points), leftTo: next };
      edit((c) => { c.curve = { kind: 'preset', preset: next }; });
    }
  };

  return (
    <PanelSection title="Curve Adjustment">
      <Segmented label="Response curve" options={OPTIONS} value={value} onChange={choose} />
      {curve.kind === 'custom' && (
        <CurveEditor
          key={`${side}-${epoch}`} size={248} points={curve.points}
          onChange={(points) => edit((c) => { c.curve = { kind: 'custom', points }; })}
        />
      )}
    </PanelSection>
  );
}
