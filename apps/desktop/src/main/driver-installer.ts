import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { defaultExec, POWERSHELL_EXE, type Exec } from './health/adapters.js';

export const DRIVER_IDS = ['vigem', 'hidhide'] as const;
export type DriverId = (typeof DRIVER_IDS)[number];
export const DriverInstallSchema = z.object({ driver: z.enum(DRIVER_IDS) }).strict();

export const DRIVER_REPOS: Record<DriverId, string> = { vigem: 'nefarius/ViGEmBus', hidhide: 'nefarius/HidHide' };
export const SIGNER = 'Nefarius Software Solutions';
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
export const SIGNATURE_TIMEOUT_MS = 30_000;

export type DriverState = 'idle' | 'downloading' | 'verifying' | 'launching' | 'done' | 'failed';
export interface DriverStatus { driver: DriverId; state: DriverState; pct?: number; code?: string; sha256?: string; url?: string }
export interface ReleaseAsset { name: string; url: string }

/** Windows PowerShell 5.1 serialises the SignatureStatus enum as a number; newer hosts use the name. */
const STATUS_NAMES = ['Valid', 'UnknownError', 'NotSigned', 'HashMismatch', 'NotTrusted', 'NotSupportedFileFormat', 'Incompatible'];

export type SignatureVerdict = { ok: true; subject: string } | { ok: false; code: 'E_DRIVER_SIGNATURE' | 'E_DRIVER_SIGNER'; status: string };

/** Parses `Get-AuthenticodeSignature | ConvertTo-Json`: signature must be Valid and the signer must be Nefarius. */
export function parseSignature(json: string): SignatureVerdict {
  let o: { Status?: unknown; SignerCertificate?: { Subject?: unknown } | null };
  try { o = JSON.parse(json) as typeof o; } catch { return { ok: false, code: 'E_DRIVER_SIGNATURE', status: 'Unparseable' }; }
  if (!o || typeof o !== 'object') return { ok: false, code: 'E_DRIVER_SIGNATURE', status: 'Unparseable' };
  const status = typeof o.Status === 'number' ? (STATUS_NAMES[o.Status] ?? `Unknown(${o.Status})`) : String(o.Status);
  if (status !== 'Valid') return { ok: false, code: 'E_DRIVER_SIGNATURE', status };
  const subject = typeof o.SignerCertificate?.Subject === 'string' ? o.SignerCertificate.Subject : '';
  if (!subject.includes(SIGNER)) return { ok: false, code: 'E_DRIVER_SIGNER', status };
  return { ok: true, subject };
}

export interface InstallerDeps {
  fetch: typeof fetch;
  exec?: Exec;
  /** shell.openPath semantics: '' on success, otherwise an error string. */
  openPath: (p: string) => Promise<string>;
  /** Download folder (%TEMP%\DualForge). */
  dir: string;
  emit: (s: DriverStatus) => void;
  log: { info(o: object): void; warn(o: object): void; error(o: object): void };
}

class InstallError extends Error { constructor(readonly code: string, msg: string) { super(msg); } }

const SAFE_ASSET = /^[\w][\w.\- ]{0,120}\.exe$/i;

