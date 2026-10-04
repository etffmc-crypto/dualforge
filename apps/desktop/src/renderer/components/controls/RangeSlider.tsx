import type { CSSProperties } from 'react';

export interface RangeSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange(v: number): void;
  format?(v: number): string;
  label?: string;
  /** accessible name when there is no visible label (e.g. the section heading names it) */
  ariaLabel?: string;
  disabled?: boolean;
}

/** Single-handle slider: red fill from the left, 14px red handle with a dark ring. */
export function RangeSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  label,
  ariaLabel,
  disabled = false,
}: RangeSliderProps) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className={`rs${disabled ? ' disabled' : ''}`}>
      {label && <span className="rs-label">{label}</span>}
      <div className="rs-row">
        <input
          data-nav
          type="range"
          className="slider"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label ?? ariaLabel}
          disabled={disabled}
          style={{ '--fill': `calc(7px + (100% - 14px) * ${pct / 100})` } as CSSProperties}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
        {format && <span className="rs-value">{format(value)}</span>}
      </div>
    </div>
  );
}
