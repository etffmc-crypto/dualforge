import { useEffect, useState } from 'react';
import { DRIVERS, formatInstallerSize, type DriverId } from './summary';

export type DriverStatus = Awaited<ReturnType<Window['dualforge']['drivers']['install']>>;

export const BUSY_STATES = new Set<DriverStatus['state']>(['downloading', 'verifying', 'launching']);

/** The consent step: what will be downloaded, from where, and that Windows will ask. Nothing runs until Install. */
export function ConsentCard({ driver, onCancel, onInstall }: { driver: DriverId; onCancel(): void; onInstall(): void }) {
  const d = DRIVERS[driver];
  const titleId = `consent-${driver}`;
  // release metadata only (name, size); a failed lookup just means "size unknown" — Install still works
  const [size, setSize] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.dualforge.drivers.release(driver).then(
      (r) => { if (live) setSize(formatInstallerSize(r.size)); },
      () => { if (live) setSize(formatInstallerSize(null)); },
    );
    return () => { live = false; };
  }, [driver]);
  return (
    <div className="hc-consent" role="group" aria-labelledby={titleId}>
      <p className="hc-consent-title" id={titleId}>Install {d.name}?</p>
      <dl className="hc-facts">
        <dt>What</dt><dd>{d.name}, {d.what}</dd>
        <dt>Source</dt><dd className="mono">github.com/{d.repo}/releases</dd>
        <dt>Size</dt><dd data-testid="installer-size">{size ?? 'checking…'}, you will see a Windows UAC prompt</dd>
      </dl>
      <p className="hc-fine">DualForge checks the installer is signed by Nefarius Software Solutions before it starts it.</p>
      <div className="hc-actions">
        <button data-nav type="button" className="panel-btn" onClick={onCancel}>Cancel</button>
        <button data-nav type="button" className="panel-btn primary" onClick={onInstall}>Install</button>
      </div>
    </div>
  );
}

const STEP_TEXT: Partial<Record<DriverStatus['state'], string>> = {
  verifying: 'Checking the signature…',
  launching: 'Starting the installer…',
};

/** Progress for one driver install, fed by `drivers.onStatus`. */
export function DriverProgress({ status }: { status: DriverStatus }) {
  const name = DRIVERS[status.driver].name;
  const pct = status.pct ?? 0;
  return (
    <div className={`hc-progress ${status.state}`} role="status" aria-live="polite">
      {status.state === 'downloading' && (
        <>
          <span>Downloading {name}… {pct}%</span>
          <div className="hc-bar" role="progressbar" aria-label={`Downloading ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="hc-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      {STEP_TEXT[status.state] && <span>{STEP_TEXT[status.state]}</span>}
      {status.state === 'done' && (
        <>
          <span className="hc-ok">Installer started.</span>
          <span className="hc-note">Finish the installer window, then re-run checks.</span>
        </>
      )}
      {status.state === 'failed' && <span className="hc-err">Install failed ({status.code ?? 'E_DRIVER_DOWNLOAD'}). Nothing was started; the log below has the details.</span>}
      {status.sha256 && (
        <span className="hc-sha"><span className="hc-sha-label">SHA-256</span><code>{status.sha256}</code></span>
      )}
    </div>
  );
}
