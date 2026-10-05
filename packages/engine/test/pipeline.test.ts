import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { parseDualSenseUsb } from '../src/codec/parse-input.js';
import { compileProfile } from '../src/compile.js';
import { createPipelineState, processReport } from '../src/pipeline.js';

function report(mut: (b: Uint8Array) => void): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 1;
  b[1] = b[2] = b[3] = b[4] = 128;
  b[8] = 8;
  mut(b);
  return b;
}

describe('processReport', () => {
  it('passes a full-right left stick through to xinput', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[1] = 255;
        }),
      ),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.lx).toBeCloseTo(1, 2);
    expect(o.xinput.ly).toBeCloseTo(0, 2);
  });
  it('applies trigger stage to analog triggers', () => {
    const p = defaultProfile('p', 'p');
    p.triggers.right.hairTrigger = { mode: 'fixed' };
    p.triggers.right.digital = false;
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[6] = 30;
        }),
      ),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.rt).toBe(1);
  });
  it('small jitter inside deadzone yields exact zero', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[3] = 131;
          b[4] = 125;
        }),
      ),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.rx).toBe(0);
    expect(o.xinput.ry).toBe(0);
  });
  it('maps buttons via mapping stage', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[9] = 0x01;
        }),
      ),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.buttons.LB).toBe(true);
  });
  // Stage order (sticks -> triggers -> mappings last) becomes observable in Plan 3, when button->axis
  // targets can override stick output; until then default mappings cannot conflict with axes.
  it('button and stick output coexist in one frame', () => {
    const p = compileProfile(defaultProfile('p', 'p'));
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[1] = 255;
          b[8] = 0x28;
        }),
      ),
      p,
      createPipelineState(),
      0,
    );
    expect(o.xinput.buttons.A).toBe(true);
    expect(o.xinput.lx).toBeCloseTo(1, 2);
  });
  it('digital trigger: l2 click (byte 9 bit 2) drives lt to 1 via the xtrigger mapping; analog is ignored', () => {
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[9] = 0x04;
          b[5] = 255;
        }),
      ),
      compileProfile(defaultProfile('p', 'p')),
      createPipelineState(),
      0,
    );
    expect(o.xinput.lt).toBe(1);
    const o2 = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[5] = 255;
        }),
      ),
      compileProfile(defaultProfile('p', 'p')),
      createPipelineState(),
      0,
    );
    expect(o2.xinput.lt).toBe(0);
  });
  it('anti-deadzone is applied after the curve: precise curve + anti 0.3 still yields >= 0.3', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.left.deadzone = { center: 0.05, anti: 0.3, outer: 0 };
    p.sticks.left.curve = { kind: 'preset', preset: 'precise' };
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[1] = 128 + 10;
        }),
      ),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(Math.hypot(o.xinput.lx, o.xinput.ly)).toBeGreaterThanOrEqual(0.3);
  });
  it('mapping keeps the stick axes (pre-filled xinput)', () => {
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[1] = 255;
          b[9] = 0x04;
        }),
      ),
      compileProfile(defaultProfile('p', 'p')),
      createPipelineState(),
      0,
    );
    expect(o.xinput.lx).toBeCloseTo(1, 2);
    expect(o.xinput.lt).toBe(1);
  });
  it('macro-driven key emits down at start and up after the hold, via the pipeline', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [
      {
        id: 'm',
        name: 'm',
        loop: false,
        steps: [{ target: { type: 'key', code: 'VK_Q' }, holdMs: 100, delayMs: 0 }],
      },
    ];
    p.mappings.triangle = {
      targets: [{ type: 'macro', macroId: 'm' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    };
    const cp = compileProfile(p);
    const s = createPipelineState();
    const press = parseDualSenseUsb(
      report((b) => {
        b[8] = 0x88;
      }),
    ); // triangle
    const idle = parseDualSenseUsb(report(() => {}));
    expect(processReport(press, cp, s, 0).keys).toEqual([{ code: 'VK_Q', down: true }]);
    expect(processReport(idle, cp, s, 50).keys).toEqual([]); // button released, macro keeps running
    expect(processReport(idle, cp, s, 100).keys).toEqual([{ code: 'VK_Q', down: false }]);
    expect(processReport(press, cp, s, 120).keys).toEqual([{ code: 'VK_Q', down: true }]);
  });
  it('holding the macro button does not re-trigger it', () => {
    const p = defaultProfile('p', 'p');
    p.macros = [
      {
        id: 'm',
        name: 'm',
        loop: false,
        steps: [{ target: { type: 'key', code: 'VK_Q' }, holdMs: 100, delayMs: 0 }],
      },
    ];
    p.mappings.triangle = {
      targets: [{ type: 'macro', macroId: 'm' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    };
    const cp = compileProfile(p);
    const s = createPipelineState();
    const press = parseDualSenseUsb(
      report((b) => {
        b[8] = 0x88;
      }),
    );
    processReport(press, cp, s, 0);
    expect(processReport(press, cp, s, 100).keys).toEqual([{ code: 'VK_Q', down: false }]);
    expect(processReport(press, cp, s, 150).keys).toEqual([]);
  });
  it('gyro rightStick adds to the processed right stick and clamps to the unit circle', () => {
    const p = defaultProfile('p', 'p');
    p.gyro.output = 'rightStick';
    p.gyro.deadzoneDps = 0;
    const cp = compileProfile(p);
    const withGyro = (rxByte: number, yawLsb: number) => {
      const b = report((bb) => {
        bb[3] = rxByte;
      });
      const raw = parseDualSenseUsb(b);
      raw.gyro.y = yawLsb;
      return processReport(raw, cp, createPipelineState(), 0);
    };
    expect(withGyro(128, -100 * 16.384).xinput.rx).toBeCloseTo(0.5, 2);
    const o = withGyro(255, -200 * 16.384);
    expect(Math.hypot(o.xinput.rx, o.xinput.ry)).toBeLessThanOrEqual(1.0000001);
  });
  it('gyro mouse sets mouseMove and leaves the right stick alone', () => {
    const p = defaultProfile('p', 'p');
    p.gyro.output = 'mouse';
    p.gyro.deadzoneDps = 0;
    const raw = parseDualSenseUsb(report(() => {}));
    raw.gyro.y = -100 * 16.384;
    const o = processReport(raw, compileProfile(p), createPipelineState(), 10); // first frame dt = 1 ms
    expect(o.xinput.rx).toBe(0);
    const s = createPipelineState();
    processReport(raw, compileProfile(p), s, 0);
    expect(processReport(raw, compileProfile(p), s, 10).mouseMove.dx).toBe(10);
  });
});

describe('analog trigger passthrough with default xtrigger mapping', () => {
  const l2Pull = (b: Uint8Array) => {
    b[5] = 102;
    b[9] = 0x04;
  }; // raw.l2 = 0.4, L2 button bit set
  it('digital=false: analog LT survives the default l2 -> xtrigger mapping', () => {
    const p = defaultProfile('p', 'p');
    p.triggers.left.digital = false;
    const o = processReport(
      parseDualSenseUsb(report(l2Pull)),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.lt).toBeCloseTo(0.4, 1);
    expect(o.xinput.lt).toBeLessThan(1);
  });
  it('digital=true: the button snaps LT to full', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(report(l2Pull)),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.lt).toBe(1);
  });
  it('digital=false only skips the xtrigger target; other targets on l2 still apply', () => {
    const p = defaultProfile('p', 'p');
    p.triggers.left.digital = false;
    p.mappings.l2 = {
      targets: [
        { type: 'xtrigger', trigger: 'lt' },
        { type: 'xbutton', button: 'A' },
        { type: 'xtrigger', trigger: 'rt' },
      ],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    };
    const o = processReport(
      parseDualSenseUsb(report(l2Pull)),
      compileProfile(p),
      createPipelineState(),
      0,
    );
    expect(o.xinput.lt).toBeCloseTo(0.4, 1);
    expect(o.xinput.buttons.A).toBe(true);
    expect(o.xinput.rt).toBe(1);
  });
});

