import { describe, expect, it } from 'vitest';
import {
  applyStickFilter,
  createFilterState,
  JITTER_AMP_MAX,
} from '../../src/stages/stick-filter.js';

const basic = (enabled: boolean, strength: number, jitterHz = 30) => ({
  enabled,
  mode: 'basic' as const,
  strength,
  jitterHz,
  curve: [
    [0, 0],
    [0.1, 0],
    [0.25, 0],
    [0.5, 0],
    [1, 0],
  ] as [number, number][],
});

describe('applyStickFilter', () => {
  it('passes through when disabled', () => {
    const s = createFilterState();
    expect(applyStickFilter(0.7, -0.2, basic(false, 100), s, 1)).toEqual({ x: 0.7, y: -0.2 });
  });
  it('first sample initializes without lag', () => {
    const s = createFilterState();
    expect(applyStickFilter(1, 1, basic(true, 100), s, 1)).toEqual({ x: 1, y: 1 });
  });
  it('smooths a step and converges', () => {
    const s = createFilterState();
    const cfg = basic(true, 100);
    applyStickFilter(0, 0, cfg, s, 1);
    const first = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.1);
    let v = first;
    for (let i = 0; i < 1000; i++) v = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(v).toBeCloseTo(1, 3);
  });
  it('lower strength smooths less', () => {
    const a = createFilterState(),
      b = createFilterState();
    applyStickFilter(0, 0, basic(true, 20), a, 1);
    applyStickFilter(0, 0, basic(true, 80), b, 1);
    expect(applyStickFilter(1, 0, basic(true, 20), a, 1).x).toBeGreaterThan(
      applyStickFilter(1, 0, basic(true, 80), b, 1).x,
    );
  });
  it('advanced mode uses curve strength by speed: slow moves heavily smoothed, fast moves pass', () => {
    const cfg = {
      enabled: true,
      mode: 'advanced' as const,
      strength: 0,
      jitterHz: 30,
      curve: [
        [0, 100],
        [0.1, 100],
        [0.25, 0],
        [0.5, 0],
        [1, 0],
      ] as [number, number][],
    };
    const s2 = createFilterState();
    applyStickFilter(0, 0, cfg, s2, 100);
    const vSlow2 = applyStickFilter(0.01, 0, cfg, s2, 100).x; // speedNorm 0.01 -> strength 100 -> heavy smoothing
    const s3 = createFilterState();
    applyStickFilter(0, 0, cfg, s3, 100);
    const vFast = applyStickFilter(1, 0, cfg, s3, 100).x; // speedNorm 1 -> strength 0 -> pass-through
    expect(vSlow2).toBeLessThan(0.01);
    expect(vFast).toBe(1);
  });
  const adv = {
    enabled: true,
    mode: 'advanced' as const,
    strength: 0,
    jitterHz: 30,
    curve: [
      [0, 100],
      [0.1, 100],
      [0.25, 0],
      [0.5, 0],
      [1, 0],
    ] as [number, number][],
  };
  it('advanced mode: 1 LSB jitter (every report) at 1 ms stays heavily smoothed', () => {
    const s = createFilterState();
    let out = 0,
      worst = 0;
    for (let i = 0; i < 300; i++) {
      out = applyStickFilter(0.3 + (i % 2 ? 0.0078 : -0.0078), 0, adv, s, 1).x;
      if (i >= 150) worst = Math.max(worst, Math.abs(out - 0.3));
    }
    expect(worst).toBeLessThan(0.002);
  });
  it('advanced mode: a fast sweep at 1 ms reports is barely smoothed', () => {
    const s = createFilterState();
    applyStickFilter(0, 0, adv, s, 1);
    let out = 0;
    for (let i = 1; i <= 20; i++) out = applyStickFilter(i / 20, 0, adv, s, 1).x;
    expect(out).toBeGreaterThan(0.9);
  });
});

