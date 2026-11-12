import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  bIntervalToHz,
  composePollingScript,
  createPollingRate,
  hzToBInterval,
  isHighSpeed,
  parsePollingQuery,
  POLLING_SCRIPT,
  registerPollingIpc,
} from '../src/main/polling-rate.js';

const INSTANCE = 'USB\\VID_054C&PID_0CE6\\9&284F11C1&0&3';
const DRIVER = '{36fc9e60-c465-11cf-8056-444553540000}\\0025';
const DATA = 'C:\\data\\DualForge';
const line = (b: string | number, filters = 'hidusbf', driver = DRIVER) =>
  `${INSTANCE}|${filters}|${driver}|${b}\r\n`;

describe('bInterval mapping', () => {
  it('halves the rate per step on a High Speed pad', () => {
    expect(hzToBInterval(8000)).toBe(1);
    expect(hzToBInterval(4000)).toBe(2);
    expect(hzToBInterval(2000)).toBe(3);
    expect(hzToBInterval(1000)).toBe(4);
    expect(bIntervalToHz(1)).toBe(8000);
    expect(bIntervalToHz(4)).toBe(1000);
  });
  it('rejects values the picker cannot show', () => {
    expect(bIntervalToHz(null)).toBeNull();
    expect(bIntervalToHz(0)).toBeNull();
    expect(bIntervalToHz(5)).toBeNull();
    expect(bIntervalToHz(2.5)).toBeNull();
  });
});

describe('isHighSpeed', () => {
  it('is High Speed above 1 kHz measured', () => {
    expect(isHighSpeed(null, 8013)).toBe(true);
    expect(isHighSpeed(1, 1600)).toBe(true);
  });
  it('is High Speed when the measured rate matches the stored value', () => {
    expect(isHighSpeed(4, 1002)).toBe(true); // bInterval 4 = 1000 Hz only on High Speed
  });
  it('is not High Speed for a stock pad at 1 kHz or a Full Speed pad with a stored value', () => {
    expect(isHighSpeed(null, 1000)).toBe(false);
    expect(isHighSpeed(1, 998)).toBe(false);
    expect(isHighSpeed(2, 500)).toBe(false); // bInterval 2 on Full Speed = 500 Hz, not 4000
    expect(isHighSpeed(null, 0)).toBe(false);
  });
});

describe('parsePollingQuery', () => {
  it('reads the instance, filters, driver key and value', () => {
    expect(parsePollingQuery(line(2, 'hidusbf;other'))).toEqual({
      instance: INSTANCE,
      lowerFilters: ['hidusbf', 'other'],
      driverKey: DRIVER,
      bInterval: 2,
    });
  });
  it('accepts an empty value and an empty filter list', () => {
    expect(parsePollingQuery(line('', ''))).toEqual({
      instance: INSTANCE,
      lowerFilters: [],
      driverKey: DRIVER,
      bInterval: null,
    });
  });
  it('ignores interface instances and foreign devices', () => {
    expect(
      parsePollingQuery(`USB\\VID_054C&PID_0CE6&MI_03\\A&1&0&0003|hidusbf|${DRIVER}|2`),
    ).toBeNull();
    expect(parsePollingQuery(`USB\\VID_045E&PID_028E\\1|hidusbf|${DRIVER}|2`)).toBeNull();
    expect(parsePollingQuery('')).toBeNull();
  });
  it('drops a driver key that is not {guid}\\nnnn', () => {
    expect(parsePollingQuery(line(2, 'hidusbf', 'oops'))!.driverKey).toBeNull();
  });
});

describe('composePollingScript', () => {
  it('stores the value and restarts the device, aborting on the first failure', () => {
    const s = composePollingScript(DRIVER, INSTANCE, 4000);
    expect(s.split('\r\n')).toEqual([
      '@echo off',
      `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\${DRIVER}" /v bInterval /t REG_DWORD /d 2 /f || exit /b 1`,
      `pnputil /restart-device "${INSTANCE}" || exit /b 1`,
      '',
    ]);
  });
  it('doubles % so cmd.exe does not expand it', () => {
    expect(composePollingScript(DRIVER, 'USB\\X%Y', 8000)).toContain('"USB\\X%%Y"');
  });
});

