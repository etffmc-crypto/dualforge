import { useCallback, useEffect, useRef, useState } from 'react';
import type { HealthResult, HealthStatus } from '@dualforge/shared';
import { Modal } from '../components/Modal';
import { FolderIcon } from '../components/icons';
import { useStore } from '../store';
import { BUSY_STATES, ConsentCard, DriverProgress, type DriverStatus } from './health/DriverInstall';
import { LogViewer } from './health/LogViewer';
import { bySeverity, DRIVER_FOR_REPAIR, healthSummary, REPAIR_LABELS, type DriverId } from './health/summary';
import '../styles/profiles.css';   // shared page head (.pf-head / .pf-title)
import '../styles/health.css';

/** After a driver installer starts, checks re-run on their own this long later (the user is still clicking through UAC). */
export const RECHECK_AFTER_INSTALL_MS = 10_000;
const STATUS_NAMES: Record<HealthStatus, string> = { ok: 'OK', warn: 'Warning', error: 'Problem' };
type Outcome = { ok: boolean; text: string };
const reportErr = (code: string) => (err: unknown) => useStore.setState({ lastError: { code, msg: String(err) } });

/** Driver install state for both drivers: the last known status plus every `drivers.onStatus` push. */
function useDriverStatus(onDone: () => void) {
  const [status, setStatus] = useState<Partial<Record<DriverId, DriverStatus>>>({});
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const d = window.dualforge.drivers;
    let live = true;
    d.status().then((s) => { if (live) setStatus((cur) => ({ vigem: cur.vigem ?? s.vigem, hidhide: cur.hidhide ?? s.hidhide })); }).catch(() => undefined);
    const off = d.onStatus((s) => {
      setStatus((cur) => ({ ...cur, [s.driver]: s }));
      if (s.state === 'done') doneRef.current();
    });
    return () => { live = false; off(); };
  }, []);
  const install = (driver: DriverId) => {
    setStatus((cur) => ({ ...cur, [driver]: { driver, state: 'downloading', pct: 0 } }));
    window.dualforge.drivers.install(driver).then(
      (s) => setStatus((cur) => ({ ...cur, [driver]: s })),
      (err: unknown) => setStatus((cur) => ({ ...cur, [driver]: { driver, state: 'failed', code: /E_[A-Z_]+/.exec(String(err))?.[0] ?? 'E_DRIVER_REQUEST' } })),
    );
  };
  return { status, install };
}

export function Health() {
  const health = useStore((s) => s.health);
  const suspendNav = useStore((s) => s.suspendNav);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [exportText, setExportText] = useState<Outcome | null>(null);
  const [resetSlot, setResetSlot] = useState<string | null>(null);
  const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runChecks = useCallback(() => {
    setRunning(true);
    setRunError('');
    window.dualforge.health.run()
      .then((s) => useStore.setState({ health: s }), (err: unknown) => setRunError(`Checks did not run (${String(err)}).`))
      .finally(() => setRunning(false));
  }, []);

  const drivers = useDriverStatus(() => {
    if (recheck.current) clearTimeout(recheck.current);
    recheck.current = setTimeout(() => { recheck.current = null; runChecks(); }, RECHECK_AFTER_INSTALL_MS);
  });
  useEffect(() => () => { if (recheck.current) clearTimeout(recheck.current); }, []);

  // pad presses must not click Install again while one is running
  const installing = Object.values(drivers.status).some((s) => s && BUSY_STATES.has(s.state));
  useEffect(() => (installing ? suspendNav() : undefined), [installing, suspendNav]);

  useEffect(() => {
    window.dualforge.health.get().then((s) => useStore.setState({ health: s }), (err: unknown) => setRunError(`Checks did not run (${String(err)}).`));
  }, []);

  const exportBundle = () => {
    setExportText(null);
    window.dualforge.health.exportBundle().then(
      (r) => setExportText(r ? { ok: true, text: `Saved ${r.path} (${r.files} files, ${(r.bytes / 1048576).toFixed(1)} MB).` } : { ok: true, text: 'Export cancelled.' }),
      (err: unknown) => setExportText({ ok: false, text: `Export failed (${String(err)}).` }),
    );
  };
  const openLogs = () => {
    window.dualforge.health.repair({ id: 'openLogs' }).then((r) => { if (!r.ok) reportErr(r.code ?? 'E_HEALTH_OPEN_LOGS')(r.msg ?? ''); }, reportErr('E_HEALTH_OPEN_LOGS'));
  };

  const results = health ? bySeverity(health.results) : [];
  const sum = health ? healthSummary(health.results) : null;
  return (
    <div className="health-page">
      <div className="pf-head">
        <h2 className="pf-title">Health</h2>
        <p className="pf-sub">What DualForge needs to work, checked every 5 minutes. Repairs only run when you click them.</p>
      </div>

      <section className={`hb ${sum?.worst ?? 'pending'}`} aria-label="Health summary">
        <div className="hb-lightbar" aria-hidden="true" />
        <div className="hb-main">
          <h3 className="hb-headline" aria-live="polite">{sum?.headline ?? 'Checking…'}</h3>
          <p className="hb-sub">
            {health ? `${health.results.length} checks · last run ${new Date(health.ranAt).toLocaleTimeString([], { hour12: false })}` : 'Gathering driver, controller and engine state.'}
          </p>
          {runError && <p className="hc-err" role="alert">{runError}</p>}
          {exportText && <p className={exportText.ok ? 'hb-note' : 'hc-err'} role="status">{exportText.text}</p>}
        </div>
        <div className="hb-actions">
          <button data-nav type="button" className="panel-btn primary" disabled={running} onClick={runChecks}>{running ? 'Checking…' : 'Run checks now'}</button>
          <button data-nav type="button" className="panel-btn" onClick={exportBundle}>Export diagnostics bundle</button>
          <button data-nav type="button" className="panel-btn with-icon" onClick={() => window.dualforge.system.openDataDir().catch(reportErr('E_OPEN_DATA_DIR'))}>
            <FolderIcon size={16} />Open data folder
          </button>
        </div>
      </section>

      <div className="hc-grid">
        {results.map((r) => (
          <CheckCard key={r.id} result={r} driverStatus={driverOf(r) ? drivers.status[driverOf(r)!] : undefined}
            onInstall={drivers.install} onResetProfile={setResetSlot} />
        ))}
      </div>

      <LogViewer onOpenLogs={openLogs} />

      {resetSlot && <ResetSlotDialog slot={resetSlot} onClose={() => setResetSlot(null)} />}
    </div>
  );
}