export function createDriverInstaller(d: InstallerDeps) {
  const exec = d.exec ?? defaultExec;
  const status: Record<DriverId, DriverStatus> = { vigem: { driver: 'vigem', state: 'idle' }, hidhide: { driver: 'hidhide', state: 'idle' } };
  const busy = new Set<DriverId>();
  const set = (s: DriverStatus): DriverStatus => { status[s.driver] = s; d.emit(s); return s; };

  /** First `.exe` asset of the repository's latest release. */
  async function fetchLatestRelease(repo: string): Promise<ReleaseAsset> {
    let res: Response;
    try {
      res = await d.fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'User-Agent': 'DualForge', Accept: 'application/vnd.github+json' } });
    } catch (e) { throw new InstallError('E_DRIVER_FETCH', (e as Error).message); }
    if (!res.ok) throw new InstallError('E_DRIVER_FETCH', `GitHub answered ${res.status}`);
    const body = (await res.json().catch(() => null)) as { assets?: { name?: unknown; browser_download_url?: unknown }[] } | null;
    for (const a of body?.assets ?? []) {
      if (typeof a.name !== 'string' || typeof a.browser_download_url !== 'string' || !a.name.toLowerCase().endsWith('.exe')) continue;
      let host = '';
      try { const u = new URL(a.browser_download_url); host = u.protocol === 'https:' ? u.hostname : ''; } catch { /* bad url */ }
      if (host !== 'github.com') continue;
      if (!SAFE_ASSET.test(a.name)) throw new InstallError('E_DRIVER_NO_ASSET', 'release asset has an unsafe file name');
      return { name: a.name, url: a.browser_download_url };
    }
    throw new InstallError('E_DRIVER_NO_ASSET', `no .exe asset in the latest ${repo} release`);
  }

  /** Streams to `dest`, capped at 50 MB; progress is a whole percent (when the size is known). */
  async function download(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
    let res: Response;
    try { res = await d.fetch(url, { headers: { 'User-Agent': 'DualForge' } }); }
    catch (e) { throw new InstallError('E_DRIVER_DOWNLOAD', (e as Error).message); }
    if (!res.ok || !res.body) throw new InstallError('E_DRIVER_DOWNLOAD', `download answered ${res.status}`);
    const total = Number(res.headers.get('content-length') ?? 0);
    if (total > MAX_DOWNLOAD_BYTES) throw new InstallError('E_DRIVER_TOO_LARGE', `installer is ${total} bytes (limit ${MAX_DOWNLOAD_BYTES})`);
    mkdirSync(d.dir, { recursive: true });
    let got = 0, lastPct = -1;
    const counter = async function* (src: AsyncIterable<Buffer>) {
      for await (const chunk of src) {
        got += chunk.length;
        if (got > MAX_DOWNLOAD_BYTES) throw new InstallError('E_DRIVER_TOO_LARGE', 'installer exceeded the size limit');
        if (total > 0) { const pct = Math.min(100, Math.floor((got / total) * 100)); if (pct !== lastPct) { lastPct = pct; onProgress(pct); } }
        yield chunk;
      }
    };
    try {
      await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(dest));
    } catch (e) {
      rmSync(dest, { force: true });
      throw e instanceof InstallError ? e : new InstallError('E_DRIVER_DOWNLOAD', (e as Error).message);
    }
  }

  async function sha256(file: string): Promise<string> {
    const h = createHash('sha256');
    await pipeline(createReadStream(file), h);
    return h.digest('hex');
  }

  async function verifySignature(file: string): Promise<SignatureVerdict> {
    const cmd = `(Get-AuthenticodeSignature -FilePath '${file.replace(/'/g, "''")}') | ConvertTo-Json`;
    try {
      return parseSignature((await exec(POWERSHELL_EXE, ['-NoProfile', '-Command', cmd], { timeoutMs: SIGNATURE_TIMEOUT_MS })).stdout);
    } catch (e) { d.log.warn({ code: 'E_DRIVER_SIGNATURE', msg: (e as Error).message }); return { ok: false, code: 'E_DRIVER_SIGNATURE', status: 'CheckFailed' }; }
  }

  /** Downloads, hashes, verifies the signer, then launches the installer (UAC). Only ever called from a user click. */
  async function install(driver: DriverId): Promise<DriverStatus> {
    if (busy.has(driver)) return status[driver];
    busy.add(driver);
    let file: string | null = null;
    let url: string | undefined;
    let hash: string | undefined;
    try {
      set({ driver, state: 'downloading', pct: 0 });
      const asset = await fetchLatestRelease(DRIVER_REPOS[driver]);
      const assetUrl = asset.url;
      url = assetUrl;
      file = join(d.dir, basename(asset.name));
      set({ driver, state: 'downloading', pct: 0, url: assetUrl });
      await download(asset.url, file, (pct) => set({ driver, state: 'downloading', pct, url: assetUrl }));
      set({ driver, state: 'verifying', url });
      hash = await sha256(file);
      d.log.info({ code: 'DRIVER_DOWNLOADED', driver, url, sha256: hash, file });
      const verdict = await verifySignature(file);
      if (!verdict.ok) throw new InstallError(verdict.code, `Authenticode status ${verdict.status}`);
      set({ driver, state: 'launching', url, sha256: hash });
      const err = await d.openPath(file);
      if (err) throw new InstallError('E_DRIVER_LAUNCH', err);
      d.log.info({ code: 'DRIVER_LAUNCHED', driver, sha256: hash });
      return set({ driver, state: 'done', url, sha256: hash });
    } catch (e) {
      const code = e instanceof InstallError ? e.code : 'E_DRIVER_DOWNLOAD';
      d.log.error({ code, msg: (e as Error).message, driver });
      // a file that failed verification is never left behind to be double-clicked
      if (file && code !== 'E_DRIVER_LAUNCH') rmSync(file, { force: true });
      return set({ driver, state: 'failed', code, ...(url ? { url } : {}), ...(hash ? { sha256: hash } : {}) });
    } finally { busy.delete(driver); }
  }

  return {
    install, fetchLatestRelease, download, sha256, verifySignature,
    status: (): Record<DriverId, DriverStatus> => ({ vigem: status.vigem, hidhide: status.hidhide }),
  };
}
export type DriverInstaller = ReturnType<typeof createDriverInstaller>;

type Handler = (event: unknown, ...args: unknown[]) => unknown;
/** `driver:install` is the consent click (zod-validated); `driver:status:get` returns both drivers' latest state. */
export function registerDriverIpc(d: { ipc: { handle(channel: string, fn: Handler): void }; installer: DriverInstaller; log: { error(o: object): void } }): void {
  d.ipc.handle('driver:install', (_e, raw) => {
    const p = DriverInstallSchema.safeParse(raw);
    if (!p.success) { d.log.error({ code: 'E_DRIVER_REQUEST', msg: 'driver:install rejected' }); throw new Error('E_DRIVER_REQUEST'); }
    return d.installer.install(p.data.driver);
  });
  d.ipc.handle('driver:status:get', () => d.installer.status());
}
