import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUNDLE_CAP_BYTES,
  buildSystemInfo,
  collectEntries,
  createBundleExporter,
  planBundle,
  writeBundle,
  type BundleEntry,
} from '../src/main/bundle.js';
import { startCrashReporter } from '../src/main/crash-reporter.js';

const MB = 1024 * 1024;
const e = (
  name: string,
  size: number,
  mtimeMs: number,
  kind: BundleEntry['kind'],
): BundleEntry => ({ name, size, mtimeMs, kind, path: `/x/${name}` });

/** Names listed in a zip's central directory (enough of the format for these tests). */
function zipNames(file: string): string[] {
  const buf = readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const nameLen = buf.readUInt16LE(p + 28),
      extraLen = buf.readUInt16LE(p + 30),
      commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names.sort();
}

describe('planBundle', () => {
  it('keeps everything when it fits', () => {
    const all = [
      e('system.json', 1, 0, 'system'),
      e('logs/a.log', MB, 1, 'log'),
      e('crashes/c.dmp', MB, 2, 'crash'),
    ];
    const p = planBundle(all, 50 * MB);
    expect(p.include.map((x) => x.name).sort()).toEqual([
      'crashes/c.dmp',
      'logs/a.log',
      'system.json',
    ]);
    expect(p.skipped).toEqual([]);
  });

  it('skips the oldest logs first when over the cap and always keeps the small fixed files', () => {
    const all = [
      e('system.json', 1000, 0, 'system'),
      e('health.json', 1000, 0, 'health'),
      e('settings.json', 500, 0, 'settings'),
      e('profiles/p1.json', 500, 0, 'profile'),
      e('logs/old.log', 20 * MB, 100, 'log'),
      e('logs/mid.log', 20 * MB, 200, 'log'),
      e('logs/new.log', 20 * MB, 300, 'log'),
    ];
    const p = planBundle(all, 50 * MB);
    expect(p.include.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        'system.json',
        'health.json',
        'settings.json',
        'profiles/p1.json',
        'logs/new.log',
        'logs/mid.log',
      ]),
    );
    expect(p.include.map((x) => x.name)).not.toContain('logs/old.log');
    expect(p.skipped).toEqual(['logs/old.log']);
    expect(p.include.reduce((n, x) => n + x.size, 0)).toBeLessThanOrEqual(50 * MB);
  });

  it('prefers crash dumps over logs and drops the oldest crash first', () => {
    const all = [
      e('crashes/old.dmp', 30 * MB, 1, 'crash'),
      e('crashes/new.dmp', 30 * MB, 2, 'crash'),
      e('logs/a.log', 10 * MB, 3, 'log'),
    ];
    const p = planBundle(all, 50 * MB);
    expect(p.include.map((x) => x.name)).toEqual(['crashes/new.dmp', 'logs/a.log']);
    expect(p.skipped).toEqual(['crashes/old.dmp']);
  });

  it('defaults to a 50 MB cap', () => {
    expect(BUNDLE_CAP_BYTES).toBe(50 * MB);
  });
});

