import { z } from 'zod';

export interface UpdateResult {
  available: boolean;
  version?: string;
  code?: string;
}
export interface UpdateProgress {
  /** 0..100 */
  percent: number;
  transferred: number;
  total: number;
}
export interface UpdateActionResult {
  ok: boolean;
  version?: string;
  code?: string;
}

/** The part of electron-updater's AppUpdater that DualForge uses. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{
    isUpdateAvailable?: boolean;
    updateInfo: { version: string };
  } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(
    event: 'download-progress',
    cb: (p: { percent: number; transferred: number; total: number }) => void,
  ): unknown;
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
  /** Download progress for the Settings page (only while a user-started download runs). */
  onProgress?: (p: UpdateProgress) => void;
  /** Awaited before quitAndInstall: the HidHide quit cleanup, so the installer never races it. */
  beforeInstall?: () => Promise<void>;
}

/**
 * Opt-in updates from GitHub releases (provider from app-update.yml). Nothing happens by itself: the user checks (or the
 * startup check runs when settings.updates is on), then clicks once to download and a second time to quit and install.
 */
export function createUpdater(d: UpdaterDeps) {
  let impl: AutoUpdaterLike | null = null;
  let lastResult: UpdateResult | null = null;
  let lastFailed = false;
  let downloading: Promise<UpdateActionResult> | null = null;
  let downloadedVersion: string | null = null;

  async function ensureImpl(): Promise<AutoUpdaterLike> {
    if (!impl) {
      const u = await d.load();
      u.autoDownload = false;
      u.autoInstallOnAppQuit = false;
      u.on('download-progress', (p) =>
        d.onProgress?.({
          percent: Math.max(0, Math.min(100, Number(p.percent) || 0)),
          transferred: Number(p.transferred) || 0,
          total: Number(p.total) || 0,
        }),
      );
      impl = u;
    }
    return impl;
  }

  /** The reason an update action cannot run at all (off / dev build), or null. */
  function gate(): string | null {
    if (!d.enabled()) return 'E_UPDATE_DISABLED';
    if (!d.isPackaged) return 'E_UPDATE_DEV'; // electron-updater has no app-update.yml in a dev run
    return null;
  }

  async function check(): Promise<UpdateResult> {
    const blocked = gate();
    if (blocked) return { available: false, code: blocked };
    try {
      const u = await ensureImpl();
      const r = await u.checkForUpdates();
      const version = r?.updateInfo.version;
      const available = !!r && (r.isUpdateAvailable ?? version !== d.currentVersion);
      const res: UpdateResult =
        available && version ? { available: true, version } : { available: false };
      lastResult = res;
      lastFailed = false;
      d.log.info({ code: 'UPDATE_CHECK', available: res.available, version: res.version });
      d.onResult(res);
      return res;
    } catch (e) {
      const msg = (e as Error).message;
      if (/app-update\.yml|ENOENT/i.test(msg)) return { available: false, code: 'E_UPDATE_DEV' };
      d.log.error({ code: 'E_UPDATE_CHECK', msg });
      const res: UpdateResult = { available: false, code: 'E_UPDATE_CHECK' };
      lastFailed = true; // Health shows the error until the next successful check
      d.onResult(res);
      return res;
    }
  }

  /** First explicit click: fetch the update found by the last check (progress via onProgress). Never installs. */
  function download(): Promise<UpdateActionResult> {
    const blocked = gate();
    if (blocked) return Promise.resolve({ ok: false, code: blocked });
    const version = lastResult?.available ? lastResult.version : undefined;
    if (!impl || !version) return Promise.resolve({ ok: false, code: 'E_UPDATE_NOT_READY' });
    if (downloadedVersion === version) return Promise.resolve({ ok: true, version });
    if (downloading) return downloading; // a double click joins the running download
    const u = impl;
    d.log.info({ code: 'UPDATE_DOWNLOAD', version });
    downloading = u
      .downloadUpdate()
      .then((): UpdateActionResult => {
        downloadedVersion = version;
        d.log.info({ code: 'UPDATE_DOWNLOADED', version });
        return { ok: true, version };
      })
      .catch((e: unknown): UpdateActionResult => {
        d.log.error({ code: 'E_UPDATE_DOWNLOAD', msg: (e as Error).message });
        return { ok: false, code: 'E_UPDATE_DOWNLOAD' };
      })
      .finally(() => {
        downloading = null;
      });
    return downloading;
  }

  /**
   * Second explicit click: un-hide the pad (HidHide quit cleanup, capped), then quit DualForge and run the downloaded
   * installer (it restarts the app afterwards).
   */
  let installing: Promise<UpdateActionResult> | null = null;
  function install(): Promise<UpdateActionResult> {
    const blocked = gate();
    if (blocked) return Promise.resolve({ ok: false, code: blocked });
    const u = impl;
    const version = downloadedVersion;
    if (!u || !version) return Promise.resolve({ ok: false, code: 'E_UPDATE_NOT_READY' });
    if (installing) return installing; // a double click must not start the installer twice
    d.log.info({ code: 'UPDATE_INSTALL', version });
    installing = (async (): Promise<UpdateActionResult> => {
      try {
        await d.beforeInstall?.();
      } catch (e) {
        d.log.warn({ code: 'E_UPDATE_INSTALL', msg: `quit cleanup: ${(e as Error).message}` });
      }
      try {
        u.quitAndInstall(false, true);
      } catch (e) {
        d.log.error({ code: 'E_UPDATE_INSTALL', msg: (e as Error).message });
        installing = null; // allow another try
        return { ok: false, code: 'E_UPDATE_INSTALL' };
      }
      return { ok: true, version };
    })();
    return installing;
  }

  return {
    check,
    download,
    install,
    /** The last successful result (Health's app.update check reads this); null while updates are off or before the first check. */
    last: (): UpdateResult | null => (d.enabled() ? lastResult : null),
    /** The most recent check failed (cleared by the next successful one). */
    failed: (): boolean => d.enabled() && lastFailed,
  };
}
export type Updater = ReturnType<typeof createUpdater>;

/** None of the update channels take a payload; anything the renderer sends along is rejected. */
const NoArgs = z.tuple([]);
type Handler = (event: unknown, ...args: unknown[]) => unknown;

export function registerUpdateIpc(d: {
  ipc: { handle(channel: string, fn: Handler): void };
  updater: Pick<Updater, 'check' | 'download' | 'install'>;
}): void {
  const h = (ch: string, fn: () => unknown) =>
    d.ipc.handle(ch, (_e, ...a) => {
      NoArgs.parse(a);
      return fn();
    });
  h('updates:check', () => d.updater.check());
  h('updates:download', () => d.updater.download());
  h('updates:install', () => d.updater.install());
}
