import type { CSSProperties } from 'react';

export interface HueSliderProps {
  /** degrees, 0–359 */
  value: number;
  onChange(hue: number): void;
  ariaLabel?: string;
  disabled?: boolean;
}

/** Rainbow-track slider for picking a lightbar hue (GameSir "Color"). */
export function HueSlider({
  value,
  onChange,
  ariaLabel = 'Colour',
  disabled = false,
}: HueSliderProps) {
  return (
    <input
      data-nav
      type="range"
      className="slider hue-slider"
      min={0}
      max={359}
      step={1}
      value={Math.round(value)}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{ '--hue': `hsl(${Math.round(value)} 100% 50%)` } as CSSProperties}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  );
}
