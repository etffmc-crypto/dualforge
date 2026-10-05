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
};

function updateText(r: UpdateResult | { error: string } | null): string {
  if (!r) return '';
  if ('error' in r) return `The update check failed (${r.error}).`;
  if (r.code) return UPDATE_CODES[r.code] ?? `The update check failed (${r.code}).`;
  return r.available
    ? `Version ${r.version ?? ''} is available.`
    : 'You are on the latest version.';
}
