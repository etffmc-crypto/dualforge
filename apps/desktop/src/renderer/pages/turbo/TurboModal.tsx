import { BUTTON_LABELS, type DsButton, type Mapping } from '@dualforge/shared';
import { Modal } from '../../components/Modal';
import { useStore } from '../../store';
import { TurboControls } from '../buttons/TurboControls';
import { mappingOf } from '../buttons/targets';

/** Small dialog for one button's turbo: mode, speed and continuous. Every change is live. */
export function TurboModal({ button, onClose }: { button: DsButton | null; onClose(): void }) {
  const stored = useStore((s) => (button ? s.profile?.mappings[button] : undefined));
  const hasProfile = useStore((s) => s.profile !== null);
  const updateProfile = useStore((s) => s.updateProfile);
  if (!button || !hasProfile) return null;
  const mapping = stored ?? mappingOf({}, button);
  const edit = (fn: (m: Mapping) => void) =>
    updateProfile((d) => fn((d.mappings[button] ??= mappingOf(d.mappings, button))));
  return (
    <Modal open title={`Turbo ${BUTTON_LABELS[button]}`} onClose={onClose} width={460}>
      <div className="turbo-modal">
        <TurboControls mapping={mapping} edit={edit} withContinuous />
        <div className="map-actions">
          <button data-nav type="button" className="panel-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
