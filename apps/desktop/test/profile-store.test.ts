import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { defaultProfile } from '@dualforge/shared';
import { createProfileStore } from '../src/main/profile-store.js';
import { nodeIo } from '../src/main/json-file.js';
import { profileFromShareCode, shareCodeFor } from '../src/main/share.js';

let dir: string;
const log = { error: vi.fn(), warn: vi.fn() };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'df-prof-'));
  log.error.mockClear();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('profile store', () => {
  it('returns defaults for missing slots and lists 4 summaries', () => {
    const s = createProfileStore(dir, log);
    expect(s.list()).toEqual(
      [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `Profile ${n}`, slot: n })),
    );
    expect(s.get('p2')).toEqual(defaultProfile('p2', 'Profile 2'));
  });
  it('round-trips set/get across a fresh store instance', () => {
    const s = createProfileStore(dir, log);
    const p = defaultProfile('p3', 'Mine');
    p.sticks.left.deadzone.anti = 0.3;
    s.set(p);
    expect(createProfileStore(dir, log).get('p3')).toEqual(p);
    s.rename('p3', 'Renamed');
    expect(createProfileStore(dir, log).list()[2]!.name).toBe('Renamed');
  });
  it('adopt fills mappings missing from an imported profile with the defaults', () => {
    const s = createProfileStore(dir, log);
    const src = defaultProfile('x', 'Sparse') as unknown as { mappings: Record<string, unknown> };
    src.mappings = { cross: { targets: [{ type: 'none' }], turboHz: 5, continuous: false } };
    const p = s.adopt(src, 'p2');
    expect(Object.keys(p.mappings).length).toBe(
      Object.keys(defaultProfile('p2', 'x').mappings).length,
    );
    expect(p.mappings.cross).toEqual({
      targets: [{ type: 'none' }],
      turbo: { mode: 'hold', hz: 5 }, // a legacy turboHz is migrated on the way in
      continuous: false,
    });
    expect(p.mappings.circle).toEqual(defaultProfile('p2', 'x').mappings.circle);
  });
  it('rejects non-slot ids and invalid profiles', () => {
    const s = createProfileStore(dir, log);
    expect(() => s.get('../evil')).toThrow('E_PROFILE_ID');
    expect(() => s.set(defaultProfile('zzz', 'x'))).toThrow('E_PROFILE_ID');
    const bad = defaultProfile('p1', 'x');
    bad.name = '';
    expect(() => s.set(bad)).toThrow('E_PROFILE_SCHEMA');
  });
  it('is atomic: a failure mid-write keeps the old file and leaves no temp file', () => {
    const s = createProfileStore(dir, log, {
      ...nodeIo,
      renameSync() {
        throw new Error('boom');
      },
    });
    const good = createProfileStore(dir, log);
    good.set(defaultProfile('p1', 'Original'));
    expect(() => s.set(defaultProfile('p1', 'Changed'))).toThrow('boom');
    expect(createProfileStore(dir, log).get('p1').name).toBe('Original');
    expect(readdirSync(join(dir, 'profiles')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
  it('quarantines a corrupt file, logs E_PROFILE_SCHEMA and returns the default', () => {
    mkdirSync(join(dir, 'profiles'), { recursive: true });
    writeFileSync(join(dir, 'profiles', 'p1.json'), '{not json');
    writeFileSync(join(dir, 'profiles', 'p2.json'), JSON.stringify({ schemaVersion: 1, id: 'p2' }));
    const s = createProfileStore(dir, log);
    expect(s.get('p1')).toEqual(defaultProfile('p1', 'Profile 1'));
    expect(s.get('p2').name).toBe('Profile 2');
    expect(existsSync(join(dir, 'profiles', 'p1.json'))).toBe(false);
    expect(readdirSync(join(dir, 'profiles', 'corrupt'))).toHaveLength(2);
    expect(
      log.error.mock.calls.every((c) => (c[0] as { code: string }).code === 'E_PROFILE_SCHEMA'),
    ).toBe(true);
  });
  it('duplicate / reset / export / import', () => {
    const s = createProfileStore(dir, log);
    const p = defaultProfile('p1', 'Alpha');
    p.vibration.left = 42;
    s.set(p);
    const d = s.duplicate('p1', 'p4');
    expect(d.id).toBe('p4');
    expect(d.name).toBe('Alpha copy');
    expect(d.vibration.left).toBe(42);
    const f = join(dir, 'out.json');
    s.exportTo('p1', f);
    expect(JSON.parse(readFileSync(f, 'utf8'))).not.toHaveProperty('id');
    const imp = s.importFrom(f, 'p2');
    expect(imp.id).toBe('p2');
    expect(imp.name).toBe('Alpha');
    s.reset('p1');
    expect(s.get('p1').name).toBe('Profile 1');
    writeFileSync(f, '[]');
    expect(() => s.importFrom(f, 'p3')).toThrow('E_PROFILE_SCHEMA');
  });
  it('share codes round-trip with real zlib and reject decompression bombs', () => {
    const p = defaultProfile('p1', 'Shared');
    expect(profileFromShareCode(shareCodeFor(p)).name).toBe('Shared');
    const bomb =
      'DUALFORGE:' + deflateRawSync(Buffer.alloc(8 * 1024 * 1024, 0x20)).toString('base64url');
    expect(() => profileFromShareCode(bomb)).toThrow(/E_SHARE_CODE/);
  });
  it('setDeferred updates memory at once and coalesces rapid sets into one disk write', () => {
    vi.useFakeTimers();
    let renames = 0;
    const s = createProfileStore(dir, log, {
      ...nodeIo,
      renameSync(a, b) {
        renames++;
        nodeIo.renameSync(a, b);
      },
    });
    for (let i = 1; i <= 5; i++) s.setDeferred(defaultProfile('p1', `N${i}`));
    expect(s.get('p1').name).toBe('N5');
    expect(existsSync(join(dir, 'profiles', 'p1.json'))).toBe(false);
    vi.advanceTimersByTime(250);
    expect(renames).toBe(1);
    expect(createProfileStore(dir, log).get('p1').name).toBe('N5');
    s.setDeferred(defaultProfile('p2', 'Flushed'));
    s.flush();
    expect(createProfileStore(dir, log).get('p2').name).toBe('Flushed');
    vi.useRealTimers();
  });
  it('a failing deferred write is logged E_PROFILE_WRITE and does not throw', () => {
    vi.useFakeTimers();
    const s = createProfileStore(dir, log, {
      ...nodeIo,
      renameSync() {
        throw new Error('disk');
      },
    });
    s.setDeferred(defaultProfile('p1', 'X'));
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(
      log.error.mock.calls.some((c) => (c[0] as { code: string }).code === 'E_PROFILE_WRITE'),
    ).toBe(true);
    vi.useRealTimers();
  });
});
