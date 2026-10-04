import { useId } from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange(v: boolean): void;
  label?: string;
}

/** iOS-style switch: grey track when off, accent when on. */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  const id = useId();
  const sw = (
    <button
      type="button" role="switch" aria-checked={checked} aria-labelledby={label ? id : undefined}
      className={`toggle${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="toggle-row">
      <span id={id} className="toggle-label">{label}</span>
      {sw}
    </div>
  );
}
