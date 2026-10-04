import {
  app,
  BrowserWindow,
  crashReporter,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron';
import os from 'node:os';
import { basename, join, resolve, extname } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { z } from 'zod';
import { logger, LOG_DIR } from './logger.js';
import { clearLogs, pruneLogs } from './log-prune.js';
import { registerLogIpc } from './log-tail.js';
import { createHealthService, createEngineFeed } from './health/service.js';
import { gatherInput, defaultExec, queryVigemService } from './health/adapters.js';
import { buildSystemInfo, createBundleExporter } from './bundle.js';
import { startCrashReporter } from './crash-reporter.js';
import { registerHealthIpc } from './health/ipc.js';
import { createEngineHost } from './engine-host.js';
import { createProfileStore } from './profile-store.js';
import { createSettingsStore } from './settings-store.js';
import { registerIpc } from './register-ipc.js';
import { createInjector } from './injector.js';
import { createFocusGate } from './focus-gate.js';
import { createGameWatcher } from './game-watcher.js';
import { createProcessLister } from './processes.js';
import { createHidHide } from './hidhide.js';
import { createSettingsHooks } from './settings-hooks.js';
import { applyLoginItem, shouldHideOnClose, shouldStartHidden } from './startup.js';
import { createTray, type AppTray } from './tray.js';
import { createUpdater } from './updater.js';
import { createDriverInstaller, registerDriverIpc, type DriverStatus } from './driver-installer.js';

let win: BrowserWindow | null = null;
let tray: AppTray | null = null;
let quitting = false;
const engine = createEngineHost({
  log: logger,
  onEvent: (e) => {
    engineFeed.onEvent(e);
    if (win && !win.isDestroyed()) win.webContents.send('engine:event', e);
  },
});
const engineFeed = createEngineFeed(() => engine.stats());

const dataDir = process.env.DUALFORGE_DATA_DIR ?? join(app.getPath('appData'), 'DualForge');
// Crash dumps stay local (no upload) in <data dir>crashes; started before app ready so child processes are covered.
const crashDir = join(dataDir, 'crashes');
startCrashReporter(app, crashReporter, crashDir);
const store = createProfileStore(dataDir, logger);
const settings = createSettingsStore(dataDir, logger);
const updater = createUpdater({
  enabled: () => settings.get().updates,
  isPackaged: app.isPackaged,
  currentVersion: app.getVersion(),
  log: logger,
  load: async () => (await import('electron-updater')).autoUpdater,
  onResult: () => {
    void health.run();
  },
});
ipcMain.handle('updates:check', () => updater.check());
const hidhide = createHidHide({ ownExe: process.execPath, log: logger });
const ipc = registerIpc({
  ipc: ipcMain,
  dialog,
  store,
  settings,
  engine,
  log: logger,
  processes: createProcessLister(undefined, [basename(process.execPath)]),
  notifyActive: (id) => {
    if (win && !win.isDestroyed()) win.webContents.send('profiles:active', id);
    tray?.refresh();
  },
  onProfilesChanged: () => tray?.refresh(),
  onSettingsChanged: createSettingsHooks({
    hidhide,
    settingsStore: settings,
    engine,
    log: logger,
    applyLoginItem: (next) => applyLoginItem(app, next, logger),
    onUpdatesEnabled: () => {
      void updater.check();
    },
    refreshHealth: () => {
      void health.run();
    }, // re-check so Health reflects the new state at once
  }),
});

// The main process loads the addon too, only to read the foreground process name for auto-switching (E_INJECT_LOAD is logged once).
const focusGate = createFocusGate((focused) => engine.send({ type: 'uiFocused', focused }));
const injector = createInjector((code, msg) => logger.error({ code, msg }));
const watcher = createGameWatcher({
  foreground: () => injector.foreground(),
  settings: () => settings.get(),
  onSwitch: (id) => ipc.applyProfile(id, 'auto'),
  log: (code, msg) => logger.error({ code, msg }),
  available: injector.available,
  foregroundElevated: () => injector.foregroundElevated(),
  foregroundPid: () => injector.foregroundPid(),
  onOwnForeground: (own) => focusGate.ownForeground(own),
});

const installer = createDriverInstaller({
  fetch,
  openPath: (p) => shell.openPath(p),
  dir: join(app.getPath('temp'), 'DualForge'),
  log: logger,
  emit: (s: DriverStatus) => {
    if (win && !win.isDestroyed()) win.webContents.send('driver:status', s);
  },
});
registerDriverIpc({ ipc: ipcMain, installer, log: logger });
const installRepair = (driver: 'vigem' | 'hidhide') => async () => {
  const s = await installer.install(driver);
  return s.state === 'done'
    ? { ok: true }
    : {
        ok: false,
        code: s.code ?? 'E_DRIVER_DOWNLOAD',
        msg: `driver install failed (${s.code ?? 'E_DRIVER_DOWNLOAD'})`,
      };
};

const health = createHealthService({
  gather: () =>
    gatherInput({
      exec: defaultExec,
      dataDir,
      logDir: LOG_DIR,
      ownExe: process.execPath,
      appVersion: app.getVersion(),
      engine: () => engineFeed.view(),
      updateAvailable: () => updater.last()?.available ?? null,
      injector: {
        available: injector.available,
        lastForeign: () => watcher.lastForeignForeground(),
        selfElevated: () => injector.selfElevated(),
      },
      onError: (code, msg) => logger.warn({ code, msg }),
    }),
  emit: (s) => {
    if (win && !win.isDestroyed()) win.webContents.send('health:changed', s);
  },
  log: logger,
  repairs: {
    restartEngine: () => engine.restart(),
    resetProfile: (id) => {
      ipc.resetProfile(id);
    },
    clearLogs: () => clearLogs(LOG_DIR),
    openLogs: () => shell.openPath(LOG_DIR),
    installViGEm: installRepair('vigem'),
    installHidHide: installRepair('hidhide'),
    enableHidHide: async () => {
      const r = await hidhide.enable();
      if (r.ok && !settings.get().hidHide)
        engine.send({ type: 'setSettings', settings: settings.set({ hidHide: true }) }); // the quit/startup logic follows the setting
      return r;
    },
    exportBundle: async () =>
      (await bundle.exportWithDialog()) ? { ok: true } : { ok: false, code: 'E_BUNDLE_CANCELLED' },
  },
});
const bundle = createBundleExporter({
  logDir: LOG_DIR,
  crashDir: app.getPath('crashDumps'),
  dataDir,
  dialog,
  log: logger,
  now: Date.now,
  health: () => health.get(),
  system: async () =>
    buildSystemInfo({
      appVersion: app.getVersion(),
      vigemState: await queryVigemService(defaultExec, (code, msg) => logger.warn({ code, msg })),
      addonAvailable: injector.available,
      foregroundElevatedExport: injector.hasForegroundElevated,
      os,
      versions: process.versions,
    }),
});
registerHealthIpc({
  ipc: ipcMain,
  service: health,
  log: logger,
  exportBundle: () => bundle.exportWithDialog(),
});
registerLogIpc({ ipc: ipcMain, dir: LOG_DIR, log: logger });

const MAX_REPLAY_BYTES = 16 * 1024 * 1024;
function validateReplayPath(raw: unknown): string {
  const p = resolve(z.string().parse(raw));
  if (
    p.startsWith('\\') ||
    extname(p).toLowerCase() !== '.hidlog' ||
    statSync(p).size > MAX_REPLAY_BYTES
  ) {
    logger.error({ code: 'E_REPLAY_PATH', msg: 'replay path rejected' });
    throw new Error('E_REPLAY_PATH');
  }
  return p;
}

function createWindow(): void {
  const startHidden = shouldStartHidden(process.argv, settings.get(), tray?.exists() ?? false);
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0d0b10',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.on('ready-to-show', () => {
    if (!startHidden) win?.show();
  });
  // The close button hides to the tray (when enabled and a tray exists); Quit from the tray menu really quits.
  win.on('close', (e) => {
    if (
      shouldHideOnClose({
        closeToTray: settings.get().closeToTray,
        hasTray: tray?.exists() ?? false,
        quitting,
      })
    ) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('hide', () => tray?.refresh());
  win.on('session-end', () => {
    quitting = true;
    ipc.flush(); // the process may be killed right after logoff/shutdown: write pending profile edits now
  }); // Windows logoff/shutdown must not be swallowed by close-to-tray
  win.on('focus', () => focusGate.windowFocus(true));
  win.on('blur', () => {
    focusGate.windowFocus(false);
    watcher.sampleOwnForeground(); // a native dialog of ours may be in front: keep the gate closed
  });
  win.on('closed', () => {
    win = null;
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

ipcMain.handle('engine:replay', (_e, raw: unknown) => {
  try {
    engine.send({ type: 'replay', path: validateReplayPath(raw) });
  } catch (err) {
    if ((err as Error).message !== 'E_REPLAY_PATH')
      logger.error({ code: 'E_REPLAY_PATH', msg: (err as Error).message });
    throw new Error('E_REPLAY_PATH');
  }
});
// no payload: the renderer can only ever open our own data folder
ipcMain.handle('system:openDataDir', () => shell.openPath(dataDir));
ipcMain.handle('engine:useDevice', () => engine.send({ type: 'useDevice' }));
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:toggleMaximize', () =>
  win?.isMaximized() ? win.unmaximize() : win?.maximize(),
);
ipcMain.on('window:close', () => win?.close());

/** Packaged builds ship resources next to the app (extraResources); a dev/e2e run reads them from apps/desktop/resources. */
function trayIconPath(): string {
  const candidates = [
    join(process.resourcesPath, 'resources', 'tray.png'),
    join(__dirname, '../../resources/tray.png'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[1]!;
}

function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    logger.info({ code: 'APP_START', version: app.getVersion() });
    const pruned = pruneLogs(LOG_DIR, Date.now(), (msg) => logger.warn({ code: 'LOG_PRUNE', msg }));
    if (pruned.length) logger.info({ code: 'LOG_PRUNE', deleted: pruned.length });
    tray = createTray({
      Tray,
      Menu,
      nativeImage,
      iconPath: trayIconPath(),
      log: logger,
      profiles: () => store.list().map((p) => ({ id: p.id, name: p.name })),
      activeId: () => ipc.currentEngineProfile(),
      show: showWindow,
      activate: (id) => {
        try {
          ipc.activate(id);
        } catch (e) {
          logger.error({ code: 'E_TRAY_ACTIVATE', msg: (e as Error).message });
        }
      },
      health: () => {
        showWindow();
        win?.webContents.send('app:navigate', 'health');
      },
      quit: () => app.quit(),
    });
    createWindow();
    applyLoginItem(app, settings.get(), logger);
    if (settings.get().updates) setTimeout(() => void updater.check(), 10_000); // opt-in only
    engine.start();
    engine.send({ type: 'setSettings', settings: settings.get() });
    focusGate.windowFocus(win?.isFocused() ?? true);
    focusGate.resend();
    ipc.applyProfile(settings.get().activeProfile);
    watcher.start();
    health.start();
    if (settings.get().hidHide) {
      // cloak is off after a quit/reboot: switch it on again
      void hidhide.enable().then((r) => {
        if (!r.ok) logger.warn({ code: r.code, msg: r.msg });
        void health.run();
      });
    }
  });
  // While DualForge is closed the DualSense must be visible to games again: cloak off first (best effort, 2 s), then really quit.
  let quitCleanup: 'idle' | 'running' | 'done' = 'idle';
  app.on('before-quit', (e) => {
    quitting = true;
    if (quitCleanup === 'idle' && settings.get().hidHide && hidhide.findCli()) {
      e.preventDefault();
      quitCleanup = 'running';
      const timeout = new Promise<void>((r) => setTimeout(r, 2000));
      void Promise.race([hidhide.disable(), timeout])
        .catch(() => undefined)
        .finally(() => {
          quitCleanup = 'done';
          app.quit();
        });
      return;
    }
    if (quitCleanup === 'running') {
      e.preventDefault();
      return;
    }
    tray?.destroy();
    health.stop();
    watcher.stop();
    ipc.flush();
    engine.stop();
  });
  app.on('window-all-closed', () => app.quit());
}
process.on('uncaughtException', (err) =>
  logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }),
);
