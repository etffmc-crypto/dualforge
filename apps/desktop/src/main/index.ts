import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join, resolve, extname } from 'node:path';
import { statSync } from 'node:fs';
import { z } from 'zod';
import { logger } from './logger.js';
import { createEngineHost } from './engine-host.js';
import { createProfileStore } from './profile-store.js';
import { createSettingsStore } from './settings-store.js';
import { registerIpc } from './register-ipc.js';
import { createInjector } from './injector.js';
import { createGameWatcher } from './game-watcher.js';

let win: BrowserWindow | null = null;
const engine = createEngineHost({ log: logger, onEvent: (e) => { if (win && !win.isDestroyed()) win.webContents.send('engine:event', e); } });

const dataDir = process.env.DUALFORGE_DATA_DIR ?? join(app.getPath('appData'), 'DualForge');
const store = createProfileStore(dataDir, logger);
const settings = createSettingsStore(dataDir, logger);
const ipc = registerIpc({
  ipc: ipcMain, dialog, store, settings, engine, log: logger,
  notifyActive: (id) => { if (win && !win.isDestroyed()) win.webContents.send('profiles:active', id); },
});

// The main process loads the addon too, only to read the foreground process name for auto-switching (E_INJECT_LOAD is logged once).
const injector = createInjector((code, msg) => logger.error({ code, msg }));
const watcher = createGameWatcher({
  foreground: () => injector.foreground(), settings: () => settings.get(), onSwitch: (id) => ipc.applyProfile(id, 'auto'), log: (code, msg) => logger.error({ code, msg }),
  available: injector.available,
});

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
    createWindow();
    engine.start();
    engine.send({ type: 'setSettings', settings: settings.get() });
    engine.send({ type: 'uiFocused', focused: win?.isFocused() ?? true });
    ipc.applyProfile(settings.get().activeProfile);
    watcher.start();
  });
  app.on('before-quit', () => { watcher.stop(); ipc.flush(); engine.stop(); });
  app.on('window-all-closed', () => app.quit());
}
process.on('uncaughtException', (err) => logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }));
