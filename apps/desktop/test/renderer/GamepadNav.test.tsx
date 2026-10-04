// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type EngineSnapshot } from '@dualforge/shared';
import { navSuspended, useStore } from '../../src/renderer/store';
import { NAV_REPEAT_MS, useGamepadNav } from '../../src/renderer/hooks/useGamepadNav';
import { Modal } from '../../src/renderer/components/Modal';
import { Sticks } from '../../src/renderer/pages/Sticks';

function Nav() { useGamepadNav(); return null; }

/** One snapshot of the virtual pad with `held` XInput buttons down (plus LT / RT pulls). */
function snap(held: string[] = [], lt = 0, rt = 0, source: 'device' | 'replay' = 'device'): EngineSnapshot {
  return {
    t: 0, connected: true, source, vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 80, state: 'discharging' },
    raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro: { x: 0, y: 0, z: 0 }, touch: [] },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt, rt, buttons: Object.fromEntries(held.map((b) => [b, true])) },
  };
}
const feed = (held: string[] = [], lt = 0, rt = 0) => act(() => { useStore.setState({ snapshot: snap(held, lt, rt) }); });
const feedReplay = (held: string[] = []) => act(() => { useStore.setState({ snapshot: snap(held, 0, 0, 'replay') }); });
/** press-and-release, as a pad tap shows up across two snapshots */
const tap = (b: string) => { feed([b]); feed([]); };
/** Renders with the hook mounted and feeds the neutral baseline snapshot navigation needs before it acts. */
const mount = (ui: ReactNode = null) => { const r = render(<><Nav />{ui}</>); feed([]); return r; };

/** jsdom has no layout: give an element a fixed box. */
function place(el: HTMLElement, left: number, top: number, width = 100, height = 30) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
}

function Stacked({ onTop, onBottom }: { onTop?(): void; onBottom?(): void }) {
  return (
    <div>
      <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 0); }} onClick={onTop}>Top</button>
      <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 50); }} onClick={onBottom}>Bottom</button>
      <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 100); }}>Third</button>
    </div>
  );
}

function WithModal() {
  const [open, setOpen] = useState(true);
  return (
    <Modal open={open} title="Pick" onClose={() => setOpen(false)}>
      <button data-nav type="button">Inside</button>
    </Modal>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) } });
  useStore.setState({
    profile: defaultProfile('p1', 'Profile 1'), snapshot: null, lastError: null, page: 'buttons',
    subTab: { sticks: 'left', triggers: 'left' }, navHolds: 0,
  });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const page = () => useStore.getState().page;

