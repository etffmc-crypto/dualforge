import { useStore } from '../store';
import { TabStrip } from './TabStrip';
import { FlaskIcon, HomeIcon, ResetIcon } from './icons';

export function Header() {
  const w = window.dualforge.window;
  const setPage = useStore((s) => s.setPage);
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">D</span>
        <span className="brand-text">
          <span className="brand-word">DUALFORGE</span>
          <span className="brand-tag">CONFIG</span>
        </span>
      </div>
      <TabStrip />
      <div className="header-actions">
        <span title="Reset profile — coming in Plan 3">
          <button className="icon-btn" aria-label="Reset profile" disabled><ResetIcon size={18} /></button>
        </span>
        <button className="icon-btn" title="Input Test" aria-label="Open Input Test" onClick={() => setPage('inputTest')}><FlaskIcon size={18} /></button>
        <button className="icon-btn" title="Home" aria-label="Go to Home" onClick={() => setPage('home')}><HomeIcon size={18} /></button>
      </div>
      <div className="win-controls">
        <button className="win-btn" title="Minimize" aria-label="Minimize" onClick={w.minimize}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg>
        </button>
        <button className="win-btn" title="Maximize" aria-label="Maximize" onClick={w.toggleMaximize}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
        </button>
        <button className="win-btn close" title="Close" aria-label="Close" onClick={w.close}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0 0 10" stroke="currentColor" /></svg>
        </button>
      </div>
    </header>
  );
}
