import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { logger } from './logger.js';

let win: BrowserWindow | null = null;

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

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win?.focus());

app.whenReady().then(() => { logger.info({ code: 'APP_START', version: app.getVersion() }); createWindow(); });
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }));
