import { useState, type InputHTMLAttributes } from 'react';

export interface DraftNumberProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'> {
  value: number;
  label: string;
  min: number;
  max: number;
  onCommit(v: number): void;
}

/** Integer field that keeps a local draft while typing; commits (rounded, clamped) on blur/Enter, Escape reverts the draft, empty or non-numeric drafts are ignored. */
export function DraftNumber({ value, label, min, max, onCommit, ...rest }: DraftNumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, Math.round(n))));
    setDraft(null);
  };
  return (
    <input
      {...rest} type="number" min={min} max={max} aria-label={label} value={draft ?? String(value)}
      onChange={(e) => setDraft(e.currentTarget.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        // Escape first reverts an open draft (without closing a surrounding dialog); a second Escape reaches the dialog
        else if (e.key === 'Escape' && draft !== null) { e.stopPropagation(); setDraft(null); }
      }}
    />
  );
}
