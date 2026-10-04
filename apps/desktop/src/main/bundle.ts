import { createWriteStream, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, posix } from 'node:path';
import { ZipFile } from 'yazl';
import type { HealthState } from '@dualforge/shared';

export const BUNDLE_CAP_BYTES = 50 * 1024 * 1024;
export const BUNDLE_LOG_DAYS = 7;

export interface BundleEntry {
  /** Path inside the zip (forward slashes). */
  name: string;
  size: number;
  mtimeMs: number;
  kind: 'log' | 'crash' | 'profile' | 'settings' | 'health' | 'system';
  /** On-disk source for file entries. */
  path?: string;
  /** In-memory content for generated entries. */
  data?: string;
}
export interface BundlePlan { include: BundleEntry[]; skipped: string[] }

/**
 * Chooses what goes in under `cap` bytes (uncompressed). Profiles, settings, health.json and system.json are tiny and always kept;
 * crash dumps come next, then logs, each newest first, so the oldest files are the ones dropped.
 */
export function planBundle(entries: readonly BundleEntry[], cap: number = BUNDLE_CAP_BYTES): BundlePlan {
  const include: BundleEntry[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const x of entries) if (x.kind !== 'log' && x.kind !== 'crash') { include.push(x); total += x.size; }
  for (const kind of ['crash', 'log'] as const) {
    const group = entries.filter((x) => x.kind === kind).sort((a, b) => b.mtimeMs - a.mtimeMs);
    let full = false;
    for (const x of group) {
      if (!full && total + x.size <= cap) { include.push(x); total += x.size; }
      else { full = true; skipped.push(x.name); }   // once one file does not fit, every older one in the group is skipped too
    }
  }
  return { include, skipped };
}

export interface CollectOpts {
  logDir: string;
  crashDir: string;
  dataDir: string;
  now: number;
  health: HealthState | null;
  system: object;
}

function listFiles(dir: string, rel = ''): { rel: string; full: string; size: number; mtimeMs: number }[] {
  const out: { rel: string; full: string; size: number; mtimeMs: number }[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const full = join(dir, n);
    try {
      const st = statSync(full);
      if (st.isDirectory()) out.push(...listFiles(full, posix.join(rel, n)));
      else out.push({ rel: posix.join(rel, n), full, size: st.size, mtimeMs: st.mtimeMs });
    } catch { /* vanished while scanning */ }
  }
  return out;
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);

/** Gathers candidate entries from disk (missing folders are fine) plus the generated health.json and system.json. */
export function collectEntries(o: CollectOpts): BundleEntry[] {
  const out: BundleEntry[] = [];
  const cutoff = o.now - BUNDLE_LOG_DAYS * 86_400_000;
  for (const f of listFiles(o.logDir)) {
    if (/^app.*\.log$/.test(f.rel) && f.mtimeMs >= cutoff) out.push({ name: `logs/${f.rel}`, size: f.size, mtimeMs: f.mtimeMs, kind: 'log', path: f.full });
  }
  for (const f of listFiles(o.crashDir)) out.push({ name: `crashes/${f.rel}`, size: f.size, mtimeMs: f.mtimeMs, kind: 'crash', path: f.full });
  for (const f of listFiles(join(o.dataDir, 'profiles'))) {
    if (!f.rel.includes('/') && f.rel.endsWith('.json')) out.push({ name: `profiles/${f.rel}`, size: f.size, mtimeMs: f.mtimeMs, kind: 'profile', path: f.full });
  }
  try {
    const p = join(o.dataDir, 'settings.json');
    const st = statSync(p);
    out.push({ name: 'settings.json', size: st.size, mtimeMs: st.mtimeMs, kind: 'settings', path: p });
  } catch { /* no settings yet */ }
  const h = json(o.health), s = json(o.system);
  out.push({ name: 'health.json', size: Buffer.byteLength(h), mtimeMs: o.now, kind: 'health', data: h });
  out.push({ name: 'system.json', size: Buffer.byteLength(s), mtimeMs: o.now, kind: 'system', data: s });
  return out;
}

export interface WriteResult { path: string; files: number; bytes: number }

