import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Segmented } from '../../components/controls/Segmented';
import { slotOptions, type Slot } from './slots';

interface DialogProps { slot: Slot; slots: Slot[]; onClose(): void }

/** Picks the slot to overwrite with a copy of `slot`. */
export function DuplicateDialog({ slot, slots, onClose, onConfirm }: DialogProps & { onConfirm(to: Slot['id']): Promise<void> }) {
  const others = slots.filter((s) => s.id !== slot.id);
  const [to, setTo] = useState(others[0]!.id);
  const [busy, setBusy] = useState(false);
  const target = others.find((s) => s.id === to)!;
  const run = async () => { setBusy(true); try { await onConfirm(to); } finally { onClose(); } };
  return (
    <Modal open title={`Duplicate ${slot.name}`} onClose={onClose} width={480}>
      <p className="modal-text">Copy every setting of {slot.name} into another slot.</p>
      <div className="pf-dialog-pick">
        <Segmented label="Copy into" options={slotOptions(others)} value={to} onChange={(v) => setTo(v)} />
      </div>
      <p className="pf-warn">{target.name} is replaced. Its old settings can’t be brought back.</p>
      <div className="modal-actions">
        <button data-nav type="button" className="panel-btn" onClick={onClose}>Cancel</button>
        <button data-nav type="button" className="panel-btn primary" disabled={busy} onClick={() => void run()}>Duplicate</button>
      </div>
    </Modal>
  );
}

export function ResetSlotDialog({ slot, onClose, onConfirm }: Omit<DialogProps, 'slots'> & { onConfirm(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await onConfirm(); } finally { onClose(); } };
  return (
    <Modal open title={`Reset ${slot.name}?`} onClose={onClose} width={420}>
      <p className="modal-text">Sticks, triggers, lights, button mappings, motion, macros and the name go back to their defaults. The other three profiles are not touched.</p>
      <div className="modal-actions">
        <button data-nav type="button" className="panel-btn" onClick={onClose}>Cancel</button>
        <button data-nav type="button" className="panel-btn primary" disabled={busy} onClick={() => void run()}>Reset</button>
      </div>
    </Modal>
  );
}
