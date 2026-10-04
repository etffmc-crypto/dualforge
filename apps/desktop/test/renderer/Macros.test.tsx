// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProfileSchema,
  defaultProfile,
  type EngineSnapshot,
  type Profile,
} from '@dualforge/shared';
import { navSuspended, useStore } from '../../src/renderer/store';
import { Macros } from '../../src/renderer/pages/Macros';
import { RecordDialog } from '../../src/renderer/pages/macros/RecordDialog';
import { pressesToSteps, removeMacro } from '../../src/renderer/pages/macros/ops';

function stubProfile(): Profile {
  const p = defaultProfile('p1', 'Profile 1');
  p.macros = [
    {
      id: 'm1',
      name: 'Reload',
      loop: false,
      steps: [
        { target: { type: 'xbutton', button: 'X' }, holdMs: 80, delayMs: 40 },
        { target: { type: 'key', code: 'VK_R' }, holdMs: 50, delayMs: 0 },
      ],
    },
    {
      id: 'm2',
      name: 'Spam jump',
      loop: true,
      steps: [{ target: { type: 'xbutton', button: 'A' }, holdMs: 30, delayMs: 30 }],
    },
  ];
  p.mappings.l3 = { targets: [{ type: 'macro', macroId: 'm1' }], turboHz: 0, continuous: false };
  p.mappings.r3 = {
    targets: [
      { type: 'xbutton', button: 'RS' },
      { type: 'macro', macroId: 'm1' },
    ],
    turboHz: 0,
    continuous: false,
  };
  return p;
}
function snap(t: number, buttons: Record<string, boolean> = {}): EngineSnapshot {
  return {
    t,
    connected: true,
    source: 'device',
    vigemReady: true,
    reportHz: 250,
    pipelineP99Ms: 0,
    battery: { percent: 50, state: 'discharging' },
    raw: {
      lx: 0,
      ly: 0,
      rx: 0,
      ry: 0,
      l2: 0,
      r2: 0,
      buttons,
      gyro: { x: 0, y: 0, z: 0 },
      touch: [],
    },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
}

let runMacro: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  runMacro = vi.fn(async () => {});
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) }, engine: { runMacro } });
  useStore.setState({
    profile: stubProfile(),
    snapshot: snap(0),
    lastError: null,
    page: 'macros',
    navHolds: 0,
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const macros = () => useStore.getState().profile!.macros;
const row = (name: string) => screen.getByRole('article', { name });
const dialog = (name: string) => within(screen.getByRole('dialog', { name }));
/** hold / delay fields keep a local draft and commit on blur */
const setMs = (field: HTMLElement, value: string) => {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

describe('Macros page', () => {
  it('lists each macro with its steps, loop badge and the buttons that run it', () => {
    render(<Macros />);
    const reload = within(row('Reload'));
    expect(reload.getByText('2 steps')).toBeTruthy();
    expect(reload.queryByText('Loops')).toBeNull();
    expect(reload.getByText('L3')).toBeTruthy();
    expect(reload.getByText('R3')).toBeTruthy();
    expect(within(row('Spam jump')).getByText('Loops')).toBeTruthy();
    expect(within(row('Spam jump')).getByText('Not assigned')).toBeTruthy();
  });

  it('New macro: name it, add and fill steps, reorder, save', () => {
    render(<Macros />);
    fireEvent.click(screen.getByRole('button', { name: 'New macro' }));
    const ed = () => dialog('New macro');
    fireEvent.change(ed().getByRole('textbox', { name: 'Macro name' }), {
      target: { value: 'Combo' },
    });
    // the new macro starts with one step (A); give it Space from the keyboard picker
    fireEvent.click(ed().getByRole('button', { name: 'Step 1 output: A' }));
    fireEvent.click(dialog('Step 1 output').getByRole('tab', { name: 'Keyboard' }));
    fireEvent.click(dialog('Step 1 output').getByRole('button', { name: 'Space' }));
    expect(screen.queryByRole('dialog', { name: 'Step 1 output' })).toBeNull();
    setMs(ed().getByRole('spinbutton', { name: 'Step 1 hold (ms)' }), '120');
    fireEvent.click(ed().getByRole('button', { name: 'Add step' }));
    setMs(ed().getByRole('spinbutton', { name: 'Step 2 delay (ms)' }), '15');
    fireEvent.click(ed().getByRole('button', { name: 'Move step 2 up' }));
    expect(macros()).toHaveLength(2); // nothing saved yet
    fireEvent.click(ed().getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const m = macros().find((x) => x.name === 'Combo')!;
    expect(m.steps).toEqual([
      { target: { type: 'xbutton', button: 'A' }, holdMs: 50, delayMs: 15 },
      { target: { type: 'key', code: 'VK_SPACE' }, holdMs: 120, delayMs: 50 },
    ]);
    expect(m.loop).toBe(false);
    expect(row('Combo')).toBeTruthy();
  });

  it('Edit: delete a step, toggle loop; Save is blocked without a name', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    const ed = () => dialog('Edit macro');
    fireEvent.click(ed().getByRole('button', { name: 'Delete step 1' }));
    fireEvent.click(ed().getByRole('switch', { name: 'Loop' }));
    fireEvent.change(ed().getByRole('textbox', { name: 'Macro name' }), {
      target: { value: '  ' },
    });
    expect((ed().getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(ed().getByRole('textbox', { name: 'Macro name' }), {
      target: { value: 'Reload 2' },
    });
    fireEvent.click(ed().getByRole('button', { name: 'Save' }));
    expect(macros()[0]).toEqual({
      id: 'm1',
      name: 'Reload 2',
      loop: true,
      steps: [{ target: { type: 'key', code: 'VK_R' }, holdMs: 50, delayMs: 0 }],
    });
  });

  it('Delete removes the macro and every mapping reference in one valid edit', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Delete Reload' }));
    fireEvent.click(dialog('Delete Reload?').getByRole('button', { name: 'Delete' }));
    const p = useStore.getState().profile!;
    expect(p.macros.map((m) => m.id)).toEqual(['m2']);
    expect(p.mappings.l3!.targets).toEqual([{ type: 'none' }]);
    expect(p.mappings.r3!.targets).toEqual([{ type: 'xbutton', button: 'RS' }]);
    expect(useStore.getState().lastError).toBeNull();
    expect(screen.queryByRole('article', { name: 'Reload' })).toBeNull();
  });

  it('Duplicate copies the steps under a new id', () => {
    render(<Macros />);
    fireEvent.click(within(row('Spam jump')).getByRole('button', { name: 'Duplicate Spam jump' }));
    const copy = macros().find((m) => m.name === 'Spam jump copy')!;
    expect(copy.id).not.toBe('m2');
    expect(copy.steps).toEqual(macros()[1]!.steps);
  });

  it('Play test saves the macro and asks the engine to run it; looping macros cannot be play-tested', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    setMs(dialog('Edit macro').getByRole('spinbutton', { name: 'Step 1 hold (ms)' }), '90');
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Play test' }));
    expect(macros()[0]!.steps[0]!.holdMs).toBe(90);
    expect(runMacro).toHaveBeenCalledWith('m1');
    // the run's own A / B / D-pad output must not navigate (B would close this dialog) until it has played
    expect(navSuspended()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(navSuspended()).toBe(false);
    expect(dialog('Edit macro').getByText(/not injected while DualForge is focused/)).toBeTruthy();
    fireEvent.click(dialog('Edit macro').getByRole('switch', { name: 'Loop' }));
    expect(
      (dialog('Edit macro').getByRole('button', { name: 'Play test' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('a draft the profile schema rejects keeps the editor open and says why; Play test does not run it', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    // maxLength stops typing past 40, but a programmatic value is not limited: the store's schema is the real guard
    fireEvent.change(dialog('Edit macro').getByRole('textbox', { name: 'Macro name' }), {
      target: { value: 'x'.repeat(41) },
    });
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('dialog', { name: 'Edit macro' })).toBeTruthy();
    expect(dialog('Edit macro').getByRole('alert').textContent).toMatch(/^Not saved: .*40/);
    expect(macros()[0]!.name).toBe('Reload');
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Play test' }));
    expect(runMacro).not.toHaveBeenCalled();
    fireEvent.change(dialog('Edit macro').getByRole('textbox', { name: 'Macro name' }), {
      target: { value: 'Short' },
    });
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(macros()[0]!.name).toBe('Short');
  });

  it('hold / delay fields commit on blur or Enter, revert on Escape, and clamp to 0–10000', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    const hold = () =>
      dialog('Edit macro').getByRole('spinbutton', {
        name: 'Step 1 hold (ms)',
      }) as HTMLInputElement;
    fireEvent.change(hold(), { target: { value: '' } }); // mid-edit: nothing is clamped or committed
    expect(hold().value).toBe('');
    fireEvent.change(hold(), { target: { value: '25' } });
    fireEvent.keyDown(hold(), { key: 'Escape' });
    expect(hold().value).toBe('80');
    fireEvent.change(hold(), { target: { value: '99999' } });
    fireEvent.keyDown(hold(), { key: 'Enter' });
    expect(hold().value).toBe('10000');
    fireEvent.change(hold(), { target: { value: '' } });
    fireEvent.blur(hold());
    expect(hold().value).toBe('10000');
  });

  it('closing with unsaved edits asks first: Keep editing (focused) keeps the draft, Discard closes without saving', () => {
    const before = useStore.getState().profile;
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    const ed = () => dialog('Edit macro');
    setMs(ed().getByRole('spinbutton', { name: 'Step 1 hold (ms)' }), '300');
    fireEvent.keyDown(document, { key: 'Escape' });
    const confirm = () => dialog('Discard changes?');
    expect(confirm().getByRole('button', { name: 'Keep editing' })).toBe(document.activeElement);
    fireEvent.click(confirm().getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull();
    expect(
      (ed().getByRole('spinbutton', { name: 'Step 1 hold (ms)' }) as HTMLInputElement).value,
    ).toBe('300');
    // Cancel (and B / backdrop, which share the same close path) ask again
    fireEvent.click(ed().getByRole('button', { name: 'Cancel' }));
    fireEvent.click(confirm().getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useStore.getState().profile).toBe(before);
  });

  it('closing an unchanged or just-saved editor does not ask', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    setMs(dialog('Edit macro').getByRole('spinbutton', { name: 'Step 1 hold (ms)' }), '90');
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Play test' })); // saves
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an invitation when there are no macros', () => {
    const p = defaultProfile('p1', 'Profile 1');
    useStore.setState({ profile: p });
    render(<Macros />);
    expect(screen.getByText('No macros yet')).toBeTruthy();
  });
});

describe('RecordDialog', () => {
  it('suspends gamepad navigation while open, so recorded presses do not navigate', () => {
    const { rerender } = render(<RecordDialog open onClose={() => {}} onUse={() => {}} />);
    expect(navSuspended()).toBe(true);
    rerender(<RecordDialog open={false} onClose={() => {}} onUse={() => {}} />);
    expect(navSuspended()).toBe(false);
  });

  it('closing the recorder does not cancel a Play test hold, and the editor releases its hold when it closes', () => {
    render(<Macros />);
    fireEvent.click(within(row('Reload')).getByRole('button', { name: 'Edit Reload' }));
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Play test' }));
    const rec = render(<RecordDialog open onClose={() => {}} onUse={() => {}} />);
    expect(useStore.getState().navHolds).toBe(2);
    rec.unmount();
    expect(navSuspended()).toBe(true); // the play test still holds it
    fireEvent.click(dialog('Edit macro').getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Edit macro' })).toBeNull();
    expect(navSuspended()).toBe(false); // released on close, before its timer
  });

  it('turns a scripted snapshot stream into steps with mapped targets and timings', () => {
    const p = stubProfile();
    p.mappings.circle = {
      targets: [{ type: 'key', code: 'VK_SPACE' }],
      turboHz: 0,
      continuous: false,
    };
    useStore.setState({ profile: p, snapshot: snap(1000) });
    const onUse = vi.fn();
    render(<RecordDialog open onClose={() => {}} onUse={onUse} />);
    const frames: [number, Record<string, boolean>][] = [
      [1016, {}],
      [1100, { cross: true }],
      [1200, { cross: false }],
      [1300, { circle: true }],
      [1350, {}],
      [1500, { l3: true }],
      [1580, {}],
    ];
    for (const [t, b] of frames) act(() => useStore.setState({ snapshot: snap(t, b) }));
    expect(screen.getByText('3 presses')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 3 steps' }));
    expect(onUse).toHaveBeenCalledWith([
      { target: { type: 'xbutton', button: 'A' }, holdMs: 100, delayMs: 100 },
      { target: { type: 'key', code: 'VK_SPACE' }, holdMs: 50, delayMs: 150 },
      // L3 runs a macro, which a step cannot do: its stock output is used instead
      { target: { type: 'xbutton', button: 'LS' }, holdMs: 80, delayMs: 0 },
    ]);
  });

  it('stops by itself after 60 s and needs at least one press', () => {
    render(<RecordDialog open onClose={() => {}} onUse={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Use 0 steps' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('RecordDialog limits', () => {
  it('finishes when the 64th press completes', () => {
    useStore.setState({ snapshot: snap(0) });
    const onUse = vi.fn();
    render(<RecordDialog open onClose={() => {}} onUse={onUse} />);
    let t = 0;
    const press = () => {
      act(() => useStore.setState({ snapshot: snap((t += 10), { cross: true }) }));
      act(() => useStore.setState({ snapshot: snap((t += 10), {}) }));
    };
    for (let i = 0; i < 63; i++) press();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.getByText('63 presses')).toBeTruthy();
    press();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use 64 steps' }));
    expect(onUse.mock.calls[0]![0]).toHaveLength(64);
  });

  it('the 60 s wall timer finishes while snapshots keep arriving', () => {
    useStore.setState({ snapshot: snap(0) });
    render(<RecordDialog open onClose={() => {}} onUse={() => {}} />);
    // engine time crawls (1 ms per snapshot), so only the wall timer can end the take
    let t = 0;
    for (let s = 0; s < 59; s++) {
      act(() => {
        vi.advanceTimersByTime(500);
        useStore.setState({ snapshot: snap(++t, { cross: s % 2 === 0 }) });
      });
      act(() => {
        vi.advanceTimersByTime(500);
        useStore.setState({ snapshot: snap(++t, {}) });
      });
    }
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(500);
      useStore.setState({ snapshot: snap(++t, { cross: true }) });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    // the press still held when the timer fired is closed at the last snapshot time
    expect(screen.getByRole('button', { name: 'Use 31 steps' })).toBeTruthy();
  });
});

describe('macro ops', () => {
  it('removeMacro strips references and leaves a schema-valid profile', () => {
    const p = stubProfile();
    removeMacro(p, 'm1');
    expect(ProfileSchema.safeParse(p).success).toBe(true);
    expect(p.mappings.l3!.targets).toEqual([{ type: 'none' }]);
    expect(p.mappings.r3!.targets).toEqual([{ type: 'xbutton', button: 'RS' }]);
  });
  it('pressesToSteps: overlapping presses get no delay; capped at 64', () => {
    const t = () => ({ type: 'none' as const });
    expect(
      pressesToSteps(
        [
          { button: 'cross', start: 0, end: 100 },
          { button: 'circle', start: 50, end: 120 },
        ],
        t,
      ),
    ).toEqual([
      { target: t(), holdMs: 100, delayMs: 0 },
      { target: t(), holdMs: 70, delayMs: 0 },
    ]);
    const many = Array.from({ length: 70 }, (_, i) => ({
      button: 'cross' as const,
      start: i * 10,
      end: i * 10 + 5,
    }));
    expect(pressesToSteps(many, t)).toHaveLength(64);
  });
});
