import { useEffect } from 'react';
import { DpadIcon } from './icons';
import { useStore } from '../store';

/** How long a transient error (a failed test or copy, nothing lost) stays in the footer. */
export const ERROR_CHIP_MS = 6000;
/** Errors that only report a one-off action failing; everything else stays until dismissed. */
const TRANSIENT = new Set(['E_RUMBLE_TEST', 'E_MACRO_TEST', 'E_CLIPBOARD']);

/** Short, user-facing text for an error code; unknown codes show main's message without the IPC wrapper. */
function shortMessage(code: string, msg: string): string {
  switch (code) {
    case 'E_PROFILE_SEND':
      return 'Changes not saved — check Health';
    case 'E_PROFILE_INVALID':
      return `Change not applied: ${msg}`;
    case 'E_RUMBLE_TEST':
      return 'Rumble test did not play';
    case 'E_MACRO_TEST':
      return 'Macro test did not run';
    case 'E_CLIPBOARD':
      return 'Could not copy to the clipboard';
    default:
      return msg.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '');
  }
}

/** The store's lastError as a dismissible chip; transient codes clear themselves after ERROR_CHIP_MS. */
function ErrorChip() {
  const err = useStore((s) => s.lastError);
  const clearError = useStore((s) => s.clearError);
  useEffect(() => {
    if (!err || !TRANSIENT.has(err.code)) return;
    // only this error: a newer one replaces `err`, cancelling this timer and starting its own
    const t = setTimeout(() => {
      if (useStore.getState().lastError === err) clearError();
    }, ERROR_CHIP_MS);
    return () => clearTimeout(t);
  }, [err, clearError]);
  if (!err) return null;
  return (
    <div className="err-chip" role="alert" title={err.msg}>
      <span className="err-code">{err.code}</span>
      <span className="err-msg">{shortMessage(err.code, err.msg)}</span>
      <button
        data-nav
        type="button"
        className="err-x"
        aria-label="Dismiss error"
        onClick={clearError}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-left">
        <div className="footer-hints">
          <span className="hint">
            <DpadIcon size={20} className="hint-dpad" /> Direction Control
          </span>
          <span className="hint">
            <span className="badge badge-a" aria-hidden="true">
              ✕
            </span>{' '}
            Confirm
          </span>
          <span className="hint">
            <span className="badge badge-b" aria-hidden="true">
              ○
            </span>{' '}
            Back
          </span>
        </div>
        <ErrorChip />
      </div>
      <span className="version">V{__APP_VERSION__}</span>
    </footer>
  );
}
