// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type EngineSnapshot } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Motion } from '../../src/renderer/pages/Motion';
import { CALIBRATE_MS } from '../../src/renderer/pages/motion/useGyroCalibration';

function snap(gyro = { x: 0, y: 0, z: 0 }): EngineSnapshot {
  return {
    t: 0, connected: true, source: 'device', vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 50, state: 'discharging' },
    raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro, touch: [] },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
}

let set: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  set = vi.fn(async () => true);
  vi.stubGlobal('dualforge', { profiles: { set } });
  useStore.setState({ profile: defaultProfile('p1', 'Profile 1'), snapshot: snap(), lastError: null, page: 'motion' });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const gyro = () => useStore.getState().profile!.gyro;
const group = (name: string) => within(screen.getByRole('radiogroup', { name }));

describe('Motion page', () => {
  it('Aim turns motion on with the last output; Off turns it off; Output picks mouse', () => {
    render(<Motion />);
    expect(gyro().output).toBe('off');
    fireEvent.click(group('Motion mode').getByRole('radio', { name: 'Aim' }));
    expect(gyro().output).toBe('rightStick');
    fireEvent.click(group('Output').getByRole('radio', { name: 'Mouse' }));
    expect(gyro().output).toBe('mouse');
    fireEvent.click(group('Motion mode').getByRole('radio', { name: 'Off' }));
    expect(gyro().output).toBe('off');
    fireEvent.click(group('Motion mode').getByRole('radio', { name: 'Aim' }));
    expect(gyro().output).toBe('mouse');
  });

  it('sensitivity, deadzone, curve and invert edit the gyro config', () => {
    render(<Motion />);
    fireEvent.click(group('Motion mode').getByRole('radio', { name: 'Aim' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Horizontal sensitivity' }), { target: { value: '2.5' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Vertical sensitivity' }), { target: { value: '0.75' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Gyro deadzone' }), { target: { value: '6' } });
    fireEvent.click(group('Motion curve').getByRole('radio', { name: 'S-Curve' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Invert Y' }));
    expect(gyro()).toMatchObject({ sensitivityX: 2.5, sensitivityY: 0.75, deadzoneDps: 6, curve: 'scurve', invertX: false, invertY: true });
    expect(screen.getByText('2.50×')).toBeTruthy();
  });

  it('Hold without a button auto-selects L1; the button pill opens a picker', () => {
    render(<Motion />);
    fireEvent.click(group('Motion mode').getByRole('radio', { name: 'Aim' }));
    fireEvent.click(group('Activate method').getByRole('radio', { name: 'Hold' }));
    expect(gyro()).toMatchObject({ activate: 'hold', activateButton: 'l1' });
    fireEvent.click(screen.getByRole('button', { name: 'Activate button: L1' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Activate button' }));
    expect(dialog.getByRole('button', { name: 'L1' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dialog.getByRole('button', { name: 'R1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(gyro().activateButton).toBe('r1');
    fireEvent.click(group('Activate method').getByRole('radio', { name: 'Always' }));
    expect(gyro().activate).toBe('always');
    expect((screen.getByRole('button', { name: /^Activate button/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Calibrate averages the raw gyro stream over the capture window into bias and saves at once', () => {
    render(<Motion />);
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate' }));
    expect(screen.getByRole('progressbar', { name: 'Calibrating' })).toBeTruthy();
    const samples = [{ x: 10, y: -20, z: 4 }, { x: 12, y: -22, z: 6 }, { x: 14, y: -24, z: 8 }];
    for (const g of samples) {
      act(() => { useStore.setState({ snapshot: snap(g) }); vi.advanceTimersByTime(100); });
    }
    expect(gyro().bias).toEqual({ x: 0, y: 0, z: 0 });
    set.mockClear();
    act(() => { vi.advanceTimersByTime(CALIBRATE_MS); });
    expect(gyro().bias).toEqual({ x: 12, y: -22, z: 6 });
    expect(set).toHaveBeenCalledTimes(1);   // flushed, not debounced
    expect(screen.queryByRole('progressbar')).toBeNull();
    // later snapshots don't move the bias
    act(() => { useStore.setState({ snapshot: snap({ x: 500, y: 500, z: 500 }) }); vi.advanceTimersByTime(500); });
    expect(gyro().bias).toEqual({ x: 12, y: -22, z: 6 });
  });

  it('Calibrate with no controller data reports it and keeps the bias', () => {
    useStore.setState({ snapshot: { ...snap(), connected: false } });
    render(<Motion />);
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate' }));
    act(() => { vi.advanceTimersByTime(CALIBRATE_MS + 100); });
    expect(gyro().bias).toEqual({ x: 0, y: 0, z: 0 });
    expect(screen.getByRole('alert').textContent).toMatch(/controller/i);
  });

  it('the gyro meter shows yaw and pitch in °/s after bias', () => {
    const p = defaultProfile('p1', 'Profile 1');
    p.gyro.bias = { x: 16.384, y: 0, z: 0 };
    useStore.setState({ profile: p, snapshot: snap({ x: 16.384 * 31, y: -16.384 * 50, z: 0 }) });
    render(<Motion />);
    expect(screen.getByTestId('meter-yaw').textContent).toBe('-50 °/s');
    expect(screen.getByTestId('meter-pitch').textContent).toBe('+30 °/s');
  });
});
