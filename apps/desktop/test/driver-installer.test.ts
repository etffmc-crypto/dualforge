import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDriverInstaller, DRIVER_REPOS, MAX_DOWNLOAD_BYTES, parseSignature, registerDriverIpc, type DriverStatus } from '../src/main/driver-installer.js';

const VALID = JSON.stringify({ Status: 0, SignerCertificate: { Subject: 'CN="Nefarius Software Solutions e.U.", O="Nefarius Software Solutions e.U.", C=AT' } });
const BYTES = Buffer.from('MZ fake installer');

describe('parseSignature', () => {
  it('accepts a Valid signature from Nefarius (numeric or named status)', () => {
    expect(parseSignature(VALID)).toMatchObject({ ok: true });
    expect(parseSignature(JSON.stringify({ Status: 'Valid', SignerCertificate: { Subject: 'CN=Nefarius Software Solutions e.U.' } }))).toMatchObject({ ok: true });
  });
  it('rejects NotSigned, HashMismatch and other statuses', () => {
    expect(parseSignature(JSON.stringify({ Status: 2, SignerCertificate: null }))).toEqual({ ok: false, code: 'E_DRIVER_SIGNATURE', status: 'NotSigned' });
    expect(parseSignature(JSON.stringify({ Status: 3, SignerCertificate: { Subject: 'CN=Nefarius Software Solutions' } }))).toMatchObject({ ok: false, status: 'HashMismatch' });
    expect(parseSignature(JSON.stringify({ Status: 'NotTrusted', SignerCertificate: { Subject: 'CN=Nefarius Software Solutions' } }))).toMatchObject({ ok: false, code: 'E_DRIVER_SIGNATURE' });
  });
  it('rejects a valid signature from another signer', () => {
    expect(parseSignature(JSON.stringify({ Status: 0, SignerCertificate: { Subject: 'CN=Evil Corp' } }))).toMatchObject({ ok: false, code: 'E_DRIVER_SIGNER' });
    expect(parseSignature(JSON.stringify({ Status: 0, SignerCertificate: null }))).toMatchObject({ ok: false, code: 'E_DRIVER_SIGNER' });
  });
  it('rejects garbage output', () => {
    expect(parseSignature('not json')).toMatchObject({ ok: false, code: 'E_DRIVER_SIGNATURE' });
    expect(parseSignature('null')).toMatchObject({ ok: false, code: 'E_DRIVER_SIGNATURE' });
  });
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'df-drv-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function releaseJson(assets: unknown[]) { return new Response(JSON.stringify({ assets }), { status: 200 }); }
function bodyResponse(chunks: Buffer[], headers: Record<string, string> = {}) {
  return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new Uint8Array(ch)); c.close(); } }), { status: 200, headers });
}

function rig(opts: { fetchImpl?: typeof fetch; sig?: string; open?: string } = {}) {
  const events: DriverStatus[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const calls: string[] = [];
  const fetchImpl = opts.fetchImpl ?? (vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('https://api.github.com/')) return releaseJson([{ name: 'notes.txt', browser_download_url: 'https://github.com/x/notes.txt' }, { name: 'HidHide_1.5.exe', browser_download_url: 'https://github.com/nefarius/HidHide/releases/download/v1/HidHide_1.5.exe' }]);
    return bodyResponse([BYTES.subarray(0, 5), BYTES.subarray(5)], { 'content-length': String(BYTES.length) });
  }) as unknown as typeof fetch);
  const exec = vi.fn(async () => ({ stdout: opts.sig ?? VALID }));
  const openPath = vi.fn(async () => opts.open ?? '');
  const inst = createDriverInstaller({ fetch: fetchImpl, exec, openPath, dir, emit: (s) => events.push(s), log });
  return { inst, events, log, exec, openPath, fetchImpl, calls };
}

