import type { Settings as SettingsT } from '@dualforge/shared';
import { Segmented } from '../components/controls/Segmented';
import { Toggle } from '../components/controls/Toggle';
import { PanelSection } from '../components/SettingsLayout';
import { FolderIcon } from '../components/icons';
import { useStore } from '../store';

type Flag = 'hasRumble' | 'hidHide' | 'startWithWindows' | 'startMinimized' | 'updates';
const THEMES: { value: SettingsT['theme']; label: string }[] = [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }];

/** App-wide preferences (gear in the header). Every change is saved by main at once. */
export function Settings() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  if (!settings) return null; // still loading
  const flag = (k: Flag, label: string, hint: string) => (
    <Toggle label={label} hint={hint} checked={settings[k]} onChange={(v) => void updateSettings({ [k]: v })} />
  );
  const openDataDir = () => {
    window.dualforge.system.openDataDir().catch((err: unknown) => useStore.setState({ lastError: { code: 'E_OPEN_DATA_DIR', msg: String(err) } }));
  };
  return (
    <div className="prefs">
      <section className="prefs-card" aria-labelledby="prefs-controller">
        <h3 id="prefs-controller" className="prefs-heading">Controller</h3>
        <PanelSection title="Hardware">
          {flag('hasRumble', 'This controller has rumble motors', 'Turn off if your DualSense has no working rumble. The Vibrations sliders are greyed out while it is off.')}
          <Toggle
            label="Hide the DualSense from games" hint="Games would see only the virtual Xbox controller, so inputs are never doubled. Needs the HidHide driver."
            checked={settings.hidHide} onChange={() => {}} disabled title="Coming in Plan 4"
          />
        </PanelSection>
      </section>

      <section className="prefs-card" aria-labelledby="prefs-app">
        <h3 id="prefs-app" className="prefs-heading">App</h3>
        <PanelSection title="Startup">
          {flag('startWithWindows', 'Start with Windows', 'Launch DualForge when you sign in, so your profile is active before the first game.')}
          {flag('startMinimized', 'Start minimized', 'Open without showing the window.')}
        </PanelSection>
        <PanelSection title="Theme">
          <Segmented label="Theme" options={THEMES} value={settings.theme} onChange={(theme) => void updateSettings({ theme })} />
        </PanelSection>
        <PanelSection title="Updates">
          {flag('updates', 'Check for updates', 'Look for a new version when the app starts.')}
        </PanelSection>
        <PanelSection title="Data">
          <p className="psec-hint">Profiles, settings and logs are stored in one folder.</p>
          <button type="button" className="panel-btn with-icon" onClick={openDataDir}><FolderIcon size={16} />Open data folder</button>
        </PanelSection>
      </section>
    </div>
  );
}
