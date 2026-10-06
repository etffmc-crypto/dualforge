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
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { logger, LOG_DIR } from './logger.js';
import { resolveAppVersion } from './app-version.js';
import { clearLogs, pruneLogs } from './log-prune.js';
import { registerLogIpc } from './log-tail.js';
import { createHealthService, createEngineFeed } from './health/service.js';
import {
  gatherInput,
  defaultExec,
  queryVigemService,
  HIDHIDE_STUCK_MARKER,
} from './health/adapters.js';
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
import { createHidHide, createHidHideQueue } from './hidhide.js';
import { createSettingsHooks } from './settings-hooks.js';
import { applyLoginItem, shouldHideOnClose, shouldStartHidden } from './startup.js';
import { createTray, type AppTray } from './tray.js';
import { createUpdater, registerUpdateIpc } from './updater.js';
import { createQuitCleanup } from './quit-cleanup.js';
import { createDriverInstaller, registerDriverIpc, type DriverStatus } from './driver-installer.js';

let win: BrowserWindow | null = null;
let tray: AppTray | null = null;
let quitting = false;
const engine = createEngineHost({
  log: logger,
  onEvent: (e) => {
    if (e.type === 'profileEdit') {
      ipc.applyProfileEdit(e); // on-pad turbo: persisted and pushed like a UI edit
      return;
    }
    engineFeed.onEvent(e);
    if (win && !win.isDestroyed()) win.webContents.send('engine:event', e);
  },
});
const engineFeed = createEngineFeed(() => engine.stats());

const APP_VERSION = resolveAppVersion({
  built: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
  getVersion: () => app.getVersion(),
  electronVersion: process.versions.electron,
});
const dataDir = process.env.DUALFORGE_DATA_DIR ?? join(app.getPath('appData'), 'DualForge');
// Crash dumps stay local (no upload) in <data dir>crashes; started before app ready so child processes are covered.
const crashDir = join(dataDir, 'crashes');
startCrashReporter(app, crashReporter, crashDir);
const store = createProfileStore(dataDir, logger);
const settings = createSettingsStore(dataDir, logger);
const updater = createUpdater({
  enabled: () => __UPDATES_ENABLED__ && settings.get().updates, // build-time gate: off until a real publish owner is set
  isPackaged: app.isPackaged,
  currentVersion: APP_VERSION,
  log: logger,
  load: async () => (await import('electron-updater')).autoUpdater,
  onResult: () => {
    void health.run();
  },
  onProgress: (p) => {
    if (win && !win.isDestroyed()) win.webContents.send('updates:progress', p);
  },
  // un-hide the DualSense before the installer takes over; before-quit then finds the cleanup done
  beforeInstall: () => quitCleanup.run(),
});
registerUpdateIpc({ ipc: ipcMain, updater });
const stuckMarker = join(dataDir, HIDHIDE_STUCK_MARKER);
const markCloakStuck = (stuck: boolean) => {
  try {
    if (stuck) writeFileSync(stuckMarker, new Date().toISOString());
    else rmSync(stuckMarker, { force: true });
  } catch (e) {
    logger.warn({ code: 'E_HIDHIDE_CLOAK_STUCK', msg: (e as Error).message });
  }
};
const hidhide = createHidHide({
  ownExe: process.execPath,
  dataDir,
  log: logger,
  onCloakStuck: markCloakStuck,
  cloakedThisSession: () => hidHideQueue.cloakedThisSession(),
});
// every HidHide operation (toggle, startup, repair, quit) goes through this one queue and converges on the setting
const hidHideQueue = createHidHideQueue({
  hidhide,
  desired: () => settings.get().hidHide,
  log: logger,
});
// While DualForge is closed the DualSense must be visible to games again: cloak off first (best effort, 5 s), then
// really quit. Runs whenever this session cloaked, even if the setting was switched off meanwhile.
const quitCleanup = createQuitCleanup({
  hasCli: () => !!hidhide.findCli(),
  cloakOff: () => hidHideQueue.quitCleanup(settings.get().hidHide),
  cloakedThisSession: () => hidHideQueue.cloakedThisSession(),
  markStuck: markCloakStuck,
  log: logger,
});
let hidHideWaitingForPad = false;
const startupHidHide = () =>
  hidHideQueue.startup().then((r) => {
    if (!r.ok) logger.warn({ code: r.code, msg: r.msg });
    hidHideWaitingForPad = !!r.skipped; // retried on the next device-present health change
    void health.run();
  });
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
  notifyTurboEdit: (e) => {
    if (win && !win.isDestroyed()) win.webContents.send('profiles:turboEdit', e);
  },
  onProfilesChanged: () => tray?.refresh(),
  onSettingsChanged: createSettingsHooks({
    hidhide: hidHideQueue,
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
      appVersion: APP_VERSION,
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
    // startup skipped HidHide because the pad was absent: apply it once the pad is present
    const snap = engineFeed.view().snapshot;
    if (
      hidHideWaitingForPad &&
      settings.get().hidHide &&
      snap?.connected &&
      snap.source === 'device'
    ) {
      hidHideWaitingForPad = false;
      void startupHidHide();
    }
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
    enableHidHide: () =>
      // the setting is turned on inside the queue, before converge reads it; the quit/startup logic follows it
      hidHideQueue.repair(() => {
        if (!settings.get().hidHide)
          engine.send({ type: 'setSettings', settings: settings.set({ hidHide: true }) });
      }),
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
      appVersion: APP_VERSION,
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
    if (hidhide.findCli()) void hidHideQueue.quitCleanup(settings.get().hidHide); // un-hide the pad before we are killed
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
    logger.info({ code: 'APP_START', version: APP_VERSION });
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
    if (__UPDATES_ENABLED__ && settings.get().updates)
      setTimeout(() => void updater.check(), 10_000); // opt-in only
    engine.start();
    engine.send({ type: 'setSettings', settings: settings.get() });
    focusGate.windowFocus(win?.isFocused() ?? true);
    focusGate.resend();
    ipc.applyProfile(settings.get().activeProfile);
    watcher.start();
    health.start();
    if (settings.get().hidHide) void startupHidHide(); // cloak is off after a quit/reboot: switch it on again
  });
  // the cloak-off runs once (here or already from "Install & restart"); the real quit waits for it
  app.on('before-quit', (e) => {
    quitting = true;
    if (quitCleanup.state() === 'idle') {
      const done = quitCleanup.run();
      if (quitCleanup.state() === 'running') {
        e.preventDefault();
        void done.then(() => app.quit());
        return;
      }
    }
    if (quitCleanup.state() === 'running') {
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
