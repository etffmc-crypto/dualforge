import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeIo, writeJsonAtomic, type FileIo } from '../src/main/json-file.js';

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
