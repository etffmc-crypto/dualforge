import { z } from 'zod';
import { ProfileSchema, SettingsSchema, type EngineCommand, type Profile, type Settings } from '@dualforge/shared';
import type { ProfileStore } from './profile-store.js';
import { PROFILE_IDS } from './profile-store.js';
import type { SettingsStore } from './settings-store.js';
import { profileFromShareCode, shareCodeFor } from './share.js';

const IdSchema = z.enum(PROFILE_IDS);
const NameSchema = z.string().trim().min(1).max(40);
const CodeSchema = z.string().max(64 * 1024);
const PatchSchema = SettingsSchema.partial().strict();

type Handler = (event: unknown, ...args: unknown[]) => unknown;
export interface IpcLike { handle(channel: string, fn: Handler): void }
export interface DialogLike {
  showSaveDialog(opts: object): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>;
}
export interface IpcDeps {
  ipc: IpcLike;
  dialog: DialogLike;
  store: ProfileStore;
  settings: SettingsStore;
  engine: { send(cmd: EngineCommand): void };
  /** Tells the renderer which profile the engine is now running. */
  notifyActive: (id: string) => void;
  log: { error(o: object): void };
}

/** Every handler validates its input with zod in the main process; renderer data is never trusted. */
export function registerIpc(d: IpcDeps) {
  let engineProfileId = d.settings.get().activeProfile;

  /** Loads a profile into the engine without persisting it as the user's active profile (used by auto-switch). */
  function applyProfile(id: string): Profile {
    const p = d.store.get(id);
    engineProfileId = id;
    d.engine.send({ type: 'setProfile', profile: p });
    d.notifyActive(id);
    return p;
  }
  function activate(id: string): Profile {
    d.settings.set({ activeProfile: id });
    return applyProfile(id);
  }
  function saveProfile(raw: unknown): boolean {
    const parsed = ProfileSchema.safeParse(raw);
    if (!parsed.success) { d.log.error({ code: 'E_PROFILE_SCHEMA', msg: 'profiles:set rejected' }); throw new Error('E_PROFILE_SCHEMA'); }
    d.store.set(parsed.data);
    if (parsed.data.id === engineProfileId) d.engine.send({ type: 'setProfile', profile: d.store.get(engineProfileId) });
    return true;
  }
  const h = (ch: string, fn: (...a: unknown[]) => unknown) => d.ipc.handle(ch, (_e, ...a) => fn(...a));

  h('profiles:list', () => d.store.list());
  h('profiles:get', (id) => d.store.get(IdSchema.parse(id)));
  h('profiles:set', saveProfile);
  h('profiles:rename', (id, name) => { d.store.rename(IdSchema.parse(id), NameSchema.parse(name)); if (id === engineProfileId) d.engine.send({ type: 'setProfile', profile: d.store.get(engineProfileId) }); });
  h('profiles:duplicate', (from, to) => d.store.duplicate(IdSchema.parse(from), IdSchema.parse(to)));
  h('profiles:reset', (id) => {
    const pid = IdSchema.parse(id);
    d.store.reset(pid);
    if (pid === engineProfileId) d.engine.send({ type: 'setProfile', profile: d.store.get(pid) });
  });
  h('profiles:export', async (id) => {
    const pid = IdSchema.parse(id);
    const r = await d.dialog.showSaveDialog({ defaultPath: `${d.store.get(pid).name}.dualforge.json`, filters: [{ name: 'DualForge profile', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    d.store.exportTo(pid, r.filePath);
    return r.filePath;
  });
  h('profiles:import', async (toSlot) => {
    const slot = IdSchema.parse(toSlot);
    const r = await d.dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'DualForge profile', extensions: ['json'] }] });
    const f = r.filePaths[0];
    if (r.canceled || !f) return null;
    const p = d.store.importFrom(f, slot);
    if (slot === engineProfileId) d.engine.send({ type: 'setProfile', profile: p });
    return p;
  });
  h('profiles:shareCode', (id) => shareCodeFor(d.store.get(IdSchema.parse(id))));
  h('profiles:importShareCode', (code, toSlot) => {
    const slot = IdSchema.parse(toSlot);
    let decoded: Profile;
    try { decoded = profileFromShareCode(CodeSchema.parse(code)); }
    catch (e) { d.log.error({ code: 'E_SHARE_CODE', msg: (e as Error).message }); throw new Error('E_SHARE_CODE'); }
    const p = d.store.adopt(decoded, slot);
    if (slot === engineProfileId) d.engine.send({ type: 'setProfile', profile: p });
    return p;
  });
  h('profiles:activate', (id) => activate(IdSchema.parse(id)));
  h('settings:get', () => d.settings.get());
  h('settings:set', (patch) => {
    const parsed = PatchSchema.safeParse(patch);
    if (!parsed.success) { d.log.error({ code: 'E_SETTINGS_SCHEMA', msg: 'settings:set rejected' }); throw new Error('E_SETTINGS_SCHEMA'); }
    if (parsed.data.activeProfile !== undefined) IdSchema.parse(parsed.data.activeProfile);
    const next = d.settings.set(parsed.data as Partial<Settings>);
    d.engine.send({ type: 'setSettings', settings: next });
    if (parsed.data.activeProfile !== undefined) applyProfile(next.activeProfile);
    return next;
  });
  // Plan 1 channels, kept for the existing renderer: they act on the active profile.
  h('profile:get', () => d.store.get(d.settings.get().activeProfile));
  h('profile:set', saveProfile);

  return { applyProfile, activate, currentEngineProfile: () => engineProfileId };
}
