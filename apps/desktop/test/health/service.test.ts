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
  inject: { available: true, foregroundElevated: null },
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
