import { join } from 'node:path';
import { defaultSettings, SettingsSchema, type Settings } from '@dualforge/shared';
import {
  nodeIo,
  quarantine,
  readJsonFile,
  writeJsonAtomic,
  type FileIo,
  type StoreLog,
} from './json-file.js';

export function createSettingsStore(dir: string, log: StoreLog, io: FileIo = nodeIo) {
  const file = join(dir, 'settings.json');
  let cache: Settings | null = null;

  /** Field-by-field recovery: defaults overlaid with every key that validates on its own; null when `raw` is not an object. */
  function salvage(raw: unknown): Settings | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const shape = SettingsSchema.shape as Record<
      string,
      { safeParse(v: unknown): { success: boolean; data?: unknown } }
    >;
    const merged: Record<string, unknown> = { ...defaultSettings() };
    for (const key of Object.keys(shape)) {
      if (!Object.hasOwn(raw, key)) continue;
      const f = shape[key]!.safeParse((raw as Record<string, unknown>)[key]);
      if (f.success) merged[key] = f.data;
    }
    const r = SettingsSchema.safeParse(merged);
    return r.success ? r.data : null;
  }

  function load(): Settings {
    try {
      const raw = readJsonFile(file);
      if (raw === undefined) return defaultSettings();
      const r = SettingsSchema.safeParse(raw);
      if (r.success) return r.data;
      const salvaged = salvage(raw);
      if (salvaged) {
        // Keep the original for inspection, but do not lose the settings that were fine.
        quarantine(file, join(dir, 'corrupt'), log, 'E_SETTINGS_SALVAGED', r.error.message, io);
        try {
          writeJsonAtomic(file, salvaged, io);
        } catch (e) {
          log.error({
            code: 'E_SETTINGS_SALVAGED',
            msg: `could not rewrite settings: ${(e as Error).message}`,
          });
        }
        return salvaged;
      }
      quarantine(file, join(dir, 'corrupt'), log, 'E_SETTINGS_SCHEMA', r.error.message, io);
    } catch (e) {
      quarantine(file, join(dir, 'corrupt'), log, 'E_SETTINGS_SCHEMA', (e as Error).message, io);
    }
    return defaultSettings();
  }

  return {
    get(): Settings {
      return (cache ??= load());
    },
    set(patch: Partial<Settings>): Settings {
      const next = SettingsSchema.parse({ ...this.get(), ...patch, schemaVersion: 1 });
      writeJsonAtomic(file, next, io);
      cache = next;
      return next;
    },
  };
}
export type SettingsStore = ReturnType<typeof createSettingsStore>;
