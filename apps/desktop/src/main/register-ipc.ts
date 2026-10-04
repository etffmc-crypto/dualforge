import { z } from 'zod';
import {
  PROFILE_IDS,
  ProfileSchema,
  SettingsSchema,
  TestRumbleSchema,
  type EngineCommand,
  type Profile,
  type Settings,
} from '@dualforge/shared';
import type { ProfileStore } from './profile-store.js';
import type { SettingsStore } from './settings-store.js';
import { profileFromShareCode, shareCodeFor } from './share.js';

const IdSchema = z.enum(PROFILE_IDS);
const NameSchema = z.string().trim().min(1).max(40);
const CodeSchema = z.string().max(64 * 1024);
const PatchSchema = SettingsSchema.partial().strict();
const MacroIdSchema = z.string().min(1).max(64);
const ProcessListSchema = z.array(z.string());

type Handler = (event: unknown, ...args: unknown[]) => unknown;
export interface IpcLike {
  handle(channel: string, fn: Handler): void;
}
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
  /** Running exe basenames for the auto-switch picker (see processes.ts). */
  processes: () => Promise<string[]>;
  /** Runs after settings:set persisted (HidHide, login item, tray); the reply waits for it and a rejection reaches the renderer. */
  /** Profile names or slots changed (rename, duplicate, reset, import, save, activate); the tray menu refreshes from it. */
  onProfilesChanged?: () => void;
  onSettingsChanged?: (prev: Settings, next: Settings) => void | Promise<void>;
}

