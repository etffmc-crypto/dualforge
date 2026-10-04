import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthRepairRequestSchema, HealthResultSchema, type EngineEvent, type HealthState } from '@dualforge/shared';
import type { GatheredInput } from '../../src/main/health/adapters.js';
import { createEngineFeed, createHealthService, type HealthRepairs } from '../../src/main/health/service.js';
import { registerHealthIpc } from '../../src/main/health/ipc.js';

const GOOD: GatheredInput = {
  vigem: { serviceState: 'running', busDevicePresent: true },
  hidhide: { installed: true, cliPath: 'x', whitelisted: true, deviceHidden: true },
  device: { present: true, reportHz: 8000, source: 'device' },
  engine: { alive: true, restartsLastHour: 0, p99Ms: 0.3, lastErrorCodes: [] },
  profiles: [{ slot: 'p1', status: 'ok' }],
  disk: { logBytes: 1, logFiles: 1 },
  app: { version: '0.1.0', updateAvailable: null },
  inject: { available: true, foregroundElevated: null, ownElevated: false },
};

function rig(gathered: () => GatheredInput = () => GOOD) {
  const emitted: HealthState[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const repairs = {
    restartEngine: vi.fn(), resetProfile: vi.fn(), clearLogs: vi.fn(async () => 3), openLogs: vi.fn(async () => ''),
  } satisfies HealthRepairs;
  const gather = vi.fn(async () => gathered());
  const svc = createHealthService({ gather, emit: (s) => emitted.push(s), log, repairs });
  return { svc, emitted, log, repairs, gather };
}

describe('health service scheduling', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs 3 s after start, then every 5 min, and pushes each result', async () => {
    const { svc, emitted, gather } = rig();
    svc.start();
    await vi.advanceTimersByTimeAsync(2999);
    expect(gather).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(gather).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(gather).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(gather).toHaveBeenCalledTimes(3);
    svc.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(gather).toHaveBeenCalledTimes(3);
  });

  it('caches: get() runs once, later gets reuse it, run() refreshes', async () => {
    const { svc, gather } = rig();
    const a = await svc.get();
    const b = await svc.get();
    expect(b).toBe(a);
    expect(gather).toHaveBeenCalledTimes(1);
    await svc.run();
    expect(gather).toHaveBeenCalledTimes(2);
    expect(svc.cached()).not.toBe(a);
  });

  it('shares one in-flight run between concurrent callers', async () => {
    const { svc, gather } = rig();
    await Promise.all([svc.run(), svc.run(), svc.run()]);
    expect(gather).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous result and logs E_HEALTH_CHECK when gathering throws', async () => {
    let fail = false;
    const { svc, log } = rig(() => { if (fail) throw new Error('adapter blew up'); return GOOD; });
    const first = await svc.run();
    fail = true;
    const second = await svc.run();
    expect(second).toBe(first);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_HEALTH_CHECK' }));
  });

  it('results satisfy the IPC schema', async () => {
    const { svc } = rig();
    for (const r of (await svc.run()).results) expect(() => HealthResultSchema.parse(r)).not.toThrow();
  });

  it('remembers the highest report rate across runs and warns when it halves', async () => {
    let hz = 8000;
    const { svc } = rig(() => ({ ...GOOD, device: { present: true, reportHz: hz, source: 'device' } }));
    expect((await svc.run()).results.find((r) => r.id === 'reportRate')!.status).toBe('ok');
    hz = 3000;
    expect((await svc.run()).results.find((r) => r.id === 'reportRate')!.status).toBe('warn');
  });
});

