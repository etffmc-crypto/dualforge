import { TabStrip } from './TabStrip';
export function Header() {
  const w = window.dualforge.window;
  return (
    <header className="header">
      <div className="brand"><span className="brand-word">DUAL</span><span className="brand-tag">FORGE</span></div>
      <TabStrip />
      <div className="header-right">
        <button className="icon-btn" title="Minimize" onClick={w.minimize}>–</button>
        <button className="icon-btn" title="Maximize" onClick={w.toggleMaximize}>▢</button>
        <button className="icon-btn close" title="Close" onClick={w.close}>✕</button>
      </div>
    </header>
  );
}
