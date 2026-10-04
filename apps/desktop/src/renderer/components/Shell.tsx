import { useEffect, type PropsWithChildren } from 'react';
import type { HealthState } from '@dualforge/shared';
import { Header } from './Header';
import { Footer } from './Footer';
import { isPage, useStore } from '../store';
import { applyTheme } from '../theme';
import { useGamepadNav } from '../hooks/useGamepadNav';

/** Mirrors `settings.theme` onto `<html data-theme>` (and remembers it for the next boot). Until settings load, the theme `bootTheme()` set stays. */
export function useThemeSync(): void {
  const theme = useStore((s) => s.settings?.theme ?? null);
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
}

/** Main runs the first checks 3 s after start (so the engine can connect); the header asks a little after that. */
export const FIRST_HEALTH_FETCH_MS = 4000;

/**
 * Keeps `store.health` current (every `health:changed` push, plus one `health.get` after `firstFetchMs` in case the
 * startup push came before the window loaded) and follows main's navigation requests (tray "Health"); a page id
 * outside the whitelist is ignored.
 */
export function useAppFeeds(firstFetchMs = FIRST_HEALTH_FETCH_MS): void {
  useEffect(() => {
    const d = window.dualforge;
    const offs: (() => void)[] = [];
    const setHealth = (health: HealthState) => useStore.setState({ health });
    if (d.health) {
      const health = d.health;
      offs.push(health.onChanged(setHealth));
      const t = setTimeout(() => {
        // a fresher answer (push or Health page) wins; failures are reported by the Health page itself
        if (!useStore.getState().health)
          health
            .get()
            .then(setHealth)
            .catch(() => undefined);
      }, firstFetchMs);
      offs.push(() => clearTimeout(t));
    }
    if (d.app)
      offs.push(
        d.app.onNavigate((p) => {
          if (isPage(p)) useStore.getState().setPage(p);
        }),
      );
    return () => {
      for (const off of offs) off();
    };
  }, [firstFetchMs]);
}

export function Shell({ children }: PropsWithChildren) {
  const subscribe = useStore((s) => s.subscribe);
  const loadProfile = useStore((s) => s.loadProfile);
  const loadSettings = useStore((s) => s.loadSettings);
  const refreshProfiles = useStore((s) => s.refreshProfiles);
  useThemeSync();
  useGamepadNav();
  useAppFeeds();
  useEffect(() => {
    const report = (code: string) => (err: unknown) =>
      useStore.setState({ lastError: { code, msg: String(err) } });
    loadProfile().catch(report('E_PROFILE_LOAD'));
    loadSettings().catch(report('E_SETTINGS_LOAD'));
    refreshProfiles().catch(report('E_PROFILE_LIST'));
    return subscribe();
  }, [subscribe, loadProfile, loadSettings, refreshProfiles]);
  return (
    <div className="app">
      <Header />
      <main className="body">{children}</main>
      <Footer />
    </div>
  );
}
