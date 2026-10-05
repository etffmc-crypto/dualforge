import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  checkCi,
  checkRelease,
  checkSite,
  hashFromSums,
  issueTitle,
  parseLatestYml,
  runWatchdog,
  syncIssues,
} from '../../../../scripts/watchdog.mjs';

const REPO = 'etffmc-crypto/dualforge';
const API = `https://api.github.com/repos/${REPO}`;
const DL = `https://github.com/${REPO}/releases/download/v0.3.3`;

type Route = { status?: number; body: string | Buffer | object };
/** A fetch double answering from a URL (optionally "METHOD url") table; records every call. */
function mockFetch(routes: Record<string, Route | (() => Route)>) {
  const calls: { url: string; method: string; body?: unknown; auth?: string }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      ...(headers.Authorization ? { auth: headers.Authorization } : {}),
    });
    const hit = routes[`${method} ${url}`] ?? (method === 'GET' ? routes[url] : undefined);
    const r = typeof hit === 'function' ? hit() : hit;
    if (!r) return new Response('not found', { status: 404 });
    const body =
      typeof r.body === 'string' || Buffer.isBuffer(r.body) ? r.body : JSON.stringify(r.body);
    return new Response(body as BodyInit, { status: r.status ?? 200 });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const exe = Buffer.from('MZ fake installer bytes');
const sha512 = createHash('sha512').update(exe).digest('base64');
const sha256 = createHash('sha256').update(exe).digest('hex');
const latestYml = (o: { version?: string; sha?: string; size?: number } = {}) =>
  [
    `version: ${o.version ?? '0.3.3'}`,
    'files:',
    '  - url: DualForge-Setup-0.3.3.exe',
    `    sha512: ${o.sha ?? sha512}`,
    `    size: ${o.size ?? exe.length}`,
    'path: DualForge-Setup-0.3.3.exe',
    `sha512: ${o.sha ?? sha512}`,
    "releaseDate: '2026-10-06T12:00:00.000Z'",
  ].join('\n');
const asset = (name: string, size = 10) => ({
  name,
  size,
  browser_download_url: `${DL}/${name}`,
});
const release = (
  assets = [
    asset('DualForge-Setup-0.3.3.exe', exe.length),
    asset('DualForge-Setup-0.3.3.exe.blockmap'),
    asset('latest.yml'),
    asset('SHA256SUMS.txt'),
  ],
) => ({ tag_name: 'v0.3.3', assets });

function releaseRoutes(o: { yml?: string; sums?: string; exe?: Buffer } = {}) {
  return {
    [`${API}/releases/latest`]: { body: release() },
    [`${DL}/latest.yml`]: { body: o.yml ?? latestYml() },
    [`${DL}/SHA256SUMS.txt`]: { body: o.sums ?? `${sha256}  DualForge-Setup-0.3.3.exe\n` },
    [`${DL}/DualForge-Setup-0.3.3.exe`]: { body: o.exe ?? exe },
  };
}

describe('watchdog parsing', () => {
  it('reads version, path, sha512 and the first file size from latest.yml', () => {
    expect(parseLatestYml(latestYml())).toEqual({
      version: '0.3.3',
      path: 'DualForge-Setup-0.3.3.exe',
      sha512,
      size: exe.length,
    });
  });
  it('finds a file in SHA256SUMS.txt', () => {
    expect(hashFromSums(`${sha256}  a.exe\r\n${'0'.repeat(64)} *b.exe`, 'b.exe')).toBe(
      '0'.repeat(64),
    );
    expect(hashFromSums('nonsense', 'a.exe')).toBeNull();
  });
});

describe('site check', () => {
  it('passes on 200 with the download button text', async () => {
    const m = mockFetch({ 'https://x.test/': { body: '<a>Download for Windows</a>' } });
    expect((await checkSite(m.fetch, 'https://x.test/')).ok).toBe(true);
  });
  it('fails on a non-200 answer, missing text, or a network error', async () => {
    const m = mockFetch({
      'https://a.test/': { status: 404, body: 'gone' },
      'https://b.test/': { body: '<h1>Hello</h1>' },
    });
    expect(await checkSite(m.fetch, 'https://a.test/')).toMatchObject({ ok: false });
    expect((await checkSite(m.fetch, 'https://b.test/')).details).toMatch(/does not contain/);
    const boom = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch;
    expect((await checkSite(boom, 'https://c.test/')).details).toMatch(/ENOTFOUND/);
  });
});

