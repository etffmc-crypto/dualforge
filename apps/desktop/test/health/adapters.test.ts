import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  diskUsage, gatherInput, HealthAdapterError, parseScState, profileStatuses, queryHidHide, queryVigemBus, queryVigemService,
  type Exec, type GatherDeps,
} from '../../src/main/health/adapters.js';

const SC_RUNNING = 'SERVICE_NAME: ViGEmBus\r\n        TYPE               : 1  KERNEL_DRIVER\r\n        STATE              : 4  RUNNING\r\n';
const SC_STOPPED = 'SERVICE_NAME: ViGEmBus\r\n        STATE              : 1  STOPPED\r\n';

describe('parseScState', () => {
  it('reads RUNNING / STOPPED and treats anything else as unknown', () => {
    expect(parseScState(SC_RUNNING)).toBe('running');
    expect(parseScState(SC_STOPPED)).toBe('stopped');
    expect(parseScState('STATE : 2  START_PENDING')).toBe('unknown');
    expect(parseScState('garbage')).toBe('unknown');
  });
});

describe('queryVigemService', () => {
  it('runs sc.exe with a 5 s timeout', async () => {
    const exec = vi.fn<Exec>(async () => ({ stdout: SC_RUNNING }));
    expect(await queryVigemService(exec, vi.fn())).toBe('running');
    expect(exec).toHaveBeenCalledWith(expect.stringMatching(/sc\.exe$/i), ['query', 'ViGEmBus'], { timeoutMs: 5000 });
  });
  it('maps exit code 1060 to missing without reporting an error', async () => {
    const onError = vi.fn();
    const exec: Exec = async () => { throw Object.assign(new Error('failed'), { code: 1060, stdout: '' }); };
    expect(await queryVigemService(exec, onError)).toBe('missing');
    expect(onError).not.toHaveBeenCalled();
  });
  it('maps a 1060 message in stdout to missing', async () => {
    const exec: Exec = async () => { throw Object.assign(new Error('failed'), { code: 1, stdout: '[SC] EnumQueryServicesStatus:OpenService FAILED 1060:' }); };
    expect(await queryVigemService(exec, vi.fn())).toBe('missing');
  });
  it('reports a timeout as E_HEALTH_TIMEOUT and degrades to unknown', async () => {
    const onError = vi.fn();
    const exec: Exec = async () => { throw new HealthAdapterError('E_HEALTH_TIMEOUT', 'sc.exe timed out'); };
    expect(await queryVigemService(exec, onError)).toBe('unknown');
    expect(onError).toHaveBeenCalledWith('E_HEALTH_TIMEOUT', 'sc.exe timed out');
  });
  it('reports any other failure as E_HEALTH_SC', async () => {
    const onError = vi.fn();
    const exec: Exec = async () => { throw new Error('boom'); };
    expect(await queryVigemService(exec, onError)).toBe('unknown');
    expect(onError).toHaveBeenCalledWith('E_HEALTH_SC', 'boom');
  });
});

describe('queryVigemBus', () => {
  it('uses powershell.exe -NoProfile -Command and detects status OK', async () => {
    const exec = vi.fn<Exec>(async () => ({ stdout: 'OK\r\n' }));
    expect(await queryVigemBus(exec, vi.fn())).toBe(true);
    const [file, args, opts] = exec.mock.calls[0]!;
    expect(file).toMatch(/powershell\.exe$/i);
    expect(args.slice(0, 2)).toEqual(['-NoProfile', '-Command']);
    expect(args[2]).toContain('Nefarius Virtual Gamepad Emulation Bus');
    expect(opts).toEqual({ timeoutMs: 5000 });
  });
  it('is false for empty output and for failures (E_HEALTH_PNP)', async () => {
    expect(await queryVigemBus(async () => ({ stdout: '' }), vi.fn())).toBe(false);
    const onError = vi.fn();
    expect(await queryVigemBus(async () => { throw new Error('ps failed'); }, onError)).toBe(false);
    expect(onError).toHaveBeenCalledWith('E_HEALTH_PNP', 'ps failed');
  });
});

