// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, defaultSettings, type Settings } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Vibrations } from '../../src/renderer/pages/Vibrations';

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
});
