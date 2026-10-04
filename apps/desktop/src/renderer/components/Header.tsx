import { useState } from 'react';
import { useStore } from '../store';
import { TabStrip } from './TabStrip';
import { ProfileTabs } from './ProfileTabs';
import { Modal } from './Modal';
import { FlaskIcon, GearIcon, HeartPulseIcon, HomeIcon, ProfilesIcon, ResetIcon } from './icons';
import { healthSummary } from '../pages/health/summary';

/** Health icon with a status lamp (green / amber / red) from the cached check results. */
function HealthButton() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const health = useStore((s) => s.health);
  const sum = health ? healthSummary(health.results) : null;
  const title = sum ? `Health: ${sum.headline}` : 'Health';
  return (
    <button data-nav className={`icon-btn health-btn${page === 'health' ? ' active' : ''}`} title={title} aria-label="Open Health"
      aria-pressed={page === 'health'} onClick={() => setPage('health')}>
      <HeartPulseIcon size={18} />
      {sum && <span className={`health-lamp ${sum.worst}`} data-testid="health-lamp" aria-hidden="true" />}
    </button>
  );
}

function ResetDialog({ onClose }: { onClose(): void }) {
  const name = useStore((s) => s.profiles.find((p) => p.id === s.activeProfileId)?.name ?? s.profile?.name ?? 'this profile');
  const resetProfile = useStore((s) => s.resetProfile);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try { await resetProfile(); }
    catch (err) { useStore.setState({ lastError: { code: 'E_PROFILE_RESET', msg: String(err) } }); }
    onClose();
  };
  return (
    <Modal open title={`Reset ${name}?`} onClose={onClose} width={420}>
      <p className="modal-text">Sticks, triggers, lights, button mappings, motion, macros and the name go back to their defaults. The other three profiles are not touched.</p>
      <div className="modal-actions">
        <button data-nav type="button" className="panel-btn" onClick={onClose}>Cancel</button>
        <button data-nav type="button" className="panel-btn primary" disabled={busy} onClick={() => void reset()}>Reset</button>
      </div>
    </Modal>
  );
}

export function Header() {
  const w = window.dualforge.window;
  const setPage = useStore((s) => s.setPage);
  const page = useStore((s) => s.page);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">D</span>
        <span className="brand-text">
          <span className="brand-word">DUALFORGE</span>
          <span className="brand-tag">CONFIG</span>
        </span>
      </div>
      <ProfileTabs />
      <TabStrip />
      <div className="header-actions">
        <button data-nav className={`icon-btn${page === 'profiles' ? ' active' : ''}`} title="Profiles" aria-label="Open Profiles" aria-pressed={page === 'profiles'} onClick={() => setPage('profiles')}><ProfilesIcon size={18} /></button>
        <button data-nav className="icon-btn" title="Reset profile" aria-label="Reset profile" onClick={() => setConfirmReset(true)}><ResetIcon size={18} /></button>
        <button data-nav className="icon-btn" title="Input Test" aria-label="Open Input Test" onClick={() => setPage('inputTest')}><FlaskIcon size={18} /></button>
        <button data-nav className="icon-btn" title="Home" aria-label="Go to Home" onClick={() => setPage('home')}><HomeIcon size={18} /></button>
        <HealthButton />
        <button data-nav className={`icon-btn${page === 'settings' ? ' active' : ''}`} title="Settings" aria-label="Open Settings" aria-pressed={page === 'settings'} onClick={() => setPage('settings')}><GearIcon size={18} /></button>
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
      {confirmReset && <ResetDialog onClose={() => setConfirmReset(false)} />}
    </header>
  );
}
