import { describe, expect, it } from 'vitest';
import { buildOutputReport, type Feedback } from '../../src/codec/build-output.js';

const fb: Feedback = { rumbleLeft: 1, rumbleRight: 0.5, lightbar: { r: 10, g: 20, b: 30 }, brightness: 1, playerLeds: 0b00100, micLed: 2 };

describe('buildOutputReport', () => {
  it('is 48 bytes with report id 0x02', () => {
    const r = buildOutputReport(fb);
    expect(r.length).toBe(48);
    expect(r[0]).toBe(0x02);
  });
  it('sets valid flags', () => {
    const r = buildOutputReport(fb);
    expect(r[1] & 0x03).toBe(0x03);            // vibration + haptics select
    expect(r[2] & 0x15).toBe(0x15);            // mic LED, lightbar, player LEDs
    expect(r[39] & 0x06).toBe(0x06);           // lightbar setup + vibration v2
  });
  it('scales motors 0..255 (right=small, left=large)', () => {
    const r = buildOutputReport(fb);
    expect(r[3]).toBe(128);
    expect(r[4]).toBe(255);
  });
  it('writes lightbar, brightness, player LEDs, mic LED', () => {
    const r = buildOutputReport(fb);
    expect([r[45], r[46], r[47]]).toEqual([10, 20, 30]);
    expect(r[42]).toBe(0x02);
    expect(r[43]).toBe(1);
    expect(r[44]).toBe(0b00100);
    expect(r[9]).toBe(2);
  });
  it('clamps out-of-range motor values', () => {
    const r = buildOutputReport({ ...fb, rumbleLeft: 7, rumbleRight: -3 });
    expect(r[4]).toBe(255);
    expect(r[3]).toBe(0);
  });
});
