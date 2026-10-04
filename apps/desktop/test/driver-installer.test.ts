import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    expect(readFileSync(join(dir, 'HidHide_1.5.exe'))).toEqual(BYTES);
    expect(r.openPath).toHaveBeenCalledWith(join(dir, 'HidHide_1.5.exe'));
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
    expect(existsSync(join(dir, 'HidHide_1.5.exe'))).toBe(false);
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
        ? releaseJson([{ name: 'big.exe', browser_download_url: 'https://github.com/big.exe' }])
        : bodyResponse(chunks, headers)) as unknown as typeof fetch;
    const a = rig({ fetchImpl: mk({ 'content-length': String(MAX_DOWNLOAD_BYTES + 1) }, [BYTES]) });
    expect(await a.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_TOO_LARGE' });
    const big = Buffer.alloc(1024 * 1024);
    const b = rig({ fetchImpl: mk({}, Array.from({ length: 51 }, () => big)) });
    expect(await b.inst.install('vigem')).toMatchObject({ code: 'E_DRIVER_TOO_LARGE' });
    expect(existsSync(join(dir, 'big.exe'))).toBe(false);
  });

  it('a second click while installing does not start another download', async () => {
    const r = rig();
    const [a, b] = await Promise.all([r.inst.install('hidhide'), r.inst.install('hidhide')]);
    expect(r.calls.filter((u) => u.startsWith('https://api.github.com/'))).toHaveLength(1);
    expect(a.state === 'done' || b.state === 'done').toBe(true);
  });
});

describe('driver IPC', () => {
  it('validates the request with zod; only install and status are exposed', async () => {
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
