export interface UpdateResult { available: boolean; version?: string; code?: string }

/** The part of electron-updater's AppUpdater that DualForge uses. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{ isUpdateAvailable?: boolean; updateInfo: { version: string } } | null>;
}

export interface UpdaterDeps {
  /** settings.updates; nothing is loaded or fetched while it is false. */
  enabled: () => boolean;
  isPackaged: boolean;
  currentVersion: string;
  /** Lazy so the module (and its network stack) is only touched after the user opted in. */
  load: () => Promise<AutoUpdaterLike>;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
  onResult: (r: UpdateResult) => void;
}

/** Opt-in update check: GitHub provider (from app-update.yml), never downloads or installs by itself. */
export function createUpdater(d: UpdaterDeps) {
  let impl: AutoUpdaterLike | null = null;
  let lastResult: UpdateResult | null = null;

  async function check(): Promise<UpdateResult> {
    if (!d.enabled()) return { available: false, code: 'E_UPDATE_DISABLED' };
    if (!d.isPackaged) return { available: false, code: 'E_UPDATE_DEV' };   // electron-updater has no app-update.yml in a dev run
    try {
      if (!impl) {
        impl = await d.load();
        impl.autoDownload = false;
        impl.autoInstallOnAppQuit = false;
      }
      const r = await impl.checkForUpdates();
      const version = r?.updateInfo.version;
      const available = !!r && (r.isUpdateAvailable ?? version !== d.currentVersion);
      const res: UpdateResult = available && version ? { available: true, version } : { available: false };
      lastResult = res;
      d.log.info({ code: 'UPDATE_CHECK', available: res.available, version: res.version });
      d.onResult(res);
      return res;
    } catch (e) {
      const msg = (e as Error).message;
      if (/app-update\.yml|ENOENT/i.test(msg)) return { available: false, code: 'E_UPDATE_DEV' };
      d.log.error({ code: 'E_UPDATE_CHECK', msg });
      return { available: false, code: 'E_UPDATE_CHECK' };
    }
  }

  return {
    check,
    /** The last successful result (Health's app.update check reads this); null while updates are off or before the first check. */
    last: (): UpdateResult | null => (d.enabled() ? lastResult : null),
  };
}
export type Updater = ReturnType<typeof createUpdater>;
