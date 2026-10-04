import { APP_VERSION } from '@dualforge/shared';
import { DpadIcon } from './icons';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-hints">
        <span className="hint"><DpadIcon size={20} className="hint-dpad" /> Direction Control</span>
        <span className="hint"><span className="badge badge-a" aria-hidden="true">A</span> Confirm</span>
        <span className="hint"><span className="badge badge-b" aria-hidden="true">B</span> Back</span>
      </div>
      <span className="version">V{APP_VERSION}</span>
    </footer>
  );
}
