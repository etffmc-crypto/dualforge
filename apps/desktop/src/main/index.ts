import { app, BrowserWindow, crashReporter, dialog, ipcMain, shell } from 'electron';
import os from 'node:os';
import { basename, join, resolve, extname } from 'node:path';
import { statSync } from 'node:fs';
import { z } from 'zod';
import { logger, LOG_DIR } from './logger.js';
import { clearLogs, pruneLogs } from './log-prune.js';
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
import { createGameWatcher } from './game-watcher.js';
import { createProcessLister } from './processes.js';

let win: BrowserWindow | null = null;
const engine = createEngineHost({ log: logger, onEvent: (e) => { engineFeed.onEvent(e); if (win && !win.isDestroyed()) win.webContents.send('engine:event', e); } });
const engineFeed = createEngineFeed(() => engine.stats());

const dataDir = process.env.DUALFORGE_DATA_DIR ?? join(app.getPath('appData'), 'DualForge');
// Crash dumps stay local (no upload) in <data dir>crashes; started before app ready so child processes are covered.
const crashDir = join(dataDir, 'crashes');
startCrashReporter(app, crashReporter, crashDir);
const store = createProfileStore(dataDir, logger);
const settings = createSettingsStore(dataDir, logger);
const ipc = registerIpc({
  ipc: ipcMain, dialog, store, settings, engine, log: logger,
  processes: createProcessLister(undefined, [basename(process.execPath)]),
  notifyActive: (id) => { if (win && !win.isDestroyed()) win.webContents.send('profiles:active', id); },
});

// The main process loads the addon too, only to read the foreground process name for auto-switching (E_INJECT_LOAD is logged once).
const injector = createInjector((code, msg) => logger.error({ code, msg }));
const watcher = createGameWatcher({
  foreground: () => injector.foreground(), settings: () => settings.get(), onSwitch: (id) => ipc.applyProfile(id, 'auto'), log: (code, msg) => logger.error({ code, msg }),
  available: injector.available, foregroundElevated: () => injector.foregroundElevated(),
});

const health = createHealthService({
  gather: () => gatherInput({
    exec: defaultExec, dataDir, logDir: LOG_DIR, ownExe: process.execPath, appVersion: app.getVersion(), engine: () => engineFeed.view(),
    injector: { available: injector.available, foregroundElevated: () => watcher.lastForeignForeground()?.elevated ?? null, selfElevated: () => injector.selfElevated() },
    onError: (code, msg) => logger.warn({ code, msg }),
  }),
  emit: (s) => { if (win && !win.isDestroyed()) win.webContents.send('health:changed', s); },
  log: logger,
  repairs: {
    restartEngine: () => engine.restart(),
    resetProfile: (id) => { ipc.resetProfile(id); },
    clearLogs: () => clearLogs(LOG_DIR),
    openLogs: () => shell.openPath(LOG_DIR),
    exportBundle: async () => ((await bundle.exportWithDialog()) ? { ok: true } : { ok: false, code: 'E_BUNDLE_CANCELLED' }),
  },
});
const bundle = createBundleExporter({
  logDir: LOG_DIR, crashDir: app.getPath('crashDumps'), dataDir, dialog, log: logger, now: Date.now,
  health: () => health.get(),
  system: async () => buildSystemInfo({
    appVersion: app.getVersion(), vigemState: await queryVigemService(defaultExec, (code, msg) => logger.warn({ code, msg })),
    addonAvailable: injector.available, foregroundElevatedExport: injector.hasForegroundElevated,
    os, versions: process.versions,
  }),
});
registerHealthIpc({ ipc: ipcMain, service: health, log: logger, exportBundle: () => bundle.exportWithDialog() });

const MAX_REPLAY_BYTES = 16 * 1024 * 1024;
function validateReplayPath(raw: unknown): string {
  const p = resolve(z.string().parse(raw));
  if (p.startsWith('\\') || extname(p).toLowerCase() !== '.hidlog' || statSync(p).size > MAX_REPLAY_BYTES) {
    logger.error({ code: 'E_REPLAY_PATH', msg: 'replay path rejected' });
    throw new Error('E_REPLAY_PATH');
  }
  return p;
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1000, minHeight: 680,
    frame: false, backgroundColor: '#0d0b10', show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true },
  });
  win.on('ready-to-show', () => win?.show());
  win.on('focus', () => engine.send({ type: 'uiFocused', focused: true }));
  win.on('blur', () => engine.send({ type: 'uiFocused', focused: false }));
  win.on('closed', () => { win = null; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

ipcMain.handle('engine:replay', (_e, raw: unknown) => {
  try { engine.send({ type: 'replay', path: validateReplayPath(raw) }); }
  catch (err) {
    if ((err as Error).message !== 'E_REPLAY_PATH') logger.error({ code: 'E_REPLAY_PATH', msg: (err as Error).message });
    throw new Error('E_REPLAY_PATH');
  }
});
// no payload: the renderer can only ever open our own data folder
ipcMain.handle('system:openDataDir', () => shell.openPath(dataDir));
ipcMain.handle('engine:useDevice', () => engine.send({ type: 'useDevice' }));
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('window:close', () => win?.close());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    logger.info({ code: 'APP_START', version: app.getVersion() });
    const pruned = pruneLogs(LOG_DIR, Date.now(), (msg) => logger.warn({ code: 'LOG_PRUNE', msg }));
    if (pruned.length) logger.info({ code: 'LOG_PRUNE', deleted: pruned.length });
    createWindow();
    engine.start();
    engine.send({ type: 'setSettings', settings: settings.get() });
    engine.send({ type: 'uiFocused', focused: win?.isFocused() ?? true });
    ipc.applyProfile(settings.get().activeProfile);
    watcher.start();
    health.start();
  });
  app.on('before-quit', () => { health.stop(); watcher.stop(); ipc.flush(); engine.stop(); });
  app.on('window-all-closed', () => app.quit());
}
process.on('uncaughtException', (err) => logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }));
