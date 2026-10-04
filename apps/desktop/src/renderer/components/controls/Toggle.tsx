import { useId } from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange(v: boolean): void;
  label?: string;
  /** one line of help under the label; it is the switch's description, not part of its name */
  hint?: string;
  disabled?: boolean;
  /** tooltip for the whole row, e.g. why it is disabled */
  title?: string;
}

/** iOS-style switch: grey track when off, accent when on. */
export function Toggle({ checked, onChange, label, hint, disabled = false, title }: ToggleProps) {
  const id = useId();
  const sw = (
    <button
      type="button" role="switch" aria-checked={checked} aria-labelledby={label ? `${id}-l` : undefined}
      aria-describedby={hint ? `${id}-h` : undefined} disabled={disabled}
      className={`toggle${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
  if (!label) return sw;
  return (
    <div className={`toggle-row${disabled ? ' disabled' : ''}`} title={title}>
      <span className="toggle-text">
        <span id={`${id}-l`} className="toggle-label">{label}</span>
        {hint && <span id={`${id}-h`} className="toggle-hint">{hint}</span>}
      </span>
      {sw}
    </div>
  );
}
