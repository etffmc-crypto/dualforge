import { contextBridge, ipcRenderer } from 'electron';
import type { EngineEvent, Profile } from '@dualforge/shared';

const api = {
  onEngineEvent(cb: (e: EngineEvent) => void): () => void {
    const h = (_: unknown, e: EngineEvent) => cb(e);
    ipcRenderer.on('engine:event', h);
    return () => ipcRenderer.removeListener('engine:event', h);
  },
  getProfile: (): Promise<Profile> => ipcRenderer.invoke('profile:get'),
  setProfile: (p: Profile): Promise<boolean> => ipcRenderer.invoke('profile:set', p),
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
