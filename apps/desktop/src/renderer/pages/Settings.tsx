import { useEffect, useState } from 'react';
import type { HealthState, Settings as SettingsT } from '@dualforge/shared';
import { Segmented } from '../components/controls/Segmented';
import { Toggle } from '../components/controls/Toggle';
import { PanelSection } from '../components/SettingsLayout';
import { FolderIcon } from '../components/icons';
import { useStore } from '../store';
import { TurboPrefs } from './settings/TurboPrefs';

type Flag =
  'hasRumble' | 'hidHide' | 'startWithWindows' | 'startMinimized' | 'closeToTray' | 'updates';
type UpdateResult = { available: boolean; version?: string; code?: string };
type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; percent: number }
  | { phase: 'ready'; version?: string | undefined }
  | { phase: 'failed'; code: string };
const THEMES: { value: SettingsT['theme']; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

/** App-wide preferences (gear in the header). Every change is saved by main at once. */
export function Settings() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const loadSettings = useStore((s) => s.loadSettings);
  const hidHidePending = useStore((s) => s.hidHidePending);
  // build-time: false unless electron-builder.yml publishes to a real owner (not the `dualforge` placeholder)
  const updatesEnabled = typeof __UPDATES_ENABLED__ !== 'undefined' && __UPDATES_ENABLED__;
  // null = unknown (Health not loaded); false = the HidHide driver is missing
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | { error: string } | null>(null);
  const [hidHideInstalled, setHidHideInstalled] = useState<boolean | null>(null);
  // the two explicit clicks after a check found a version: download (with progress), then install & restart
  const [dl, setDl] = useState<DownloadState>({ phase: 'idle' });
  useEffect(() => {
    const updates = window.dualforge.updates;
    if (!updatesEnabled || !updates?.onProgress) return;
    return updates.onProgress((p) =>
      setDl((s) => (s.phase === 'downloading' ? { phase: 'downloading', percent: p.percent } : s)),
    );
  }, [updatesEnabled]);
  // the startup check may already have run (or finish while this page is open): seed from the main process
  useEffect(() => {
    const updates = window.dualforge.updates;
    if (!updatesEnabled || !updates?.last) return;
    let alive = true;
    const sync = () =>
      updates.last().then(
        (s) => {
          if (!alive) return;
          setUpdateResult((prev) => {
            if (s.state === 'available')
              return { available: true, ...(s.version ? { version: s.version } : {}) };
            if (s.state === 'none') return { available: false };
            if (s.state === 'error') return { available: false, code: 'E_UPDATE_CHECK' };
            return prev; // disabled / unchecked: keep what a manual check showed
          });
        },
        () => undefined,
      );
    void sync();
    const off = updates.onChanged?.(() => void sync());
    return () => {
      alive = false;
      off?.();
    };
  }, [updatesEnabled]);
  useEffect(() => {
    loadSettings().catch(() => undefined); // Health repairs can flip hidHide behind the page's back
    const health = window.dualforge.health;
    if (!health) return;
    const apply = (s: HealthState) => {
      const r = s.results.find((x) => x.id === 'hidhide');
      setHidHideInstalled(r ? r.repair !== 'installHidHide' : null);
    };
    health
      .get()
      .then(apply)
      .catch(() => undefined);
    return health.onChanged(apply);
  }, [loadSettings]);
  if (!settings) return null; // still loading
  const flag = (k: Flag, label: string, hint: string) => (
    <Toggle
      label={label}
      hint={hint}
      checked={settings[k]}
      onChange={(v) => void updateSettings({ [k]: v })}
    />
  );
  const checkNow = () => {
    setChecking(true);
    window.dualforge.updates
      .check()
      .then(setUpdateResult, (err: unknown) => setUpdateResult({ error: String(err) }))
      .finally(() => setChecking(false));
  };
  const download = () => {
    setDl({ phase: 'downloading', percent: 0 });
    window.dualforge.updates.download().then(
      (r) =>
        setDl(
          r.ok ? { phase: 'ready', version: r.version } : { phase: 'failed', code: r.code ?? '' },
        ),
      (err: unknown) => setDl({ phase: 'failed', code: String(err) }),
    );
  };
  const install = () => {
    window.dualforge.updates.install().then(
      (r) => {
        if (!r.ok) setDl({ phase: 'failed', code: r.code ?? '' });
      },
      (err: unknown) => setDl({ phase: 'failed', code: String(err) }),
    );
  };
  const offered =
    updateResult && !('error' in updateResult) && updateResult.available
      ? updateResult.version
      : undefined;
  const openDataDir = () => {
    window.dualforge.system
      .openDataDir()
      .catch((err: unknown) =>
        useStore.setState({ lastError: { code: 'E_OPEN_DATA_DIR', msg: String(err) } }),
      );
  };
  return (
    <div className="prefs">
      <section className="prefs-card" aria-labelledby="prefs-controller">
        <h3 id="prefs-controller" className="prefs-heading">
          Controller
        </h3>
        <PanelSection title="Hardware">
          {flag(
            'hasRumble',
            'This controller has rumble motors',
            'Turn off if your DualSense has no working rumble. The Vibrations sliders are greyed out while it is off.',
          )}
          <Toggle
            label="Hide the DualSense from games"
            hint="Games would see only the virtual Xbox controller, so inputs are never doubled. While DualForge is closed the DualSense is visible again. HidHide needs administrator rights on most PCs, so the first enable shows a UAC prompt."
            note={
              hidHideInstalled === false ? 'Driver not installed — install from Health' : undefined
            }
            checked={settings.hidHide}
            onChange={(v) => void updateSettings({ hidHide: v })}
            disabled={hidHidePending || (hidHideInstalled === false && !settings.hidHide)}
            title={
              hidHideInstalled === false
                ? 'Install the HidHide driver from the Health page first'
                : undefined
            }
          />
        </PanelSection>
        <TurboPrefs />
      </section>

      <section className="prefs-card" aria-labelledby="prefs-app">
        <h3 id="prefs-app" className="prefs-heading">
          App
        </h3>
        <PanelSection title="Startup">
          {flag(
            'startWithWindows',
            'Start with Windows',
            'Launch DualForge when you sign in, so your profile is active before the first game.',
          )}
          {flag('startMinimized', 'Start minimized', 'Open without showing the window.')}
          {flag(
            'closeToTray',
            'Close to tray',
            'The close button hides DualForge in the notification area so your profile keeps working. Use Quit in the tray menu to exit.',
          )}
        </PanelSection>
        <PanelSection title="Theme">
          <Segmented
            label="Theme"
            options={THEMES}
            value={settings.theme}
            onChange={(theme) => void updateSettings({ theme })}
          />
        </PanelSection>
        {updatesEnabled && (
          <PanelSection title="Updates">
            <p className="psec-hint">DualForge {appVersion()}</p>
            {flag(
              'updates',
              'Check for updates',
              'Look for a new version when the app starts. Nothing is downloaded or installed without you.',
            )}
            <button
              data-nav
              type="button"
              className="panel-btn"
              disabled={checking}
              onClick={checkNow}
            >
              {checking ? 'Checking…' : 'Check now'}
            </button>
            <p className="psec-hint" role="status" aria-live="polite">
              {updateText(updateResult)}
            </p>
            {offered && (dl.phase === 'idle' || dl.phase === 'failed') && (
              <button data-nav type="button" className="panel-btn" onClick={download}>
                Download {offered}
              </button>
            )}
            {dl.phase === 'downloading' && (
              <div className="update-progress">
                <progress
                  max={100}
                  value={dl.percent}
                  aria-label="Update download progress"
                  aria-valuetext={`${Math.round(dl.percent)}%`}
                />
                <span className="psec-hint">Downloading… {Math.round(dl.percent)}%</span>
              </div>
            )}
            {dl.phase === 'ready' && (
              <>
                <p className="psec-hint">
                  Version {dl.version ?? offered} is downloaded. DualForge will close, install it
                  and start again.
                </p>
                <button data-nav type="button" className="panel-btn" onClick={install}>
                  Install &amp; restart
                </button>
              </>
            )}
            {dl.phase === 'failed' && (
              <p className="psec-hint" role="alert">
                {UPDATE_CODES[dl.code] ?? `The update failed (${dl.code}).`}
              </p>
            )}
          </PanelSection>
        )}
        <PanelSection title="Data">
          <p className="psec-hint">Profiles, settings and logs are stored in one folder.</p>
          <button data-nav type="button" className="panel-btn with-icon" onClick={openDataDir}>
            <FolderIcon size={16} />
            Open data folder
          </button>
        </PanelSection>
      </section>
    </div>
  );
}

const UPDATE_CODES: Record<string, string> = {
  E_UPDATE_DISABLED: 'Turn on "Check for updates" first.',
  E_UPDATE_DEV: 'Update checks are not available in a development build.',
  E_UPDATE_CHECK: 'The update check failed. Try again later.',
  E_UPDATE_NOT_READY: 'Check for updates again first.',
  E_UPDATE_DOWNLOAD: 'The download failed. Check your connection and try again.',
  E_UPDATE_INSTALL: 'The installer could not be started. Download the update again.',
};

function updateText(r: UpdateResult | { error: string } | null): string {
  if (!r) return 'Not checked yet.';
  if ('error' in r) return `The update check failed (${r.error}).`;
  if (r.code) return UPDATE_CODES[r.code] ?? `The update check failed (${r.code}).`;
  return r.available ? `Version ${r.version ?? ''} is available.` : `Up to date (${appVersion()}).`;
}

/** DualForge's own version (build-time constant; absent in unit tests that do not stub it). */
const appVersion = (): string =>
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
