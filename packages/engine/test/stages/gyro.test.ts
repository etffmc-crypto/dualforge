import { describe, expect, it } from 'vitest';
import { defaultProfile, emptyButtons, type GyroConfig, type RawState } from '@dualforge/shared';
import { buildCurveLut, presetPoints } from '../../src/stages/stick-curve.js';
import { applyGyro, createGyroState, GYRO_LSB_PER_DPS } from '../../src/stages/gyro.js';

const D = GYRO_LSB_PER_DPS;
const raw = (gx = 0, gy = 0, pressed: string[] = []): RawState => {
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
    gyro: { x: gx, y: gy, z: 0 },
    accel: { x: 0, y: 0, z: 0 },
    touch: [
      { active: false, id: 0, x: 0, y: 0 },
      { active: false, id: 0, x: 0, y: 0 },
    ],
    battery: { percent: 100, state: 'full' },
    seq: 0,
  };
};
const cfg = (o: Partial<GyroConfig> = {}): GyroConfig => ({
  ...defaultProfile('p', 'p').gyro,
  output: 'rightStick',
  deadzoneDps: 0,
  ...o,
});
const lin = buildCurveLut(presetPoints('linear'));

describe('applyGyro', () => {
  it('rightStick scaling at sens 1: 100 dps turning right -> rx +0.5; pitch up -> ry +', () => {
    const o = applyGyro(raw(100 * D, -100 * D), cfg(), lin, createGyroState(), 8);
    expect(o.active).toBe(true);
    expect(o.rx).toBeCloseTo(0.5, 3);
    expect(o.ry).toBeCloseTo(0.5, 3);
  });
  it('turning left gives negative rx; saturates at 1', () => {
    expect(applyGyro(raw(0, 400 * D), cfg(), lin, createGyroState(), 8).rx).toBeCloseTo(-1, 6);
  });
  it('subtracts bias', () => {
    const c = cfg({ bias: { x: 0, y: 50 * D, z: 0 } });
    expect(applyGyro(raw(0, 50 * D), c, lin, createGyroState(), 8).rx).toBe(0);
    expect(applyGyro(raw(0, -50 * D), c, lin, createGyroState(), 8).rx).toBeCloseTo(0.5, 3); // (-50-50)=-100 dps yaw -> right
  });
  it('deadzone zeroes small rates', () => {
    const c = cfg({ deadzoneDps: 5 });
    expect(applyGyro(raw(4 * D, 4 * D), c, lin, createGyroState(), 8)).toMatchObject({
      rx: 0,
      ry: 0,
    });
    expect(Math.abs(applyGyro(raw(0, 6 * D), c, lin, createGyroState(), 8).rx)).toBeGreaterThan(0);
  });
  it('invert flips each axis', () => {
    const o = applyGyro(
      raw(100 * D, -100 * D),
      cfg({ invertX: true, invertY: true }),
      lin,
      createGyroState(),
      8,
    );
    expect(o.rx).toBeCloseTo(-0.5, 3);
    expect(o.ry).toBeCloseTo(-0.5, 3);
  });
  it('sensitivity scales the full-deflection rate', () => {
    expect(
      applyGyro(raw(0, -100 * D), cfg({ sensitivityX: 2 }), lin, createGyroState(), 8).rx,
    ).toBeCloseTo(1, 3);
  });
  it('hold activation follows the button', () => {
    const c = cfg({ activate: 'hold', activateButton: 'l1' });
    const s = createGyroState();
    expect(applyGyro(raw(0, -100 * D), c, lin, s, 8).active).toBe(false);
    expect(applyGyro(raw(0, -100 * D), c, lin, s, 8).rx).toBe(0);
    expect(applyGyro(raw(0, -100 * D, ['l1']), c, lin, s, 8).active).toBe(true);
    expect(applyGyro(raw(0, -100 * D), c, lin, s, 8).active).toBe(false);
  });
  it('toggle flips on each rising edge only', () => {
    const c = cfg({ activate: 'toggle', activateButton: 'r3' });
    const s = createGyroState();
    expect(applyGyro(raw(0, 0, ['r3']), c, lin, s, 8).active).toBe(true);
    expect(applyGyro(raw(0, 0, ['r3']), c, lin, s, 8).active).toBe(true); // still held: no flip
    expect(applyGyro(raw(), c, lin, s, 8).active).toBe(true); // release keeps state
    expect(applyGyro(raw(0, 0, ['r3']), c, lin, s, 8).active).toBe(false); // second press flips off
  });
  it('output off is inactive', () => {
    expect(
      applyGyro(raw(0, -100 * D), cfg({ output: 'off' }), lin, createGyroState(), 8).active,
    ).toBe(false);
  });
  it('mouse accumulates fractional pixels and emits integers', () => {
    const c = cfg({ output: 'mouse' });
    const s = createGyroState();
    // 30 dps right, 8 ms: 30*1*0.008*10 = 2.4 px/frame
    const a = applyGyro(raw(0, -30 * D), c, lin, s, 8);
    expect(a.dx).toBe(2);
    const b = applyGyro(raw(0, -30 * D), c, lin, s, 8); // 0.4 + 2.4 = 2.8
    expect(b.dx).toBe(2);
    const d = applyGyro(raw(0, -30 * D), c, lin, s, 8); // 0.8 + 2.4 = 3.2
    expect(d.dx).toBe(3);
    expect(s.mouseAccX).toBeCloseTo(0.2, 6);
    expect(d.rx).toBe(0);
  });
  it('mouse: pitch up moves the cursor up (dy < 0); invertY flips', () => {
    const up = applyGyro(raw(100 * D, 0), cfg({ output: 'mouse' }), lin, createGyroState(), 10);
    expect(up.dy).toBe(-10);
    const inv = applyGyro(
      raw(100 * D, 0),
      cfg({ output: 'mouse', invertY: true }),
      lin,
      createGyroState(),
      10,
    );
    expect(inv.dy).toBe(10);
  });
  it('mouse: left turn gives negative dx; invertX flips', () => {
    expect(
      applyGyro(raw(0, 100 * D), cfg({ output: 'mouse' }), lin, createGyroState(), 10).dx,
    ).toBe(-10);
    expect(
      applyGyro(
        raw(0, 100 * D),
        cfg({ output: 'mouse', invertX: true }),
        lin,
        createGyroState(),
        10,
      ).dx,
    ).toBe(10);
  });
});