describe('gamepad navigation', () => {
  it('LB / RB cycle the header pages on the rising edge, wrapping at the ends', () => {
    mount();
    feed(['RB']);
    expect(page()).toBe('sticks');
    feed(['RB']);   // still held: no repeat
    feed(['RB']);
    expect(page()).toBe('sticks');
    feed([]);
    tap('LB'); tap('LB'); tap('LB');
    expect(page()).toBe('home');
    tap('LB');
    expect(page()).toBe('inputTest');
    tap('RB');
    expect(page()).toBe('home');
  });

  it('the first snapshot is a baseline: a button already held then is not a press', () => {
    const onTop = vi.fn();
    render(<><Nav /><Stacked onTop={onTop} /></>);
    screen.getByRole('button', { name: 'Top' }).focus();
    feed(['A', 'RB']);   // first snapshot ever, A and RB already down
    feed(['A', 'RB']);
    expect(onTop).not.toHaveBeenCalled();
    expect(page()).toBe('buttons');
    feed([]);
    feed(['A']);
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it('regaining focus takes a new baseline', () => {
    mount();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    feed([]);
    vi.mocked(document.hasFocus).mockReturnValue(true);
    feed(['RB']);   // was pressed while unfocused: baseline, not a press
    expect(page()).toBe('buttons');
    feed([]); feed(['RB']);
    expect(page()).toBe('sticks');
  });

  it('replayed input is ignored unless the navReplay flag is set', () => {
    mount();
    feedReplay([]); feedReplay(['RB']); feedReplay([]);
    expect(page()).toBe('buttons');
    cleanup();

    vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) }, flags: { navReplay: true } });
    render(<Nav />);
    feedReplay([]); feedReplay(['RB']);
    expect(page()).toBe('sticks');
  });

  it('LT / RT switch the Sticks sub-tab', () => {
    mount(<Sticks />);
    feed([], 0, 0.9);
    expect(useStore.getState().subTab.sticks).toBe('right');
    expect(screen.getByRole('tab', { name: 'Right' }).getAttribute('aria-selected')).toBe('true');
    feed([], 0.9, 0.9);
    expect(useStore.getState().subTab.sticks).toBe('left');
  });

  it('D-pad down moves focus to the control below, up moves it back, and the ring is shown', () => {
    mount(<Stacked />);
    screen.getByRole('button', { name: 'Top' }).focus();
    tap('DPAD_DOWN');
    const bottom = screen.getByRole('button', { name: 'Bottom' });
    expect(document.activeElement).toBe(bottom);
    expect(bottom.hasAttribute('data-nav-focus')).toBe(true);
    tap('DPAD_UP');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Top' }));
    expect(bottom.hasAttribute('data-nav-focus')).toBe(false);
  });

  it('A clicks the focused control', () => {
    const onBottom = vi.fn();
    mount(<Stacked onBottom={onBottom} />);
    screen.getByRole('button', { name: 'Bottom' }).focus();
    tap('A');
    expect(onBottom).toHaveBeenCalledTimes(1);
    feed(['A']); feed(['A']);   // held A clicks once
    expect(onBottom).toHaveBeenCalledTimes(2);
  });

  it('D-pad left / right step a focused slider instead of moving focus', () => {
    const onChange = vi.fn();
    mount(<input data-nav type="range" aria-label="Level" min={0} max={1} step={0.1} defaultValue={0.5} onChange={(e) => onChange(Number(e.currentTarget.value))} />);
    const slider = screen.getByRole('slider', { name: 'Level' });
    place(slider, 0, 0);
    slider.focus();
    tap('DPAD_RIGHT');
    expect(onChange).toHaveBeenLastCalledWith(0.6);
    expect(document.activeElement).toBe(slider);
    tap('DPAD_LEFT'); tap('DPAD_LEFT');
    expect(onChange).toHaveBeenLastCalledWith(0.4);
  });

  it('B closes the open dialog first, then goes back to Overview', () => {
    mount(<WithModal />);
    expect(screen.getByRole('dialog', { name: 'Pick' })).toBeTruthy();
    tap('B');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(page()).toBe('buttons');
    tap('B');
    expect(page()).toBe('overview');
  });

  it('inside a dialog the D-pad only reaches its controls and LB / RB do not switch pages', () => {
    mount(<><Stacked /><WithModal /></>);
    place(screen.getByRole('button', { name: 'Inside' }), 0, 200);
    tap('DPAD_DOWN');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
    tap('DPAD_UP');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
    tap('RB');
    expect(page()).toBe('buttons');
  });

  it('does nothing while suspended (macro recording) or while the window is unfocused', () => {
    const onTop = vi.fn();
    mount(<Stacked onTop={onTop} />);
    screen.getByRole('button', { name: 'Top' }).focus();
    let release = () => {};
    act(() => { release = useStore.getState().suspendNav(); });
    tap('RB'); tap('A'); tap('DPAD_DOWN'); tap('B');
    expect(page()).toBe('buttons');
    expect(onTop).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Top' }));

    act(() => release());
    vi.mocked(document.hasFocus).mockReturnValue(false);
    tap('RB'); tap('A');
    expect(page()).toBe('buttons');
    expect(onTop).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    feed([]);   // baseline after regaining focus
    tap('RB');
    expect(page()).toBe('sticks');
  });

  it('suspension holds count: one owner releasing does not lift another’s hold; releases are idempotent', () => {
    const { suspendNav } = useStore.getState();
    let a = () => {}, b = () => {};
    act(() => { a = suspendNav(); b = suspendNav(); });
    expect(navSuspended()).toBe(true);
    act(() => { a(); a(); });   // a double release must not eat b's hold
    expect(navSuspended()).toBe(true);
    act(() => b());
    expect(navSuspended()).toBe(false);
  });

  it('a held D-pad moves at once, then every 150 ms until released', () => {
    mount(<Stacked />);
    screen.getByRole('button', { name: 'Top' }).focus();
    feed(['DPAD_DOWN']);
    expect(document.activeElement?.textContent).toBe('Bottom');
    act(() => { vi.advanceTimersByTime(NAV_REPEAT_MS - 1); });
    feed(['DPAD_DOWN']);   // still held: snapshots alone do not move it
    expect(document.activeElement?.textContent).toBe('Bottom');
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.activeElement?.textContent).toBe('Third');
    feed([]);
    screen.getByRole('button', { name: 'Top' }).focus();
    act(() => { vi.advanceTimersByTime(NAV_REPEAT_MS * 3); });
    expect(document.activeElement?.textContent).toBe('Top');
  });
});