describe('absolute system paths and exec errors', () => {
  it('uses System32 absolute paths for sc.exe and powershell.exe', async () => {
    const { SC_EXE, POWERSHELL_EXE } = await import('../../src/main/health/adapters.js');
    expect(SC_EXE.toLowerCase()).toMatch(/system32[\\/]sc\.exe$/);
    expect(POWERSHELL_EXE.toLowerCase()).toMatch(/system32[\\/]windowspowershell[\\/]v1\.0[\\/]powershell\.exe$/);
    const exec = vi.fn<Exec>(async () => ({ stdout: SC_RUNNING }));
    await queryVigemService(exec, vi.fn());
    expect(exec.mock.calls[0]![0]).toBe(SC_EXE);
  });
  it('tells a maxBuffer overflow from a timeout', async () => {
    const { defaultExec } = await import('../../src/main/health/adapters.js');
    const err = await defaultExec(process.execPath, ['-e', 'process.stdout.write("x".repeat(2*1024*1024))'], { timeoutMs: 5000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HealthAdapterError);
    expect((err as HealthAdapterError).code).toBe('E_HEALTH_OUTPUT_TOO_LARGE');
  });
});

describe('queryHidHide', () => {
  it('normalises quotes and slashes in --app-list and reports unknown (null) when the CLI call fails', async () => {
    const base = { cliPath: 'C:\\HH\\HidHideCLI.exe', ownExe: 'C:\\Apps\\DualForge.exe', exists: () => true };
    const quoted: Exec = async (_f, a) => ({ stdout: a[0] === '--app-list' ? '"C:/Apps/DualForge.exe"\r\n' : '' });
    expect((await queryHidHide({ ...base, exec: quoted, onError: vi.fn() })).whitelisted).toBe(true);
    const failing: Exec = async (_f, a) => { if (a[0] === '--app-list') throw new Error('cli broke'); return { stdout: '' }; };
    const onError = vi.fn();
    expect((await queryHidHide({ ...base, exec: failing, onError })).whitelisted).toBeNull();
    expect(onError).toHaveBeenCalledWith('E_HEALTH_HIDHIDE', expect.stringContaining('--app-list'));
  });
});

describe('queryHidHide (basics)', () => {
  const base = { cliPath: 'C:\\HH\\HidHideCLI.exe', ownExe: 'C:\\Apps\\DualForge.exe', onError: vi.fn() };
  it('returns installed:false, without running anything or erroring, when the CLI is missing', async () => {
    const exec = vi.fn<Exec>();
    const onError = vi.fn();
    expect(await queryHidHide({ ...base, exec, exists: () => false, onError })).toEqual({ installed: false, cliPath: null, whitelisted: false, deviceHidden: false });
    expect(exec).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
  it('reads --app-list and --dev-list', async () => {
    const exec: Exec = async (_f, args) => ({
      stdout: args[0] === '--app-list' ? 'C:\\Other\\a.exe\r\nc:\\apps\\dualforge.exe\r\n' : 'HID\\VID_054C&PID_0CE6\\7&2&0000\r\n',
    });
    expect(await queryHidHide({ ...base, exec, exists: () => true })).toEqual({ installed: true, cliPath: base.cliPath, whitelisted: true, deviceHidden: true });
  });
  it('is not whitelisted / hidden when the lists lack us, and codes CLI failures', async () => {
    const onError = vi.fn();
    const exec: Exec = async (_f, args) => {
      if (args[0] === '--dev-list') throw new HealthAdapterError('E_HEALTH_TIMEOUT', 'slow');
      return { stdout: 'C:\\Other\\a.exe\r\n' };
    };
    const r = await queryHidHide({ ...base, exec, exists: () => true, onError });
    expect(r).toMatchObject({ installed: true, whitelisted: false, deviceHidden: false });
    expect(onError).toHaveBeenCalledWith('E_HEALTH_TIMEOUT', expect.stringContaining('--dev-list'));
  });
});

describe('profile and disk adapters', () => {
  it('classifies slots as ok / quarantined / default and sums app logs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'df-health-'));
    try {
      mkdirSync(join(dir, 'profiles', 'corrupt'), { recursive: true });
      writeFileSync(join(dir, 'profiles', 'p1.json'), '{}');
      writeFileSync(join(dir, 'profiles', 'corrupt', 'p2.123.json'), '{');
      expect(profileStatuses(dir)).toEqual([
        { slot: 'p1', status: 'ok' }, { slot: 'p2', status: 'quarantined' }, { slot: 'p3', status: 'default' }, { slot: 'p4', status: 'default' },
      ]);
      mkdirSync(join(dir, 'logs'));
      writeFileSync(join(dir, 'logs', 'app.1.log'), 'x'.repeat(100));
      writeFileSync(join(dir, 'logs', 'app.2.log'), 'x'.repeat(50));
      writeFileSync(join(dir, 'logs', 'notes.txt'), 'x'.repeat(999));
      expect(diskUsage(join(dir, 'logs'))).toEqual({ logBytes: 150, logFiles: 2 });
      expect(diskUsage(join(dir, 'nope'))).toEqual({ logBytes: 0, logFiles: 0 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('gatherInput', () => {
  const deps = (over: Partial<GatherDeps> = {}): GatherDeps => ({
    exec: async (file) => ({ stdout: /sc\.exe$/i.test(file) ? SC_RUNNING : 'OK' }),
    dataDir: join(tmpdir(), 'df-missing-data'), logDir: join(tmpdir(), 'df-missing-logs'), ownExe: 'x.exe', appVersion: '1.2.3',
    engine: () => ({ alive: true, restartsLastHour: 1, lastErrorCodes: ['E_PIPELINE'], snapshot: { connected: true, reportHz: 7900, pipelineP99Ms: 0.4, source: 'device' } }),
    injector: { available: true, foregroundElevated: () => null, selfElevated: () => false },
    onError: vi.fn(), exists: () => false,
    ...over,
  });
  it('assembles the input from the adapters and the engine view', async () => {
    const r = await gatherInput(deps());
    expect(r.vigem).toEqual({ serviceState: 'running', busDevicePresent: true });
    expect(r.hidhide.installed).toBe(false);
    expect(r.device).toEqual({ present: true, reportHz: 7900, source: 'device' });
    expect(r.engine).toEqual({ alive: true, restartsLastHour: 1, p99Ms: 0.4, lastErrorCodes: ['E_PIPELINE'] });
    expect(r.app.version).toBe('1.2.3');
    expect(r.inject).toEqual({ available: true, foregroundElevated: null, ownElevated: false });
  });
  it('handles no snapshot yet and a throwing elevation probe', async () => {
    const onError = vi.fn();
    const r = await gatherInput(deps({
      onError, engine: () => ({ alive: false, restartsLastHour: 0, lastErrorCodes: [], snapshot: null }),
      injector: { available: true, selfElevated: () => false, foregroundElevated: () => { throw new Error('addon exploded'); } },
    }));
    expect(r.device).toEqual({ present: false, reportHz: 0, source: 'device' });
    expect(r.inject.foregroundElevated).toBeNull();
    expect(onError).toHaveBeenCalledWith('E_HEALTH_ELEVATION', 'addon exploded');
  });
});
