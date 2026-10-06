import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuitCleanup } from '../src/main/quit-cleanup.js';

function rig(o: { cli?: boolean; cloakOff?: () => Promise<unknown>; cloaked?: boolean } = {}) {
  const markStuck = vi.fn();
  const log = { error: vi.fn() };
  const cloakOff = vi.fn(o.cloakOff ?? (async () => undefined));
  const c = createQuitCleanup({
    hasCli: () => o.cli ?? true,
    cloakOff,
    cloakedThisSession: () => o.cloaked ?? true,
    markStuck,
    log,
    timeoutMs: 5000,
  });
  return { c, markStuck, log, cloakOff };
}

afterEach(() => vi.useRealTimers());

describe('quit cleanup', () => {
  it('without the HidHide CLI it is done at once and never cloaks off', async () => {
    const r = rig({ cli: false });
    await r.c.run();
    expect(r.c.state()).toBe('done');
    expect(r.cloakOff).not.toHaveBeenCalled();
  });
  it('runs the cloak-off once, however often it is asked (install, then before-quit)', async () => {
    const r = rig();
    const a = r.c.run();
    expect(r.c.state()).toBe('running');
    const b = r.c.run();
    await Promise.all([a, b]);
    await r.c.run();
    expect(r.cloakOff).toHaveBeenCalledTimes(1);
    expect(r.c.state()).toBe('done');
    expect(r.markStuck).not.toHaveBeenCalled();
  });
  it('gives up after 5 s and marks the pad stuck when this session cloaked it', async () => {
    vi.useFakeTimers();
    const r = rig({ cloakOff: () => new Promise(() => undefined) });
    const p = r.c.run();
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(r.c.state()).toBe('done');
    expect(r.markStuck).toHaveBeenCalledWith(true);
    expect(r.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'E_HIDHIDE_CLOAK_STUCK' }),
    );
  });
  it('a timeout without a cloak this session is not stuck; a rejection still finishes', async () => {
    vi.useFakeTimers();
    const a = rig({ cloakOff: () => new Promise(() => undefined), cloaked: false });
    const p = a.c.run();
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(a.markStuck).not.toHaveBeenCalled();
    vi.useRealTimers();
    const b = rig({ cloakOff: async () => Promise.reject(new Error('boom')) });
    await b.c.run();
    expect(b.c.state()).toBe('done');
  });
});
