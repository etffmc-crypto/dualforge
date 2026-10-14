import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeIo, quarantine, writeJsonAtomic, type FileIo } from '../src/main/json-file.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-json-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function flaky(code: string, failures: number): FileIo & { calls: number } {
  const io = {
    calls: 0,
    ...nodeIo,
    renameSync(a: string, b: string) {
      io.calls++;
      if (io.calls <= failures) throw Object.assign(new Error('locked'), { code });
      nodeIo.renameSync(a, b);
    },
  };
  return io;
}

describe('writeJsonAtomic rename retry', () => {
  it('retries a transient EPERM/EBUSY rename and succeeds', () => {
    for (const code of ['EPERM', 'EBUSY']) {
      const io = flaky(code, 2);
      const f = join(dir, `${code}.json`);
      writeJsonAtomic(f, { a: 1 }, io);
      expect(io.calls).toBe(3);
      expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1 });
    }
  });
  it('gives up after 3 retries and rethrows', () => {
    const io = flaky('EPERM', 99);
    expect(() => writeJsonAtomic(join(dir, 'x.json'), {}, io)).toThrow('locked');
    expect(io.calls).toBe(4);
  });
  it('does not retry other errors', () => {
    const io = flaky('ENOSPC', 99);
    const spy = vi.spyOn(io, 'unlinkSync');
    expect(() => writeJsonAtomic(join(dir, 'x.json'), {}, io)).toThrow();
    expect(io.calls).toBe(1);
    expect(spy).toHaveBeenCalled();
  });
});

describe('quarantine rename retry', () => {
  const log = { error: vi.fn(), warn: vi.fn() };
  beforeEach(() => {
    log.error.mockClear();
  });
  it('retries a transient EBUSY and moves the file into the corrupt dir', () => {
    const f = join(dir, 'settings.json');
    writeFileSync(f, '{bad');
    const io = flaky('EBUSY', 2);
    quarantine(f, join(dir, 'corrupt'), log, 'E_TEST', 'bad json', io);
    expect(io.calls).toBe(3);
    expect(existsSync(f)).toBe(false);
    expect(readdirSync(join(dir, 'corrupt'))).toHaveLength(1);
    // only the "rejected" line, no "could not quarantine" line
    expect(log.error).toHaveBeenCalledTimes(1);
  });
  it('logs and keeps the file when the rename keeps failing', () => {
    const f = join(dir, 'settings.json');
    writeFileSync(f, '{bad');
    const io = flaky('EPERM', 99);
    quarantine(f, join(dir, 'corrupt'), log, 'E_TEST', 'bad json', io);
    expect(io.calls).toBe(4);
    expect(existsSync(f)).toBe(true);
    expect(log.error).toHaveBeenCalledTimes(2);
  });
});
