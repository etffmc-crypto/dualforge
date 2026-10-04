// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { DEBOUNCE_MS, useStore } from '../../src/renderer/store';

const setProfile = vi.fn(async () => true);

beforeEach(() => {
  vi.useFakeTimers();
  setProfile.mockClear();
  vi.stubGlobal('dualforge', { setProfile });
  useStore.setState({ profile: defaultProfile('p1', 'Profile 1'), lastError: null, subTab: { sticks: 'left', triggers: 'left' } });
});
afterEach(() => {
  vi.runOnlyPendingTimers(); // drain any pending debounce between tests
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('store profile editing', () => {
  it('applies immediately and sends one debounced setProfile with the latest profile', () => {
    const { updateProfile } = useStore.getState();
    updateProfile((d) => { d.sticks.left.deadzone.anti = 0.1; });
    updateProfile((d) => { d.sticks.left.deadzone.anti = 0.2; });
    expect(useStore.getState().profile!.sticks.left.deadzone.anti).toBe(0.2);
    expect(setProfile).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(setProfile).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setProfile).toHaveBeenCalledTimes(1);
    expect((setProfile.mock.calls[0] as unknown[])[0]).toMatchObject({ sticks: { left: { deadzone: { anti: 0.2 } } } });
    expect(DEBOUNCE_MS).toBe(100);
  });

  it('rejects an invalid mutation with E_PROFILE_INVALID and keeps the old profile', () => {
    const before = useStore.getState().profile;
    useStore.getState().updateProfile((d) => { d.triggers.left.deadzone.initial = 0.9; d.triggers.left.deadzone.max = 0.1; });
    expect(useStore.getState().profile).toBe(before);
    expect(useStore.getState().lastError?.code).toBe('E_PROFILE_INVALID');
    vi.advanceTimersByTime(500);
    expect(setProfile).not.toHaveBeenCalled();
  });

  it('does not mutate the previous profile object', () => {
    const before = useStore.getState().profile!;
    useStore.getState().updateProfile((d) => { d.sticks.right.invertX = true; });
    expect(before.sticks.right.invertX).toBe(false);
  });

  it('flushProfile sends immediately and cancels the pending debounce', () => {
    useStore.getState().updateProfile((d) => { d.sticks.left.circular = false; });
    useStore.getState().flushProfile();
    expect(setProfile).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(setProfile).toHaveBeenCalledTimes(1);
  });

  it('tracks a sub-tab per page', () => {
    useStore.getState().setSubTab('triggers', 'right');
    expect(useStore.getState().subTab).toEqual({ sticks: 'left', triggers: 'right' });
  });
});