const driverOf = (r: HealthResult): DriverId | undefined => (r.repair ? DRIVER_FOR_REPAIR[r.repair] : undefined);

function CheckCard({ result: r, driverStatus, onInstall, onResetProfile }: {
  result: HealthResult; driverStatus: DriverStatus | undefined; onInstall(d: DriverId): void; onResetProfile(slot: string): void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const driver = driverOf(r);
  const installing = !!driverStatus && BUSY_STATES.has(driverStatus.state);
  const showProgress = !!driver && !!driverStatus && driverStatus.state !== 'idle';

  const repair = () => {
    if (!r.repair) return;
    if (driver) { setConsent(true); return; }
    if (r.repair === 'resetProfile') { if (r.repairArg) onResetProfile(r.repairArg); return; }
    setBusy(true);
    setOutcome(null);
    window.dualforge.health.repair({ id: r.repair, ...(r.repairArg ? { arg: r.repairArg } : {}) })
      .then((res) => setOutcome(res.ok ? { ok: true, text: 'Done.' } : { ok: false, text: `Repair failed (${res.code ?? 'E_HEALTH_REPAIR_FAILED'})${res.msg ? `: ${res.msg}` : ''}.` }),
        (err: unknown) => setOutcome({ ok: false, text: `Repair failed (${String(err)}).` }))
      .finally(() => setBusy(false));
  };

  return (
    <article className={`hc ${r.status}`} aria-label={r.title}>
      <div className="hc-top">
        <span className={`hc-lamp ${r.status}`} role="img" aria-label={STATUS_NAMES[r.status]} />
        <h4 className="hc-title">{r.title}</h4>
        {r.repair && !consent && (
          <button data-nav type="button" className={`panel-btn${r.status === 'error' ? ' primary' : ''}`} disabled={busy || installing} onClick={repair}>
            {REPAIR_LABELS[r.repair]}
          </button>
        )}
      </div>
      <p className="hc-detail">{r.detail}</p>
      {outcome && <p className={outcome.ok ? 'hc-ok' : 'hc-err'} role="status">{outcome.text}</p>}
      {driver && consent && (
        <ConsentCard driver={driver} onCancel={() => setConsent(false)} onInstall={() => { setConsent(false); onInstall(driver); }} />
      )}
      {showProgress && !consent && <DriverProgress status={driverStatus} />}
    </article>
  );
}

function ResetSlotDialog({ slot, onClose }: { slot: string; onClose(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const n = slot.replace(/^p/, '');
  const reset = () => {
    setBusy(true);
    window.dualforge.health.repair({ id: 'resetProfile', arg: slot })
      .then((r) => {
        if (!r.ok) reportErr(r.code ?? 'E_HEALTH_REPAIR_FAILED')(r.msg ?? '');
        else useStore.getState().slotReplaced(slot).catch(() => undefined);
      }, reportErr('E_HEALTH_REPAIR_FAILED'))
      .finally(onClose);
  };
  return (
    <Modal open title={`Reset profile slot ${n}?`} onClose={onClose} width={420} initialFocus={cancel}>
      <p className="modal-text">The damaged file was already moved to profiles/corrupt. Resetting writes fresh defaults into slot {n}; the other slots are not touched.</p>
      <div className="modal-actions">
        <button data-nav ref={cancel} type="button" className="panel-btn" onClick={onClose}>Cancel</button>
        <button data-nav type="button" className="panel-btn primary" disabled={busy} onClick={reset}>Reset</button>
      </div>
    </Modal>
  );
}
