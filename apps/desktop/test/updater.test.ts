import { describe, expect, it, vi } from 'vitest';
import { createUpdater, registerUpdateIpc } from '../src/main/updater.js';

type ProgressCb = (p: { percent: number; transferred: number; total: number }) => void;

function rig(
  opts: {
    enabled?: boolean;
    packaged?: boolean;
    check?: () => Promise<unknown>;
    download?: () => Promise<unknown>;
  } = {},
) {
  let progress: ProgressCb | null = null;
  const au = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(
      opts.check ?? (async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.2.0' } })),
    ),
    downloadUpdate: vi.fn(opts.download ?? (async () => ['DualForge-Setup-0.2.0.exe'])),
    quitAndInstall: vi.fn(),
    on: vi.fn((_ev: string, cb: ProgressCb) => {
      progress = cb;
    }),
  };
  const load = vi.fn(async () => au);
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const results: unknown[] = [];
  const progressSeen: unknown[] = [];
  const u = createUpdater({
    enabled: () => opts.enabled ?? true,
    isPackaged: opts.packaged ?? true,
    load: load as never,
    log,
    onResult: (r) => results.push(r),
    onProgress: (p) => progressSeen.push(p),
    currentVersion: '0.1.0',
  });
  return { u, au, load, log, results, progressSeen, emitProgress: (p: never) => progress?.(p) };
}

