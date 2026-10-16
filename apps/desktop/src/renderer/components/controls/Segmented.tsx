import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface SegmentedProps<T extends string> {
  /** `disabled` options cannot be picked (arrow keys skip them); `tag` is drawn after the label (e.g. the Pro tag). */
  options: { value: T; label: string; disabled?: boolean; tag?: ReactNode }[];
  value: T;
  onChange(v: T): void;
  label?: string;
}

/** Equal-width option buttons; the active one is solid accent. Arrow keys move the selection. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    let n = i;
    for (let k = 0; k < options.length; k++) {
      n = (n + d + options.length) % options.length;
      if (!options[n]!.disabled) break;
    }
    if (n === i || options[n]!.disabled) return;
    onChange(options[n]!.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            data-nav
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`seg-btn${checked ? ' active' : ''}`}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
            {o.tag}
          </button>
        );
      })}
    </div>
  );
}
