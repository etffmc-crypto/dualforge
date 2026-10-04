import { useState } from 'react';
import {
  BUTTON_LABELS,
  type DsButton,
  type Macro,
  type Mapping,
  type Target,
} from '@dualforge/shared';
import { Modal } from '../../components/Modal';
import { RangeSlider } from '../../components/controls/RangeSlider';
import { Toggle } from '../../components/controls/Toggle';
import { useStore } from '../../store';
import { TargetPicker, type PickerTab } from './TargetPicker';
import { MAX_TARGETS, TURBO_STEPS, mappingOf, pickTarget, targetKey, targetText } from './targets';

const NO_MACROS: Macro[] = [];
const CLEARED: Mapping = { targets: [{ type: 'none' }], turboHz: 0, continuous: false };
const snapTurbo = (v: number) =>
  TURBO_STEPS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const tabFor = (t: Target | undefined): PickerTab =>
  t?.type === 'key'
    ? 'keyboard'
    : t?.type === 'mouse'
      ? 'mouse'
      : t?.type === 'macro'
        ? 'macro'
        : 'controller';

export interface MappingModalProps {
  button: DsButton | null;
  onClose(): void;
}

/** GameSir-style remap dialog (ss6): output tabs, multi-map chips, continuous + turbo footer. Every change is live. */
export function MappingModal({ button, onClose }: MappingModalProps) {
  // select the stored object (stable); the default for a missing entry is built outside the selector, never inside it
  const stored = useStore((s) => (button ? s.profile?.mappings[button] : undefined));
  const hasProfile = useStore((s) => s.profile !== null);
  const mapping = button && hasProfile ? (stored ?? mappingOf({}, button)) : undefined;
  const macros = useStore((s) => s.profile?.macros ?? NO_MACROS);
  const updateProfile = useStore((s) => s.updateProfile);
  const setPage = useStore((s) => s.setPage);
  // the parent keys this component by button, so these start fresh for every button
  const [tab, setTab] = useState<PickerTab>(() => tabFor(mapping?.targets[0]));
  const [multi, setMulti] = useState(() => (mapping?.targets.length ?? 0) > 1);

  if (!button || !mapping) return null;
  const label = BUTTON_LABELS[button];
  const edit = (fn: (m: Mapping) => void) =>
    updateProfile((d) => fn((d.mappings[button] ??= mappingOf(d.mappings, button))));
  const real = mapping.targets.filter((t) => t.type !== 'none');
  const full = multi && real.length >= MAX_TARGETS;

  const setMultiMode = (on: boolean) => {
    setMulti(on);
    if (!on && mapping.targets.length > 1)
      edit((m) => {
        m.targets = m.targets.slice(0, 1);
      });
  };

  return (
    <Modal open title={`Remap ${label}`} onClose={onClose} width={1000} className="map-modal">
      <button data-nav type="button" className="modal-x" aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <TargetPicker
        tab={tab}
        onTab={setTab}
        subject={label}
        selected={mapping.targets}
        full={full}
        macros={macros}
        onPick={(t) =>
          edit((m) => {
            m.targets = pickTarget(m.targets, t, multi);
          })
        }
        onCreateMacro={() => {
          onClose();
          setPage('macros');
        }}
      />
      <div className="map-foot">
        <div className="map-foot-toggles">
          <Toggle
            label={`Map multiple buttons (up to ${MAX_TARGETS})`}
            checked={multi}
            onChange={setMultiMode}
          />
          {multi && (
            <ul className="map-chips" aria-label="Selected outputs">
              {real.length === 0 && (
                <li className="map-chip-empty">Pick up to {MAX_TARGETS} outputs</li>
              )}
              {real.map((t) => {
                const text = targetText(t, macros);
                return (
                  <li key={targetKey(t)} className="tchip">
                    {text}
                    <button
                      data-nav
                      type="button"
                      aria-label={`Remove ${text}`}
                      onClick={() =>
                        edit((m) => {
                          m.targets = pickTarget(m.targets, t, true);
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Toggle
            label="Continuous trigger"
            hint="One press holds the output until the next press."
            checked={mapping.continuous}
            onChange={(v) =>
              edit((m) => {
                m.continuous = v;
              })
            }
          />
        </div>
        <div className="map-foot-turbo">
          <div className="turbo-head">
            <span>Turbo</span>
            <span className="turbo-value">
              {mapping.turboHz === 0 ? 'Off' : `${mapping.turboHz} Hz`}
            </span>
          </div>
          <RangeSlider
            ariaLabel="Turbo"
            min={0}
            max={30}
            step={5}
            value={snapTurbo(mapping.turboHz)}
            onChange={(v) =>
              edit((m) => {
                m.turboHz = snapTurbo(v);
              })
            }
          />
          <div className="turbo-scale" aria-hidden="true">
            <span>Off</span>
            <span>30 Hz</span>
          </div>
          <div className="map-actions">
            <button
              data-nav
              type="button"
              className="panel-btn"
              onClick={() =>
                edit((m) => {
                  Object.assign(m, structuredClone(CLEARED));
                })
              }
            >
              Clear
            </button>
            <button data-nav type="button" className="panel-btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
