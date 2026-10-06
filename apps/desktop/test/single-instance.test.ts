import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { acquireSingleInstance } from '../src/main/single-instance.js';

describe('acquireSingleInstance', () => {
  it('keeps running when the lock is acquired', () => {
    const app = { requestSingleInstanceLock: vi.fn(() => true), exit: vi.fn() };
    expect(acquireSingleInstance(app)).toBe(true);
    expect(app.exit).not.toHaveBeenCalled();
  });
  it('a second instance exits immediately with code 0', () => {
    const app = { requestSingleInstanceLock: vi.fn(() => false), exit: vi.fn() };
    expect(acquireSingleInstance(app)).toBe(false);
    expect(app.exit).toHaveBeenCalledWith(0);
  });
  it('a test data dir moves userData (and so the lock) there before locking; otherwise it stays put', () => {
    const order: string[] = [];
    const app = {
      requestSingleInstanceLock: vi.fn(() => (order.push('lock'), true)),
      exit: vi.fn(),
      setPath: vi.fn((name: string, p: string) => order.push(`${name}=${p}`)),
    };
    acquireSingleInstance(app, { DUALFORGE_DATA_DIR: join('C:', 'tmp', 'df-pkg-1') });
    expect(order).toEqual([`userData=${join('C:', 'tmp', 'df-pkg-1', 'electron')}`, 'lock']);
    const plain = { ...app, setPath: vi.fn() };
    acquireSingleInstance(plain, {});
    expect(plain.setPath).not.toHaveBeenCalled();
  });
});
