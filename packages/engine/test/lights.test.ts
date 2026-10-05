import { describe, expect, it } from 'vitest';
import { defaultProfile, type Battery } from '@dualforge/shared';
import { applyTurboPulse, computeLightbar } from '../src/lights.js';

const full: Battery = { percent: 100, state: 'full' };
const cfg = (o: Partial<ReturnType<typeof defaultProfile>['lights']> = {}) => ({
  ...defaultProfile('p', 'p').lights,
  r: 200,
  g: 100,
  b: 50,
  ...o,
});
const rgb = (f: { r: number; g: number; b: number }) => [f.r, f.g, f.b];

describe('computeLightbar', () => {
  it('off is black and not animated', () => {
    const f = computeLightbar(cfg({ mode: 'off' }), 0, full);
    expect(rgb(f)).toEqual([0, 0, 0]);
    expect(f.animated).toBe(false);
  });
  it('static returns the configured colour plus brightness/leds/mic', () => {
    const f = computeLightbar(
      cfg({ mode: 'static', brightness: 1, playerLeds: 5, micLed: 2 }),
      12345,
      full,
    );
    expect(rgb(f)).toEqual([200, 100, 50]);
    expect(f).toMatchObject({ brightness: 1, playerLeds: 5, micLed: 2, animated: false });
  });
  it('breathing: speed 0 -> 4000 ms period, 0.575 at t=0, full at quarter period, animated', () => {
    const c = cfg({ mode: 'breathing', speed: 0 });
    const f0 = computeLightbar(c, 0, full);
    expect(rgb(f0)).toEqual([
      Math.round(200 * 0.575),
      Math.round(100 * 0.575),
      Math.round(50 * 0.575),
    ]);
    expect(f0.animated).toBe(true);
    expect(rgb(computeLightbar(c, 1000, full))).toEqual([200, 100, 50]);
    expect(computeLightbar(c, 3000, full).r).toBe(Math.round(200 * 0.15));
  });
  it('breathing period shortens with speed (speed 100 -> 500 ms)', () => {
    expect(computeLightbar(cfg({ mode: 'breathing', speed: 100 }), 125, full).r).toBe(200);
  });
  it('rainbow: red at t=0, hue advances over the period (speed 0 -> 6000 ms), animated', () => {
    const c = cfg({ mode: 'rainbow', speed: 0 });
    const f0 = computeLightbar(c, 0, full);
    expect(rgb(f0)).toEqual([255, 0, 0]);
    expect(f0.animated).toBe(true);
    expect(rgb(computeLightbar(c, 2000, full))).toEqual([0, 255, 0]); // hue 1/3
    expect(rgb(computeLightbar(c, 3000, full))).toEqual([0, 255, 255]); // hue 1/2
    expect(rgb(computeLightbar(c, 6000, full))).toEqual([255, 0, 0]); // wraps
  });
  it('battery colours by level', () => {
    const c = cfg({ mode: 'battery' });
    expect(rgb(computeLightbar(c, 0, { percent: 80, state: 'discharging' }))).toEqual([0, 255, 0]);
    expect(rgb(computeLightbar(c, 0, { percent: 60, state: 'discharging' }))).toEqual([0, 255, 0]);
    expect(rgb(computeLightbar(c, 0, { percent: 40, state: 'discharging' }))).toEqual([
      255, 140, 0,
    ]);
    expect(rgb(computeLightbar(c, 0, { percent: 20, state: 'discharging' }))).toEqual([
      255, 140, 0,
    ]);
    expect(rgb(computeLightbar(c, 0, { percent: 19, state: 'discharging' }))).toEqual([255, 0, 0]);
    expect(computeLightbar(c, 0, { percent: 80, state: 'discharging' }).animated).toBe(false);
  });
  it('battery blinks at 1 Hz while charging', () => {
    const c = cfg({ mode: 'battery' });
    const b: Battery = { percent: 80, state: 'charging' };
    expect(rgb(computeLightbar(c, 0, b))).toEqual([0, 255, 0]);
    expect(rgb(computeLightbar(c, 499, b))).toEqual([0, 255, 0]);
    expect(rgb(computeLightbar(c, 500, b))).toEqual([0, 0, 0]);
    expect(rgb(computeLightbar(c, 1000, b))).toEqual([0, 255, 0]);
    expect(computeLightbar(c, 0, b).animated).toBe(true);
  });
});

describe('applyTurboPulse', () => {
  const base = {
    r: 0,
    g: 80,
    b: 255,
    brightness: 1 as const,
    playerLeds: 4,
    micLed: 0 as const,
    animated: false,
  };
  it('replaces the colour with red pulsing at 2 Hz and keeps the other fields', () => {
    const f = applyTurboPulse(base, 0);
    expect(f).toMatchObject({
      r: 255,
      g: 0,
      b: 0,
      brightness: 1,
      playerLeds: 4,
      micLed: 0,
      animated: true,
    });
    expect(applyTurboPulse(base, 250).r).toBeLessThan(60); // half a 500 ms period: dim
    expect(applyTurboPulse(base, 500).r).toBe(255); // a full period later: bright again
    expect(applyTurboPulse(base, 125).r).toBeGreaterThan(60);
    expect(applyTurboPulse(base, 125).r).toBeLessThan(255);
  });
  it('is pure', () => {
    applyTurboPulse(base, 0);
    expect(base.r).toBe(0);
  });
});
