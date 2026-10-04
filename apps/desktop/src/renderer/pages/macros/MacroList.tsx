import { useId } from 'react';
import { BUTTON_LABELS, type Macro, type Profile } from '@dualforge/shared';
import { CopyIcon, PencilIcon, TrashIcon } from '../../components/icons';
import { MacroTimeline } from './MacroTimeline';
import { MAX_MACROS, assignedTo, cycleMs } from './ops';

export interface MacroListProps {
  profile: Profile;
  onEdit(m: Macro): void;
  onDuplicate(m: Macro): void;
  onDelete(m: Macro): void;
}

function MacroCard({ m, profile, onEdit, onDuplicate, onDelete }: { m: Macro } & MacroListProps) {
  const id = useId();
  const buttons = assignedTo(profile, m.id);
  return (
    <article className="mcard" aria-labelledby={id}>
      <header className="mcard-head">
        <h3 id={id} className="mcard-name">{m.name}</h3>
        {m.loop && <span className="mcard-loop">Loops</span>}
        <div className="mcard-actions">
          <button type="button" className="step-icon" aria-label={`Edit ${m.name}`} title="Edit" onClick={() => onEdit(m)}><PencilIcon size={16} /></button>
          <button type="button" className="step-icon" aria-label={`Duplicate ${m.name}`} title="Duplicate"
            disabled={profile.macros.length >= MAX_MACROS} onClick={() => onDuplicate(m)}><CopyIcon size={16} /></button>
          <button type="button" className="step-icon danger" aria-label={`Delete ${m.name}`} title="Delete" onClick={() => onDelete(m)}><TrashIcon size={16} /></button>
        </div>
      </header>
      <button type="button" className="mcard-roll" tabIndex={-1} aria-hidden="true" onClick={() => onEdit(m)}>
        <MacroTimeline steps={m.steps} loop={m.loop} />
      </button>
      <div className="mcard-meta">
        <span>{m.steps.length} step{m.steps.length === 1 ? '' : 's'}</span>
        <span className="mcard-dot" aria-hidden="true">·</span>
        <span>{(cycleMs(m) / 1000).toFixed(2)} s</span>
        <span className="mcard-on">
          {buttons.length === 0 ? <span className="mcard-none">Not assigned</span>
            : <>Runs on {buttons.map((b) => <span key={b} className="mcard-btn">{BUTTON_LABELS[b]}</span>)}</>}
        </span>
      </div>
    </article>
  );
}

/** One card per macro: name, loop badge, to-scale step roll, length and the buttons that run it. */
export function MacroList(p: MacroListProps) {
  return (
    <div className="mlist">
      {p.profile.macros.map((m) => <MacroCard key={m.id} m={m} {...p} />)}
    </div>
  );
}