describe('collectEntries / writeBundle', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'df-bundle-'));
    for (const d of ['logs', 'crashes/reports', 'data/profiles/corrupt'])
      mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, 'logs', 'app.new.log'), 'new');
    writeFileSync(join(dir, 'logs', 'app.old.log'), 'old');
    utimesSync(
      join(dir, 'logs', 'app.old.log'),
      new Date(Date.now() - 30 * 86_400_000),
      new Date(Date.now() - 30 * 86_400_000),
    );
    writeFileSync(join(dir, 'logs', 'notes.txt'), 'not a log');
    writeFileSync(join(dir, 'crashes', 'reports', 'a.dmp'), 'dump');
    writeFileSync(join(dir, 'data', 'profiles', 'p1.json'), '{}');
    writeFileSync(join(dir, 'data', 'profiles', 'corrupt', 'p2.1.json'), '{');
    writeFileSync(join(dir, 'data', 'settings.json'), '{}');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const dirs = () => ({
    logDir: join(dir, 'logs'),
    crashDir: join(dir, 'crashes'),
    dataDir: join(dir, 'data'),
  });

  it('collects logs of the last 7 days, crashes, profiles, settings and the two JSON documents', () => {
    const entries = collectEntries({
      ...dirs(),
      now: Date.now(),
      health: { results: [], ranAt: 1 },
      system: { a: 1 },
    });
    expect(entries.map((x) => x.name).sort()).toEqual([
      'crashes/reports/a.dmp',
      'health.json',
      'logs/app.new.log',
      'profiles/p1.json',
      'settings.json',
      'system.json',
    ]);
    expect(JSON.parse(entries.find((x) => x.name === 'system.json')!.data as string)).toEqual({
      a: 1,
    });
  });

  it('tolerates missing folders', () => {
    const entries = collectEntries({
      logDir: join(dir, 'x'),
      crashDir: join(dir, 'y'),
      dataDir: join(dir, 'z'),
      now: Date.now(),
      health: null,
      system: {},
    });
    expect(entries.map((x) => x.name).sort()).toEqual(['health.json', 'system.json']);
  });

  it('writes a zip in a temp dir that lists the expected names', async () => {
    const entries = collectEntries({
      ...dirs(),
      now: Date.now(),
      health: { results: [], ranAt: 1 },
      system: {},
    });
    const out = join(dir, 'bundle.zip');
    const res = await writeBundle(out, planBundle(entries, BUNDLE_CAP_BYTES).include);
    expect(zipNames(out)).toEqual([
      'crashes/reports/a.dmp',
      'health.json',
      'logs/app.new.log',
      'profiles/p1.json',
      'settings.json',
      'system.json',
    ]);
    expect(res).toEqual({ path: out, files: 6, bytes: statSync(out).size });
  });

  it('removes the partial file and throws E_BUNDLE_WRITE when the zip cannot be written', async () => {
    const entries = [e('missing.txt', 1, 0, 'log')];
    const out = join(dir, 'bad.zip');
    await expect(writeBundle(out, entries)).rejects.toThrow('E_BUNDLE_WRITE');
    await vi.waitFor(() => expect(existsSync(out)).toBe(false)); // partial zip removed after the handle closed
    await expect(writeBundle(join(dir, 'no-such-dir', 'x.zip'), [])).rejects.toThrow(
      'E_BUNDLE_WRITE',
    );
  });

  it('exporter: dialog cancel returns null, otherwise writes the capped bundle', async () => {
    const log = { error: vi.fn(), info: vi.fn() };
    const showSaveDialog = vi.fn(
      async (_opts: object): Promise<{ canceled: boolean; filePath?: string }> => ({
        canceled: true,
      }),
    );
    const exporter = createBundleExporter({
      ...dirs(),
      dialog: { showSaveDialog },
      log,
      now: () => Date.now(),
      health: async () => ({ results: [], ranAt: 1 }),
      system: async () => ({ ok: true }),
    });
    expect(await exporter.exportWithDialog()).toBeNull();
    const out = join(dir, 'chosen.zip');
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    const r = await exporter.exportWithDialog();
    expect(r).toMatchObject({ path: out, files: 6, skipped: [] });
    expect(zipNames(out)).toContain('system.json');
    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({
      filters: [{ name: 'DualForge diagnostics', extensions: ['zip'] }],
    });
  });

  it('exporter: a failing health or system probe still produces a bundle and logs E_BUNDLE_COLLECT', async () => {
    const log = { error: vi.fn(), info: vi.fn() };
    const out = join(dir, 'degraded.zip');
    const exporter = createBundleExporter({
      ...dirs(),
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: out }) },
      log,
      now: () => Date.now(),
      health: async () => {
        throw new Error('no health');
      },
      system: async () => {
        throw new Error('no system');
      },
    });
    expect(await exporter.exportWithDialog()).toMatchObject({ path: out });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_BUNDLE_COLLECT' }));
    expect(zipNames(out)).toContain('health.json');
  });
});

describe('buildSystemInfo', () => {
  it('records OS, CPU count, runtime versions, addon ABI, driver state and app version without hostnames or user names', () => {
    const info = buildSystemInfo({
      appVersion: '1.2.3',
      vigemState: 'running',
      addonAvailable: true,
      foregroundElevatedExport: true,
      os: {
        release: () => '10.0.26200',
        arch: () => 'x64',
        cpus: () => [{}, {}, {}, {}] as never,
        totalmem: () => 16 * 1024 ** 3,
        platform: () => 'win32',
      },
      versions: { node: '24.0.0', electron: '44.0.0', modules: '149' },
    });
    expect(info).toMatchObject({
      appVersion: '1.2.3',
      os: { platform: 'win32', release: '10.0.26200', arch: 'x64', cpus: 4 },
      versions: { node: '24.0.0', electron: '44.0.0', modules: '149' },
      addon: { abi: '149', loaded: true, hasForegroundElevated: true },
      drivers: { vigemBusService: 'running' },
    });
    expect(JSON.stringify(info)).not.toMatch(/hostname|username/i);
  });
});

describe('startCrashReporter', () => {
  it('sets the crash dump folder, then starts the reporter with uploads off and compression on', () => {
    const calls: string[] = [];
    const app = { setPath: vi.fn((k: string, v: string) => calls.push(`setPath ${k} ${v}`)) };
    const crashReporter = { start: vi.fn((o: object) => calls.push(`start ${JSON.stringify(o)}`)) };
    startCrashReporter(app, crashReporter, 'D:\\data\\crashes');
    expect(calls).toEqual([
      'setPath crashDumps D:\\data\\crashes',
      'start {"submitURL":"","uploadToServer":false,"compress":true}',
    ]);
  });
});
