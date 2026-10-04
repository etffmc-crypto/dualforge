// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DS_BUTTONS,
  defaultProfile,
  defaultSettings,
  type EngineEvent,
  type EngineSnapshot,
} from '@dualforge/shared';
import { DEBOUNCE_MS, useStore } from '../../src/renderer/store';

const set = vi.fn(async () => true);
let activeCb: ((id: string) => void) | null = null;
let engineCb: ((e: EngineEvent) => void) | null = null;
const profilesApi = {
  set,
  current: vi.fn(async (): Promise<{ id: string; source: 'manual' | 'auto' }> => ({
    id: 'p2',
    source: 'manual',
  })),
  get: vi.fn(async (id: string) => defaultProfile(id, `Slot ${id}`)),
  list: vi.fn(async () => [
    { id: 'p1', name: 'One', slot: 1 },
    { id: 'p2', name: 'Two', slot: 2 },
  ]),
  activate: vi.fn(async (id: string) => defaultProfile(id, `Slot ${id}`)),
  rename: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
  onActive: vi.fn((cb: (id: string) => void) => {
    activeCb = cb;
    return () => {
      activeCb = null;
    };
  }),
};
const settingsApi = {
  get: vi.fn(async () => defaultSettings()),
  set: vi.fn(async (patch: object) => ({ ...defaultSettings(), ...patch })),
};