describe('negative smoothing (game-visible oscillation)', () => {
  const DT = 0.125; // 8 kHz reports
  const REPORTS_PER_S = 8000;
  type Cfg = Parameters<typeof applyStickFilter>[2];

  /** x ramps 0 -> 0.3 over 1 s at 8 kHz; returns (output - input) per report (index = report number). */
  const rampDiff = (cfg: Cfg) => {
    const s = createFilterState();
    applyStickFilter(0, 0, cfg, s, DT);
    const d: number[] = [];
    for (let i = 1; i <= REPORTS_PER_S; i++) {
      const x = (0.3 * i) / REPORTS_PER_S;
      d.push(applyStickFilter(x, 0, cfg, s, DT).x - x);
    }
    return d;
  };
  const after100ms = (d: number[]) => d.slice(REPORTS_PER_S / 10);
  const peak = (d: number[]) => Math.max(...d.map(Math.abs));
  const zeroCrossings = (d: number[]) => {
    let n = 0;
    for (let i = 1; i < d.length; i++) if (Math.sign(d[i]!) !== Math.sign(d[i - 1]!)) n++;
    return n;
  };

  it('at rest (constant input) the output is exactly the input', () => {
    const s = createFilterState();
    const cfg = basic(true, -100);
    for (let i = 0; i < 500; i++) {
      const o = applyStickFilter(0.42, -0.17, cfg, s, DT);
      expect(o.x).toBe(0.42);
      expect(o.y).toBe(-0.17);
    }
  });

  it('slow tracking at -100 / 30 Hz: amplitude ~6 % deflection, ~60 zero-crossings per second', () => {
    const d = after100ms(rampDiff(basic(true, -100, 30)));
    // env = speed / 0.04 = 0.03 / 0.04 = 0.75 -> A*env = 0.08 * 0.75 = 0.06 (the speed EMA approaches 0.03 from below)
    expect(peak(d)).toBeGreaterThan(0.055);
    expect(peak(d)).toBeLessThanOrEqual(JITTER_AMP_MAX);
    const perSecond = zeroCrossings(d) / 0.9;
    expect(perSecond).toBeGreaterThan(54);
    expect(perSecond).toBeLessThan(66);
  });

  it('-50 gives about half the amplitude of -100', () => {
    const ratio =
      peak(after100ms(rampDiff(basic(true, -50)))) / peak(after100ms(rampDiff(basic(true, -100))));
    expect(ratio).toBeCloseTo(0.5, 2);
  });

  it('jitterHz scales the zero-crossing rate proportionally (10 vs 60 Hz)', () => {
    const c10 = zeroCrossings(after100ms(rampDiff(basic(true, -100, 10))));
    const c60 = zeroCrossings(after100ms(rampDiff(basic(true, -100, 60))));
    expect(c10 / 0.9).toBeGreaterThan(18);
    expect(c10 / 0.9).toBeLessThan(22);
    expect(c60 / c10).toBeGreaterThan(5.4);
    expect(c60 / c10).toBeLessThan(6.6);
  });

  it('frequency follows real time, not the report rate (1 kHz reports give the same rate)', () => {
    const s = createFilterState();
    const cfg = basic(true, -100, 30);
    applyStickFilter(0, 0, cfg, s, 1);
    const d: number[] = [];
    for (let i = 1; i <= 1000; i++) {
      const x = (0.3 * i) / 1000;
      d.push(applyStickFilter(x, 0, cfg, s, 1).x - x);
    }
    const perSecond = zeroCrossings(d.slice(100)) / 0.9;
    expect(perSecond).toBeGreaterThan(54);
    expect(perSecond).toBeLessThan(66);
  });

  it('is visible to a game polling at 125 Hz: std-dev of (output - input) >= 0.03 at -100', () => {
    const d = after100ms(rampDiff(basic(true, -100)));
    const samples = d.filter((_, i) => i % 64 === 0); // every 8 ms
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
    expect(samples.length).toBeGreaterThan(100);
    expect(sd).toBeGreaterThanOrEqual(0.03);
  });

  it('dies out after the stick stops moving', () => {
    const s = createFilterState();
    const cfg = basic(true, -100);
    applyStickFilter(0, 0, cfg, s, DT);
    for (let i = 1; i <= 4000; i++) applyStickFilter((0.3 * i) / 8000, 0, cfg, s, DT); // move for 0.5 s
    let worst = 0;
    for (let i = 0; i < 8000; i++) {
      const o = applyStickFilter(0.15, 0, cfg, s, DT).x; // then hold for 1 s
      if (i >= 2400) worst = Math.max(worst, Math.abs(o - 0.15)); // after 300 ms of rest
    }
    expect(worst).toBeLessThan(0.001);
  });

  it('advanced curve: wobble while slow, none while fast', () => {
    const cfg = {
      enabled: true,
      mode: 'advanced' as const,
      strength: 0,
      jitterHz: 30,
      curve: [
        [0, -100],
        [0.1, -100],
        [0.25, 0],
        [0.5, 0],
        [1, 0],
      ] as [number, number][],
    };
    expect(peak(after100ms(rampDiff(cfg)))).toBeGreaterThan(0.05); // slow: speed 0.03 -> strength -100
    // fast: x sweeps -1 -> 1 in 400 ms (speed 0.5) -> strength 0 -> pass-through
    const s = createFilterState();
    applyStickFilter(-1, 0, cfg, s, DT);
    let worst = 0;
    for (let i = 1; i <= 3200; i++) {
      const x = -1 + (2 * i) / 3200;
      const o = applyStickFilter(x, 0, cfg, s, DT).x;
      if (i >= 1600) worst = Math.max(worst, Math.abs(o - x)); // after the speed EMA has settled
    }
    expect(worst).toBe(0);
  });

  /** Worst case over 12 start phases of the std-dev of (output - input) seen by a game polling every periodMs. */
  const worstPolledSd = (d: number[], periodMs: number) => {
    let worst = Infinity;
    for (let k = 0; k < 12; k++) {
      const samples: number[] = [];
      for (let t = 100 + (k * periodMs) / 12; t <= 1000; t += periodMs) {
        samples.push(d[Math.round(t / DT) - 1]!); // d[i] is report i+1, at (i+1) * DT ms
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
      worst = Math.min(worst, sd);
    }
    return worst;
  };

  it('visible to a 60 fps game regardless of phase (37 Hz); 30 Hz aliases to nothing', () => {
    expect(worstPolledSd(rampDiff(basic(true, -100, 37)), 1000 / 60)).toBeGreaterThanOrEqual(0.02);
    // 30 Hz is exactly half of 60 fps: every frame lands on +/- the same point of the swing
    expect(worstPolledSd(rampDiff(basic(true, -100, 30)), 1000 / 60)).toBeLessThan(0.01);
  });

  it('visible to a 120 fps game regardless of phase (37 Hz)', () => {
    expect(worstPolledSd(rampDiff(basic(true, -100, 37)), 1000 / 120)).toBeGreaterThanOrEqual(0.02);
  });

  it('clamps radially: moving along the rim never leaves the unit circle', () => {
    const s = createFilterState();
    const cfg = basic(true, -100);
    applyStickFilter(1, 0, cfg, s, DT);
    let maxMag = 0,
      onRim = 0;
    for (let i = 1; i <= 8000; i++) {
      const a = (0.3 * i) / 8000; // slow sweep around the rim
      const o = applyStickFilter(Math.cos(a), Math.sin(a), cfg, s, DT);
      const m = Math.hypot(o.x, o.y);
      maxMag = Math.max(maxMag, m);
      if (Math.abs(m - 1) < 1e-12) onRim++;
    }
    expect(maxMag).toBeLessThanOrEqual(1 + 1e-12);
    expect(onRim).toBeGreaterThan(0); // the clamp actually engaged
  });

  it('square (Raw) corners: outputs stay within [-1, 1] per axis', () => {
    const s = createFilterState();
    const cfg = basic(true, -100, 60);
    applyStickFilter(0.9, -0.9, cfg, s, DT);
    let maxAbs = 0,
      clipped = 0;
    for (let i = 1; i <= 8000; i++) {
      const v = Math.min(1, 0.9 + (0.3 * i) / 8000); // creeps into the rim and stays moving-ish
      const o = applyStickFilter(v, -v, cfg, s, DT);
      maxAbs = Math.max(maxAbs, Math.abs(o.x), Math.abs(o.y));
      if (Math.abs(o.x) === 1) clipped++;
    }
    expect(maxAbs).toBeLessThanOrEqual(1);
    expect(clipped).toBeGreaterThan(0); // the clamp actually engaged
  });
});
