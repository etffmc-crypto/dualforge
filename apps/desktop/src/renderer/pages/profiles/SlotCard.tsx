import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../../store';
import { DuplicateDialog, ResetSlotDialog } from './SlotDialogs';
import { flushEdits, reportError, type Slot } from './slots';

/** The DualSense player-indicator pattern for players 1–4 (five LEDs under the touchpad). */
const PLAYER_LEDS: Record<number, number[]> = { 1: [0, 0, 1, 0, 0], 2: [0, 1, 0, 1, 0], 3: [1, 0, 1, 0, 1], 4: [1, 1, 0, 1, 1] };

function NameField({ slot, onDone }: { slot: Slot; onDone(name: string | null): void }) {
  const [value, setValue] = useState(slot.name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => { if (!done.current) { done.current = true; onDone(v); } };
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
  };
  return (
    <input data-nav
      ref={ref} className="slot-input" aria-label={`Name of slot ${slot.n}`} value={value} maxLength={40} spellCheck={false}
      onChange={(e) => setValue(e.currentTarget.value)} onKeyDown={onKey} onBlur={() => finish(value)}
    />
  );
}

export interface SlotCardProps { slot: Slot; slots: Slot[]; active: boolean; onNotice(msg: string): void }

/** One profile slot: player-LED lamp, name, Active badge and the slot's actions. */
export function SlotCard({ slot, slots, active, onNotice }: SlotCardProps) {
  const activate = useStore((s) => s.activateProfile);
  const rename = useStore((s) => s.renameProfile);
  const slotReplaced = useStore((s) => s.slotReplaced);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'duplicate' | 'reset' | null>(null);
  const close = () => setDialog(null);

  const commitName = (raw: string | null) => {
    setEditing(false);
    const name = raw?.trim();
    if (name && name !== slot.name) void rename(slot.id, name).catch(reportError('E_PROFILE_RENAME'));
  };
  const duplicate = async (to: Slot['id']) => {
    flushEdits();
    try {
      const p = await window.dualforge.profiles.duplicate(slot.id, to);
      await slotReplaced(to);
      onNotice(`Copied ${slot.name} into slot ${slots.find((s) => s.id === to)!.n} as ${p.name}.`);
    } catch (err) { reportError('E_PROFILE_DUPLICATE')(err); onNotice(`Couldn’t copy ${slot.name}.`); }
  };
  const reset = async () => {
    try { await window.dualforge.profiles.reset(slot.id); await slotReplaced(slot.id); onNotice(`Slot ${slot.n} is back to its defaults.`); }
    catch (err) { reportError('E_PROFILE_RESET')(err); onNotice(`Couldn’t reset ${slot.name}.`); }
  };
  const exportFile = async () => {
    flushEdits();
    try {
      const path = await window.dualforge.profiles.export(slot.id);
      if (path) onNotice(`Exported ${slot.name} to ${path}`);
    } catch (err) { reportError('E_PROFILE_EXPORT')(err); onNotice(`Couldn’t export ${slot.name}.`); }
  };
  const importFile = async () => {
    try {
      const p = await window.dualforge.profiles.import(slot.id);
      if (!p) return;   // dialog cancelled
      await slotReplaced(slot.id);
      onNotice(`Imported ${p.name} into slot ${slot.n}.`);
    } catch (err) { reportError('E_PROFILE_IMPORT')(err); onNotice(`That file isn’t a DualForge profile, so slot ${slot.n} was left as it was.`); }
  };

  return (
    <article className={`slot-card${active ? ' active' : ''}`} aria-label={`Slot ${slot.n}`}>
      <div className="slot-top">
        <span className="slot-leds" aria-hidden="true">
          {PLAYER_LEDS[slot.n]!.map((on, i) => <span key={i} className={`slot-led${on ? ' lit' : ''}`} />)}
        </span>
        <span className="slot-eyebrow">Slot {slot.n}</span>
        {active && <span className="slot-badge">Active</span>}
      </div>
      {editing ? <NameField slot={slot} onDone={commitName} /> : <h3 className="slot-name" title={slot.name}>{slot.name}</h3>}
      <div className="slot-actions">
        <button data-nav
          type="button" className="slot-btn" disabled={active}
          onClick={() => void activate(slot.id).catch(reportError('E_PROFILE_ACTIVATE'))}
        >Activate</button>
        <button data-nav type="button" className="slot-btn" onClick={() => setEditing(true)}>Rename</button>
        <button data-nav type="button" className="slot-btn" onClick={() => setDialog('duplicate')}>Duplicate to…</button>
        <button data-nav type="button" className="slot-btn" onClick={() => setDialog('reset')}>Reset</button>
        <span className="slot-sep" aria-hidden="true" />
        <button data-nav type="button" className="slot-btn" onClick={() => void exportFile()}>Export</button>
        <button data-nav type="button" className="slot-btn" onClick={() => void importFile()}>Import</button>
      </div>
      {dialog === 'duplicate' && <DuplicateDialog slot={slot} slots={slots} onClose={close} onConfirm={duplicate} />}
      {dialog === 'reset' && <ResetSlotDialog slot={slot} onClose={close} onConfirm={reset} />}
    </article>
  );
}
