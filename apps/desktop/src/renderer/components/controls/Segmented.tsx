import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  label?: string;
}

/** Equal-width option buttons; the active one is solid accent. Arrow keys move the selection. */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n]!.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button data-nav
            key={o.value} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
            className={`seg-btn${checked ? ' active' : ''}`} onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
