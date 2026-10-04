// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, defaultSettings, type EngineSnapshot, type Settings } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Vibrations, vibRenderCounts } from '../../src/renderer/pages/Vibrations';

let testRumble: ReturnType<typeof vi.fn>;
let settingsSet: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  testRumble = vi.fn(async () => {});
  settingsSet = vi.fn(async (patch: Partial<Settings>) => ({ ...useStore.getState().settings!, ...patch }));
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) }, settings: { set: settingsSet }, engine: { testRumble } });
  useStore.setState({ profile: defaultProfile('p1', 'Profile 1'), settings: { ...defaultSettings(), hasRumble: false }, snapshot: null, lastError: null, page: 'vibrations' });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const slider = (name: string) => screen.getByRole('slider', { name }) as HTMLInputElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Vibrations page', () => {
  it('without rumble motors the sliders and Test buttons are disabled with a note', () => {
    render(<Vibrations />);
    expect(screen.getByRole('switch', { name: 'This controller has rumble motors' }).getAttribute('aria-checked')).toBe('false');
    expect(slider('Left motor strength').disabled).toBe(true);
    expect(slider('Right motor strength').disabled).toBe(true);
    expect(button('Test left motor').disabled).toBe(true);
    expect(button('Test right motor').disabled).toBe(true);
    expect(screen.getByText(/Rumble is off for this controller/)).toBeTruthy();
  });

  it('the rumble toggle saves hasRumble through settings and enables the controls', async () => {
    render(<Vibrations />);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'This controller has rumble motors' })); });
    expect(settingsSet).toHaveBeenCalledWith({ hasRumble: true });
    expect(useStore.getState().settings!.hasRumble).toBe(true);
    expect(slider('Left motor strength').disabled).toBe(false);
    expect(screen.queryByText(/Rumble is off for this controller/)).toBeNull();
  });

  it('sliders edit the profile; Test plays that motor at its strength for 500 ms', () => {
    useStore.setState({ settings: { ...defaultSettings(), hasRumble: true } });
    render(<Vibrations />);
    fireEvent.change(slider('Left motor strength'), { target: { value: '60' } });
    fireEvent.change(slider('Right motor strength'), { target: { value: '25' } });
    expect(useStore.getState().profile!.vibration).toEqual({ left: 60, right: 25 });
    fireEvent.click(button('Test left motor'));
    expect(testRumble).toHaveBeenLastCalledWith({ left: 0.6, right: 0, ms: 500 });
    fireEvent.click(button('Test right motor'));
    expect(testRumble).toHaveBeenLastCalledWith({ left: 0, right: 0.25, ms: 500 });
  });

  it('a snapshot stream re-renders only the stage, not the sliders', () => {
    useStore.setState({ settings: { ...defaultSettings(), hasRumble: true } });
    render(<Vibrations />);
    const page0 = vibRenderCounts.page, stage0 = vibRenderCounts.stage;
    for (let i = 0; i < 10; i++) {
      const s: EngineSnapshot = {
        t: i, connected: true, source: 'device', vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 50, state: 'discharging' },
        raw: { lx: i / 10, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: { cross: i % 2 === 0 }, gyro: { x: 0, y: 0, z: 0 }, touch: [] },
        out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
      };
      act(() => useStore.setState({ snapshot: s }));
    }
    expect(vibRenderCounts.page - page0).toBe(0);
    expect(vibRenderCounts.stage - stage0).toBe(10);
  });
});
