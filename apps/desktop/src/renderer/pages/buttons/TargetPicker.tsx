import type { Macro, Target } from '@dualforge/shared';
import { SubTabs } from '../../components/controls/SubTabs';
import { KeyGrid } from './KeyGrid';
import { CONTROLLER_TARGETS, MOUSE_LABELS, targetKey, targetText } from './targets';

export type PickerTab = 'controller' | 'keyboard' | 'mouse' | 'macro';
const TABS: { value: PickerTab; label: string }[] = [
  { value: 'controller', label: 'Controller' }, { value: 'keyboard', label: 'Keyboard' },
  { value: 'mouse', label: 'Mouse' }, { value: 'macro', label: 'Macro' },
];
const HEADINGS: Record<PickerTab, string> = {
  controller: 'Map controller button for', keyboard: 'Map keyboard key for', mouse: 'Map mouse button for', macro: 'Run a macro from',
};

export interface TargetPickerProps {
  tab: PickerTab;
  onTab(t: PickerTab): void;
  selected: readonly Target[];
  /** the 3-target limit is reached: everything not already selected is disabled */
  full: boolean;
  onPick(t: Target): void;
  /** source button label for the heading badge (e.g. ✕) */
  subject: string;
  /** omit to hide the Macro tab (macro steps cannot start macros) */
  macros?: readonly Macro[] | undefined;
  /** shown on the empty Macro tab */
  onCreateMacro?: (() => void) | undefined;
}

function Option({ t, label, sel, full, onPick, className = '' }: { t: Target; label: string; sel: Set<string>; full: boolean; onPick(t: Target): void; className?: string }) {
  const on = sel.has(targetKey(t));
  return (
    <button type="button" className={`opt ${className}${on ? ' on' : ''}`} aria-pressed={on} disabled={full && !on} onClick={() => onPick(t)}>
      {label}
    </button>
  );
}

const MouseGlyph = ({ b }: { b: 'left' | 'right' | 'middle' }) => (
  <svg viewBox="0 0 40 56" width="34" height="46" aria-hidden="true" className="mouse-glyph">
    <rect x="3" y="3" width="34" height="50" rx="17" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M3 22h34M20 3v19" stroke="currentColor" strokeWidth="2" />
    {b === 'left' && <path d="M20 3v19H3v-2A17 17 0 0 1 20 3Z" className="mg-on" />}
    {b === 'right' && <path d="M20 3v19h17v-2A17 17 0 0 0 20 3Z" className="mg-on" />}
    {b === 'middle' && <rect x="17" y="8" width="6" height="10" rx="3" className="mg-on" />}
  </svg>
);

/** Controller / Keyboard / Mouse / Macro output pickers, shared by the mapping modal and the macro step editor. */
export function TargetPicker({ tab, onTab, selected, full, onPick, subject, macros, onCreateMacro }: TargetPickerProps) {
  const sel = new Set(selected.map(targetKey));
  const tabs = macros ? TABS : TABS.filter((t) => t.value !== 'macro');
  const keys = new Set(selected.flatMap((t) => (t.type === 'key' ? [t.code] : [])));
  const common = { sel, full, onPick };
  return (
    <div className="picker">
      <SubTabs tabs={tabs} value={tab} onChange={onTab} pills={['LB', 'RB']} />
      <p className="picker-head">{HEADINGS[tab]} <span className="picker-badge">{subject}</span></p>
      <div className="picker-body" role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
        {tab === 'controller' && (
          <div className="opt-grid">
            {CONTROLLER_TARGETS.map((t) => (
              <Option key={targetKey(t)} t={t} label={targetText(t, [])} className={`xb xb-${targetKey(t).slice(2)}`} {...common} />
            ))}
            <Option t={{ type: 'none' }} label="No output" className="opt-none" {...common} />
          </div>
        )}
        {tab === 'keyboard' && <KeyGrid selected={keys} full={full} onPick={onPick} />}
        {tab === 'mouse' && (
          <div className="opt-grid mouse-grid">
            {(['left', 'middle', 'right'] as const).map((b) => {
              const t: Target = { type: 'mouse', button: b };
              const on = sel.has(targetKey(t));
              return (
                <button key={b} type="button" className={`opt mouse-opt${on ? ' on' : ''}`} aria-pressed={on} aria-label={MOUSE_LABELS[b]}
                  disabled={full && !on} onClick={() => onPick(t)}>
                  <MouseGlyph b={b} /><span>{b === 'left' ? 'Left click' : b === 'right' ? 'Right click' : 'Middle click'}</span>
                </button>
              );
            })}
          </div>
        )}
        {tab === 'macro' && macros && (macros.length === 0 ? (
          <div className="picker-empty">
            <p>No macros yet. A macro plays a timed sequence of outputs from one press.</p>
            {onCreateMacro && <button type="button" className="panel-btn" onClick={onCreateMacro}>Create a macro</button>}
          </div>
        ) : (
          <div className="opt-grid macro-grid">
            {macros.map((m) => {
              const t: Target = { type: 'macro', macroId: m.id };
              const on = sel.has(targetKey(t));
              return (
                <button key={m.id} type="button" className={`opt macro-opt${on ? ' on' : ''}`} aria-pressed={on} aria-label={m.name}
                  disabled={full && !on} onClick={() => onPick(t)}>
                  <span className="macro-opt-name">{m.name}</span>
                  <span className="macro-opt-meta">{m.steps.length} step{m.steps.length === 1 ? '' : 's'}{m.loop ? ' · loops' : ''}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
