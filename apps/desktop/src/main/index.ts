import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { defaultProfile, ProfileSchema, type Profile } from '@dualforge/shared';
import { logger } from './logger.js';
import { createEngineHost } from './engine-host.js';

let win: BrowserWindow | null = null;
let profile: Profile = defaultProfile('p1', 'Profile 1');
const engine = createEngineHost({ log: logger, onEvent: (e) => win?.webContents.send('engine:event', e) });

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1000, minHeight: 680,
    frame: false, backgroundColor: '#0b0b14', show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true },
  });
  win.on('ready-to-show', () => win?.show());
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

ipcMain.handle('profile:get', () => profile);
ipcMain.handle('profile:set', (_e, p: unknown) => {
  const parsed = ProfileSchema.safeParse(p);
  if (!parsed.success) throw new Error('E_PROFILE_SCHEMA');
  profile = parsed.data; engine.send({ type: 'setProfile', profile }); return true;
});
ipcMain.handle('engine:replay', (_e, path: string) => engine.send({ type: 'replay', path }));
ipcMain.handle('engine:useDevice', () => engine.send({ type: 'useDevice' }));
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('window:close', () => win?.close());

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win?.focus());

app.whenReady().then(() => {
  logger.info({ code: 'APP_START', version: app.getVersion() });
  createWindow();
  engine.start(); engine.send({ type: 'setProfile', profile });
});
app.on('before-quit', () => engine.stop());
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }));
