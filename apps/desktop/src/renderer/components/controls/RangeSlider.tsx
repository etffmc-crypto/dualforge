import { useRef, type CSSProperties } from 'react';

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
  /** bipolar slider: fill runs from this value to the handle, and a tick marks it */
  fillFrom?: number;
  /** with fillFrom: while dragging with a pointer, values within this distance of it snap onto it (a centre detent) */
  detent?: number;
  /** captions under the two ends of the track: [min side, max side] */
  ends?: [string, string];
}

const at = (frac: number) => `calc(7px + (100% - 14px) * ${frac})`;

/** Single-handle slider: red fill from the left (or from `fillFrom`), 14px red handle with a dark ring. */
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
  fillFrom,
  detent = 0,
  ends,
}: RangeSliderProps) {
  const dragging = useRef(false);
  const frac = (v: number) =>
    max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) / 100 : 0;
  const pct = frac(value);
  const origin = fillFrom === undefined ? undefined : frac(fillFrom);
  const vars: Record<string, string> =
    origin === undefined
      ? { '--fill': at(pct) }
      : { '--fill-lo': at(Math.min(origin, pct)), '--fill': at(Math.max(origin, pct)) };
  const style = vars as CSSProperties;
  // the detent only catches a pointer drag; keyboard and D-pad steps (nudgeRange) must be able to leave it
  const commit = (v: number) =>
    onChange(
      dragging.current && fillFrom !== undefined && Math.abs(v - fillFrom) <= detent ? fillFrom : v,
    );
  const endDrag = () => {
    dragging.current = false;
  };
  const input = (
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
      style={style}
      onChange={(e) => commit(Number(e.currentTarget.value))}
      onPointerDown={(e) => {
        dragging.current = true;
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId); // the matching pointerup lands here even off the track
        } catch {
          /* pointer already released */
        }
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onBlur={endDrag}
    />
  );
  return (
    <div className={`rs${disabled ? ' disabled' : ''}`}>
      {label && <span className="rs-label">{label}</span>}
      <div className="rs-row">
        {origin === undefined && !ends ? (
          input
        ) : (
          <div className="rs-track">
            {origin !== undefined && (
              <span className="rs-detent" aria-hidden="true" style={{ left: at(origin) }} />
            )}
            {input}
            {ends && (
              <div className="rs-ends" aria-hidden="true">
                <span>{ends[0]}</span>
                <span>{ends[1]}</span>
              </div>
            )}
          </div>
        )}
        {format && <span className="rs-value">{format(value)}</span>}
      </div>
    </div>
  );
}