describe('turbo through the pipeline', () => {
  const ON_PAD = { modeButton: 'touchpad' as const, lightbarPulse: true, onPadAssign: true };
  const tp = parseDualSenseUsb(
    report((b) => {
      b[10] = 0x02;
    }),
  );
  const tpCross = parseDualSenseUsb(
    report((b) => {
      b[8] = 0x28;
      b[10] = 0x02;
    }),
  );
  it('compileProfile records turbo settings (default when omitted) and whether any turbo is set', () => {
    const p = defaultProfile('p', 'p');
    expect(compileProfile(p).turbo).toEqual({
      modeButton: 'touchpad',
      lightbarPulse: true,
      onPadAssign: true,
    });
    expect(compileProfile(p).turboConfigured).toBe(false);
    p.macros = [
      {
        id: 'm',
        name: 'm',
        steps: [{ target: { type: 'key', code: 'VK_A' }, holdMs: 10, delayMs: 0 }],
        loop: false,
      },
    ];
    p.mappings.square = {
      targets: [{ type: 'macro', macroId: 'm' }],
      turbo: { mode: 'hold', hz: 12 },
      continuous: false,
    };
    expect(compileProfile(p).turboConfigured).toBe(false); // macros are never turbo'd
    p.mappings.r1!.turbo = { mode: 'toggle', hz: 12 };
    const cp = compileProfile(p, { turbo: { ...ON_PAD, modeButton: null } });
    expect(cp.turboConfigured).toBe(true);
    expect(cp.turbo.modeButton).toBeNull();
  });
  it('the on-pad combo reaches the frame as turboEdits', () => {
    const cp = compileProfile(defaultProfile('p', 'p'), { turbo: ON_PAD });
    const s = createPipelineState();
    expect(processReport(tp, cp, s, 0).turboEdits).toEqual([]);
    expect(processReport(tpCross, cp, s, 10).turboEdits).toEqual([
      { button: 'cross', turbo: { mode: 'hold', hz: 8 } },
    ]);
  });
  it('the combo is off when the compiled settings disable it', () => {
    const cp = compileProfile(defaultProfile('p', 'p'), {
      turbo: { ...ON_PAD, onPadAssign: false },
    });
    const s = createPipelineState();
    processReport(tp, cp, s, 0);
    const o = processReport(tpCross, cp, s, 10);
    expect(o.turboEdits).toEqual([]);
    expect(o.xinput.buttons.A).toBe(true);
  });
});