/** Every handler validates its input with zod in the main process; renderer data is never trusted. */
export function registerIpc(d: IpcDeps) {
  let engineProfileId: string = d.settings.get().activeProfile;
  let engineSource: 'manual' | 'auto' = 'manual';

  /** Loads a profile into the engine without persisting it as the user's active profile (used by auto-switch). */
  function applyProfile(id: string, source: 'manual' | 'auto' = 'manual'): Profile {
    const p = d.store.get(id);
    engineProfileId = id;
    engineSource = source;
    d.engine.send({ type: 'setProfile', profile: p });
    d.notifyActive(id);
    d.onProfilesChanged?.();
    return p;
  }
  function activate(id: string): Profile {
    d.store.flush();
    d.settings.set({ activeProfile: IdSchema.parse(id) });
    return applyProfile(id);
  }
  function saveProfile(raw: unknown): boolean {
    const parsed = ProfileSchema.safeParse(raw);
    if (!parsed.success) {
      d.log.error({ code: 'E_PROFILE_SCHEMA', msg: 'profiles:set rejected' });
      throw new Error('E_PROFILE_SCHEMA');
    }
    d.store.setDeferred(parsed.data); // cache + engine first; the disk write is debounced and cannot block the update
    if (parsed.data.id === engineProfileId)
      d.engine.send({ type: 'setProfile', profile: d.store.get(engineProfileId) });
    d.onProfilesChanged?.();
    return true;
  }
  const h = (ch: string, fn: (...a: unknown[]) => unknown) =>
    d.ipc.handle(ch, (_e, ...a) => fn(...a));

  h('profiles:list', () => d.store.list());
  h('profiles:get', (id) => d.store.get(IdSchema.parse(id)));
  h('profiles:set', saveProfile);
  h('profiles:rename', (id, name) => {
    d.store.rename(IdSchema.parse(id), NameSchema.parse(name));
    if (id === engineProfileId)
      d.engine.send({ type: 'setProfile', profile: d.store.get(engineProfileId) });
    d.onProfilesChanged?.();
  });
  h('profiles:duplicate', (from, to) => {
    const slot = IdSchema.parse(to);
    const p = d.store.duplicate(IdSchema.parse(from), slot);
    if (slot === engineProfileId) d.engine.send({ type: 'setProfile', profile: p });
    d.onProfilesChanged?.();
    return p;
  });
  function resetProfile(id: unknown): void {
    const pid = IdSchema.parse(id);
    d.store.reset(pid);
    if (pid === engineProfileId) d.engine.send({ type: 'setProfile', profile: d.store.get(pid) });
    d.onProfilesChanged?.();
  }
  h('profiles:reset', resetProfile);
  h('profiles:export', async (id) => {
    const pid = IdSchema.parse(id);
    const r = await d.dialog.showSaveDialog({
      defaultPath: `${d.store.get(pid).name}.dualforge.json`,
      filters: [{ name: 'DualForge profile', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    d.store.exportTo(pid, r.filePath);
    return r.filePath;
  });
  h('profiles:import', async (toSlot) => {
    const slot = IdSchema.parse(toSlot);
    const r = await d.dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'DualForge profile', extensions: ['json'] }],
    });
    const f = r.filePaths[0];
    if (r.canceled || !f) return null;
    const p = d.store.importFrom(f, slot);
    if (slot === engineProfileId) d.engine.send({ type: 'setProfile', profile: p });
    d.onProfilesChanged?.();
    return p;
  });
  h('profiles:shareCode', (id) => shareCodeFor(d.store.get(IdSchema.parse(id))));
  h('profiles:importShareCode', (code, toSlot) => {
    const slot = IdSchema.parse(toSlot);
    let decoded: Profile;
    try {
      decoded = profileFromShareCode(CodeSchema.parse(code));
    } catch (e) {
      d.log.error({ code: 'E_SHARE_CODE', msg: (e as Error).message });
      throw new Error('E_SHARE_CODE');
    }
    const p = d.store.adopt(decoded, slot);
    if (slot === engineProfileId) d.engine.send({ type: 'setProfile', profile: p });
    d.onProfilesChanged?.();
    return p;
  });
  h('profiles:current', () => ({ id: engineProfileId, source: engineSource }));
  h('profiles:activate', (id) => activate(IdSchema.parse(id)));
  h('settings:get', () => d.settings.get());
  h('settings:set', (patch) => {
    const parsed = PatchSchema.safeParse(patch);
    if (!parsed.success) {
      d.log.error({ code: 'E_SETTINGS_SCHEMA', msg: 'settings:set rejected' });
      throw new Error('E_SETTINGS_SCHEMA');
    }
    if (parsed.data.activeProfile !== undefined) IdSchema.parse(parsed.data.activeProfile);
    const prev = d.settings.get();
    const next = d.settings.set(parsed.data as Partial<Settings>);
    d.engine.send({ type: 'setSettings', settings: next });
    if (parsed.data.activeProfile !== undefined) applyProfile(next.activeProfile);
    if (!d.onSettingsChanged) return next;
    return Promise.resolve(d.onSettingsChanged(prev, next)).then(() => d.settings.get());
  });
  h('system:processes', async () => {
    try {
      return ProcessListSchema.parse(await d.processes());
    } catch (e) {
      d.log.error({ code: 'E_PROCESSES', msg: (e as Error).message });
      throw new Error('E_PROCESSES');
    }
  });
  h('engine:runMacro', (id) => d.engine.send({ type: 'runMacro', id: MacroIdSchema.parse(id) }));
  h('engine:testRumble', (req) =>
    d.engine.send({ type: 'testRumble', ...TestRumbleSchema.parse(req) }),
  );
  // Plan 1 channels, kept for the existing renderer: they act on the profile the engine is running (so UI edits go live even during an auto-switch).
  h('profile:get', () => d.store.get(engineProfileId));
  h('profile:set', saveProfile);

  /** Health repair: reset a slot, and when it is the running one tell the renderer to reload it. */
  function repairResetProfile(id: string): void {
    resetProfile(id);
    if (id === engineProfileId) d.notifyActive(id);
  }

  return {
    applyProfile,
    activate,
    resetProfile: repairResetProfile,
    flush: () => d.store.flush(),
    currentEngineProfile: () => engineProfileId,
  };
}
