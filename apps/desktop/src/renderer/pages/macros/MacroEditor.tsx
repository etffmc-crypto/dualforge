import { useEffect, useId, useRef, useState } from 'react';
import type { Macro, Target } from '@dualforge/shared';
import { Modal } from '../../components/Modal';
import { Toggle } from '../../components/controls/Toggle';
import { useStore } from '../../store';
import { TargetPicker, type PickerTab } from '../buttons/TargetPicker';
import { MacroTimeline } from './MacroTimeline';
import { RecordDialog } from './RecordDialog';
import { StepTable } from './StepTable';
import { MAX_STEPS, NAME_MAX, cycleMs, newStep, upsertMacro } from './ops';

export interface MacroEditorProps {
  /** the macro being edited (a fresh one for "New macro") */
  macro: Macro;
  isNew: boolean;
  onClose(): void;
}

const tabFor = (t: Target): PickerTab =>
  t.type === 'key' ? 'keyboard' : t.type === 'mouse' ? 'mouse' : 'controller';

/** Extra time gamepad navigation stays off after a test run's last step (engine start-up + one snapshot). */
const PLAY_NAV_GRACE_MS = 250;

/** Edits a draft copy; nothing reaches the profile until Save (or Play test, which saves first). */
export function MacroEditor({ macro, isNew, onClose }: MacroEditorProps) {
  const updateProfile = useStore((s) => s.updateProfile);
  const flushProfile = useStore((s) => s.flushProfile);
  const [draft, setDraft] = useState<Macro>(() => structuredClone(macro));
  const [picking, setPicking] = useState<number | null>(null);
  const [pickTab, setPickTab] = useState<PickerTab>('controller');
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState(!isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  // the version the profile holds (the opened macro, then each successful save): closing a different draft asks first
  const savedDraft = useRef(macro);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft.current);
  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  const nameId = useId();

  const name = draft.name.trim();
  const problem = !name
    ? 'Give the macro a name.'
    : draft.steps.length === 0
      ? 'Add at least one step.'
      : null;
  const save = () => {
    if (problem) return false;
    // the store validates the whole profile; a rejected draft keeps the dialog open with the reason
    if (!updateProfile((d) => upsertMacro(d, { ...draft, name }))) {
      setSaveError(useStore.getState().lastError?.msg ?? 'The macro could not be saved.');
      return false;
    }
    setSaveError(null);
    setSaved(true);
    savedDraft.current = draft;
    return true;
  };
  // while a test run plays, its A / B / D-pad steps must not also drive gamepad navigation (B would close this dialog)
  // the hold ends on its timer or when the editor closes (Save / Cancel / unmount), whichever comes first
  const navHold = useRef<{ timer: ReturnType<typeof setTimeout>; release(): void } | null>(null);
  const endNavHold = () => {
    if (!navHold.current) return;
    clearTimeout(navHold.current.timer);
    navHold.current.release();
    navHold.current = null;
  };
  useEffect(() => endNavHold, []);
  const playTest = () => {
    if (!save()) return;
    flushProfile(); // the engine must have this version before it runs it
    endNavHold(); // a re-run replaces the previous hold
    const release = useStore.getState().suspendNav();
    navHold.current = {
      release,
      timer: setTimeout(endNavHold, cycleMs(draft) + PLAY_NAV_GRACE_MS),
    };
    window.dualforge.engine
      .runMacro(draft.id)
      .catch((err: unknown) =>
        useStore.setState({ lastError: { code: 'E_MACRO_TEST', msg: String(err) } }),
      );
  };
  const openPicker = (i: number) => {
    setPickTab(tabFor(draft.steps[i]!.target));
    setPicking(i);
  };
  const setTarget = (t: Target) => {
    if (picking === null) return;
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, j) => (j === picking ? { ...s, target: t } : s)),
    }));
    setPicking(null);
  };
  const seconds = (cycleMs(draft) / 1000).toFixed(2);

  return (
    <Modal
      open
      title={isNew && !saved ? 'New macro' : 'Edit macro'}
      onClose={requestClose}
      width={760}
      className="macro-editor"
    >
      <div className="me-top">
        <label className="me-name" htmlFor={nameId}>
          <span>Name</span>
          <input
            data-nav
            id={nameId}
            type="text"
            aria-label="Macro name"
            maxLength={NAME_MAX}
            value={draft.name}
            placeholder="e.g. Reload cancel"
            onChange={(e) => {
              const v = e.currentTarget.value;
              setDraft((d) => ({ ...d, name: v }));
            }}
          />
        </label>
        <Toggle
          label="Loop"
          hint="Repeats while the button is held."
          checked={draft.loop}
          onChange={(loop) => setDraft((d) => ({ ...d, loop }))}
        />
      </div>
      <div className="me-roll">
        <MacroTimeline steps={draft.steps} loop={draft.loop} />
        <span className="me-roll-meta">
          {draft.steps.length} / {MAX_STEPS} steps · {seconds} s{draft.loop ? ' per loop' : ''}
        </span>
      </div>
      <StepTable
        steps={draft.steps}
        onChange={(steps) => setDraft((d) => ({ ...d, steps }))}
        onPickTarget={openPicker}
      />
      <div className="me-tools">
        <button
          data-nav
          type="button"
          className="panel-btn"
          disabled={draft.steps.length >= MAX_STEPS}
          onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, newStep()] }))}
        >
          Add step
        </button>
        <button
          data-nav
          type="button"
          className="panel-btn with-icon"
          onClick={() => setRecording(true)}
        >
          <span className="rec-dot small" aria-hidden="true" />
          Record
        </button>
        <span className="me-spacer" />
        <button
          data-nav
          type="button"
          className="panel-btn"
          disabled={!!problem || draft.loop}
          title={draft.loop ? 'Turn off Loop to play-test' : undefined}
          onClick={playTest}
        >
          Play test
        </button>
      </div>
      <p className="me-hint">
        Play test saves the macro, then runs it once on the virtual controller. Keyboard/mouse steps
        are not injected while DualForge is focused.
      </p>
      <div className="modal-actions">
        {problem && (
          <span className="me-problem" role="status">
            {problem}
          </span>
        )}
        {!problem && saveError && (
          <span className="me-problem" role="alert">
            Not saved: {saveError}
          </span>
        )}
        <button data-nav type="button" className="panel-btn" onClick={requestClose}>
          Cancel
        </button>
        <button
          data-nav
          type="button"
          className="panel-btn primary"
          disabled={!!problem}
          onClick={() => {
            if (save()) onClose();
          }}
        >
          Save
        </button>
      </div>

      <Modal
        open={picking !== null}
        title={`Step ${(picking ?? 0) + 1} output`}
        onClose={() => setPicking(null)}
        width={1000}
        className="map-modal step-picker"
      >
        {picking !== null && (
          <TargetPicker
            tab={pickTab}
            onTab={setPickTab}
            subject={`Step ${picking + 1}`}
            selected={[draft.steps[picking]!.target]}
            full={false}
            onPick={setTarget}
          />
        )}
      </Modal>
      <Modal
        open={confirmDiscard}
        title="Discard changes?"
        onClose={() => setConfirmDiscard(false)}
        width={420}
        initialFocus={keepEditing}
      >
        <p className="modal-text">
          Your edits to {name ? `“${name}”` : 'this macro'} have not been saved.
        </p>
        <div className="modal-actions">
          <button data-nav type="button" className="panel-btn" onClick={onClose}>
            Discard
          </button>
          <button
            data-nav
            type="button"
            className="panel-btn primary"
            ref={keepEditing}
            onClick={() => setConfirmDiscard(false)}
          >
            Keep editing
          </button>
        </div>
      </Modal>
      <RecordDialog
        open={recording}
        onClose={() => setRecording(false)}
        onUse={(steps) => {
          setDraft((d) => ({ ...d, steps }));
          setRecording(false);
        }}
      />
    </Modal>
  );
}
