import { contextBridge, ipcRenderer } from 'electron';
import type { EngineEvent, Profile, ProfileSummary, Settings } from '@dualforge/shared';

const api = {
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
  },
  replay: (path: string): Promise<void> => ipcRenderer.invoke('engine:replay', path),
  useDevice: (): Promise<void> => ipcRenderer.invoke('engine:useDevice'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
  },
};
contextBridge.exposeInMainWorld('dualforge', api);
export type DualforgeApi = typeof api;
