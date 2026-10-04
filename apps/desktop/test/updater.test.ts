import { describe, expect, it, vi } from 'vitest';
import { createUpdater } from '../src/main/updater.js';

function rig(opts: { enabled?: boolean; packaged?: boolean; check?: () => Promise<unknown> } = {}) {
  const au = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(
      opts.check ?? (async () => ({ isUpdateAvailable: true, updateInfo: { version: '0.2.0' } })),
    ),
  };
  const load = vi.fn(async () => au);
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const results: unknown[] = [];
  const u = createUpdater({
    enabled: () => opts.enabled ?? true,
    isPackaged: opts.packaged ?? true,
    load: load as never,
    log,
    onResult: (r) => results.push(r),
    currentVersion: '0.1.0',
  });
  return { u, au, load, log, results };
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
