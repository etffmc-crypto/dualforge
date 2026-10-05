import { useState } from 'react';
import { BUTTON_LABELS, DS_BUTTONS, type DsButton, type TurboSettings } from '@dualforge/shared';
import { Modal } from '../../components/Modal';
import { Toggle } from '../../components/controls/Toggle';
import { PanelSection } from '../../components/SettingsLayout';
import { useStore } from '../../store';
import '../../styles/turbo.css';

const nameOf = (b: DsButton | null) => (b ? BUTTON_LABELS[b] : 'None');

/** Settings → Turbo: which button is the on-pad turbo modifier, and whether the combo and the red pulse are on. */
export function TurboPrefs() {
  const turbo = useStore((s) => s.settings?.turbo);
  const updateSettings = useStore((s) => s.updateSettings);
  const [picking, setPicking] = useState(false);
  if (!turbo) return null;
  const set = (patch: Partial<TurboSettings>) =>
    void updateSettings({ turbo: { ...turbo, ...patch } });
  const pick = (b: DsButton | null) => {
    setPicking(false);
    set({ modeButton: b });
  };
  return (
    <PanelSection title="Turbo">
      <Toggle
        label="Assign turbo on the controller"
        hint={`Hold the mode button and press a button to step its turbo: Slow, Medium, Fast, Off. Double-tap the mode button to clear all turbo.`}
        checked={turbo.onPadAssign}
        onChange={(v) => set({ onPadAssign: v })}
      />
      <div className="prefs-row">
        <span className="prefs-row-text">
          <span className="toggle-label">Mode button</span>
          <span className="toggle-hint">
            A quick tap still sends its own output; held with another button it only sets turbo.
          </span>
        </span>
        <button
          data-nav
          type="button"
          className="panel-btn"
          aria-label={`Mode button: ${nameOf(turbo.modeButton)}`}
          disabled={!turbo.onPadAssign}
          onClick={() => setPicking(true)}
        >
          {nameOf(turbo.modeButton)}
        </button>
      </div>
      <Toggle
        label="Pulse the lightbar red"
        hint="While any button has turbo set, the lightbar flashes red instead of the profile colour."
        checked={turbo.lightbarPulse}
        onChange={(v) => set({ lightbarPulse: v })}
      />
      <Modal open={picking} title="Turbo mode button" onClose={() => setPicking(false)} width={520}>
        <div className="mode-grid">
          {DS_BUTTONS.map((b) => (
            <button
              data-nav
              key={b}
              type="button"
              className={`mode-opt${turbo.modeButton === b ? ' active' : ''}`}
              aria-pressed={turbo.modeButton === b}
              onClick={() => pick(b)}
            >
              {BUTTON_LABELS[b]}
            </button>
          ))}
          <button
            data-nav
            type="button"
            className={`mode-opt none${turbo.modeButton === null ? ' active' : ''}`}
            aria-pressed={turbo.modeButton === null}
            onClick={() => pick(null)}
          >
            None
          </button>
        </div>
        <p className="psec-hint">
          None turns the on-pad shortcut off; every button keeps its mapping.
        </p>
      </Modal>
    </PanelSection>
  );
}
