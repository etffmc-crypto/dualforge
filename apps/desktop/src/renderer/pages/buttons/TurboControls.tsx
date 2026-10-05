import { useState } from 'react';
import {
  TURBO_MAX_HZ,
  TURBO_MIN_HZ,
  TURBO_PRESETS,
  turboApplies,
  type Mapping,
  type Turbo,
  type TurboMode,
} from '@dualforge/shared';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Segmented } from '../../components/controls/Segmented';
import { Toggle } from '../../components/controls/Toggle';
import { turboText } from './targets';
import '../../styles/turbo.css';

type Speed = keyof typeof TURBO_PRESETS | 'custom';
const MODES: { value: TurboMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'hold', label: 'Hold' },
  { value: 'toggle', label: 'Toggle' },
];
const SPEEDS: { value: Speed; label: string }[] = [
  { value: 'slow', label: `Slow ${TURBO_PRESETS.slow}` },
  { value: 'medium', label: `Medium ${TURBO_PRESETS.medium}` },
  { value: 'fast', label: `Fast ${TURBO_PRESETS.fast}` },
  { value: 'custom', label: 'Custom' },
];
const presetOf = (hz: number): Speed =>
  (Object.keys(TURBO_PRESETS) as (keyof typeof TURBO_PRESETS)[]).find(
    (k) => TURBO_PRESETS[k] === hz,
  ) ?? 'custom';

const MODE_HINT: Record<TurboMode, string> = {
  off: 'The button sends its output once per press.',
  hold: 'Fires repeatedly while you hold the button.',
  toggle: 'One press starts auto-fire, the next press stops it.',
};

export interface TurboControlsProps {
  mapping: Mapping;
  /** Mutates the mapping in a profile draft (the caller wraps updateProfile). */
  edit(fn: (m: Mapping) => void): void;
  /** Also show the Continuous trigger switch (the Turbo page; the mapping modal has its own). */
  withContinuous?: boolean;
}

/** Turbo mode + speed for one mapping; shared by the Turbo page and the mapping modal so both always agree. */
export function TurboControls({ mapping, edit, withContinuous = false }: TurboControlsProps) {
  const t = mapping.turbo;
  const applies = turboApplies(mapping);
  // "Custom" stays picked (slider shown) even when the slider lands on a preset value
  const [custom, setCustom] = useState(() => presetOf(t.hz) === 'custom');
  const speed: Speed = custom ? 'custom' : presetOf(t.hz);
  const set = (next: Partial<Turbo>) =>
    applies &&
    edit((m) => {
      m.turbo = { ...m.turbo, ...next };
    });
  const pickSpeed = (s: Speed) => {
    setCustom(s === 'custom');
    // choosing a speed while turbo is off means "turn it on at this speed"
    const mode = t.mode === 'off' ? 'hold' : t.mode;
    if (s !== 'custom') set({ mode, hz: TURBO_PRESETS[s] });
    else if (t.mode === 'off') set({ mode });
  };
  return (
    <div className={`turbo-ctl${t.mode === 'off' ? ' is-off' : ''}`}>
      <div className="turbo-head">
        <span>Turbo</span>
        <span className="turbo-value">{turboText(t)}</span>
      </div>
      {/* turbo never re-triggers a macro, so a macro-only button has nothing for it to repeat */}
      <fieldset className="turbo-fields" disabled={!applies}>
        <Segmented
          label="Turbo mode"
          options={MODES}
          value={t.mode}
          onChange={(mode) => set({ mode })}
        />
        <p className="turbo-hint">
          {applies ? MODE_HINT[t.mode] : 'Macros run on their own timing, so turbo does not apply.'}
        </p>
        <div className="turbo-speed">
          <Segmented label="Turbo speed" options={SPEEDS} value={speed} onChange={pickSpeed} />
          {speed === 'custom' && (
            <RangeSlider
              ariaLabel="Turbo speed (Hz)"
              min={TURBO_MIN_HZ}
              max={TURBO_MAX_HZ}
              step={1}
              value={t.hz}
              format={(v) => `${v} Hz`}
              onChange={(hz) => set({ hz })}
            />
          )}
        </div>
      </fieldset>
      {withContinuous && (
        <Toggle
          label="Continuous trigger"
          hint="One press holds the output until the next press."
          checked={mapping.continuous}
          onChange={(v) =>
            edit((m) => {
              m.continuous = v;
            })
          }
        />
      )}
    </div>
  );
}
