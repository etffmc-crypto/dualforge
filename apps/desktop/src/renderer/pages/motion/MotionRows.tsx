import { useRef, useState, type ReactNode } from 'react';
import { BUTTON_LABELS, DS_BUTTONS, type DsButton, type GyroConfig } from '@dualforge/shared';
import { Modal } from '../../components/Modal';
import { Segmented } from '../../components/controls/Segmented';
import { DS_LABEL } from '../overview/format';

export type GyroEdit = (fn: (g: GyroConfig) => void) => void;
type Output = Exclude<GyroConfig['output'], 'off'>;

const MODES: { value: 'off' | 'aim'; label: string }[] = [{ value: 'off', label: 'Off' }, { value: 'aim', label: 'Aim' }];
const OUTPUTS: { value: Output; label: string }[] = [{ value: 'rightStick', label: 'Right stick' }, { value: 'mouse', label: 'Mouse' }];
const ACTIVATE: { value: GyroConfig['activate']; label: string }[] = [
  { value: 'always', label: 'Always' }, { value: 'hold', label: 'Hold' }, { value: 'toggle', label: 'Toggle' },
];
/** Hold / Toggle need a button; this is the one picked for you when none is set. */
const DEFAULT_ACTIVATE_BUTTON: DsButton = 'l1';

/** GameSir-style settings row: label on the left, its control right-aligned. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mrow">
      <span className="mrow-label">{label}</span>
      <div className="mrow-ctl">{children}</div>
    </div>
  );
}

/** The Off / Aim switch. Aim brings back the last output used (Right stick the first time). */
export function ModeRow({ gyro, edit }: { gyro: GyroConfig; edit: GyroEdit }) {
  const last = useRef<Output>(gyro.output === 'off' ? 'rightStick' : gyro.output);
  if (gyro.output !== 'off') last.current = gyro.output;
  return (
    <Row label="Motion Mode">
      <Segmented
        label="Motion mode" options={MODES} value={gyro.output === 'off' ? 'off' : 'aim'}
        onChange={(m) => edit((g) => { g.output = m === 'off' ? 'off' : last.current; })}
      />
    </Row>
  );
}

/** Output, activation method and the activation button (picked in a dialog). */
export function OutputRows({ gyro, edit }: { gyro: GyroConfig; edit: GyroEdit }) {
  const [picking, setPicking] = useState(false);
  const needsButton = gyro.activate !== 'always';
  const btn = gyro.activateButton;
  return (
    <>
      <Row label="Output">
        <Segmented
          label="Output" options={OUTPUTS} value={gyro.output === 'mouse' ? 'mouse' : 'rightStick'}
          onChange={(o) => edit((g) => { g.output = o; })}
        />
      </Row>
      <Row label="Activate Method">
        <Segmented
          label="Activate method" options={ACTIVATE} value={gyro.activate}
          onChange={(a) => edit((g) => { g.activate = a; if (a !== 'always' && !g.activateButton) g.activateButton = DEFAULT_ACTIVATE_BUTTON; })}
        />
      </Row>
      <Row label="Activate Button">
        <button
          type="button" className={`mpill${needsButton ? ' hot' : ''}`} disabled={!needsButton}
          aria-label={`Activate button: ${needsButton && btn ? DS_LABEL[btn] : 'not needed'}`}
          title={needsButton ? 'Choose the button that turns motion aim on' : 'Only used with Hold or Toggle'}
          onClick={() => setPicking(true)}
        >
          {needsButton && btn ? BUTTON_LABELS[btn] : '—'}
        </button>
      </Row>
      <Modal open={picking} title="Activate button" onClose={() => setPicking(false)} width={520}>
        <p className="modal-text">
          {gyro.activate === 'hold' ? 'Motion aim works while this button is held.' : 'Each press turns motion aim on or off.'} The button keeps its own mapping too.
        </p>
        <div className="mbtn-grid">
          {DS_BUTTONS.map((b) => (
            <button
              key={b} type="button" className={`mbtn${b === btn ? ' active' : ''}`} aria-pressed={b === btn} aria-label={DS_LABEL[b]} title={DS_LABEL[b]}
              onClick={() => { edit((g) => { g.activateButton = b; }); setPicking(false); }}
            >
              {BUTTON_LABELS[b]}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
