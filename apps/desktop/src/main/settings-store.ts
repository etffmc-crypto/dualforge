import { join } from 'node:path';
import {
  AutoSwitchRuleSchema,
  defaultSettings,
  emptyLicenseState,
  LicenseStateSchema,
  MAX_AUTO_SWITCH_RULES,
  type LicenseState,
  SettingsSchema,
  type Settings,
} from '@dualforge/shared';
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
  // The Pro license block lives in the same file but outside Settings: the renderer and the engine never see it, and
  // only main's LicenseService writes it (setLicense). Every settings write carries it along unchanged.
  let license: LicenseState = emptyLicenseState();
  const isEmpty = (l: LicenseState) => Object.values(l).every((v) => v === '');
  const body = (s: Settings): object => (isEmpty(license) ? s : { ...s, license });
  function readLicense(raw: unknown): void {
    const l =
      raw && typeof raw === 'object' && 'license' in raw
        ? LicenseStateSchema.safeParse((raw as { license: unknown }).license)
        : null;
    license = l?.success ? l.data : emptyLicenseState();
  }

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
      if (key === 'autoSwitch') {
        // One bad rule must not cost the user every other game rule: keep the valid ones, up to the cap.
        const rules = (raw as Record<string, unknown>)[key];
        if (Array.isArray(rules)) {
          merged[key] = rules
            .flatMap((r) => {
              const p = AutoSwitchRuleSchema.safeParse(r);
              return p.success ? [p.data] : [];
            })
            .slice(0, MAX_AUTO_SWITCH_RULES);
        }
        continue;
      }
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
      readLicense(raw);
      const r = SettingsSchema.safeParse(raw);
      if (r.success) return r.data;
      const salvaged = salvage(raw);
      if (salvaged) {
        // Keep the original for inspection, but do not lose the settings that were fine.
        quarantine(file, join(dir, 'corrupt'), log, 'E_SETTINGS_SALVAGED', r.error.message, io);
        try {
          writeJsonAtomic(file, body(salvaged), io);
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
      try {
        writeJsonAtomic(file, body(next), io);
      } catch (e) {
        log.error({ code: 'E_SETTINGS_WRITE', msg: (e as Error).message });
        throw new Error('E_SETTINGS_WRITE', { cause: e });
      }
      cache = next;
      return next;
    },
    getLicense(): LicenseState {
      this.get();
      return license;
    },
    /** LicenseService only. Throws E_SETTINGS_WRITE like set(); the cached block changes only once it is on disk. */
    setLicense(next: LicenseState): void {
      const s = this.get();
      const prev = license;
      license = LicenseStateSchema.parse(next);
      try {
        writeJsonAtomic(file, body(s), io);
      } catch (e) {
        license = prev;
        log.error({ code: 'E_SETTINGS_WRITE', msg: (e as Error).message });
        throw new Error('E_SETTINGS_WRITE', { cause: e });
      }
    },
  };
}
export type SettingsStore = ReturnType<typeof createSettingsStore>;
