import { useCallback, useState } from 'react';
import type { DsButton } from '@dualforge/shared';
import { useStore } from '../store';
import { PadDiagram } from './buttons/PadDiagram';
import { MappingModal } from './buttons/MappingModal';
import '../styles/buttons.css';

/** Buttons page (GameSir ss3): pick any button on the pad diagram to remap it in the mapping dialog. */
export function Buttons() {
  const mappings = useStore((s) => s.profile?.mappings);
  const macros = useStore((s) => s.profile?.macros);
  const lights = useStore((s) => s.profile?.lights);
  const [editing, setEditing] = useState<DsButton | null>(null);
  const onEdit = useCallback((b: DsButton) => setEditing(b), []);
  if (!mappings || !macros || !lights) return null; // still loading
  return (
    <div className="buttons-page">
      <div className="pad-wrap">
        <PadDiagram mappings={mappings} macros={macros} lights={lights} onEdit={onEdit} />
      </div>
      <p className="buttons-hint">
        Select a button to change what it sends. Red pills differ from the standard Xbox layout.
      </p>
      <MappingModal key={editing ?? ''} button={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