function snap(connected: boolean): EngineSnapshot {
  return {
    t: 0,
    connected,
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
      buttons: {},
      gyro: { x: 0, y: 0, z: 0 },
      touch: [],
    },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('dualforge', {
    profiles: profilesApi,
    settings: settingsApi,
    onEngineEvent: (cb: (e: EngineEvent) => void) => {
      engineCb = cb;
      return () => {
        engineCb = null;
      };
    },
  });
  useStore.setState({
    profile: defaultProfile('p1', 'Profile 1'),
    lastError: null,
    subTab: { sticks: 'left', triggers: 'left' },
    page: 'home',
    autoRouted: false,
    settings: null,
    profiles: [],
    activeProfileId: null,
    snapshot: null,
  });
});
afterEach(() => {
  vi.runOnlyPendingTimers(); // drain any pending debounce between tests
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('store profile editing', () => {
  it('applies immediately and sends one debounced profiles.set with the latest profile', () => {
    const { updateProfile } = useStore.getState();
    updateProfile((d) => {
      d.sticks.left.deadzone.anti = 0.1;
    });
    updateProfile((d) => {
      d.sticks.left.deadzone.anti = 0.2;
    });
    expect(useStore.getState().profile!.sticks.left.deadzone.anti).toBe(0.2);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect((set.mock.calls[0] as unknown[])[0]).toMatchObject({
      id: 'p1',
      sticks: { left: { deadzone: { anti: 0.2 } } },
    });
    expect(DEBOUNCE_MS).toBe(100);
  });

  it('rejects an invalid mutation with E_PROFILE_INVALID and keeps the old profile', () => {
    const before = useStore.getState().profile;
    useStore.getState().updateProfile((d) => {
      d.triggers.left.deadzone.initial = 0.9;
      d.triggers.left.deadzone.max = 0.1;
    });
    expect(useStore.getState().profile).toBe(before);
    expect(useStore.getState().lastError?.code).toBe('E_PROFILE_INVALID');
    vi.advanceTimersByTime(500);
    expect(set).not.toHaveBeenCalled();
  });

  it('does not mutate the previous profile object', () => {
    const before = useStore.getState().profile!;
    useStore.getState().updateProfile((d) => {
      d.sticks.right.invertX = true;
    });
    expect(before.sticks.right.invertX).toBe(false);
  });

  it('flushProfile sends immediately and cancels the pending debounce', () => {
    useStore.getState().updateProfile((d) => {
      d.sticks.left.circular = false;
    });
    useStore.getState().flushProfile();
    expect(set).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('tracks a sub-tab per page', () => {
    useStore.getState().setSubTab('triggers', 'right');
    expect(useStore.getState().subTab).toEqual({ sticks: 'left', triggers: 'right' });
  });
});

describe('store profiles + settings', () => {
  it('loadProfile loads the profile the engine is running', async () => {
    await useStore.getState().loadProfile();
    expect(profilesApi.current).toHaveBeenCalled();
    expect(profilesApi.get).toHaveBeenCalledWith('p2');
    expect(useStore.getState().profile!.id).toBe('p2');
    expect(useStore.getState().activeProfileId).toBe('p2');
  });

  it('reloads the profile when the engine switches (onActive), flushing pending edits first', async () => {
    const unsub = useStore.getState().subscribe();
    useStore.getState().updateProfile((d) => {
      d.sticks.left.circular = false;
    });
    profilesApi.current.mockResolvedValueOnce({ id: 'p3', source: 'auto' });
    activeCb!('p3');
    expect(set).toHaveBeenCalledTimes(1); // p1's edit is saved to p1, not lost or written into p3
    expect((set.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 'p1' });
    await vi.waitFor(() => expect(useStore.getState().profile!.id).toBe('p3'));
    expect(useStore.getState().activeProfileId).toBe('p3');
    unsub();
    expect(activeCb).toBeNull();
    expect(engineCb).toBeNull();
  });

  it('loadSettings / updateSettings round-trip through settings.set', async () => {
    await useStore.getState().loadSettings();
    expect(useStore.getState().settings!.theme).toBe('dark');
    const p = useStore.getState().updateSettings({ hasRumble: true });
    expect(useStore.getState().settings!.hasRumble).toBe(true); // optimistic
    await p;
    expect(settingsApi.set).toHaveBeenCalledWith({ hasRumble: true });
    expect(useStore.getState().settings!.hasRumble).toBe(true);
  });

  it('updateSettings reverts and reports when main rejects the patch', async () => {
    await useStore.getState().loadSettings();
    settingsApi.set.mockRejectedValueOnce(new Error('E_SETTINGS_SCHEMA'));
    await useStore.getState().updateSettings({ startMinimized: true });
    expect(useStore.getState().settings!.startMinimized).toBe(false);
    expect(useStore.getState().lastError?.code).toBe('E_SETTINGS_SEND');
  });

  it('after a rejected patch the store resyncs to what main actually persisted', async () => {
    await useStore.getState().loadSettings();
    settingsApi.set.mockRejectedValueOnce(new Error('E_STARTUP_LOGIN_ITEM'));
    settingsApi.get.mockResolvedValueOnce({
      ...useStore.getState().settings!,
      startWithWindows: true,
    });
    await useStore.getState().updateSettings({ startWithWindows: true });
    expect(useStore.getState().settings!.startWithWindows).toBe(true);
    expect(useStore.getState().lastError?.msg).toMatch(/E_STARTUP_LOGIN_ITEM/);
  });

  it('profiles loaded from main are made dense: every button has a mapping', async () => {
    const sparse = (id: string) => ({
      ...defaultProfile(id, 'Sparse'),
      mappings: { cross: defaultProfile(id, 'x').mappings.cross },
    });
    profilesApi.get.mockImplementationOnce(
      async (id: string) => sparse(id) as ReturnType<typeof defaultProfile>,
    );
    await useStore.getState().loadProfile();
    expect(Object.keys(useStore.getState().profile!.mappings)).toHaveLength(DS_BUTTONS.length);
    profilesApi.activate.mockImplementationOnce(
      async (id: string) => sparse(id) as ReturnType<typeof defaultProfile>,
    );
    await useStore.getState().activateProfile('p3');
    expect(useStore.getState().profile!.mappings.circle).toEqual(
      defaultProfile('p3', 'x').mappings.circle,
    );
  });

  it('activateProfile switches the engine and loads that profile', async () => {
    await useStore.getState().activateProfile('p4');
    expect(profilesApi.activate).toHaveBeenCalledWith('p4');
    expect(useStore.getState().profile!.id).toBe('p4');
    expect(useStore.getState().activeProfileId).toBe('p4');
  });

  it('renameProfile renames, refreshes the list and keeps the local profile name in sync', async () => {
    await useStore.getState().renameProfile('p1', 'Racing');
    expect(profilesApi.rename).toHaveBeenCalledWith('p1', 'Racing');
    expect(profilesApi.list).toHaveBeenCalled();
    expect(useStore.getState().profile!.name).toBe('Racing');
    expect(set).not.toHaveBeenCalled();
  });

  it('resetProfile drops pending edits, resets the running slot and reloads it', async () => {
    useStore.setState({ activeProfileId: 'p2' });
    useStore.getState().updateProfile((d) => {
      d.sticks.left.circular = false;
    });
    await useStore.getState().resetProfile();
    vi.advanceTimersByTime(500);
    expect(set).not.toHaveBeenCalled();
    expect(profilesApi.reset).toHaveBeenCalledWith('p2');
    expect(useStore.getState().profile!.sticks.left.circular).toBe(true);
  });
});

describe('landing page', () => {
  it('routes Home → Overview on the first connected snapshot, once', () => {
    const unsub = useStore.getState().subscribe();
    engineCb!({ type: 'snapshot', snapshot: snap(false) });
    expect(useStore.getState().page).toBe('home');
    engineCb!({ type: 'snapshot', snapshot: snap(true) });
    expect(useStore.getState().page).toBe('overview');
    useStore.getState().setPage('home');
    engineCb!({ type: 'snapshot', snapshot: snap(true) });
    expect(useStore.getState().page).toBe('home'); // Home stays reachable
    unsub();
  });

  it('does not steal the page when the user already navigated away from Home', () => {
    const unsub = useStore.getState().subscribe();
    useStore.getState().setPage('sticks');
    engineCb!({ type: 'snapshot', snapshot: snap(true) });
    expect(useStore.getState().page).toBe('sticks');
    unsub();
  });
});
