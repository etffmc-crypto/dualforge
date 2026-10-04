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

/**
 * One snapshot with `held` raw DualSense buttons down (plus analog L2 / R2 pulls). The virtual pad (`out`) is left
 * neutral, or set from `out` — navigation must read only the raw controller.
 */
function snap(held: string[] = [], l2 = 0, r2 = 0, source: 'device' | 'replay' = 'device', out: string[] = []): EngineSnapshot {
  return {
    t: 0, connected: true, source, vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 80, state: 'discharging' },
    raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2, r2, buttons: Object.fromEntries(held.map((b) => [b, true])), gyro: { x: 0, y: 0, z: 0 }, touch: [] },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: Object.fromEntries(out.map((b) => [b, true])) },
  };
}
const feed = (held: string[] = [], l2 = 0, r2 = 0) => act(() => { useStore.setState({ snapshot: snap(held, l2, r2) }); });
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
  it('L1 / R1 cycle the header pages on the rising edge, wrapping at the ends', () => {
    mount();
    feed(['r1']);
    expect(page()).toBe('sticks');
    feed(['r1']);   // still held: no repeat
    feed(['r1']);
    expect(page()).toBe('sticks');
    feed([]);
    tap('l1'); tap('l1'); tap('l1');
    expect(page()).toBe('home');
    tap('l1');
    expect(page()).toBe('inputTest');
    tap('r1');
    expect(page()).toBe('home');
  });

  it('the first snapshot is a baseline: a button already held then is not a press', () => {
    const onTop = vi.fn();
    render(<><Nav /><Stacked onTop={onTop} /></>);
    screen.getByRole('button', { name: 'Top' }).focus();
    feed(['cross', 'r1']);   // first snapshot ever, A and RB already down
    feed(['cross', 'r1']);
    expect(onTop).not.toHaveBeenCalled();
    expect(page()).toBe('buttons');
    feed([]);
    feed(['cross']);
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it('regaining focus takes a new baseline', () => {
    mount();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    feed([]);
    vi.mocked(document.hasFocus).mockReturnValue(true);
    feed(['r1']);   // was pressed while unfocused: baseline, not a press
    expect(page()).toBe('buttons');
    feed([]); feed(['r1']);
    expect(page()).toBe('sticks');
  });

  it('replayed input is ignored unless the navReplay flag is set', () => {
    mount();
    feedReplay([]); feedReplay(['r1']); feedReplay([]);
    expect(page()).toBe('buttons');
    cleanup();

    vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) }, flags: { navReplay: true } });
    render(<Nav />);
    feedReplay([]); feedReplay(['r1']);
    expect(page()).toBe('sticks');
  });

  it('L2 / R2 switch the Sticks sub-tab: as digital buttons, or as analog pulls past half', () => {
    mount(<Sticks />);
    feed(['r2']);
    expect(useStore.getState().subTab.sticks).toBe('right');
    expect(screen.getByRole('tab', { name: 'Right' }).getAttribute('aria-selected')).toBe('true');
    feed(['r2', 'l2']);
    expect(useStore.getState().subTab.sticks).toBe('left');
    feed([]);
    feed([], 0, 0.9);
    expect(useStore.getState().subTab.sticks).toBe('right');
    feed([], 0.9, 0.9);
    expect(useStore.getState().subTab.sticks).toBe('left');
  });

  it('D-pad down moves focus to the control below, up moves it back, and the ring is shown', () => {
    mount(<Stacked />);
    screen.getByRole('button', { name: 'Top' }).focus();
    tap('dpadDown');
    const bottom = screen.getByRole('button', { name: 'Bottom' });
    expect(document.activeElement).toBe(bottom);
    expect(bottom.hasAttribute('data-nav-focus')).toBe(true);
    tap('dpadUp');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Top' }));
    expect(bottom.hasAttribute('data-nav-focus')).toBe(false);
  });

  it('cross clicks the focused control', () => {
    const onBottom = vi.fn();
    mount(<Stacked onBottom={onBottom} />);
    screen.getByRole('button', { name: 'Bottom' }).focus();
    tap('cross');
    expect(onBottom).toHaveBeenCalledTimes(1);
    feed(['cross']); feed(['cross']);   // held A clicks once
    expect(onBottom).toHaveBeenCalledTimes(2);
  });

  it('D-pad left / right step a focused slider instead of moving focus', () => {
    const onChange = vi.fn();
    mount(<input data-nav type="range" aria-label="Level" min={0} max={1} step={0.1} defaultValue={0.5} onChange={(e) => onChange(Number(e.currentTarget.value))} />);
    const slider = screen.getByRole('slider', { name: 'Level' });
    place(slider, 0, 0);
    slider.focus();
    tap('dpadRight');
    expect(onChange).toHaveBeenLastCalledWith(0.6);
    expect(document.activeElement).toBe(slider);
    tap('dpadLeft'); tap('dpadLeft');
    expect(onChange).toHaveBeenLastCalledWith(0.4);
  });

  it('circle closes the open dialog first, then goes back to Overview', () => {
    mount(<WithModal />);
    expect(screen.getByRole('dialog', { name: 'Pick' })).toBeTruthy();
    tap('circle');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(page()).toBe('buttons');
    tap('circle');
    expect(page()).toBe('overview');
  });

  it('inside a dialog the D-pad only reaches its controls and L1 / R1 do not switch pages', () => {
    mount(<><Stacked /><WithModal /></>);
    place(screen.getByRole('button', { name: 'Inside' }), 0, 200);
    tap('dpadDown');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
    tap('dpadUp');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
    tap('r1');
    expect(page()).toBe('buttons');
  });

  it('does nothing while suspended (macro recording) or while the window is unfocused', () => {
    const onTop = vi.fn();
    mount(<Stacked onTop={onTop} />);
    screen.getByRole('button', { name: 'Top' }).focus();
    let release = () => {};
    act(() => { release = useStore.getState().suspendNav(); });
    tap('r1'); tap('cross'); tap('dpadDown'); tap('circle');
    expect(page()).toBe('buttons');
    expect(onTop).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Top' }));

    act(() => release());
    vi.mocked(document.hasFocus).mockReturnValue(false);
    tap('r1'); tap('cross');
    expect(page()).toBe('buttons');
    expect(onTop).not.toHaveBeenCalled();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    feed([]);   // baseline after regaining focus
    tap('r1');
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
    feed(['dpadDown']);
    expect(document.activeElement?.textContent).toBe('Bottom');
    act(() => { vi.advanceTimersByTime(NAV_REPEAT_MS - 1); });
    feed(['dpadDown']);   // still held: snapshots alone do not move it
    expect(document.activeElement?.textContent).toBe('Bottom');
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.activeElement?.textContent).toBe('Third');
    feed([]);
    screen.getByRole('button', { name: 'Top' }).focus();
    act(() => { vi.advanceTimersByTime(NAV_REPEAT_MS * 3); });
    expect(document.activeElement?.textContent).toBe('Top');
  });
  it('reads the raw controller, not the virtual pad: remapping or turbo on cross does not change navigation', () => {
    let remapped = false;
    act(() => {
      remapped = useStore.getState().updateProfile((p) => { p.mappings.cross = { targets: [{ type: 'key', code: 'VK_SPACE' }], turboHz: 20, continuous: false }; });
    });
    expect(remapped).toBe(true);
    const onBottom = vi.fn();
    mount(<Stacked onBottom={onBottom} />);
    screen.getByRole('button', { name: 'Bottom' }).focus();
    // cross held across many snapshots while turbo toggles the virtual A / B on and off: one press, one click
    const outs = [['A'], [], ['A'], ['B'], [], ['A', 'B']];
    for (const out of outs) act(() => { useStore.setState({ snapshot: snap(['cross'], 0, 0, 'device', out) }); });
    expect(onBottom).toHaveBeenCalledTimes(1);
    expect(page()).toBe('buttons');   // the virtual B never navigated back
    // and the virtual pad alone (raw idle) does nothing
    for (const out of outs) act(() => { useStore.setState({ snapshot: snap([], 0, 0, 'device', out) }); });
    act(() => { useStore.setState({ snapshot: snap([], 0, 0, 'device', ['RB']) }); });
    expect(onBottom).toHaveBeenCalledTimes(1);
    expect(page()).toBe('buttons');
  });

  it('skips controls inside a disabled fieldset and reaches the next enabled one', () => {
    mount(
      <div>
        <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 0); }}>Top</button>
        <fieldset disabled>
          <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 50); }}>Locked 1</button>
          <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 100); }}>Locked 2</button>
        </fieldset>
        <button data-nav type="button" ref={(el) => { if (el) place(el, 0, 150); }}>After</button>
      </div>,
    );
    screen.getByRole('button', { name: 'Top' }).focus();
    tap('dpadDown');
    const after = screen.getByRole('button', { name: 'After' });
    expect(document.activeElement).toBe(after);
    expect(after.hasAttribute('data-nav-focus')).toBe(true);
    expect(screen.getByRole('button', { name: 'Locked 1' }).hasAttribute('data-nav-focus')).toBe(false);
  });

  it('shows the focus ring only when focus actually landed', () => {
    mount(<Stacked />);
    const bottom = screen.getByRole('button', { name: 'Bottom' });
    bottom.focus = () => {};   // a control that refuses focus
    screen.getByRole('button', { name: 'Top' }).focus();
    tap('dpadDown');
    expect(bottom.hasAttribute('data-nav-focus')).toBe(false);
  });
});
