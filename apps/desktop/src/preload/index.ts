import { contextBridge, ipcRenderer } from 'electron';
import type { EngineEvent, HealthRepairRequest, HealthRepairResult, HealthState, Profile, ProfileSummary, Settings } from '@dualforge/shared';

const api = {
  /** Fixed at launch from main's environment (the sandboxed preload sees it); no IPC. */
  flags: {
    /** DUALFORGE_NAV_REPLAY=1: replayed input may drive gamepad navigation (tests only; off by default). */
    navReplay: process.env.DUALFORGE_NAV_REPLAY === '1',
  },
  onEngineEvent(cb: (e: EngineEvent) => void): () => void {
    const h = (_: unknown, e: EngineEvent) => cb(e);
    ipcRenderer.on('engine:event', h);
    return () => ipcRenderer.removeListener('engine:event', h);
  },
  getProfile: (): Promise<Profile> => ipcRenderer.invoke('profile:get'),
  setProfile: (p: Profile): Promise<boolean> => ipcRenderer.invoke('profile:set', p),
  profiles: {
    list: (): Promise<ProfileSummary[]> => ipcRenderer.invoke('profiles:list'),
    get: (id: string): Promise<Profile> => ipcRenderer.invoke('profiles:get', id),
    set: (p: Profile): Promise<boolean> => ipcRenderer.invoke('profiles:set', p),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('profiles:rename', id, name),
    duplicate: (from: string, toSlot: string): Promise<Profile> => ipcRenderer.invoke('profiles:duplicate', from, toSlot),
    reset: (id: string): Promise<void> => ipcRenderer.invoke('profiles:reset', id),
    export: (id: string): Promise<string | null> => ipcRenderer.invoke('profiles:export', id),
    import: (toSlot: string): Promise<Profile | null> => ipcRenderer.invoke('profiles:import', toSlot),
    shareCode: (id: string): Promise<string> => ipcRenderer.invoke('profiles:shareCode', id),
    importShareCode: (code: string, toSlot: string): Promise<Profile> => ipcRenderer.invoke('profiles:importShareCode', code, toSlot),
    activate: (id: string): Promise<Profile> => ipcRenderer.invoke('profiles:activate', id),
    /** The profile the engine is actually running, and whether it was chosen manually or by per-game auto-switch. */
    current: (): Promise<{ id: string; source: 'manual' | 'auto' }> => ipcRenderer.invoke('profiles:current'),
    /** Fires when the engine switches profile (manual activation or per-game auto-switch). */
    onActive(cb: (id: string) => void): () => void {
      const h = (_: unknown, id: string) => cb(id);
      ipcRenderer.on('profiles:active', h);
      return () => ipcRenderer.removeListener('profiles:active', h);
    },
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  },
  system: {
    /** Opens the folder holding profiles, settings and logs in Explorer. */
    openDataDir: (): Promise<string> => ipcRenderer.invoke('system:openDataDir'),
    /** Running programs (lowercased exe names, Windows/background processes left out) for the auto-switch picker. */
    processes: (): Promise<string[]> => ipcRenderer.invoke('system:processes'),
  },
  replay: (path: string): Promise<void> => ipcRenderer.invoke('engine:replay', path),
  useDevice: (): Promise<void> => ipcRenderer.invoke('engine:useDevice'),
  engine: {
    /** Plays a macro of the running profile once on the live pipeline (key/mouse steps are not injected while DualForge is focused). */
    runMacro: (id: string): Promise<void> => ipcRenderer.invoke('engine:runMacro', id),
    /** Plays both rumble motors at the given levels (0..1) for `ms` (50..2000); ignored when settings.hasRumble is off. */
    testRumble: (req: { left: number; right: number; ms: number }): Promise<void> => ipcRenderer.invoke('engine:testRumble', req),
  },
  health: {
    /** Cached check results (runs the checks first if none exist yet). */
    get: (): Promise<HealthState> => ipcRenderer.invoke('health:get'),
    run: (): Promise<HealthState> => ipcRenderer.invoke('health:run'),
    /** Asks where to save, then writes the diagnostics zip (logs, crashes, profiles, settings, health, system). Null if cancelled. */
    exportBundle: (): Promise<{ path: string; files: number; bytes: number; skipped: string[] } | null> => ipcRenderer.invoke('health:exportBundle'),
    repair: (req: HealthRepairRequest): Promise<HealthRepairResult> => ipcRenderer.invoke('health:repair', req),
    /** Fires after every check run (startup, every 5 min, on demand, after a repair). */
    onChanged(cb: (s: HealthState) => void): () => void {
      const h = (_: unknown, s: HealthState) => cb(s);
      ipcRenderer.on('health:changed', h);
      return () => ipcRenderer.removeListener('health:changed', h);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
  },
};
contextBridge.exposeInMainWorld('dualforge', api);
export type DualforgeApi = typeof api;