describe('driver installer', () => {
  it('starts idle for both drivers', () => {
    expect(rig().inst.status()).toEqual({ vigem: { driver: 'vigem', state: 'idle' }, hidhide: { driver: 'hidhide', state: 'idle' } });
  });

  it('happy path: release lookup, download, hash, signature, launch; emits ordered states', async () => {
    const r = rig();
    const res = await r.inst.install('hidhide');
    expect(r.calls[0]).toBe(`https://api.github.com/repos/${DRIVER_REPOS.hidhide}/releases/latest`);
    expect(res).toMatchObject({ driver: 'hidhide', state: 'done', sha256: createHash('sha256').update(BYTES).digest('hex'), url: expect.stringContaining('HidHide_1.5.exe') });
    expect(r.events.map((e) => e.state)).toEqual(expect.arrayContaining(['downloading', 'verifying', 'launching', 'done']));
    const order = ['downloading', 'verifying', 'launching', 'done'].map((s) => r.events.findIndex((e) => e.state === s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(r.events.some((e) => e.state === 'downloading' && e.pct === 100)).toBe(true);
    const runDir = join(dir, readdirSync(dir)[0]!);
    expect(readdirSync(dir)).toHaveLength(1);
    expect(readFileSync(join(runDir, 'HidHide_1.5.exe'))).toEqual(BYTES);
    expect(r.openPath).toHaveBeenCalledWith(join(runDir, 'HidHide_1.5.exe'));
    expect(r.log.info).toHaveBeenCalledWith(expect.objectContaining({ code: 'DRIVER_DOWNLOADED', sha256: res.sha256 }));
    expect(r.inst.status().hidhide.state).toBe('done');
    const args = (r.exec.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args.join(' ')).toContain("Get-AuthenticodeSignature -FilePath '");
  });

  it('sends the User-Agent header to GitHub', async () => {
    const r = rig();
    await r.inst.install('vigem');
    const init = (r.fetchImpl as unknown as { mock: { calls: [unknown, { headers: Record<string, string> }][] } }).mock.calls[0]![1];
    expect(init.headers['User-Agent']).toBe('DualForge');
  });

  it('never launches and deletes the file when the signature is bad', async () => {
    const r = rig({ sig: JSON.stringify({ Status: 3, SignerCertificate: { Subject: 'CN=Nefarius Software Solutions' } }) });
    const res = await r.inst.install('hidhide');
    expect(res).toMatchObject({ state: 'failed', code: 'E_DRIVER_SIGNATURE' });
    expect(r.openPath).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);   // the whole run folder is removed
  });

  it('never launches for a wrong signer', async () => {
    const r = rig({ sig: JSON.stringify({ Status: 0, SignerCertificate: { Subject: 'CN=Someone Else' } }) });
    expect(await r.inst.install('hidhide')).toMatchObject({ state: 'failed', code: 'E_DRIVER_SIGNER' });
    expect(r.openPath).not.toHaveBeenCalled();
  });

  it('fails closed when PowerShell cannot be run', async () => {
    const r = rig();
    const inst = createDriverInstaller({ fetch: r.fetchImpl, exec: async () => { throw new Error('boom'); }, openPath: r.openPath, dir, emit: () => {}, log: r.log });
    expect(await inst.install('hidhide')).toMatchObject({ state: 'failed', code: 'E_DRIVER_SIGNATURE' });
    expect(r.openPath).not.toHaveBeenCalled();
  });

  it('reports E_DRIVER_LAUNCH when openPath fails', async () => {
    const r = rig({ open: 'The operation was canceled by the user' });
    expect(await r.inst.install('hidhide')).toMatchObject({ state: 'failed', code: 'E_DRIVER_LAUNCH', sha256: expect.any(String) });
  });

  it('E_DRIVER_FETCH on a GitHub error or network failure, E_DRIVER_NO_ASSET without an exe', async () => {
    const a = rig({ fetchImpl: (async () => new Response('', { status: 403 })) as unknown as typeof fetch });
    expect(await a.inst.install('vigem')).toMatchObject({ state: 'failed', code: 'E_DRIVER_FETCH' });
    const b = rig({ fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    expect(await b.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_FETCH' });
    const c = rig({ fetchImpl: (async () => releaseJson([{ name: 'a.zip', browser_download_url: 'https://github.com/a.zip' }])) as unknown as typeof fetch });
    expect(await c.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_NO_ASSET' });
  });

  it('ignores exe assets that are not served from github.com and unsafe names', async () => {
    const a = rig({ fetchImpl: (async () => releaseJson([{ name: 'x.exe', browser_download_url: 'https://evil.example/x.exe' }])) as unknown as typeof fetch });
    expect(await a.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_NO_ASSET' });
    const b = rig({ fetchImpl: (async () => releaseJson([{ name: '..\\..\\evil.exe', browser_download_url: 'https://github.com/evil.exe' }])) as unknown as typeof fetch });
    expect(await b.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_NO_ASSET' });
  });

  it('enforces the 50 MB cap by content-length and by streamed bytes', async () => {
    const mk = (headers: Record<string, string>, chunks: Buffer[]) => (async (u: string | URL | Request) =>
      String(u).startsWith('https://api.github.com/')
        ? releaseJson([{ name: 'big.exe', browser_download_url: 'https://github.com/nefarius/ViGEmBus/releases/download/v1/big.exe' }])
        : bodyResponse(chunks, headers)) as unknown as typeof fetch;
    const a = rig({ fetchImpl: mk({ 'content-length': String(MAX_DOWNLOAD_BYTES + 1) }, [BYTES]) });
    expect(await a.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_TOO_LARGE' });
    const big = Buffer.alloc(1024 * 1024);
    const b = rig({ fetchImpl: mk({}, Array.from({ length: 51 }, () => big)) });
    expect(await b.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_TOO_LARGE' });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('refuses a launch when the file changed after verification (E_DRIVER_TAMPERED) and deletes it', async () => {
    const r = rig();
    const exec = vi.fn(async (_f: string, args: string[]) => {
      const p = /-FilePath '([^']+)'/.exec(args.join(' '))![1]!;
      writeFileSync(p, 'swapped');
      return { stdout: VALID };
    });
    const inst = createDriverInstaller({ fetch: r.fetchImpl, exec, openPath: r.openPath, dir, emit: () => {}, log: r.log });
    expect(await inst.install('hidhide')).toMatchObject({ state: 'failed', code: 'E_DRIVER_TAMPERED' });
    expect(r.openPath).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);
  });

  describe('redirects', () => {
    const START = 'https://github.com/nefarius/HidHide/releases/download/v1/HidHide_1.5.exe';
    const mk = (hops: Record<string, Response | (() => Response)>) => vi.fn(async (u: string | URL | Request) => {
      const k = String(u);
      if (k.startsWith('https://api.github.com/')) return releaseJson([{ name: 'HidHide_1.5.exe', browser_download_url: START }]);
      const h = hops[k];
      if (!h) throw new Error('unexpected ' + k);
      return typeof h === 'function' ? h() : h;
    }) as unknown as typeof fetch;
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    it('follows a valid two-hop redirect chain manually', async () => {
      const f = mk({
        [START]: redirect('https://objects.githubusercontent.com/a'),
        'https://objects.githubusercontent.com/a': redirect('https://release-assets.githubusercontent.com/b'),
        'https://release-assets.githubusercontent.com/b': () => bodyResponse([BYTES], { 'content-length': String(BYTES.length) }),
      });
      const r = rig({ fetchImpl: f });
      expect(await r.inst.install('hidhide')).toMatchObject({ state: 'done' });
      expect((f as unknown as { mock: { calls: [unknown, { redirect: string }][] } }).mock.calls[1]![1].redirect).toBe('manual');
    });
    it('a redirect to a foreign host is E_DRIVER_URL and nothing is launched', async () => {
      const r = rig({ fetchImpl: mk({ [START]: redirect('https://evil.example/x.exe') }) });
      expect(await r.inst.install('hidhide')).toMatchObject({ state: 'failed', code: 'E_DRIVER_URL' });
      expect(r.openPath).not.toHaveBeenCalled();
    });
    it('rejects http hops, a missing location and more than 3 hops', async () => {
      expect(await rig({ fetchImpl: mk({ [START]: redirect('http://objects.githubusercontent.com/a') }) }).inst.install('hidhide')).toMatchObject({ code: 'E_DRIVER_URL' });
      expect(await rig({ fetchImpl: mk({ [START]: new Response(null, { status: 302 }) }) }).inst.install('hidhide')).toMatchObject({ code: 'E_DRIVER_URL' });
      const c = 'https://objects.githubusercontent.com/';
      const f = mk({ [START]: redirect(c + '1'), [c + '1']: redirect(c + '2'), [c + '2']: redirect(c + '3'), [c + '3']: redirect(c + '4'), [c + '4']: () => bodyResponse([BYTES]) });
      expect(await rig({ fetchImpl: f }).inst.install('hidhide')).toMatchObject({ code: 'E_DRIVER_URL' });
    });
    it('the initial URL must be a Nefarius release path on github.com', async () => {
      const f = (async (u: string | URL | Request) => String(u).startsWith('https://api.')
        ? releaseJson([{ name: 'x.exe', browser_download_url: 'https://github.com/someone/else/releases/download/v1/x.exe' }]) : bodyResponse([BYTES])) as unknown as typeof fetch;
      expect(await rig({ fetchImpl: f }).inst.install('hidhide')).toMatchObject({ code: 'E_DRIVER_NO_ASSET' });
    });
  });

  it('a second click while installing does not start another download', async () => {
    const r = rig();
    const [a, b] = await Promise.all([r.inst.install('hidhide'), r.inst.install('hidhide')]);
    expect(r.calls.filter((u) => u.startsWith('https://api.github.com/'))).toHaveLength(1);
    expect(a.state === 'done' || b.state === 'done').toBe(true);
  });
});

describe('release lookup (consent card size)', () => {
  const asset = (extra: object) => [{ name: 'HidHide_1.5.exe', browser_download_url: 'https://github.com/nefarius/HidHide/releases/download/v1/HidHide_1.5.exe', ...extra }];

  it('returns name, url and the GitHub asset size; only the metadata API is fetched', async () => {
    const calls: string[] = [];
    const r = rig({ fetchImpl: (async (u: string) => { calls.push(String(u)); return releaseJson(asset({ size: 4_404_224 })); }) as unknown as typeof fetch });
    expect(await r.inst.release('hidhide')).toEqual({ name: 'HidHide_1.5.exe', url: expect.stringContaining('/HidHide_1.5.exe'), size: 4_404_224 });
    expect(calls).toEqual([`https://api.github.com/repos/${DRIVER_REPOS.hidhide}/releases/latest`]);
    expect(readdirSync(dir)).toEqual([]);   // nothing downloaded or written
  });

  it('size is null when missing or nonsense', async () => {
    for (const size of [undefined, 'big', -1, 0, 1.5]) {
      const r = rig({ fetchImpl: (async () => releaseJson(asset({ size }))) as unknown as typeof fetch });
      expect((await r.inst.release('hidhide')).size).toBeNull();
    }
  });

  it('a failed lookup rejects with its code and is logged', async () => {
    const r = rig({ fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    await expect(r.inst.release('vigem')).rejects.toThrow('E_DRIVER_FETCH');
    expect(r.log.warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_DRIVER_FETCH', driver: 'vigem' }));
    const n = rig({ fetchImpl: (async () => releaseJson([])) as unknown as typeof fetch });
    await expect(n.inst.release('vigem')).rejects.toThrow('E_DRIVER_NO_ASSET');
  });
});

describe('driver IPC', () => {
  it('drivers:release is zod-validated and returns the lookup', async () => {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const release = vi.fn(async () => ({ name: 'x.exe', url: 'https://github.com/x', size: 1 }));
    registerDriverIpc({ ipc: { handle: (c, f) => { handlers.set(c, f); } }, installer: { install: vi.fn(), status: vi.fn(), release } as never, log: { error: vi.fn() } });
    for (const bad of [{ driver: 'evil' }, { driver: 'vigem', url: 'x' }, null]) expect(() => handlers.get('drivers:release')!({}, bad)).toThrow('E_DRIVER_REQUEST');
    expect(release).not.toHaveBeenCalled();
    expect(await handlers.get('drivers:release')!({}, { driver: 'hidhide' })).toEqual({ name: 'x.exe', url: 'https://github.com/x', size: 1 });
    expect(release).toHaveBeenCalledWith('hidhide');
  });

  it('validates the request with zod; install and status', async () => {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
    const install = vi.fn(async (d: string) => ({ driver: d, state: 'done' }));
    const log = { error: vi.fn() };
    registerDriverIpc({ ipc: { handle: (c, f) => { handlers.set(c, f); } }, installer: { install, status: () => ({ idle: true }) } as never, log });
    expect(() => handlers.get('driver:install')!({}, { driver: 'evil' })).toThrow('E_DRIVER_REQUEST');
    expect(() => handlers.get('driver:install')!({}, { driver: 'vigem', url: 'http://x' })).toThrow('E_DRIVER_REQUEST');
    expect(install).not.toHaveBeenCalled();
    await handlers.get('driver:install')!({}, { driver: 'hidhide' });
    expect(install).toHaveBeenCalledWith('hidhide');
    expect(handlers.get('driver:status:get')!({})).toEqual({ idle: true });
  });
});
