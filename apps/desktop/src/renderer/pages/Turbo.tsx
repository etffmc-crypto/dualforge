import { useCallback, useState } from 'react';
import { BUTTON_LABELS, DS_BUTTONS, type DsButton, type TurboSettings } from '@dualforge/shared';
import { useStore } from '../store';
import { PadDiagram } from './buttons/PadDiagram';
import { TurboModal } from './turbo/TurboModal';
import '../styles/buttons.css';
import '../styles/turbo.css';

const TURBO_RED = { r: 255, g: 0, b: 0 };

/** Turbo page: every button's turbo at a glance on the pad diagram, the live state, and the on-pad shortcut. */
export function Turbo() {
  const mappings = useStore((s) => s.profile?.mappings);
  const macros = useStore((s) => s.profile?.macros);
  const lights = useStore((s) => s.profile?.lights);
  const active = useStore((s) => s.snapshot?.turboActive === true);
  const turbo = useStore((s) => s.settings?.turbo);
  const updateProfile = useStore((s) => s.updateProfile);
  const [editing, setEditing] = useState<DsButton | null>(null);
  const onEdit = useCallback((b: DsButton) => setEditing(b), []);
  if (!mappings || !macros || !lights) return null; // still loading
  const configured = DS_BUTTONS.filter((b) => mappings[b] && mappings[b].turbo.mode !== 'off');
  // the drawn pad shows the lightbar the way the controller does: red while turbo is set
  const padLights =
    configured.length > 0 && turbo?.lightbarPulse ? { ...lights, ...TURBO_RED } : lights;
  const clearAll = () =>
    updateProfile((d) => {
      for (const m of Object.values(d.mappings)) m.turbo = { ...m.turbo, mode: 'off' };
    });
  return (
    <div className="buttons-page turbo-page">
      <div className="turbo-bar">
        <div className={`turbo-live${active ? ' on' : ''}`}>
          <span className="turbo-dot" aria-hidden="true" />
          <span role="status">{active ? 'Turbo active' : 'Turbo idle'}</span>
        </div>
        <span className="turbo-count">
          {configured.length === 0
            ? 'No button has turbo'
            : `${configured.length} button${configured.length === 1 ? '' : 's'} with turbo`}
        </span>
        <button
          data-nav
          type="button"
          className="panel-btn"
          disabled={configured.length === 0}
          onClick={clearAll}
        >
          Clear all turbo
        </button>
      </div>
      <div className="pad-wrap">
        <PadDiagram
          variant="turbo"
          mappings={mappings}
          macros={macros}
          lights={padLights}
          onEdit={onEdit}
        />
      </div>
      <OnPadHelp turbo={turbo} />
      <TurboModal key={editing ?? ''} button={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function OnPadHelp({ turbo }: { turbo: TurboSettings | undefined }) {
  const mb = turbo?.onPadAssign ? turbo.modeButton : null;
  if (!mb)
    return (
      <p className="turbo-help" role="note">
        On-pad assignment is off. Turn it on in Settings to set turbo from the controller.
      </p>
    );
  const key = <kbd className="turbo-key">{BUTTON_LABELS[mb]}</kbd>;
  return (
    <p className="turbo-help" role="note">
      <span className="turbo-help-item">
        Hold {key} + press a button:{' '}
        <span className="turbo-cycle">
          <b>Slow</b> → <b>Medium</b> → <b>Fast</b> → <b>Off</b>
        </span>
      </span>
      <span className="turbo-help-item">Double-tap {key} to clear all turbo</span>
      {turbo?.lightbarPulse && (
        <span className="turbo-help-item">The lightbar pulses red while turbo is set</span>
      )}
    </p>
  );
}
