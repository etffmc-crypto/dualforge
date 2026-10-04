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

  function load(): Settings {
    try {
      const raw = readJsonFile(file);
      if (raw === undefined) return defaultSettings();
      const r = SettingsSchema.safeParse(raw);
      if (r.success) return r.data;
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