/** Writes the zip; on any failure the partial file is removed and E_BUNDLE_WRITE is thrown. */
export function writeBundle(dest: string, entries: readonly BundleEntry[]): Promise<WriteResult> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    const out = createWriteStream(dest);
    let settled = false;
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      out.destroy();
      try { unlinkSync(dest); } catch { /* may not exist */ }
      reject(Object.assign(new Error('E_BUNDLE_WRITE'), { cause: e }));
    };
    zip.on('error', fail);
    out.on('error', fail);
    out.on('close', () => {
      if (settled) return;
      settled = true;
      try { resolve({ path: dest, files: entries.length, bytes: statSync(dest).size }); } catch (e) { reject(Object.assign(new Error('E_BUNDLE_WRITE'), { cause: e })); }
    });
    zip.outputStream.on('error', fail);
    zip.outputStream.pipe(out);
    try {
      for (const x of entries) {
        if (x.data !== undefined) zip.addBuffer(Buffer.from(x.data, 'utf8'), x.name, { mtime: new Date(x.mtimeMs) });
        else if (x.path) zip.addFile(x.path, x.name);
      }
      zip.end();
    } catch (e) { fail(e as Error); }
  });
}

export interface SystemInfoDeps {
  appVersion: string;
  vigemState: string;
  addonAvailable: boolean;
  foregroundElevatedExport: boolean;
  os: { platform(): string; release(): string; arch(): string; cpus(): unknown[]; totalmem(): number };
  versions: Record<string, string | undefined>;
}

/** Machine facts useful for support. No host name, user name, paths or environment variables. */
export function buildSystemInfo(d: SystemInfoDeps) {
  return {
    generatedAt: new Date().toISOString(),
    appVersion: d.appVersion,
    os: { platform: d.os.platform(), release: d.os.release(), arch: d.os.arch(), cpus: d.os.cpus().length, totalMemBytes: d.os.totalmem() },
    versions: { ...d.versions },
    addon: { abi: d.versions.modules ?? null, loaded: d.addonAvailable, hasForegroundElevated: d.foregroundElevatedExport },
    drivers: { vigemBusService: d.vigemState },
  };
}

export interface BundleSummary extends WriteResult { skipped: string[] }

export interface ExporterDeps {
  logDir: string;
  crashDir: string;
  dataDir: string;
  dialog: { showSaveDialog(opts: object): Promise<{ canceled: boolean; filePath?: string }> };
  log: { error(o: object): void; info(o: object): void };
  now: () => number;
  health: () => Promise<HealthState | null>;
  system: () => Promise<object>;
  cap?: number;
}

export function createBundleExporter(d: ExporterDeps) {
  async function probe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); }
    catch (e) { d.log.error({ code: 'E_BUNDLE_COLLECT', msg: `${what}: ${(e as Error).message}` }); return fallback; }
  }

  async function exportTo(dest: string): Promise<BundleSummary> {
    const health = await probe('health', d.health, null);
    const system = await probe('system', d.system, { error: 'unavailable' });
    const plan = planBundle(collectEntries({ logDir: d.logDir, crashDir: d.crashDir, dataDir: d.dataDir, now: d.now(), health, system }), d.cap ?? BUNDLE_CAP_BYTES);
    try {
      const r = await writeBundle(dest, plan.include);
      d.log.info({ code: 'BUNDLE_WRITTEN', files: r.files, bytes: r.bytes, skipped: plan.skipped.length });
      return { ...r, skipped: plan.skipped };
    } catch (e) {
      d.log.error({ code: 'E_BUNDLE_WRITE', msg: ((e as { cause?: Error }).cause ?? (e as Error)).message });
      throw e;
    }
  }

  return {
    exportTo,
    /** Save dialog, then the zip. Null when the user cancels. */
    async exportWithDialog(): Promise<BundleSummary | null> {
      const stamp = new Date(d.now()).toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
      const r = await d.dialog.showSaveDialog({ defaultPath: `dualforge-diagnostics-${stamp}.zip`, filters: [{ name: 'DualForge diagnostics', extensions: ['zip'] }] });
      if (r.canceled || !r.filePath) return null;
      return exportTo(r.filePath);
    },
  };
}
export type BundleExporter = ReturnType<typeof createBundleExporter>;
