import type { EngineCommand, Settings } from '@dualforge/shared';
import type { HidHideResult } from './hidhide.js';

export interface SettingsHookDeps {
  hidhide: { enable(): Promise<HidHideResult>; disable(): Promise<HidHideResult> };
  settingsStore: { set(patch: Partial<Settings>): Settings };
  engine: { send(cmd: EngineCommand): void };
  applyLoginItem: (s: Settings) => void;
  log: { error(o: object): void };
  /** Updates were just switched on (starts a first check). */
  onUpdatesEnabled?: () => void;
  /** HidHide state changed; re-run Health. */
  refreshHealth?: () => void;
}

/** What happens after settings:set persisted: login item, updater, HidHide. A rejection reaches the renderer, which reverts its toggle. */
export function createSettingsHooks(d: SettingsHookDeps) {
  return async (prev: Settings, next: Settings): Promise<void> => {
    let loginError: Error | null = null;
    if (prev.startWithWindows !== next.startWithWindows) {
      try {
        d.applyLoginItem(next);
      } catch (e) {
        loginError = e as Error;
        d.log.error({ code: 'E_STARTUP_LOGIN_ITEM', msg: loginError.message });
      }
    }
    if (!prev.updates && next.updates) d.onUpdatesEnabled?.();
    if (prev.hidHide !== next.hidHide) {
      const r = next.hidHide ? await d.hidhide.enable() : await d.hidhide.disable();
      d.refreshHealth?.();
      if (!r.ok) {
        // could not enable/disable: persist the previous value so the toggle tells the truth, and tell the renderer why
        let saved: Settings;
        try {
          saved = d.settingsStore.set({ hidHide: !next.hidHide });
        } catch (e) {
          d.log.error({ code: 'E_SETTINGS_WRITE', msg: (e as Error).message });
          throw new Error('E_SETTINGS_WRITE');
        }
        d.engine.send({ type: 'setSettings', settings: saved });
        // code first (the renderer reads it), then why: the footer tells a hang from a refused prompt by it
        const code = r.code ?? 'E_HIDHIDE_CLI';
        throw new Error(r.msg ? `${code}: ${r.msg}` : code);
      }
    }
    if (loginError) throw new Error('E_STARTUP_LOGIN_ITEM');
  };
}
