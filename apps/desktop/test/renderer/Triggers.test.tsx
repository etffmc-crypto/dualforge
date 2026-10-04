// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Triggers } from '../../src/renderer/pages/Triggers';

const profile = () => useStore.getState().profile!;
const group = (name: string) => within(screen.getByRole('radiogroup', { name }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) } });
  useStore.setState({ profile: defaultProfile('p1', 'Profile 1'), snapshot: null, lastError: null, subTab: { sticks: 'left', triggers: 'left' } });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Triggers page', () => {
  it('switching the effect to Resistance seeds defaults and Force edits it', () => {
    render(<Triggers />);
    fireEvent.click(group('Adaptive trigger effect').getByRole('radio', { name: 'Resistance' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Force' }), { target: { value: '6' } });
    expect(profile().triggers.left.effect).toEqual({ mode: 'resistance', start: 2, force: 6 });
    fireEvent.change(screen.getByRole('slider', { name: 'Force' }), { target: { value: '3' } });
    expect(profile().triggers.left.effect).toEqual({ mode: 'resistance', start: 2, force: 3 });
    expect(profile().triggers.right.effect).toEqual({ mode: 'off' });
  });

  it('seeds section and vibration defaults and keeps section start < end', () => {
    render(<Triggers />);
    const fx = group('Adaptive trigger effect');
    fireEvent.click(fx.getByRole('radio', { name: 'Section' }));
    expect(profile().triggers.left.effect).toEqual({ mode: 'section', start: 2, end: 6, force: 8 });
    fireEvent.change(screen.getByRole('slider', { name: 'Section Start' }), { target: { value: '9' } });
    expect(profile().triggers.left.effect).toMatchObject({ start: 5, end: 6 });
    fireEvent.click(fx.getByRole('radio', { name: 'Vibration' }));
    expect(profile().triggers.left.effect).toEqual({ mode: 'vibration', frequency: 20, force: 5 });
    fireEvent.change(screen.getByRole('slider', { name: 'Frequency' }), { target: { value: '120' } });
    expect(profile().triggers.left.effect).toEqual({ mode: 'vibration', frequency: 120, force: 5 });
    fireEvent.click(fx.getByRole('radio', { name: 'Off' }));
    expect(profile().triggers.left.effect).toEqual({ mode: 'off' });
  });

  it('wires deadzone, hair trigger and curve for the selected side', () => {
    render(<Triggers />);
    fireEvent.click(screen.getByRole('tab', { name: 'Right' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Deadzone Initial' }), { target: { value: '0.99' } });
    expect(profile().triggers.right.deadzone).toEqual({ initial: 0.93, max: 0.98 }); // min gap keeps initial < max
    fireEvent.click(group('Hair trigger mode').getByRole('radio', { name: 'Adaptive' }));
    expect(profile().triggers.right.hairTrigger).toEqual({ mode: 'adaptive', value: 30 });
    fireEvent.change(screen.getByRole('slider', { name: 'Hair trigger threshold' }), { target: { value: '55' } });
    expect(profile().triggers.right.hairTrigger).toEqual({ mode: 'adaptive', value: 55 });
    fireEvent.click(group('Hair trigger mode').getByRole('radio', { name: 'Fixed' }));
    expect(profile().triggers.right.hairTrigger).toEqual({ mode: 'fixed' });
    fireEvent.click(group('Response curve').getByRole('radio', { name: 'S-Curve' }));
    expect(profile().triggers.right.curve).toBe('scurve');
    expect(profile().triggers.left).toEqual(defaultProfile('p1', 'Profile 1').triggers.left);
    expect(useStore.getState().lastError).toBeNull();
  });
});
