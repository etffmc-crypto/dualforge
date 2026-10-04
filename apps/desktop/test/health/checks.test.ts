import { describe, expect, it } from 'vitest';
import { runChecks, type HealthInput } from '../../src/main/health/checks.js';

const GOOD: HealthInput = {
  vigem: { serviceState: 'running', busDevicePresent: true },
  hidhide: { installed: true, cliPath: 'C:\\HidHideCLI.exe', whitelisted: true, deviceHidden: true },
  device: { present: true, reportHz: 8000, highestSeenHz: 8000, source: 'device' },
  engine: { alive: true, restartsLastHour: 0, p99Ms: 0.3, lastErrorCodes: [] },
  profiles: [1, 2, 3, 4].map((n) => ({ slot: `p${n}`, status: 'ok' as const })),
  disk: { logBytes: 5_000_000, logFiles: 3 },
  app: { version: '0.1.0', updateAvailable: false },
  inject: { available: true, foregroundElevated: false, ownElevated: false },
};
const mod = (patch: (i: HealthInput) => void): HealthInput => { const i = structuredClone(GOOD); patch(i); return i; };
const byId = (i: HealthInput, id: string) => runChecks(i).find((r) => r.id === id)!;

describe('runChecks', () => {
  it('is all ok for a healthy system', () => {
    const r = runChecks(GOOD);
    expect(r.filter((x) => x.status !== 'ok')).toEqual([]);
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length);   // ids are unique
  });

  const cases: { name: string; patch: (i: HealthInput) => void; id: string; status: 'ok' | 'warn' | 'error'; repair?: string }[] = [
    { name: 'ViGEmBus missing is an error with an install repair', patch: (i) => { i.vigem.serviceState = 'missing'; i.vigem.busDevicePresent = false; }, id: 'vigem', status: 'error', repair: 'installViGEm' },
    { name: 'ViGEmBus stopped is an error', patch: (i) => { i.vigem.serviceState = 'stopped'; }, id: 'vigem', status: 'error' },
    { name: 'ViGEmBus service running without a bus device warns', patch: (i) => { i.vigem.busDevicePresent = false; }, id: 'vigem', status: 'warn' },
    { name: 'ViGEmBus state that could not be queried warns', patch: (i) => { i.vigem.serviceState = 'unknown'; }, id: 'vigem', status: 'warn' },
    { name: 'HidHide not installed warns with an install repair', patch: (i) => { i.hidhide = { installed: false, cliPath: null, whitelisted: false, deviceHidden: false }; }, id: 'hidhide', status: 'warn', repair: 'installHidHide' },
    { name: 'HidHide installed but app not whitelisted warns with enable', patch: (i) => { i.hidhide.whitelisted = false; }, id: 'hidhide', status: 'warn', repair: 'enableHidHide' },
    { name: 'HidHide installed but pad not hidden warns with enable', patch: (i) => { i.hidhide.deviceHidden = false; }, id: 'hidhide', status: 'warn', repair: 'enableHidHide' },
    { name: 'no pad connected warns', patch: (i) => { i.device = { present: false, reportHz: 0, highestSeenHz: 0, source: 'device' }; }, id: 'device', status: 'warn' },
    { name: 'a replay source is fine without a pad', patch: (i) => { i.device = { present: false, reportHz: 250, highestSeenHz: 250, source: 'replay' }; }, id: 'device', status: 'ok' },
    { name: 'report rate under 800 Hz warns', patch: (i) => { i.device.reportHz = 700; i.device.highestSeenHz = 700; }, id: 'reportRate', status: 'warn' },
    { name: 'report rate that fell by more than half warns even above 800', patch: (i) => { i.device.reportHz = 3900; i.device.highestSeenHz = 8000; }, id: 'reportRate', status: 'warn' },
    { name: 'report rate exactly half of the best is fine', patch: (i) => { i.device.reportHz = 4000; i.device.highestSeenHz = 8000; }, id: 'reportRate', status: 'ok' },
    { name: 'a steady 1 kHz pad is fine', patch: (i) => { i.device.reportHz = 1000; i.device.highestSeenHz = 1000; }, id: 'reportRate', status: 'ok' },
    { name: 'engine not alive is an error with restart', patch: (i) => { i.engine.alive = false; }, id: 'engine', status: 'error', repair: 'restartEngine' },
    { name: 'a few engine restarts warn', patch: (i) => { i.engine.restartsLastHour = 2; }, id: 'engine', status: 'warn', repair: 'restartEngine' },
    { name: 'the restart limit is an error', patch: (i) => { i.engine.lastErrorCodes = ['E_ENGINE_RESTART_LIMIT']; }, id: 'engine', status: 'error', repair: 'restartEngine' },
    { name: 'five restarts in an hour is an error', patch: (i) => { i.engine.restartsLastHour = 5; }, id: 'engine', status: 'error' },
    { name: 'p99 above 2 ms warns', patch: (i) => { i.engine.p99Ms = 2.5; }, id: 'latency', status: 'warn' },
    { name: 'p99 of exactly 2 ms is fine', patch: (i) => { i.engine.p99Ms = 2; }, id: 'latency', status: 'ok' },
    { name: 'a quarantined profile warns with reset for that slot', patch: (i) => { i.profiles[1]!.status = 'quarantined'; }, id: 'profile.p2', status: 'warn', repair: 'resetProfile' },
    { name: 'logs over 200 MB warn with clearLogs', patch: (i) => { i.disk.logBytes = 201 * 1024 * 1024; }, id: 'logs', status: 'warn', repair: 'clearLogs' },
    { name: 'injector unavailable warns', patch: (i) => { i.inject.available = false; }, id: 'inject', status: 'warn' },
    { name: 'an elevated foreground game warns', patch: (i) => { i.inject.foregroundElevated = true; }, id: 'inject', status: 'warn' },
    { name: 'an elevated foreground is fine when DualForge is elevated too', patch: (i) => { i.inject.foregroundElevated = true; i.inject.ownElevated = true; }, id: 'inject', status: 'ok' },
    { name: 'HidHide whitelist that could not be read warns without a repair', patch: (i) => { i.hidhide.whitelisted = null; }, id: 'hidhide', status: 'warn' },
    { name: 'an unknown foreground elevation is fine', patch: (i) => { i.inject.foregroundElevated = null; }, id: 'inject', status: 'ok' },
    { name: 'an available update is surfaced as a warning', patch: (i) => { i.app.updateAvailable = true; }, id: 'app', status: 'warn' },
    { name: 'an unknown update state is fine', patch: (i) => { i.app.updateAvailable = null; }, id: 'app', status: 'ok' },
  ];
  it.each(cases)('$name', ({ patch, id, status, repair }) => {
    const r = byId(mod(patch), id);
    expect(r, `result ${id}`).toBeDefined();
    expect(r.status).toBe(status);
    if (repair) expect(r.repair).toBe(repair);
  });

  it('names the 8 kHz pad in the report-rate detail', () => {
    const r = byId(mod((i) => { i.device.reportHz = 700; i.device.highestSeenHz = 8000; }), 'reportRate');
    expect(r.detail).toMatch(/8 kHz/);
    expect(r.detail).toMatch(/700/);
  });

  it('carries the slot as the repair argument and reports healthy slots together', () => {
    const r = byId(mod((i) => { i.profiles[2]!.status = 'quarantined'; }), 'profile.p3');
    expect(r.repairArg).toBe('p3');
    expect(byId(GOOD, 'profiles').status).toBe('ok');
  });

  it('every result carries a title and detail', () => {
    for (const r of runChecks(mod((i) => { i.vigem.serviceState = 'missing'; i.engine.alive = false; i.disk.logBytes = 1e9; }))) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