describe('release check', () => {
  it('verifies size, sha512 and sha256 when the tag is new', async () => {
    const m = mockFetch(releaseRoutes());
    const r = await checkRelease({ fetch: m.fetch, repo: REPO, lastVerifiedTag: 'v0.3.2' });
    expect(r).toMatchObject({ ok: true, tag: 'v0.3.3', verifiedTag: 'v0.3.3' });
    expect(m.calls.some((c) => c.url.endsWith('.exe'))).toBe(true);
  });
  it('does not download the installer again for an already verified tag', async () => {
    const m = mockFetch(releaseRoutes());
    const r = await checkRelease({ fetch: m.fetch, repo: REPO, lastVerifiedTag: 'v0.3.3' });
    expect(r).toMatchObject({ ok: true, verifiedTag: 'v0.3.3' });
    expect(m.calls.some((c) => c.url.endsWith('.exe'))).toBe(false);
  });
  it('fails without a release', async () => {
    const m = mockFetch({});
    expect((await checkRelease({ fetch: m.fetch, repo: REPO })).details).toMatch(
      /no published release/,
    );
  });
  it('fails when assets are missing or the exe is not unique', async () => {
    const m = mockFetch({
      [`${API}/releases/latest`]: {
        body: release([asset('a.exe'), asset('b.exe'), asset('latest.yml')]),
      },
    });
    const r = await checkRelease({ fetch: m.fetch, repo: REPO });
    expect(r.ok).toBe(false);
    expect(r.details).toMatch(/exactly one \.exe.*SHA256SUMS\.txt is missing/);
  });
  it('fails when latest.yml names another version', async () => {
    const m = mockFetch(releaseRoutes({ yml: latestYml({ version: '0.3.2' }) }));
    const r = await checkRelease({ fetch: m.fetch, repo: REPO });
    expect(r).toMatchObject({ ok: false });
    expect(r.details).toMatch(/version 0.3.2 does not match tag v0.3.3/);
    expect(r.verifiedTag).toBeUndefined();
  });
  it('fails (and does not mark the tag verified) when the installer hash differs', async () => {
    const m = mockFetch(releaseRoutes({ exe: Buffer.from('MZ tampered installer!!') }));
    const r = await checkRelease({ fetch: m.fetch, repo: REPO });
    expect(r.ok).toBe(false);
    expect(r.details).toMatch(/sha512 does not match latest\.yml/);
    expect(r.verifiedTag).toBeUndefined();
  });
  it('fails when SHA256SUMS.txt disagrees', async () => {
    const m = mockFetch(releaseRoutes({ sums: `${'f'.repeat(64)}  DualForge-Setup-0.3.3.exe` }));
    expect((await checkRelease({ fetch: m.fetch, repo: REPO })).details).toMatch(
      /sha256 does not match SHA256SUMS/,
    );
  });
});

describe('ci check', () => {
  const runs = (list: object[]) => ({
    [`${API}/actions/workflows/check.yml/runs?branch=main&status=completed&per_page=10`]: {
      body: { workflow_runs: list },
    },
  });
  it('uses the newest run that was not cancelled', async () => {
    const m = mockFetch(
      runs([
        { conclusion: 'cancelled', html_url: 'u1' },
        { conclusion: 'success', html_url: 'u2' },
      ]),
    );
    expect(await checkCi({ fetch: m.fetch, repo: REPO })).toMatchObject({ ok: true });
  });
  it('fails on a failed run or no runs', async () => {
    const a = mockFetch(runs([{ conclusion: 'failure', html_url: 'u3' }]));
    expect((await checkCi({ fetch: a.fetch, repo: REPO })).details).toMatch(/failure.*u3/);
    const b = mockFetch(runs([]));
    expect((await checkCi({ fetch: b.fetch, repo: REPO })).ok).toBe(false);
  });
});

describe('issue sync', () => {
  const list = (issues: object[]) => ({
    [`${API}/issues?state=open&labels=watchdog&per_page=100`]: { body: issues },
  });
  const now = () => '2026-10-06T00:00:00Z';

  it('opens one labelled issue per failing check, with the token', async () => {
    const m = mockFetch({
      ...list([]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`POST ${API}/issues`]: { status: 201, body: {} },
    });
    await syncIssues({ fetch: m.fetch, repo: REPO, token: 't0k', now }, [
      { check: 'site', ok: false, details: 'HTTP 404' },
      { check: 'ci', ok: true, details: 'fine' },
    ]);
    const created = m.calls.filter((c) => c.method === 'POST' && c.url === `${API}/issues`);
    expect(created).toHaveLength(1);
    expect(created[0]!.body).toMatchObject({
      title: issueTitle('site'),
      labels: ['watchdog'],
    });
    expect((created[0]!.body as { body: string }).body).toContain('HTTP 404');
    expect(created[0]!.auth).toBe('Bearer t0k');
  });
  it('updates the existing issue instead of opening a duplicate', async () => {
    const m = mockFetch({
      ...list([{ number: 7, title: 'Watchdog: site failing' }]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`PATCH ${API}/issues/7`]: { body: {} },
    });
    const actions = await syncIssues({ fetch: m.fetch, repo: REPO, token: 't', now }, [
      { check: 'site', ok: false, details: 'still down' },
    ]);
    expect(m.calls.some((c) => c.method === 'POST' && c.url === `${API}/issues`)).toBe(false);
    expect(actions).toEqual(['updated #7 (HTTP 200)']);
  });
  it('comments and closes the issue once the check passes again', async () => {
    const m = mockFetch({
      ...list([
        { number: 9, title: 'Watchdog: release failing' },
        { number: 10, title: 'Watchdog: ci failing', pull_request: {} }, // PRs are ignored
      ]),
      [`POST ${API}/issues/9/comments`]: { status: 201, body: {} },
      [`PATCH ${API}/issues/9`]: { body: {} },
    });
    await syncIssues({ fetch: m.fetch, repo: REPO, token: 't', now }, [
      { check: 'release', ok: true, details: 'v0.3.3 verified' },
      { check: 'ci', ok: true, details: 'ok' },
    ]);
    const close = m.calls.find((c) => c.method === 'PATCH');
    expect(close).toMatchObject({ url: `${API}/issues/9`, body: { state: 'closed' } });
    expect(m.calls.some((c) => c.url.includes('/issues/10'))).toBe(false);
  });
});

describe('runWatchdog', () => {
  it('checks the default Pages URL and keeps the last verified tag on failure', async () => {
    const m = mockFetch({
      'https://etffmc-crypto.github.io/dualforge/': { body: 'Download for Windows' },
    });
    const out = await runWatchdog({ fetch: m.fetch, repo: REPO, lastVerifiedTag: 'v0.3.2' });
    expect(out.results.map((r) => [r.check, r.ok])).toEqual([
      ['site', true],
      ['release', false],
      ['ci', false],
    ]);
    expect(out.verifiedTag).toBe('v0.3.2');
  });
});
