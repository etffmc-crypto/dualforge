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
});