describe('updater', () => {
  it('is never loaded while updates are off', async () => {
    const r = rig({ enabled: false });
    expect(await r.u.check()).toEqual({ available: false, code: 'E_UPDATE_DISABLED' });
    expect(r.load).not.toHaveBeenCalled();
    expect(r.u.last()).toBeNull();
  });
  it('configures manual download/install and reports an available version', async () => {
    const r = rig();
    expect(await r.u.check()).toEqual({ available: true, version: '0.2.0' });
    expect(r.au.autoDownload).toBe(false);
    expect(r.au.autoInstallOnAppQuit).toBe(false);
    expect(r.u.last()).toEqual({ available: true, version: '0.2.0' });
    expect(r.results).toEqual([{ available: true, version: '0.2.0' }]);
  });
  it('reports up to date', async () => {
    const r = rig({
      check: async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.1.0' } }),
    });
    expect(await r.u.check()).toEqual({ available: false });
  });
  it('dev builds answer E_UPDATE_DEV without touching the network', async () => {
    const r = rig({ packaged: false });
    expect(await r.u.check()).toEqual({ available: false, code: 'E_UPDATE_DEV' });
    expect(r.au.checkForUpdates).not.toHaveBeenCalled();
  });
  it('a missing app-update.yml is E_UPDATE_DEV, other failures E_UPDATE_CHECK', async () => {
    const a = rig({
      check: async () => {
        throw new Error('ENOENT: no such file or directory, open app-update.yml');
      },
    });
    expect(await a.u.check()).toEqual({ available: false, code: 'E_UPDATE_DEV' });
    const b = rig({
      check: async () => {
        throw new Error('net::ERR_INTERNET_DISCONNECTED');
      },
    });
    expect(await b.u.check()).toEqual({ available: false, code: 'E_UPDATE_CHECK' });
    expect(b.log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_UPDATE_CHECK' }));
  });
  it('a failed check does not replace the last good result', async () => {
    let n = 0;
    const r = rig({
      check: async () => {
        if (n++ === 0) return { isUpdateAvailable: true, updateInfo: { version: '0.2.0' } };
        throw new Error('offline');
      },
    });
    await r.u.check();
    await r.u.check();
    expect(r.u.last()).toEqual({ available: true, version: '0.2.0' });
  });
  it('turning updates off forgets the last result', async () => {
    let on = true;
    const au = {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.2.0' } }),
      downloadUpdate: async () => [],
      quitAndInstall: () => {},
      on: () => {},
    };
    const u = createUpdater({
      enabled: () => on,
      isPackaged: true,
      load: async () => au,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onResult: () => {},
      currentVersion: '0.1.0',
    });
    await u.check();
    on = false;
    expect(u.last()).toBeNull();
  });
});

describe('updater download and install (two explicit clicks)', () => {
  it('check never downloads or installs by itself', async () => {
    const r = rig();
    await r.u.check();
    expect(r.au.downloadUpdate).not.toHaveBeenCalled();
    expect(r.au.quitAndInstall).not.toHaveBeenCalled();
  });
  it('download before a check found a version is E_UPDATE_NOT_READY', async () => {
    const r = rig();
    expect(await r.u.download()).toEqual({ ok: false, code: 'E_UPDATE_NOT_READY' });
    const up = rig({
      check: async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.1.0' } }),
    });
    await up.u.check();
    expect(await up.u.download()).toEqual({ ok: false, code: 'E_UPDATE_NOT_READY' });
    expect(up.au.downloadUpdate).not.toHaveBeenCalled();
  });
  it('download fetches the offered version, reports clamped progress, and does not install', async () => {
    let finish!: () => void;
    const r = rig({ download: () => new Promise<void>((res) => (finish = res)) });
    await r.u.check();
    const p = r.u.download();
    const again = r.u.download(); // a double click joins the running download
    r.emitProgress({ percent: 42.5, transferred: 425, total: 1000 } as never);
    r.emitProgress({ percent: 140, transferred: 1, total: 1 } as never);
    finish();
    expect(await p).toEqual({ ok: true, version: '0.2.0' });
    expect(await again).toEqual({ ok: true, version: '0.2.0' });
    expect(r.au.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(r.progressSeen).toEqual([
      { percent: 42.5, transferred: 425, total: 1000 },
      { percent: 100, transferred: 1, total: 1 },
    ]);
    expect(r.au.quitAndInstall).not.toHaveBeenCalled();
  });
  it('install before the download finished is E_UPDATE_NOT_READY', async () => {
    const r = rig();
    await r.u.check();
    expect(r.u.install()).toEqual({ ok: false, code: 'E_UPDATE_NOT_READY' });
    expect(r.au.quitAndInstall).not.toHaveBeenCalled();
  });
  it('install after a finished download quits and runs the installer (not silent, restarts)', async () => {
    const r = rig();
    await r.u.check();
    await r.u.download();
    expect(r.u.install()).toEqual({ ok: true, version: '0.2.0' });
    expect(r.au.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
  it('a failed download is E_UPDATE_DOWNLOAD and can be retried', async () => {
    let n = 0;
    const r = rig({
      download: async () => {
        if (n++ === 0) throw new Error('sha512 checksum mismatch');
        return [];
      },
    });
    await r.u.check();
    expect(await r.u.download()).toEqual({ ok: false, code: 'E_UPDATE_DOWNLOAD' });
    expect(r.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'E_UPDATE_DOWNLOAD' }),
    );
    expect(r.u.install()).toEqual({ ok: false, code: 'E_UPDATE_NOT_READY' });
    expect(await r.u.download()).toEqual({ ok: true, version: '0.2.0' });
  });
  it('a throwing quitAndInstall is E_UPDATE_INSTALL', async () => {
    const r = rig();
    await r.u.check();
    await r.u.download();
    r.au.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('spawn failed');
    });
    expect(r.u.install()).toEqual({ ok: false, code: 'E_UPDATE_INSTALL' });
  });
  it('download and install are refused while updates are off or in a dev build', async () => {
    const off = rig({ enabled: false });
    expect(await off.u.download()).toEqual({ ok: false, code: 'E_UPDATE_DISABLED' });
    expect(off.u.install()).toEqual({ ok: false, code: 'E_UPDATE_DISABLED' });
    const dev = rig({ packaged: false });
    expect(await dev.u.download()).toEqual({ ok: false, code: 'E_UPDATE_DEV' });
    expect(dev.u.install()).toEqual({ ok: false, code: 'E_UPDATE_DEV' });
    expect(off.load).not.toHaveBeenCalled();
    expect(dev.load).not.toHaveBeenCalled();
  });
});

describe('registerUpdateIpc', () => {
  it('registers check/download/install and rejects any payload', async () => {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const updater = {
      check: vi.fn(async () => ({ available: false })),
      download: vi.fn(async () => ({ ok: true })),
      install: vi.fn(() => ({ ok: true })),
    };
    registerUpdateIpc({ ipc: { handle: (ch, fn) => handlers.set(ch, fn) }, updater });
    expect([...handlers.keys()]).toEqual(['updates:check', 'updates:download', 'updates:install']);
    await handlers.get('updates:download')!({});
    handlers.get('updates:install')!({});
    expect(updater.download).toHaveBeenCalledTimes(1);
    expect(updater.install).toHaveBeenCalledTimes(1);
    expect(() => handlers.get('updates:install')!({}, { silent: true })).toThrow();
    expect(() => handlers.get('updates:check')!({}, 'x')).toThrow();
    expect(updater.install).toHaveBeenCalledTimes(1);
  });
});
