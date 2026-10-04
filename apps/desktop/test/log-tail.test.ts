import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_TAIL_MAX, newestLog, readLogTail, registerLogIpc } from '../src/main/log-tail.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-logtail-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const line = (i: number) => JSON.stringify({ level: 30, time: i, code: 'X', msg: `line ${i}` });
function writeLog(name: string, n: number, mtimeS: number) {
  writeFileSync(join(dir, name), Array.from({ length: n }, (_, i) => line(i)).join('\n') + '\n');
  utimesSync(join(dir, name), mtimeS, mtimeS);
}

describe('newestLog', () => {
  it('picks the most recently written app*.log, ignoring other files and folders', () => {
    writeLog('app.1.log', 3, 1000);
    writeLog('app.2.log', 3, 2000);
    writeLog('other.log', 3, 3000);
    mkdirSync(join(dir, 'app.9.log')); // a folder named like a log is never read
    expect(newestLog(dir)).toBe(join(dir, 'app.2.log'));
  });

  it('is null for an empty or missing folder', () => {
    expect(newestLog(dir)).toBeNull();
    expect(newestLog(join(dir, 'nope'))).toBeNull();
  });
});

describe('readLogTail', () => {
  it('returns the last N non-empty lines in file order', () => {
    writeLog('app.1.log', 50, 1000);
    const t = readLogTail(dir, 5);
    expect(t.file).toBe('app.1.log');
    expect(t.lines).toEqual([45, 46, 47, 48, 49].map(line));
  });

  it('returns every line when the file is shorter than N', () => {
    writeLog('app.1.log', 3, 1000);
    expect(readLogTail(dir, 200).lines).toHaveLength(3);
  });

  it('reads only the end of a large file and drops the partial first line', () => {
    const big = Array.from({ length: 20_000 }, (_, i) => line(i)).join('\n') + '\n';
    writeFileSync(join(dir, 'app.1.log'), big);
    const t = readLogTail(dir, 500, 4096);
    expect(t.lines.length).toBeGreaterThan(0);
    expect(t.lines.length).toBeLessThan(500);
    for (const l of t.lines) expect(() => JSON.parse(l) as unknown).not.toThrow();
    expect(t.lines.at(-1)).toBe(line(19_999));
  });

  it('is empty when there is no log', () => {
    expect(readLogTail(dir, 10)).toEqual({ file: null, lines: [] });
  });
});

describe('logs:tail IPC', () => {
  function setup() {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const log = { error: vi.fn() };
    registerLogIpc({ ipc: { handle: (c, fn) => handlers.set(c, fn) }, dir, log });
    return { call: (raw: unknown) => handlers.get('logs:tail')!({}, raw), log };
  }

  it('answers { lines } requests up to the cap', () => {
    writeLog('app.1.log', 10, 1000);
    const { call } = setup();
    expect((call({ lines: 4 }) as { lines: string[] }).lines).toHaveLength(4);
    expect((call({ lines: LOG_TAIL_MAX }) as { lines: string[] }).lines).toHaveLength(10);
  });

  it('rejects bad payloads with E_LOGS_REQUEST (no path can be passed)', () => {
    const { call, log } = setup();
    for (const bad of [
      { lines: 0 },
      { lines: LOG_TAIL_MAX + 1 },
      { lines: 1.5 },
      { lines: 5, file: '../../secret' },
      'x',
      null,
    ]) {
      expect(() => call(bad)).toThrow('E_LOGS_REQUEST');
    }
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_LOGS_REQUEST' }));
  });
});
