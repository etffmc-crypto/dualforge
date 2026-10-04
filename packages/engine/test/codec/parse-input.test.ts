import { describe, expect, it } from 'vitest';
import { parseDualSenseUsb } from '../../src/codec/parse-input.js';

function report(mut: (b: Uint8Array) => void = () => {}): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01;
  b[1] = 128;
  b[2] = 128;
  b[3] = 128;
  b[4] = 128; // centered
  b[8] = 0x08; // dpad neutral
  b[33] = 0x80;
  b[37] = 0x80; // both touch points inactive (bit7 = not touching)
  b[53] = 0x08; // 80% discharging
  mut(b);
  return b;
}

describe('parseDualSenseUsb', () => {
  it('centers sticks near zero', () => {
    const s = parseDualSenseUsb(report());
    expect(Math.abs(s.lx)).toBeLessThan(0.01);
    expect(Math.abs(s.ly)).toBeLessThan(0.01);
  });
  it('maps stick extremes with +Y up', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[1] = 255;
        b[2] = 0;
        b[3] = 0;
        b[4] = 255;
      }),
    );
    expect(s.lx).toBeCloseTo(1, 2);
    expect(s.ly).toBeCloseTo(1, 2); // HID y=0 is top → +1
    expect(s.rx).toBeCloseTo(-1, 2);
    expect(s.ry).toBeCloseTo(-1, 2);
  });
  it('maps triggers 0..1', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[5] = 255;
        b[6] = 128;
      }),
    );
    expect(s.l2).toBe(1);
    expect(s.r2).toBeCloseTo(0.502, 2);
  });
  it('decodes face buttons and dpad', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[8] = 0x20 | 0x01;
      }),
    ); // cross + NE
    expect(s.buttons.cross).toBe(true);
    expect(s.buttons.dpadUp).toBe(true);
    expect(s.buttons.dpadRight).toBe(true);
    expect(s.buttons.dpadDown).toBe(false);
  });
  it('decodes shoulder/system buttons', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[9] = 0b1111_1111;
        b[10] = 0b111;
      }),
    );
    for (const k of [
      'l1',
      'r1',
      'l2',
      'r2',
      'create',
      'options',
      'l3',
      'r3',
      'ps',
      'touchpad',
      'mic',
    ] as const)
      expect(s.buttons[k]).toBe(true);
  });
  it('decodes battery', () => {
    expect(parseDualSenseUsb(report()).battery).toEqual({ percent: 80, state: 'discharging' });
    expect(
      parseDualSenseUsb(
        report((b) => {
          b[53] = 0x1a;
        }),
      ).battery,
    ).toEqual({ percent: 100, state: 'charging' });
    expect(
      parseDualSenseUsb(
        report((b) => {
          b[53] = 0x20;
        }),
      ).battery.state,
    ).toBe('full');
  });
  it('decodes gyro int16', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[16] = 0xff;
        b[17] = 0xff;
        b[18] = 0x10;
        b[19] = 0x00;
      }),
    );
    expect(s.gyro.x).toBe(-1);
    expect(s.gyro.y).toBe(16);
  });
  it('decodes touch point', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[33] = 0x05;
        b[34] = 0x34;
        b[35] = 0x12;
        b[36] = 0x02;
      }),
    );
    expect(s.touch[0]).toEqual({ active: true, id: 5, x: 0x234, y: 0x021 });
    expect(s.touch[1].active).toBe(false);
  });
  it('throws on wrong report id or length', () => {
    expect(() => parseDualSenseUsb(new Uint8Array(10))).toThrow();
    expect(() =>
      parseDualSenseUsb(
        report((b) => {
          b[0] = 0x31;
        }),
      ),
    ).toThrow();
  });
});