function rig(
  opts: {
    /** PowerShell query output per call (the last one repeats). */
    query?: string[];
    measured?: number;
    elevation?: 'accept' | 'decline';
    queryFails?: boolean;
  } = {},
) {
  const calls: { file: string; args: string[] }[] = [];
  const writes: { path: string; data: string }[] = [];
  const applied: number[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let q = 0;
  const queries = opts.query ?? [line(1)];
  const exec = vi.fn(async (file: string, args: string[]) => {
    calls.push({ file, args });
    if (args.join(' ').includes('Start-Process')) {
      if (opts.elevation === 'decline')
        throw Object.assign(new Error('The operation was canceled by the user.'), { code: 1 });
      return { stdout: '' };
    }
    if (opts.queryFails) throw new Error('powershell timed out');
    return { stdout: queries[Math.min(q++, queries.length - 1)]! };
  });
  const p = createPollingRate({
    exec,
    dataDir: DATA,
    writeFile: (path, data) => writes.push({ path, data }),
    measuredHz: () => opts.measured ?? 8013,
    onApplied: (hz) => applied.push(hz),
    sleep: async () => undefined,
    log,
  });
  return { p, exec, calls, writes, applied, log };
}

describe('createPollingRate', () => {
  it('get: available with the stored rate on a filtered High Speed pad', async () => {
    const { p } = rig({ query: [line(2)], measured: 4007 });
    expect(await p.get()).toEqual({ available: true, rateHz: 4000, measuredHz: 4007 });
  });
  it('get: the native rate (no value yet) shows as null', async () => {
    const { p } = rig({ query: [line('')] });
    expect(await p.get()).toEqual({ available: true, rateHz: null, measuredHz: 8013 });
  });
  it('get: unavailable without a pad, without the filter, or on a Full Speed pad', async () => {
    expect((await rig({ query: [''] }).p.get()).reason).toBe('no-device');
    expect((await rig({ query: [line(1, '')] }).p.get()).reason).toBe('no-filter');
    expect((await rig({ query: [line(1, 'hidusbf', '')] }).p.get()).reason).toBe('no-filter');
    expect((await rig({ query: [line('')], measured: 1000 }).p.get()).reason).toBe(
      'not-high-speed',
    );
  });
  it('get: a failed query is unavailable and logged once', async () => {
    const { p, log } = rig({ queryFails: true });
    expect((await p.get()).reason).toBe('query-failed');
    await p.get();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_POLLING_QUERY' }));
  });

  it('set: writes the script, runs it elevated, re-reads and reports the new rate', async () => {
    const { p, writes, calls, applied, log } = rig({ query: [line(1), line(2)], measured: 4007 });
    const r = await p.set(4000);
    expect(r).toEqual({ ok: true, state: { available: true, rateHz: 4000, measuredHz: 4007 } });
    expect(writes).toEqual([
      { path: join(DATA, POLLING_SCRIPT), data: composePollingScript(DRIVER, INSTANCE, 4000) },
    ]);
    const ps = calls.find((c) => c.args.join(' ').includes('Start-Process'))!;
    expect(ps.args.join(' ')).toContain('-Verb RunAs -Wait');
    expect(ps.args.join(' ')).toContain(join(DATA, POLLING_SCRIPT));
    expect(applied).toEqual([4000]);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'POLLING_RATE_SET', hz: 4000, from: 8000 }),
    );
  });
  it('set: the current rate is a no-op without a prompt', async () => {
    const { p, writes, calls } = rig({ query: [line(2)], measured: 4007 });
    expect((await p.set(4000)).ok).toBe(true);
    expect(writes).toEqual([]);
    expect(calls.some((c) => c.args.join(' ').includes('Start-Process'))).toBe(false);
  });
  it('set: a declined UAC prompt reports E_POLLING_ELEVATION_DECLINED and nothing applied', async () => {
    const { p, applied, log } = rig({ elevation: 'decline' });
    const r = await p.set(4000);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('E_POLLING_ELEVATION_DECLINED');
    expect(r.state.rateHz).toBe(8000);
    expect(applied).toEqual([]);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'E_POLLING_ELEVATION_DECLINED' }),
    );
  });
  it('set: a stored value that did not change reports E_POLLING_APPLY', async () => {
    const { p, applied } = rig({ query: [line(1)] });
    const r = await p.set(4000);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('E_POLLING_APPLY');
    expect(applied).toEqual([]);
  });
  it('set: refused on a pad where the option is unavailable', async () => {
    const { p, writes } = rig({ query: [line(1, '')] });
    const r = await p.set(4000);
    expect(r).toMatchObject({ ok: false, code: 'E_POLLING_UNAVAILABLE' });
    expect(writes).toEqual([]);
  });
  it('set: a second change while one is in progress is E_POLLING_BUSY', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { p } = rig({ query: [line(1), line(2)], measured: 4007 });
    const slow = createPollingRate({
      exec: async (file, args, o) => {
        if (args.join(' ').includes('Start-Process')) await gate;
        return rig().exec(file, args, o);
      },
      dataDir: DATA,
      writeFile: () => undefined,
      measuredHz: () => 4007,
      sleep: async () => undefined,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    void p;
    const first = slow.set(4000);
    const second = await slow.set(2000);
    expect(second.code).toBe('E_POLLING_BUSY');
    release();
    await first;
  });
});

describe('registerPollingIpc', () => {
  it('validates polling:set and forwards the rate', async () => {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const polling = {
      get: vi.fn(async () => ({}) as never),
      set: vi.fn(async () => ({}) as never),
    };
    const log = { error: vi.fn() };
    registerPollingIpc({ ipc: { handle: (c, fn) => handlers.set(c, fn) }, polling, log });
    await handlers.get('polling:set')!({}, { hz: 2000 });
    expect(polling.set).toHaveBeenCalledWith(2000);
    // rejected payloads throw before anything runs (Electron turns the throw into a rejected invoke)
    expect(() => handlers.get('polling:set')!({}, { hz: 3000 })).toThrow('E_POLLING_REQUEST');
    expect(() => handlers.get('polling:set')!({}, { hz: 2000, x: 1 })).toThrow('E_POLLING_REQUEST');
    expect(polling.set).toHaveBeenCalledTimes(1);
    await handlers.get('polling:get')!({});
    expect(polling.get).toHaveBeenCalled();
  });
});
