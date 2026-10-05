import { describe, expect, it } from 'vitest';
import {
  defaultProfile,
  emptyButtons,
  emptyXInput,
  type Profile,
  type RawState,
  type TurboSettings,
} from '@dualforge/shared';
import {
  applyMappings,
  applyTurboEdits,
  createMappingState,
  nextTurbo,
  reconcileTurbo,
  TURBO_DOUBLE_TAP_MS,
  TURBO_TAP_MS,
  TURBO_TAP_PULSE_MS,
  type MappingState,
} from '../../src/stages/mapping.js';

const raw = (pressed: string[] = []): RawState => {
  const buttons = emptyButtons();
  for (const p of pressed) (buttons as Record<string, boolean>)[p] = true;
  return {
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    l2: 0,
    r2: 0,
    buttons,
    gyro: { x: 0, y: 0, z: 0 },
    accel: { x: 0, y: 0, z: 0 },
    touch: [
      { active: false, id: 0, x: 0, y: 0 },
      { active: false, id: 0, x: 0, y: 0 },
    ],
    battery: { percent: 100, state: 'full' },
    seq: 0,
  };
};

const ON_PAD: TurboSettings = { modeButton: 'touchpad', lightbarPulse: true, onPadAssign: true };

/** Drives frames through applyMappings and applies emitted edits to the profile, like the engine loop does. */
function rig(p: Profile, turbo?: TurboSettings) {
  const s: MappingState = createMappingState();
  const ctx = {
    p,
    s,
    edits: [] as { button: string; turbo: { mode: string; hz: number } }[][],
    frame(pressed: string[], t: number) {
      const o = applyMappings(raw(pressed), ctx.p, s, t, emptyXInput(), undefined, turbo);
      if (o.turboEdits.length) {
        ctx.edits.push(o.turboEdits);
        ctx.p = applyTurboEdits(ctx.p, o.turboEdits);
      }
      return o;
    },
    a: (pressed: string[], t: number) => ctx.frame(pressed, t).xinput.buttons.A,
  };
  return ctx;
}

describe('turbo hold mode', () => {
  it('fires at hz with 50 % duty, phase from press start, restarting on re-press', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 10 }; // 100 ms period
    const r = rig(p);
    expect(r.a(['cross'], 1000)).toBe(true);
    expect(r.a(['cross'], 1049)).toBe(true);
    expect(r.a(['cross'], 1050)).toBe(false);
    expect(r.a(['cross'], 1099)).toBe(false);
    expect(r.a(['cross'], 1100)).toBe(true);
    expect(r.a([], 1120)).toBe(false);
    expect(r.a(['cross'], 1175)).toBe(true); // new phase from the new press
    expect(r.a(['cross'], 1225)).toBe(false);
  });
  it('time running backwards (a looping replay) restarts the phase instead of sticking on', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 10 };
    const r = rig(p);
    r.a(['cross'], 1000);
    expect(r.a(['cross'], 500)).toBe(true);
    expect(r.a(['cross'], 560)).toBe(false);
    expect(r.a(['cross'], 600)).toBe(true);
  });
  it('reports turboActive while a hold-mode button is held', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 10 };
    const r = rig(p);
    expect(r.frame([], 0).turboActive).toBe(false);
    expect(r.frame(['cross'], 10).turboActive).toBe(true);
    expect(r.frame(['cross'], 70).turboActive).toBe(true); // off phase still counts as active
    expect(r.frame(['circle'], 80).turboActive).toBe(false);
  });
});

describe('turbo toggle mode', () => {
  it('a press latches auto-fire that keeps going when released; the next press stops it', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'toggle', hz: 10 };
    const r = rig(p);
    expect(r.a(['cross'], 0)).toBe(true);
    expect(r.a([], 10)).toBe(true); // released, still latched
    expect(r.frame([], 10).turboActive).toBe(true);
    expect(r.a([], 60)).toBe(false);
    expect(r.a([], 110)).toBe(true);
    expect(r.a([], 1010)).toBe(true);
    expect(r.a(['cross'], 1020)).toBe(false); // second press unlatches
    expect(r.a([], 1030)).toBe(false);
    expect(r.a([], 1110)).toBe(false);
    expect(r.frame([], 1120).turboActive).toBe(false);
    expect(r.a(['cross'], 2000)).toBe(true); // and a third latches again
  });
  it('holding the latching press does not unlatch it', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'toggle', hz: 10 };
    const r = rig(p);
    r.a(['cross'], 0);
    expect(r.a(['cross'], 100)).toBe(true);
    expect(r.a(['cross'], 500)).toBe(true);
  });
});

