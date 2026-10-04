// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { presetPoints } from '@dualforge/engine/curve';
import { useStore } from '../../src/renderer/store';
import { Sticks } from '../../src/renderer/pages/Sticks';
import { useGamepadNav } from '../../src/renderer/hooks/useGamepadNav';

function Nav() {
  useGamepadNav();
  return null;
}

const profile = () => useStore.getState().profile!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) } });
  useStore.setState({
    profile: defaultProfile('p1', 'Profile 1'),
    snapshot: null,
    lastError: null,
    subTab: { sticks: 'left', triggers: 'left' },
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Sticks page', () => {
  it('edits the selected side through updateProfile', () => {
    render(<Sticks />);
    fireEvent.change(screen.getByRole('slider', { name: 'Anti-Deadzone' }), {
      target: { value: '0.3' },
    });
    expect(profile().sticks.left.deadzone.anti).toBe(0.3);
    expect(profile().sticks.right.deadzone.anti).toBe(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Right' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Anti-Deadzone' }), {
      target: { value: '0.1' },
    });
    expect(profile().sticks.right.deadzone.anti).toBe(0.1);
    expect(profile().sticks.left.deadzone.anti).toBe(0.3);
  });

  it('maps the deadzone range to center and 1 - outer', () => {
    render(<Sticks />);
    fireEvent.change(screen.getByRole('slider', { name: 'Deadzone Max' }), {
      target: { value: '0.9' },
    });
    expect(profile().sticks.left.deadzone.outer).toBeCloseTo(0.1, 6);
    fireEvent.change(screen.getByRole('slider', { name: 'Deadzone Initial' }), {
      target: { value: '0.95' },
    });
    // min gap keeps center < 1 - outer, so the schema refinement always holds
    expect(profile().sticks.left.deadzone.center).toBeCloseTo(0.85, 6);
    expect(useStore.getState().lastError).toBeNull();
  });

  it('seeds custom curve points from the previous preset and keeps them when switching away', () => {
    render(<Sticks />);
    fireEvent.click(screen.getByRole('radio', { name: 'Aggressive' }));
    expect(profile().sticks.left.curve).toEqual({ kind: 'preset', preset: 'aggressive' });
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(profile().sticks.left.curve).toEqual({
      kind: 'custom',
      points: presetPoints('aggressive'),
    });
    expect(screen.getByTestId('curve-svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Linear' }));
    expect(profile().sticks.left.curve).toEqual({ kind: 'preset', preset: 'linear' });
    expect(screen.queryByTestId('curve-svg')).toBeNull();
  });

  it('wires trajectory, invert, offset and smoothing', () => {
    render(<Sticks />);
    fireEvent.click(screen.getByRole('radio', { name: 'Raw' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Invert Y' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Center offset X' }), {
      target: { value: '0.05' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Enable smoothing' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Smoothing strength' }), {
      target: { value: '40' },
    });
    const l = profile().sticks.left;
    expect(l.circular).toBe(false);
    expect(l.invertY).toBe(true);
    expect(l.calibration.cx).toBe(0.05);
    expect(l.filter).toMatchObject({ enabled: true, mode: 'basic', strength: 40 });
    fireEvent.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(profile().sticks.left.filter.mode).toBe('advanced');
    expect(screen.getAllByRole('button', { name: /^Point \d/ })).toHaveLength(5);
  });

  it('switches the sub-tab on an LT/RT rising edge while focused', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    render(
      <>
        <Nav />
        <Sticks />
      </>,
    );
    const snap = (lt: number, rt: number) => ({
      t: 0,
      connected: true,
      source: 'device' as const,
      vigemReady: true,
      reportHz: 250,
      pipelineP99Ms: 0,
      battery: { percent: 50, state: 'discharging' as const },
      raw: {
        lx: 0,
        ly: 0,
        rx: 0,
        ry: 0,
        l2: lt,
        r2: rt,
        buttons: {},
        gyro: { x: 0, y: 0, z: 0 },
        touch: [],
      },
      out: { lx: 0, ly: 0, rx: 0, ry: 0, lt, rt, buttons: {} },
    });
    act(() => useStore.setState({ snapshot: snap(0, 0) })); // baseline: navigation acts from the next snapshot on
    act(() => useStore.setState({ snapshot: snap(0, 0.9) }));
    expect(useStore.getState().subTab.sticks).toBe('right');
    act(() => useStore.setState({ snapshot: snap(0.9, 0.9) }));
    expect(useStore.getState().subTab.sticks).toBe('left');
  });

  it('the live stick view draws the raw dot in the stick’s calibrated space', () => {
    const p = defaultProfile('p1', 'Profile 1');
    p.sticks.left.calibration = { cx: 0.08, cy: 0.04, radius: 1 };
    useStore.setState({
      profile: p,
      snapshot: {
        t: 0,
        connected: true,
        source: 'device',
        vigemReady: true,
        reportHz: 250,
        pipelineP99Ms: 0,
        battery: { percent: 50, state: 'discharging' },
        raw: {
          lx: 0.08,
          ly: 0.04,
          rx: 0,
          ry: 0,
          l2: 0,
          r2: 0,
          buttons: {},
          gyro: { x: 0, y: 0, z: 0 },
          touch: [],
        },
        out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
      },
    });
    const { container } = render(<Sticks />);
    const dot = container.querySelector('.stick-live circle.dot-raw')!;
    expect([dot.getAttribute('cx'), dot.getAttribute('cy')]).toEqual(['74', '74']); // size 148: the resting stick is dead centre
  });
});
