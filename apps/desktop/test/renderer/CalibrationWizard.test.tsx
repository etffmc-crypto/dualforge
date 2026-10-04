// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type EngineSnapshot } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { CalibrationWizard } from '../../src/renderer/components/CalibrationWizard';
import { Sticks } from '../../src/renderer/pages/Sticks';

const setProfile = vi.fn(async () => true); // profiles.set

function snap(lx: number, ly: number): EngineSnapshot {
  return {
    t: 0, connected: true, source: 'device', vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 50, state: 'discharging' },
    raw: { lx, ly, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro: { x: 0, y: 0, z: 0 }, touch: [] },
    out: { lx, ly, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
}
const feed = (lx: number, ly: number) => act(() => useStore.setState({ snapshot: snap(lx, ly) }));
const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;

beforeEach(() => {
  setProfile.mockClear();
  vi.stubGlobal('dualforge', { profiles: { set: setProfile } });
  useStore.setState({ profile: defaultProfile('p1', 'Profile 1'), snapshot: null, lastError: null, subTab: { sticks: 'left', triggers: 'left' } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CalibrationWizard', () => {
  it('measures center, then radius, then applies and flushes', () => {
    const onClose = vi.fn();
    render(<CalibrationWizard side="left" onClose={onClose} />);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(next().disabled).toBe(true);

    for (let i = 0; i < 130; i++) feed(0.1 + (i % 2 ? 0.002 : -0.002), -0.05);
    expect(screen.getByTestId('cal-center').textContent).toBe('X +0.100 · Y -0.050');
    expect(next().disabled).toBe(false);
    fireEvent.click(next());

    for (let i = 0; i < 150; i++) { const a = (i / 150) * 4 * Math.PI; feed(0.1 + 0.8 * Math.cos(a), -0.05 + 0.8 * Math.sin(a)); }
    expect(next().disabled).toBe(true); // fewer than 200 samples
    for (let i = 0; i < 100; i++) { const a = (i / 100) * 2 * Math.PI; feed(0.1 + 0.8 * Math.cos(a), -0.05 + 0.8 * Math.sin(a)); }
    expect(next().disabled).toBe(false);
    fireEvent.click(next());

    expect(screen.getByTestId('cal-radius').textContent).toBe('0.800');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const cal = useStore.getState().profile!.sticks.left.calibration;
    expect(cal.cx).toBeCloseTo(0.1, 3);
    expect(cal.cy).toBeCloseTo(-0.05, 3);
    expect(cal.radius).toBeCloseTo(0.8, 3);
    expect(setProfile).toHaveBeenCalledTimes(1); // flushed, not waiting for the debounce
    expect(useStore.getState().profile!.sticks.right.calibration).toEqual({ cx: 0, cy: 0, radius: 1 });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Next disabled on the edge step until the stick has actually been rotated', () => {
    render(<CalibrationWizard side="left" onClose={() => {}} />);
    for (let i = 0; i < 120; i++) feed(0, 0);
    fireEvent.click(next());
    for (let i = 0; i < 300; i++) feed(0.01 * (i % 2), 0); // resting stick: plenty of samples, no edge
    expect(next().disabled).toBe(true);
  });

  it('rejects a centre measured while the stick is held off-center', () => {
    render(<CalibrationWizard side="left" onClose={() => {}} />);
    for (let i = 0; i < 130; i++) feed(0.3, 0);
    expect(screen.getByTestId('cal-rest-error').textContent).toMatch(/off-center/);
    expect(screen.getByTestId('cal-rest-error').textContent).not.toContain('�');
    expect(next().disabled).toBe(true);
    expect(screen.queryByTestId('cal-center')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Measure again' }));
    for (let i = 0; i < 130; i++) feed(0, 0);
    expect(screen.getByTestId('cal-center')).toBeTruthy();
    expect(next().disabled).toBe(false);
  });

  it('rejects a centre measured while the stick is moving', () => {
    render(<CalibrationWizard side="left" onClose={() => {}} />);
    for (let i = 0; i < 130; i++) feed(i % 2 ? 0.12 : 0, 0);
    expect(screen.getByTestId('cal-rest-error').textContent).toMatch(/at rest/);
    expect(screen.getByTestId('cal-rest-error').textContent).not.toContain('�');
    expect(next().disabled).toBe(true);
  });

  it('proposes the median edge reach as radius, not the diagonal overshoot', () => {
    render(<CalibrationWizard side="left" onClose={() => {}} />);
    for (let i = 0; i < 120; i++) feed(0, 0);
    fireEvent.click(next());
    // octagonal gate: 0.95 on the cardinals, 1.2 on the diagonals
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * 2 * Math.PI, k = Math.abs(Math.sin(2 * a)); const r = 0.95 + 0.25 * k ** 16;
      feed(r * Math.cos(a), r * Math.sin(a));
    }
    fireEvent.click(next());
    const r = Number(screen.getByTestId('cal-radius').textContent);
    expect(r).toBeGreaterThan(0.94); expect(r).toBeLessThan(1.05);
  });

  it('Escape and Cancel close without touching the profile', () => {
    const onClose = vi.fn();
    const before = useStore.getState().profile;
    render(<CalibrationWizard side="right" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(useStore.getState().profile).toBe(before);
    expect(setProfile).not.toHaveBeenCalled();
  });

  it('opens from the Sticks page Calibrate button', () => {
    render(<Sticks />);
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate…' }));
    expect(screen.getByRole('dialog', { name: 'Calibrate left stick' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
