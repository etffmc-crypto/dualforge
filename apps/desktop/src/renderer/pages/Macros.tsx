import { useState } from 'react';
import type { Macro } from '@dualforge/shared';
import { Modal } from '../components/Modal';
import { useStore } from '../store';
import { MacroEditor } from './macros/MacroEditor';
import { MacroList } from './macros/MacroList';
import { MAX_MACROS, assignedTo, duplicateMacro, newMacroId, newStep, removeMacro } from './macros/ops';
import '../styles/buttons.css';
import '../styles/macros.css';

/** Macros page: the profile's macros as cards; New / Edit open the step editor (with recorder and play test). */
export function Macros() {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const [editing, setEditing] = useState<{ macro: Macro; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Macro | null>(null);
  if (!profile) return null; // still loading

  const full = profile.macros.length >= MAX_MACROS;
  const create = () => setEditing({
    isNew: true,
    macro: { id: newMacroId(profile.macros), name: `Macro ${profile.macros.length + 1}`, loop: false, steps: [newStep()] },
  });
  const users = deleting ? assignedTo(profile, deleting.id).length : 0;

  return (
    <div className="macros-page">
      <header className="macros-head">
        <div>
          <h2 className="macros-title">Macros</h2>
          <p className="macros-sub">A macro plays a timed run of outputs from a single press. Assign one to a button on the Buttons page.</p>
        </div>
        <span className="macros-count">{profile.macros.length} / {MAX_MACROS}</span>
        <button type="button" className="panel-btn primary" disabled={full} title={full ? 'This profile has the maximum of 32 macros' : undefined} onClick={create}>New macro</button>
      </header>
      {profile.macros.length === 0 ? (
        <div className="macros-empty">
          <h3>No macros yet</h3>
          <p>Build one step by step, or press Record in the editor and play it on the controller.</p>
          <button type="button" className="panel-btn primary" onClick={create}>Create your first macro</button>
        </div>
      ) : (
        <MacroList
          profile={profile}
          onEdit={(m) => setEditing({ macro: m, isNew: false })}
          onDuplicate={(m) => updateProfile((d) => duplicateMacro(d, m.id))}
          onDelete={setDeleting}
        />
      )}
      {editing && <MacroEditor key={editing.macro.id} macro={editing.macro} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      <Modal open={!!deleting} title={`Delete ${deleting?.name ?? ''}?`} onClose={() => setDeleting(null)} width={440}>
        <p className="modal-text">
          {users === 0 ? 'No button runs this macro.' : `${users} button${users === 1 ? '' : 's'} run${users === 1 ? 's' : ''} this macro and will stop sending it.`}
        </p>
        <div className="modal-actions">
          <button type="button" className="panel-btn" onClick={() => setDeleting(null)}>Cancel</button>
          <button type="button" className="panel-btn primary" onClick={() => {
            const id = deleting!.id;
            updateProfile((d) => removeMacro(d, id));   // one edit: the macro and every reference to it go together
            setDeleting(null);
          }}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