describe('health service change detection and baseline', () => {
  it('emits health:changed only when status or detail differ', async () => {
    let hz = 8000;
    const { svc, emitted } = rig(() => ({ ...GOOD, device: { present: true, reportHz: hz, source: 'device' } }));
    await svc.run(); await svc.run();
    expect(emitted).toHaveLength(1);                 // identical second run: nothing pushed
    hz = 7990;
    await svc.run();
    expect(emitted).toHaveLength(2);                 // the detail text changed (7990 Hz)
    await svc.run();
    expect(emitted).toHaveLength(2);
  });

  it('a replayed or absent pad never raises the baseline, and a source change resets it', async () => {
    let dev: GatheredInput['device'] = { present: true, reportHz: 1000, source: 'device' };
    const { svc } = rig(() => ({ ...GOOD, device: dev }));
    const rate = async () => (await svc.run()).results.find((r) => r.id === 'reportRate')?.status;
    dev = { present: true, reportHz: 8000, source: 'replay' };
    await svc.run();
    dev = { present: false, reportHz: 8000, source: 'device' };
    await svc.run();
    dev = { present: true, reportHz: 1000, source: 'device' };
    expect(await rate()).toBe('ok');                 // 1 kHz is not "halved" by the replay's 8 kHz
    dev = { present: true, reportHz: 8000, source: 'device' };
    await svc.run();
    dev = { present: true, reportHz: 5000, source: 'replay' };
    await svc.run();                                  // source change resets the device baseline
    dev = { present: true, reportHz: 3000, source: 'device' };
    expect(await rate()).toBe('ok');
  });

  it('a repair starts a fresh run after an in-flight one finishes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const { svc } = rig();
    const gather = vi.fn(async () => { calls++; if (calls === 1) await gate; return GOOD; });
    const s2 = createHealthService({ gather, emit: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      repairs: { restartEngine: vi.fn(), resetProfile: vi.fn(), clearLogs: () => 0, openLogs: () => '' } });
    void svc;
    const first = s2.run();
    await s2.repair({ id: 'clearLogs' });
    expect(gather).toHaveBeenCalledTimes(1);          // still waiting for the in-flight run
    release();
    await first;
    await vi.waitFor(() => expect(gather).toHaveBeenCalledTimes(2));
  });
});

describe('health repairs', () => {
  it('restartEngine, resetProfile, clearLogs and openLogs call their handlers', async () => {
    const { svc, repairs } = rig();
    expect(await svc.repair({ id: 'restartEngine' })).toEqual({ ok: true });
    expect(await svc.repair({ id: 'resetProfile', arg: 'p2' })).toEqual({ ok: true });
    expect(await svc.repair({ id: 'clearLogs' })).toEqual({ ok: true });
    expect(await svc.repair({ id: 'openLogs' })).toEqual({ ok: true });
    expect(repairs.restartEngine).toHaveBeenCalled();
    expect(repairs.resetProfile).toHaveBeenCalledWith('p2');
    expect(repairs.clearLogs).toHaveBeenCalled();
    expect(repairs.openLogs).toHaveBeenCalled();
  });

  it('resetProfile rejects a missing or unknown slot', async () => {
    const { svc, repairs } = rig();
    expect(await svc.repair({ id: 'resetProfile' })).toMatchObject({ ok: false, code: 'E_HEALTH_BAD_ARG' });
    expect(await svc.repair({ id: 'resetProfile', arg: '../x' })).toMatchObject({ ok: false, code: 'E_HEALTH_BAD_ARG' });
    expect(repairs.resetProfile).not.toHaveBeenCalled();
  });

  it('install / enable repairs and an unwired exportBundle are unavailable until later tasks', async () => {
    const { svc } = rig();
    for (const id of ['installViGEm', 'installHidHide', 'enableHidHide', 'exportBundle'] as const) {
      expect(await svc.repair({ id })).toEqual({ ok: false, code: 'E_HEALTH_REPAIR_UNAVAILABLE' });
    }
  });

  it('exportBundle runs the wired exporter', async () => {
    const exportBundle = vi.fn(async () => ({ ok: true }));
    const svc = createHealthService({ gather: async () => GOOD, emit: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      repairs: { restartEngine: vi.fn(), resetProfile: vi.fn(), clearLogs: () => 0, openLogs: () => '', exportBundle } });
    expect(await svc.repair({ id: 'exportBundle' })).toEqual({ ok: true });
    expect(exportBundle).toHaveBeenCalled();
  });

  it('maps an openLogs error string and a throwing handler to coded failures', async () => {
    const { svc, repairs } = rig();
    repairs.openLogs.mockResolvedValueOnce('no such folder');
    expect(await svc.repair({ id: 'openLogs' })).toEqual({ ok: false, code: 'E_HEALTH_OPEN_LOGS', msg: 'no such folder' });
    repairs.restartEngine.mockImplementationOnce(() => { throw new Error('kaput'); });
    expect(await svc.repair({ id: 'restartEngine' })).toEqual({ ok: false, code: 'E_HEALTH_REPAIR_FAILED', msg: 'kaput' });
  });

  it('re-runs the checks after a successful fix', async () => {
    const { svc, gather } = rig();
    await svc.repair({ id: 'clearLogs' });
    await vi.waitFor(() => expect(gather).toHaveBeenCalledTimes(1));
  });
});