describe('nextTurbo / applyTurboEdits', () => {
  it('cycles off → slow → medium → fast → off; toggle or custom speeds step on or go off', () => {
    expect(nextTurbo({ mode: 'off', hz: 12 })).toEqual({ mode: 'hold', hz: 8 });
    expect(nextTurbo({ mode: 'hold', hz: 8 })).toEqual({ mode: 'hold', hz: 12 });
    expect(nextTurbo({ mode: 'hold', hz: 12 })).toEqual({ mode: 'hold', hz: 20 });
    expect(nextTurbo({ mode: 'hold', hz: 20 })).toEqual({ mode: 'off', hz: 20 });
    expect(nextTurbo({ mode: 'hold', hz: 10 })).toEqual({ mode: 'hold', hz: 12 });
    expect(nextTurbo({ mode: 'hold', hz: 25 })).toEqual({ mode: 'off', hz: 25 });
    expect(nextTurbo({ mode: 'toggle', hz: 8 })).toEqual({ mode: 'off', hz: 8 });
  });
  it('applyTurboEdits is pure and returns the same profile for no edits', () => {
    const p = defaultProfile('p', 'p');
    expect(applyTurboEdits(p, [])).toBe(p);
    const q = applyTurboEdits(p, [{ button: 'cross', turbo: { mode: 'hold', hz: 8 } }]);
    expect(q.mappings.cross!.turbo).toEqual({ mode: 'hold', hz: 8 });
    expect(p.mappings.cross!.turbo.mode).toBe('off');
    expect(q.mappings.circle).toBe(p.mappings.circle);
  });
});

