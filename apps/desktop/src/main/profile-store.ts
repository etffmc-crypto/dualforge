import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  defaultProfile,
  ensureDenseMappings,
  PROFILE_IDS,
  ProfileSchema,
  type Profile,
  type ProfileSummary,
} from '@dualforge/shared';
import {
  nodeIo,
  quarantine,
  readJsonFile,
  writeJsonAtomic,
  type FileIo,
  type StoreLog,
} from './json-file.js';

export { PROFILE_IDS };
const MAX_IMPORT_BYTES = 256 * 1024;

function slotOf(id: string): number {
  const i = PROFILE_IDS.indexOf(id as (typeof PROFILE_IDS)[number]);
  if (i < 0) throw new Error('E_PROFILE_ID');
  return i + 1;
}

export function createProfileStore(dir: string, log: StoreLog, io: FileIo = nodeIo) {
  const pdir = join(dir, 'profiles');
  const fileOf = (id: string) => join(pdir, `${id}.json`);
  const cache = new Map<string, Profile>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const DEBOUNCE_MS = 250;
  const cancel = (id: string) => {
    const t = pending.get(id);
    if (t) {
      clearTimeout(t);
      pending.delete(id);
    }
  };
  function persist(id: string) {
    cancel(id);
    const p = cache.get(id);
    if (!p) return;
    try {
      writeJsonAtomic(fileOf(id), p, io);
    } catch (e) {
      log.error({ code: 'E_PROFILE_WRITE', msg: (e as Error).message });
    }
  }

  function load(id: string): Profile {
    const n = slotOf(id);
    const fallback = () => defaultProfile(id, `Profile ${n}`);
    const f = fileOf(id);
    try {
      const raw = readJsonFile(f);
      if (raw === undefined) return fallback();
      const r = ProfileSchema.safeParse(raw);
      if (r.success) return { ...r.data, id };
      quarantine(f, join(pdir, 'corrupt'), log, 'E_PROFILE_SCHEMA', r.error.message, io);
    } catch (e) {
      quarantine(f, join(pdir, 'corrupt'), log, 'E_PROFILE_SCHEMA', (e as Error).message, io);
    }
    return fallback();
  }
  function get(id: string): Profile {
    slotOf(id);
    let p = cache.get(id);
    if (!p) {
      p = load(id);
      cache.set(id, p);
    }
    return structuredClone(p);
  }
  function validated(profile: Profile): Profile {
    slotOf(profile.id);
    const parsed = ProfileSchema.safeParse(profile);
    if (!parsed.success) throw new Error('E_PROFILE_SCHEMA');
    return parsed.data;
  }
  function set(profile: Profile): void {
    const p = validated(profile);
    cancel(p.id);
    writeJsonAtomic(fileOf(p.id), p, io);
    cache.set(p.id, structuredClone(p));
  }
  /** Updates the in-memory profile now; the disk write is debounced (250 ms trailing per id). Write errors are logged E_PROFILE_WRITE, never thrown. */
  function setDeferred(profile: Profile): void {
    const p = validated(profile);
    cache.set(p.id, structuredClone(p));
    cancel(p.id);
    pending.set(
      p.id,
      setTimeout(() => persist(p.id), DEBOUNCE_MS),
    );
  }
  function flush(): void {
    for (const id of [...pending.keys()]) persist(id);
  }
  /** Validates untrusted JSON text/object as a profile placed into `toSlot` (never throws raw zod errors); missing button mappings get their defaults. */
  function adopt(raw: unknown, toSlot: string): Profile {
    slotOf(toSlot);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new Error('E_PROFILE_SCHEMA');
    const r = ProfileSchema.safeParse({ ...raw, id: toSlot });
    if (!r.success) throw new Error('E_PROFILE_SCHEMA');
    set(ensureDenseMappings(r.data));
    return get(toSlot);
  }

  return {
    list(): ProfileSummary[] {
      return PROFILE_IDS.map((id, i) => ({ id, name: get(id).name, slot: i + 1 }));
    },
    get,
    set,
    setDeferred,
    flush,
    rename(id: string, name: string): void {
      set({ ...get(id), name });
    },
    duplicate(fromId: string, toSlot: string): Profile {
      const src = get(fromId);
      return adopt({ ...src, name: `${src.name} copy`.slice(0, 40) }, toSlot);
    },
    reset(id: string): void {
      slotOf(id);
      cancel(id);
      if (existsSync(fileOf(id))) io.unlinkSync(fileOf(id));
      cache.delete(id);
    },
    exportTo(id: string, filePath: string): void {
      const rest: Partial<Profile> = get(id);
      delete rest.id;
      writeJsonAtomic(filePath, rest, io);
    },
    importFrom(filePath: string, toSlot: string): Profile {
      if (statSync(filePath).size > MAX_IMPORT_BYTES) throw new Error('E_PROFILE_SCHEMA');
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(filePath, 'utf8'));
      } catch {
        throw new Error('E_PROFILE_SCHEMA');
      }
      return adopt(raw, toSlot);
    },
    /** For share-code import: profile from a decoded share code (fresh id is replaced by the slot id). */
    adopt,
  };
}
export type ProfileStore = ReturnType<typeof createProfileStore>;