describe('health IPC', () => {
  function ipcRig() {
    const { svc } = rig();
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    const log = { error: vi.fn() };
    registerHealthIpc({ ipc: { handle: (ch, fn) => handlers.set(ch, (...a) => fn({}, ...a)) }, service: svc, log });
    return { call: (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a), log };
  }
  it('serves get and run', async () => {
    const { call } = ipcRig();
    expect(((await call('health:get')) as HealthState).results.length).toBeGreaterThan(0);
    expect(((await call('health:run')) as HealthState).results.length).toBeGreaterThan(0);
  });
  it('validates health:repair payloads with zod', async () => {
    const { call, log } = ipcRig();
    expect(() => call('health:repair', { id: 'rm -rf' })).toThrow('E_HEALTH_REQUEST');
    expect(() => call('health:repair', { id: 'openLogs', extra: 1 })).toThrow('E_HEALTH_REQUEST');
    expect(() => call('health:repair', { id: 'resetProfile', arg: 'x'.repeat(65) })).toThrow('E_HEALTH_REQUEST');
    expect(() => call('health:repair', 'openLogs')).toThrow('E_HEALTH_REQUEST');
    expect(log.error).toHaveBeenCalledTimes(4);
    expect(await call('health:repair', { id: 'openLogs' })).toEqual({ ok: true });
  });
  it('health:exportBundle returns the summary, null on cancel, and a coded error on failure', async () => {
    const { svc } = rig();
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    const results: unknown[] = [{ path: 'a.zip', files: 1, bytes: 2, skipped: [] }, null, new Error('E_BUNDLE_WRITE'), new Error('weird')];
    registerHealthIpc({
      ipc: { handle: (ch, fn) => handlers.set(ch, (...a) => fn({}, ...a)) }, service: svc, log: { error: vi.fn() },
      exportBundle: async () => { const r = results.shift(); if (r instanceof Error) throw r; return r as never; },
    });
    const call = () => handlers.get('health:exportBundle')!() as Promise<unknown>;
    expect(await call()).toMatchObject({ path: 'a.zip' });
    expect(await call()).toBeNull();
    await expect(call()).rejects.toThrow('E_BUNDLE_WRITE');
    await expect(call()).rejects.toThrow('E_BUNDLE_EXPORT');
  });
  it('schema accepts the documented shape', () => {
    expect(HealthRepairRequestSchema.parse({ id: 'resetProfile', arg: 'p1' })).toEqual({ id: 'resetProfile', arg: 'p1' });
  });
});

describe('engine feed', () => {
  const snap = (over: Partial<{ connected: boolean; reportHz: number; pipelineP99Ms: number; source: 'device' | 'replay' }> = {}): EngineEvent => ({
    type: 'snapshot',
    snapshot: {
      t: 1, connected: true, source: 'device', vigemReady: true, reportHz: 8000, pipelineP99Ms: 0.4, battery: { percent: 50, state: 'full' },
      raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro: { x: 0, y: 0, z: 0 }, touch: [] },
      out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} }, ...over,
    },
  });
  it('keeps the latest snapshot facts, de-duplicated recent error codes and the host stats', () => {
    const feed = createEngineFeed(() => ({ alive: true, restartsLastHour: 2 }), 3);
    expect(feed.view().snapshot).toBeNull();
    feed.onEvent(snap({ reportHz: 7900 }));
    feed.onEvent({ type: 'error', code: 'E_A', msg: '' });
    feed.onEvent({ type: 'error', code: 'E_B', msg: '' });
    feed.onEvent({ type: 'error', code: 'E_A', msg: '' });
    feed.onEvent({ type: 'error', code: 'E_C', msg: '' });
    feed.onEvent({ type: 'error', code: 'E_D', msg: '' });
    expect(feed.view()).toEqual({
      alive: true, restartsLastHour: 2, lastErrorCodes: ['E_A', 'E_C', 'E_D'],
      snapshot: { connected: true, reportHz: 7900, pipelineP99Ms: 0.4, source: 'device' },
    });
    feed.onEvent({ type: 'status', connected: false, vigemReady: false });
    expect(feed.view().snapshot?.connected).toBe(false);
  });
  it('forgets the restart-limit error once a snapshot shows the engine running again', () => {
    const feed = createEngineFeed(() => ({ alive: true, restartsLastHour: 0 }));
    feed.onEvent({ type: 'error', code: 'E_ENGINE_RESTART_LIMIT', msg: '' });
    expect(feed.view().lastErrorCodes).toContain('E_ENGINE_RESTART_LIMIT');
    feed.onEvent(snap());
    expect(feed.view().lastErrorCodes).not.toContain('E_ENGINE_RESTART_LIMIT');
  });
});
