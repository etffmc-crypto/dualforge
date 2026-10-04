import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

class FakeChild extends EventEmitter {
  stderr = new EventEmitter();
  postMessage = vi.fn();
  kill = vi.fn();
}
const children: FakeChild[] = [];
vi.mock('electron', () => ({
  utilityProcess: { fork: vi.fn(() => { const c = new FakeChild(); children.push(c); return c; }) },
}));

import { createEngineHost } from '../src/main/engine-host.js';
import { defaultProfile, type EngineEvent } from '@dualforge/shared';

function setup() {
  const events: EngineEvent[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const host = createEngineHost({ onEvent: (e) => events.push(e), log: log as never });
  return { events, log, host };
}

describe('engine host', () => {
  beforeEach(() => { vi.useFakeTimers(); children.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it('respawns with 500*n ms backoff', () => {
    const { host } = setup();
    host.start();
    expect(children).toHaveLength(1);
    children[0]!.emit('exit', 1);
    vi.advanceTimersByTime(499); expect(children).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(children).toHaveLength(2);
    children[1]!.emit('exit', 1);
    vi.advanceTimersByTime(999); expect(children).toHaveLength(2);
    vi.advanceTimersByTime(1); expect(children).toHaveLength(3);
  });

  it('trips the restart limit on the 5th crash within 60 s', () => {
    const { host, events, log } = setup();
    host.start();
    for (let i = 0; i < 4; i++) { children[i]!.emit('exit', 1); vi.advanceTimersByTime(500 * (i + 1)); }
    expect(children).toHaveLength(5);
    children[4]!.emit('exit', 1);
    vi.advanceTimersByTime(60_000);
    expect(children).toHaveLength(5);
    expect(events.some((e) => e.type === 'error' && e.code === 'E_ENGINE_RESTART_LIMIT')).toBe(true);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_ENGINE_RESTART_LIMIT' }));
  });

  it('stop() during a pending backoff cancels the respawn', () => {
    const { host } = setup();
    host.start();
    children[0]!.emit('exit', 1);
    host.stop();
    vi.advanceTimersByTime(5000);
    expect(children).toHaveLength(1);
  });

  it('emits status connected:false on exit', () => {
    const { host, events } = setup();
    host.start();
    children[0]!.emit('exit', 1);
    expect(events).toContainEqual({ type: 'status', connected: false, vigemReady: false });
  });

  it('re-sends the last setProfile after a respawn', () => {
    const { host } = setup();
    host.start();
    const a = { type: 'setProfile', profile: defaultProfile('a', 'A') } as const;
    const b = { type: 'setProfile', profile: defaultProfile('b', 'B') } as const;
    host.send(a); host.send(b);
    children[0]!.emit('exit', 1);
    vi.advanceTimersByTime(500);
    expect(children[1]!.postMessage).toHaveBeenCalledWith(b);
    expect(children[1]!.postMessage).not.toHaveBeenCalledWith(a);
  });
});
