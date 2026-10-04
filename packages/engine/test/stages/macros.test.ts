import { describe, expect, it } from 'vitest';
import { emptyXInput, type Macro } from '@dualforge/shared';
import {
  createMacroState,
  reconcileMacros,
  startMacro,
  stopMacro,
  tickMacros,
} from '../../src/stages/macros.js';
import type { MouseButton } from '../../src/stages/mapping.js';

const mk = (loop = false): Map<string, Macro> =>
  new Map([
    [
      'm',
      {
        id: 'm',
        name: 'm',
        loop,
        steps: [
          { target: { type: 'key', code: 'VK_A' }, holdMs: 100, delayMs: 50 },
          { target: { type: 'key', code: 'VK_B' }, holdMs: 100, delayMs: 0 },
        ],
      },
    ],
  ]);

function at(s: ReturnType<typeof createMacroState>, t: number, macros: Map<string, Macro>) {
  const out = {
    xinput: emptyXInput(),
    keysWanted: new Set<string>(),
    mouseWanted: new Set<MouseButton>(),
  };
  tickMacros(s, t, macros, out);
  return [...out.keysWanted];
}

describe('macro scheduler', () => {
  it('runs hold/delay phases per step and finishes', () => {
    const macros = mk();
    const s = createMacroState();
    startMacro(s, 'm', 0, macros);
    expect(at(s, 0, macros)).toEqual(['VK_A']);
    expect(at(s, 99, macros)).toEqual(['VK_A']);
    expect(at(s, 100, macros)).toEqual([]);
    expect(at(s, 149, macros)).toEqual([]);
    expect(at(s, 150, macros)).toEqual(['VK_B']);
    expect(at(s, 249, macros)).toEqual(['VK_B']);
    expect(at(s, 250, macros)).toEqual([]);
    expect(s.running).toHaveLength(0);
  });
  it('loop restarts after the last step', () => {
    const macros = mk(true);
    const s = createMacroState();
    startMacro(s, 'm', 0, macros);
    expect(at(s, 250, macros)).toEqual(['VK_A']);
    expect(at(s, 360, macros)).toEqual([]);
    expect(at(s, 400, macros)).toEqual(['VK_B']);
    expect(s.running).toHaveLength(1);
  });
  it('starting an already-running macro is a no-op', () => {
    const macros = mk();
    const s = createMacroState();
    startMacro(s, 'm', 0, macros);
    startMacro(s, 'm', 90, macros);
    expect(s.running).toHaveLength(1);
    expect(at(s, 100, macros)).toEqual([]); // not restarted at 90
  });
  it('stopMacro removes it; xtrigger and mouse targets apply', () => {
    const macros: Map<string, Macro> = new Map([
      [
        't',
        {
          id: 't',
          name: 't',
          loop: false,
          steps: [{ target: { type: 'xtrigger', trigger: 'rt' }, holdMs: 10, delayMs: 0 }],
        },
      ],
    ]);
    const s = createMacroState();
    startMacro(s, 't', 0, macros);
    const out = {
      xinput: emptyXInput(),
      keysWanted: new Set<string>(),
      mouseWanted: new Set<MouseButton>(),
    };
    tickMacros(s, 5, macros, out);
    expect(out.xinput.rt).toBe(1);
    stopMacro(s, 't');
    expect(s.running).toHaveLength(0);
  });
  it('a zero-length looping macro does not spin', () => {
    const macros: Map<string, Macro> = new Map([
      [
        'z',
        {
          id: 'z',
          name: 'z',
          loop: true,
          steps: [{ target: { type: 'key', code: 'VK_A' }, holdMs: 0, delayMs: 0 }],
        },
      ],
    ]);
    const s = createMacroState();
    startMacro(s, 'z', 0, macros);
    expect(() => at(s, 1000, macros)).not.toThrow();
  });
});

describe('macros survive profile edits', () => {
  const one = (loop: boolean): Macro => ({
    id: 'm',
    name: 'm',
    loop,
    steps: [{ target: { type: 'key', code: 'VK_A' }, holdMs: 100, delayMs: 0 }],
  });
  it('tickMacros drops a running macro whose step index is out of range (no throw)', () => {
    const s = createMacroState();
    startMacro(s, 'm', 0, mk());
    s.running[0]!.step = 1;
    s.running[0]!.untilMs = 0;
    const edited = new Map([['m', one(false)]]);
    expect(() => at(s, 10, edited)).not.toThrow();
    expect(s.running).toHaveLength(0);
  });
  it('reconcileMacros: removed -> stopped; changed non-loop -> stopped; changed loop -> restarted; unchanged -> untouched', () => {
    const prev = mk();
    const s = createMacroState();
    startMacro(s, 'm', 0, prev);
    at(s, 120, prev); // mid-macro (step 0 delay phase / step 1)
    reconcileMacros(s, prev, new Map(), 120);
    expect(s.running).toHaveLength(0);

    startMacro(s, 'm', 0, prev);
    reconcileMacros(s, prev, new Map([['m', one(false)]]), 5);
    expect(s.running).toHaveLength(0);

    startMacro(s, 'm', 0, prev);
    s.running[0]!.step = 1;
    reconcileMacros(s, prev, new Map([['m', one(true)]]), 500);
    expect(s.running).toEqual([{ id: 'm', step: 0, phase: 'hold', untilMs: 600 }]);

    const same = new Map([['m', structuredClone(prev.get('m')!)]]);
    const s2 = createMacroState();
    startMacro(s2, 'm', 0, prev);
    s2.running[0]!.step = 1;
    reconcileMacros(s2, prev, same, 50);
    expect(s2.running[0]!.step).toBe(1);
  });
});
