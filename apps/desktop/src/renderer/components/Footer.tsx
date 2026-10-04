import { DpadIcon } from './icons';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-hints">
        <span className="hint"><DpadIcon size={20} className="hint-dpad" /> Direction Control</span>
        <span className="hint"><span className="badge badge-a" aria-hidden="true">✕</span> Confirm</span>
        <span className="hint"><span className="badge badge-b" aria-hidden="true">○</span> Back</span>
      </div>
      <span className="version">V{__APP_VERSION__}</span>
    </footer>
  );
}
