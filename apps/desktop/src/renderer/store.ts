import { create } from 'zustand';
import { ProfileSchema, type EngineSnapshot, type Profile } from '@dualforge/shared';

export type Page = 'home' | 'sticks' | 'triggers' | 'motion' | 'vibrations' | 'lights' | 'inputTest';
export type Side = 'left' | 'right';
export type SubTabPage = 'sticks' | 'triggers';

/** Trailing debounce for live profile edits sent to the engine. */
export const DEBOUNCE_MS = 100;

interface State {
  snapshot: EngineSnapshot | null;
  lastError: { code: string; msg: string } | null;
  page: Page;
  profile: Profile | null;
  subTab: Record<SubTabPage, Side>;
  setPage(p: Page): void;
  setSubTab(page: SubTabPage, side: Side): void;
  loadProfile(): Promise<void>;
  subscribe(): () => void;
  /** Clone → mutate → validate; applies locally at once and sends to the engine after DEBOUNCE_MS. */
  updateProfile(mutate: (draft: Profile) => void): void;
  /** Sends the current profile now, cancelling any pending debounce. */
  flushProfile(): void;
}

let pending: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<State>((set, get) => {
  const send = () => {
    pending = null;
    const p = get().profile;
    if (!p) return;
    window.dualforge.setProfile(p).catch((err: unknown) => set({ lastError: { code: 'E_PROFILE_SEND', msg: String(err) } }));
  };
  return {
    snapshot: null, lastError: null, page: 'home', profile: null,
    subTab: { sticks: 'left', triggers: 'left' },
    setPage: (page) => set({ page }),
    setSubTab: (page, side) => set((s) => ({ subTab: { ...s.subTab, [page]: side } })),
    loadProfile: async () => set({ profile: await window.dualforge.getProfile() }),
    subscribe: () => window.dualforge.onEngineEvent((e) => {
      if (e.type === 'snapshot') set({ snapshot: e.snapshot });
      else if (e.type === 'error') set({ lastError: { code: e.code, msg: e.msg } });
    }),
    updateProfile: (mutate) => {
      const cur = get().profile;
      if (!cur) return;
      const draft = structuredClone(cur);
      mutate(draft);
      const parsed = ProfileSchema.safeParse(draft);
      if (!parsed.success) {
        set({ lastError: { code: 'E_PROFILE_INVALID', msg: parsed.error.issues.map((i) => i.message).join('; ') } });
        return;
      }
      set({ profile: parsed.data });
      if (pending) clearTimeout(pending);
      pending = setTimeout(send, DEBOUNCE_MS);
    },
    flushProfile: () => {
      if (pending) clearTimeout(pending);
      send();
    },
  };
});
