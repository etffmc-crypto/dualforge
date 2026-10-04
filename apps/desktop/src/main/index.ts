import { app, BrowserWindow, ipcMain } from 'electron';
import { join, resolve, extname } from 'node:path';
import { statSync } from 'node:fs';
import { z } from 'zod';
import { defaultProfile, ProfileSchema, type Profile } from '@dualforge/shared';
import { logger } from './logger.js';
import { createEngineHost } from './engine-host.js';

let win: BrowserWindow | null = null;
let profile: Profile = defaultProfile('p1', 'Profile 1');
const engine = createEngineHost({ log: logger, onEvent: (e) => { if (win && !win.isDestroyed()) win.webContents.send('engine:event', e); } });

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
  win.on('closed', () => { win = null; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

ipcMain.handle('profile:get', () => profile);
ipcMain.handle('profile:set', (_e, p: unknown) => {
  const parsed = ProfileSchema.safeParse(p);
  if (!parsed.success) throw new Error('E_PROFILE_SCHEMA');
  profile = parsed.data; engine.send({ type: 'setProfile', profile }); return true;
});
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
    engine.start(); engine.send({ type: 'setProfile', profile });
  });
  app.on('before-quit', () => engine.stop());
  app.on('window-all-closed', () => app.quit());
}
process.on('uncaughtException', (err) => logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }));
