import { DraftNumber } from '../../components/controls/DraftNumber';
import { targetText } from '../buttons/targets';
import { MAX_MS, type MacroStep } from './ops';

export interface StepTableProps {
  steps: MacroStep[];
  onChange(steps: MacroStep[]): void;
  onPickTarget(index: number): void;
}

const Arrow = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={up ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Bin = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Editable step list: output picker, hold / delay in ms, move up / down, delete. */
export function StepTable({ steps, onChange, onPickTarget }: StepTableProps) {
  const set = (i: number, patch: Partial<MacroStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="steps" role="table" aria-label="Steps">
      <div className="steps-head" role="row">
        <span role="columnheader">#</span><span role="columnheader">Output</span>
        <span role="columnheader">Hold</span><span role="columnheader">Then wait</span><span role="columnheader"><span className="sr-only">Actions</span></span>
      </div>
      <div className="steps-body">
        {steps.map((s, i) => {
          const n = i + 1;
          const text = targetText(s.target, []);
          return (
            <div className="step-row" role="row" key={i}>
              <span className="step-n" role="cell">{n}</span>
              <span role="cell">
                <button data-nav type="button" className={`step-target t-${s.target.type}`} aria-label={`Step ${n} output: ${text}`} onClick={() => onPickTarget(i)}>{text}</button>
              </span>
              <span role="cell" className="ms-cell">
                <DraftNumber min={0} max={MAX_MS} step={10} label={`Step ${n} hold (ms)`} value={s.holdMs} onCommit={(holdMs) => set(i, { holdMs })} />
                <span aria-hidden="true">ms</span>
              </span>
              <span role="cell" className="ms-cell">
                <DraftNumber min={0} max={MAX_MS} step={10} label={`Step ${n} delay (ms)`} value={s.delayMs} onCommit={(delayMs) => set(i, { delayMs })} />
                <span aria-hidden="true">ms</span>
              </span>
              <span role="cell" className="step-actions">
                <button data-nav type="button" className="step-icon" aria-label={`Move step ${n} up`} disabled={i === 0} onClick={() => move(i, -1)}><Arrow up /></button>
                <button data-nav type="button" className="step-icon" aria-label={`Move step ${n} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}><Arrow /></button>
                <button data-nav type="button" className="step-icon danger" aria-label={`Delete step ${n}`} disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, j) => j !== i))}><Bin /></button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
