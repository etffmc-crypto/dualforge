import { create } from 'zustand';
import { ProfileSchema, type EngineSnapshot, type Profile, type ProfileSummary, type Settings } from '@dualforge/shared';

export type Page =
  | 'home' | 'overview' | 'buttons' | 'sticks' | 'triggers' | 'motion' | 'vibrations' | 'lights' | 'macros' | 'inputTest' | 'settings' | 'profiles';
export type Side = 'left' | 'right';
export type SubTabPage = 'sticks' | 'triggers';

/** Trailing debounce for live profile edits sent to the engine. */
export const DEBOUNCE_MS = 100;

interface State {
  snapshot: EngineSnapshot | null;
  lastError: { code: string; msg: string } | null;
  page: Page;
  /** Set once the app has routed Home → Overview for the first connected snapshot. */
  autoRouted: boolean;
  /** The profile the engine is running — the one every page edits. */
  profile: Profile | null;
  activeProfileId: string | null;
  profiles: ProfileSummary[];
  settings: Settings | null;
  subTab: Record<SubTabPage, Side>;
  /**
   * Outstanding gamepad-navigation holds (macro recorder, macro play test): while any is held the pad means something
   * else and navigation ignores it. Use `suspendNav()` / `navSuspended()` rather than this count.
   */
  navHolds: number;
  /** Takes a hold; the returned release is idempotent, so each owner releases exactly its own. */
  suspendNav(): () => void;
  setPage(p: Page): void;
  setSubTab(page: SubTabPage, side: Side): void;
  loadProfile(): Promise<void>;
  loadSettings(): Promise<void>;
  /** Applies locally at once; reverts and reports E_SETTINGS_SEND if main rejects it. */
  updateSettings(patch: Partial<Settings>): Promise<void>;
  refreshProfiles(): Promise<void>;
  activateProfile(id: string): Promise<void>;
  renameProfile(id: string, name: string): Promise<void>;
  /** Resets the running profile to defaults, discarding any edit still waiting for the debounce. */
  resetProfile(): Promise<void>;
  /**
   * Main rewrote slot `id` (duplicate / reset / import): refreshes the slot names and, when it is the running slot,
   * drops any edit still waiting for the debounce and reloads the profile so a stale copy is never saved over it.
   */
  slotReplaced(id: string): Promise<void>;
  subscribe(): () => void;
  /**
   * Clone → mutate → validate; applies locally at once and sends to the engine after DEBOUNCE_MS.
   * Returns false (and sets lastError E_PROFILE_INVALID) when the result fails the schema; nothing is applied then.
   */
  updateProfile(mutate: (draft: Profile) => void): boolean;
  /** Sends the current profile now, cancelling any pending debounce. */
  flushProfile(): void;
  /** Sends the current profile only if an edit is still waiting for the debounce. */
  flushPending(): void;
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** True while any gamepad-navigation hold is outstanding. */
export const navSuspended = (): boolean => useStore.getState().navHolds > 0;
const fail = (code: string) => (err: unknown) => useStore.setState({ lastError: { code, msg: String(err) } });

export const useStore = create<State>((set, get) => {
  const send = () => {
    pending = null;
    const p = get().profile;
    if (!p) return;
    // profiles.set saves to p.id's slot, so an edit can never land in a different profile after a switch
    window.dualforge.profiles.set(p).catch(fail('E_PROFILE_SEND'));
  };
  const flushPending = () => { if (pending) { clearTimeout(pending); send(); } };
  const dropPending = () => { if (pending) clearTimeout(pending); pending = null; };
  return {
    snapshot: null, lastError: null, page: 'home', autoRouted: false,
    profile: null, activeProfileId: null, profiles: [], settings: null,
    subTab: { sticks: 'left', triggers: 'left' },
    navHolds: 0,
    suspendNav: () => {
      set((s) => ({ navHolds: s.navHolds + 1 }));
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        set((s) => ({ navHolds: Math.max(0, s.navHolds - 1) }));
      };
    },
    setPage: (page) => set({ page }),
    setSubTab: (page, side) => set((s) => ({ subTab: { ...s.subTab, [page]: side } })),
    loadProfile: async () => {
      const { id } = await window.dualforge.profiles.current();
      const profile = await window.dualforge.profiles.get(id);
      set({ profile, activeProfileId: id });
    },
    loadSettings: async () => set({ settings: await window.dualforge.settings.get() }),
    updateSettings: async (patch) => {
      const before = get().settings;
      if (before) set({ settings: { ...before, ...patch } });
      try {
        set({ settings: await window.dualforge.settings.set(patch) });
      } catch (err) {
        set({ settings: before, lastError: { code: 'E_SETTINGS_SEND', msg: String(err) } });
      }
    },
    refreshProfiles: async () => set({ profiles: await window.dualforge.profiles.list() }),
    activateProfile: async (id) => {
      flushPending();
      const profile = await window.dualforge.profiles.activate(id);
      set({ profile, activeProfileId: id });
    },
    renameProfile: async (id, name) => {
      await window.dualforge.profiles.rename(id, name);
      // keep the local copy in step, or the next debounced save would write the old name back
      const p = get().profile;
      if (p?.id === id) set({ profile: { ...p, name } });
      await get().refreshProfiles();
    },
    resetProfile: async () => {
      const id = get().activeProfileId ?? get().profile?.id;
      if (!id) return;
      dropPending();
      await window.dualforge.profiles.reset(id);
      await Promise.all([get().loadProfile(), get().refreshProfiles()]);
    },
    slotReplaced: async (id) => {
      const running = id === (get().activeProfileId ?? get().profile?.id);
      if (running) dropPending();
      await Promise.all([running ? get().loadProfile() : null, get().refreshProfiles()]);
    },
    subscribe: () => {
      const offEngine = window.dualforge.onEngineEvent((e) => {
        if (e.type === 'snapshot') {
          const s = get();
          // Overview is the landing page once a controller shows up; after that Home is only a click away
          if (e.snapshot.connected && !s.autoRouted) set({ snapshot: e.snapshot, autoRouted: true, page: s.page === 'home' ? 'overview' : s.page });
          else set({ snapshot: e.snapshot });
        } else if (e.type === 'error') set({ lastError: { code: e.code, msg: e.msg } });
      });
      const offActive = window.dualforge.profiles.onActive((id) => {
        flushPending();
        set({ activeProfileId: id });
        get().loadProfile().catch(fail('E_PROFILE_LOAD'));
      });
      return () => { offEngine(); offActive(); };
    },
    updateProfile: (mutate) => {
      const cur = get().profile;
      if (!cur) return false;
      const draft = structuredClone(cur);
      mutate(draft);
      const parsed = ProfileSchema.safeParse(draft);
      if (!parsed.success) {
        set({ lastError: { code: 'E_PROFILE_INVALID', msg: parsed.error.issues.map((i) => i.message).join('; ') } });
        return false;
      }
      set({ profile: parsed.data });
      if (pending) clearTimeout(pending);
      pending = setTimeout(send, DEBOUNCE_MS);
      return true;
    },
    flushProfile: () => {
      if (pending) clearTimeout(pending);
      send();
    },
    flushPending,
  };
});