describe('on-pad turbo assignment', () => {
  const tp = () => {
    const p = defaultProfile('p', 'p');
    p.mappings.touchpad = {
      targets: [{ type: 'xbutton', button: 'Y' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    };
    return p;
  };
  it('mode button + cross cycles cross through all four states, swallowing the combo presses', () => {
    const r = rig(tp(), ON_PAD);
    const expected = [
      { mode: 'hold', hz: 8 },
      { mode: 'hold', hz: 12 },
      { mode: 'hold', hz: 20 },
      { mode: 'off', hz: 20 },
    ];
    r.frame(['touchpad'], 0);
    let t = 10;
    for (const want of expected) {
      const o = r.frame(['touchpad', 'cross'], t);
      expect(o.turboEdits).toEqual([{ button: 'cross', turbo: want }]);
      expect(o.xinput.buttons.A).toBe(false); // the combo press never reaches the game
      expect(o.xinput.buttons.Y).toBe(false); // nor does the mode button
      expect(r.frame(['touchpad', 'cross'], t + 5).turboEdits).toEqual([]); // edge only
      r.frame(['touchpad'], t + 10);
      t += 20;
    }
    expect(r.p.mappings.cross!.turbo).toEqual({ mode: 'off', hz: 20 });
    // releasing the mode button after a combo is swallowed (no tap passthrough)
    expect(r.frame([], t).xinput.buttons.Y).toBe(false);
    expect(r.frame([], t + 10).xinput.buttons.Y).toBe(false);
  });
  it('the combo button stays suppressed until released, even after the mode button lets go', () => {
    const r = rig(tp(), ON_PAD);
    r.frame(['touchpad'], 0);
    r.frame(['touchpad', 'cross'], 10);
    expect(r.a(['cross'], 20)).toBe(false);
    expect(r.a([], 30)).toBe(false);
    expect(r.a(['cross'], 40)).toBe(true); // a fresh press now uses the new turbo (hold 8 Hz)
  });
  it('a quick tap of the mode button passes through as a short press of its own outputs', () => {
    const r = rig(tp(), ON_PAD);
    expect(r.frame(['touchpad'], 0).xinput.buttons.Y).toBe(false); // deferred
    expect(r.frame(['touchpad'], 100).xinput.buttons.Y).toBe(false);
    expect(r.frame([], 150).xinput.buttons.Y).toBe(true); // released < 250 ms, no combo
    expect(r.frame([], 150 + TURBO_TAP_PULSE_MS - 1).xinput.buttons.Y).toBe(true);
    expect(r.frame([], 150 + TURBO_TAP_PULSE_MS).xinput.buttons.Y).toBe(false);
    expect(r.edits).toEqual([]);
  });
  it('a long hold without a combo becomes a normal hold after 250 ms', () => {
    const r = rig(tp(), ON_PAD);
    r.frame(['touchpad'], 0);
    expect(r.frame(['touchpad'], TURBO_TAP_MS - 1).xinput.buttons.Y).toBe(false);
    expect(r.frame(['touchpad'], TURBO_TAP_MS).xinput.buttons.Y).toBe(true);
    expect(r.frame(['touchpad'], 900).xinput.buttons.Y).toBe(true);
    expect(r.frame([], 910).xinput.buttons.Y).toBe(false);
  });
  it('a combo during a long hold still assigns and ends the passthrough', () => {
    const r = rig(tp(), ON_PAD);
    r.frame(['touchpad'], 0);
    expect(r.frame(['touchpad'], 400).xinput.buttons.Y).toBe(true);
    const o = r.frame(['touchpad', 'square'], 500);
    expect(o.turboEdits).toEqual([{ button: 'square', turbo: { mode: 'hold', hz: 8 } }]);
    expect(o.xinput.buttons.Y).toBe(false);
    expect(o.xinput.buttons.X).toBe(false);
  });
  it('double-tapping the mode button clears turbo on every mapping', () => {
    const p = tp();
    p.mappings.cross!.turbo = { mode: 'hold', hz: 12 };
    p.mappings.square!.turbo = { mode: 'toggle', hz: 20 };
    const r = rig(p, ON_PAD);
    r.frame(['touchpad'], 0);
    expect(r.frame([], 100).turboEdits).toEqual([]); // first tap
    r.frame(['touchpad'], 300);
    const o = r.frame([], 100 + TURBO_DOUBLE_TAP_MS); // release-to-release exactly 400 ms
    expect(o.turboEdits).toEqual([
      { button: 'cross', turbo: { mode: 'off', hz: 12 } },
      { button: 'square', turbo: { mode: 'off', hz: 20 } },
    ]);
    expect(o.xinput.buttons.Y).toBe(false); // the second tap is swallowed
    expect(r.p.mappings.cross!.turbo.mode).toBe('off');
  });
  it('two taps further apart than 400 ms are two single taps', () => {
    const p = tp();
    p.mappings.cross!.turbo = { mode: 'hold', hz: 12 };
    const r = rig(p, ON_PAD);
    r.frame(['touchpad'], 0);
    r.frame([], 100);
    r.frame(['touchpad'], 450);
    expect(r.frame([], 100 + TURBO_DOUBLE_TAP_MS + 1).turboEdits).toEqual([]);
    expect(r.edits).toEqual([]);
  });
  it('a double tap with no turbo set emits no edits', () => {
    const r = rig(tp(), ON_PAD);
    r.frame(['touchpad'], 0);
    r.frame([], 50);
    r.frame(['touchpad'], 100);
    expect(r.frame([], 150).turboEdits).toEqual([]);
  });
  it('a button already held when the mode button goes down is not a combo', () => {
    const r = rig(tp(), ON_PAD);
    r.frame(['cross'], 0);
    // pressing the mode button while cross is already held is not a combo for cross
    expect(r.frame(['cross', 'touchpad'], 10).turboEdits).toEqual([]);
  });
  it('disabled when onPadAssign is off or modeButton is null: the mode button acts normally', () => {
    for (const turbo of [
      { ...ON_PAD, onPadAssign: false },
      { ...ON_PAD, modeButton: null },
      undefined,
    ]) {
      const r = rig(tp(), turbo);
      expect(r.frame(['touchpad'], 0).xinput.buttons.Y).toBe(true);
      const o = r.frame(['touchpad', 'cross'], 10);
      expect(o.turboEdits).toEqual([]);
      expect(o.xinput.buttons.A).toBe(true);
    }
  });
  it('another mode button (ps) works the same way', () => {
    const r = rig(defaultProfile('p', 'p'), { ...ON_PAD, modeButton: 'ps' });
    r.frame(['ps'], 0);
    expect(r.frame(['ps', 'r1'], 10).turboEdits).toEqual([
      { button: 'r1', turbo: { mode: 'hold', hz: 8 } },
    ]);
    expect(r.frame(['ps', 'touchpad'], 20).turboEdits).toEqual([
      { button: 'touchpad', turbo: { mode: 'hold', hz: 8 } },
    ]);
  });
});

describe('reconcileTurbo', () => {
  it('keeps a latch when only the speed changed, drops it when the mode changed', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'toggle', hz: 10 };
    p.mappings.square!.turbo = { mode: 'toggle', hz: 10 };
    const r = rig(p);
    r.frame(['cross', 'square'], 0);
    r.frame([], 10);
    const next = structuredClone(p);
    next.mappings.cross!.turbo = { mode: 'toggle', hz: 20 };
    next.mappings.square!.turbo = { mode: 'hold', hz: 10 };
    reconcileTurbo(r.s, p, next);
    r.p = next;
    expect(r.a([], 20)).toBe(true); // cross still latched (20 Hz: 50 ms period, 20 ms in)
    expect(r.frame([], 20).xinput.buttons.X).toBe(false); // square unlatched
    expect(r.frame([], 20).turboActive).toBe(true);
  });
  it('a hold → toggle change does not inherit a stale press phase', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 10 };
    const r = rig(p);
    r.frame(['cross'], 0);
    const next = structuredClone(p);
    next.mappings.cross!.turbo = { mode: 'toggle', hz: 10 };
    reconcileTurbo(r.s, p, next);
    r.p = next;
    expect(r.a(['cross'], 70)).toBe(false); // still the same press: no new rising edge, not latched
  });
});
