import { create } from 'zustand';
import type { EngineSnapshot, Profile } from '@dualforge/shared';

export type Page = 'home' | 'inputTest';

interface State {
  snapshot: EngineSnapshot | null;
  lastError: { code: string; msg: string } | null;
  page: Page;
  profile: Profile | null;
  setPage(p: Page): void;
  loadProfile(): Promise<void>;
  subscribe(): () => void;
}

export const useStore = create<State>((set) => ({
  snapshot: null, lastError: null, page: 'home', profile: null,
  setPage: (page) => set({ page }),
  loadProfile: async () => set({ profile: await window.dualforge.getProfile() }),
  subscribe: () => window.dualforge.onEngineEvent((e) => {
    if (e.type === 'snapshot') set({ snapshot: e.snapshot });
    else if (e.type === 'error') set({ lastError: { code: e.code, msg: e.msg } });
  }),
}));
