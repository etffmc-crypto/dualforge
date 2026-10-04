import { useEffect, type PropsWithChildren } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { useStore } from '../store';
import { applyTheme } from '../theme';
import { useGamepadNav } from '../hooks/useGamepadNav';

/** Mirrors `settings.theme` onto `<html data-theme>` (and remembers it for the next boot). Until settings load, the theme `bootTheme()` set stays. */
export function useThemeSync(): void {
  const theme = useStore((s) => s.settings?.theme ?? null);
  useEffect(() => { if (theme) applyTheme(theme); }, [theme]);
}

export function Shell({ children }: PropsWithChildren) {
  const subscribe = useStore((s) => s.subscribe);
  const loadProfile = useStore((s) => s.loadProfile);
  const loadSettings = useStore((s) => s.loadSettings);
  const refreshProfiles = useStore((s) => s.refreshProfiles);
  useThemeSync();
  useGamepadNav();
  useEffect(() => {
    const report = (code: string) => (err: unknown) => useStore.setState({ lastError: { code, msg: String(err) } });
    loadProfile().catch(report('E_PROFILE_LOAD'));
    loadSettings().catch(report('E_SETTINGS_LOAD'));
    refreshProfiles().catch(report('E_PROFILE_LIST'));
    return subscribe();
  }, [subscribe, loadProfile, loadSettings, refreshProfiles]);
  return <div className="app"><Header /><main className="body">{children}</main><Footer /></div>;
}
