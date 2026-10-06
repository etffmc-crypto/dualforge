import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assetKey,
  checkCi,
  checkRelease,
  checkSite,
  hashFromSums,
  issueBody,
  issueTitle,
  main,
  parseLatestYml,
  runWatchdog,
  sanitizeDetails,
  syncIssues,
} from '../../../../scripts/watchdog.mjs';

const REPO = 'etffmc-crypto/dualforge';
const API = `https://api.github.com/repos/${REPO}`;
const DL = `https://github.com/${REPO}/releases/download/v0.3.3`;
const BOT = { login: 'github-actions[bot]' };

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
const asset = (name: string, size = 10, extra: object = {}) => ({
  id: 1,
  name,
  size,
  updated_at: '2026-10-06T12:00:00Z',
  browser_download_url: `${DL}/${name}`,
  ...extra,
});
const exeAsset = (digest = `sha256:${sha256}`) =>
  asset('DualForge-Setup-0.3.3.exe', exe.length, { id: 42, digest });
const release = (
  assets: object[] = [
    exeAsset(),
    asset('DualForge-Setup-0.3.3.exe.blockmap'),
    asset('latest.yml'),
    asset('SHA256SUMS.txt'),
  ],
) => ({ tag_name: 'v0.3.3', assets });
const KEY = assetKey(exeAsset());

function releaseRoutes(o: { yml?: string; sums?: string; exe?: Buffer; rel?: object } = {}) {
  return {
    [`${API}/releases/latest`]: { body: o.rel ?? release() },
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
  it('issue details lose backticks and are capped at 1 KB', () => {
    expect(sanitizeDetails('a ```b``` c')).toBe("a '''b''' c");
    expect(sanitizeDetails('x'.repeat(5000))).toHaveLength(1024);
    const body = issueBody({ check: 'site', ok: false, details: '```\n# injected' }, 'now');
    expect(body.match(/```/g)).toHaveLength(2); // only our own fence
    expect(body).toContain('github-actions[bot]');
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
  it('is skipped (not failing) until a release exists', async () => {
    const m = mockFetch({});
    expect(await checkRelease({ fetch: m.fetch, repo: REPO })).toMatchObject({
      ok: true,
      skipped: true,
    });
  });
  it('verifies the installer bytes when the asset is new', async () => {
    const m = mockFetch(releaseRoutes());
    const r = await checkRelease({ fetch: m.fetch, repo: REPO, verifiedAsset: 'old' });
    expect(r).toMatchObject({ ok: true, tag: 'v0.3.3', verifiedAsset: KEY });
    expect(m.calls.some((c) => c.url.endsWith('.exe'))).toBe(true);
  });
  it('skips the download for a verified asset but still compares digest, sums and size', async () => {
    const m = mockFetch(releaseRoutes());
    const r = await checkRelease({ fetch: m.fetch, repo: REPO, verifiedAsset: KEY });
    expect(r).toMatchObject({ ok: true, verifiedAsset: KEY });
    expect(m.calls.some((c) => c.url.endsWith('.exe'))).toBe(false);
    expect(m.calls.some((c) => c.url.endsWith('SHA256SUMS.txt'))).toBe(true);
  });
  it('fails without downloading when the GitHub digest disagrees with SHA256SUMS.txt', async () => {
    const m = mockFetch(
      releaseRoutes({
        rel: release([
          exeAsset(`sha256:${'e'.repeat(64)}`),
          asset('latest.yml'),
          asset('SHA256SUMS.txt'),
        ]),
      }),
    );
    const r = await checkRelease({ fetch: m.fetch, repo: REPO, verifiedAsset: KEY });
    expect(r.details).toMatch(/digest does not match SHA256SUMS/);
    expect(m.calls.some((c) => c.url.endsWith('.exe'))).toBe(false);
  });
  it('fails when latest.yml size differs from the asset size', async () => {
    const m = mockFetch(releaseRoutes({ yml: latestYml({ size: 999 }) }));
    expect(
      (await checkRelease({ fetch: m.fetch, repo: REPO, verifiedAsset: KEY })).details,
    ).toMatch(/size 999 differs/);
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
    expect(r.details).toMatch(/version 0.3.2 does not match tag v0.3.3/);
    expect(r.verifiedAsset).toBeUndefined();
  });
  it('fails (and does not mark the asset verified) when the installer hash differs', async () => {
    const m = mockFetch(releaseRoutes({ exe: Buffer.from('MZ tampered installer!!') }));
    const r = await checkRelease({ fetch: m.fetch, repo: REPO });
    expect(r.ok).toBe(false);
    expect(r.details).toMatch(/sha512 does not match latest\.yml/);
    expect(r.verifiedAsset).toBeUndefined();
  });
  it('a re-uploaded installer (new updated_at) is verified again', async () => {
    const m = mockFetch(
      releaseRoutes({
        rel: release([
          { ...exeAsset(), updated_at: '2026-10-07T00:00:00Z' },
          asset('latest.yml'),
          asset('SHA256SUMS.txt'),
        ]),
      }),
    );
    await checkRelease({ fetch: m.fetch, repo: REPO, verifiedAsset: KEY });
    expect(m.calls.some((c) => c.url.endsWith('.exe'))).toBe(true);
  });
});

describe('ci check', () => {
  const runs = (list: object[]) => ({
    [`${API}/actions/workflows/check.yml/runs?branch=main&event=push&status=completed&per_page=10`]:
      { body: { workflow_runs: list } },
  });
  it('uses the newest push run on main that was not cancelled', async () => {
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
  const openList = (issues: object[]) => ({
    [`${API}/issues?state=open&labels=watchdog&per_page=100`]: { body: issues },
  });
  const closedList = (issues: object[]) => ({
    [`${API}/issues?state=closed&labels=watchdog&sort=updated&direction=desc&per_page=30`]: {
      body: issues,
    },
  });
  const now = () => '2026-10-10T00:00:00Z';

  it('opens one labelled issue per failing check, with the token', async () => {
    const m = mockFetch({
      ...openList([]),
      ...closedList([]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`POST ${API}/issues`]: { status: 201, body: {} },
    });
    await syncIssues({ fetch: m.fetch, repo: REPO, token: 't0k', now }, [
      { check: 'site', ok: false, details: 'HTTP 404' },
      { check: 'ci', ok: true, details: 'fine' },
    ]);
    const created = m.calls.filter((c) => c.method === 'POST' && c.url === `${API}/issues`);
    expect(created).toHaveLength(1);
    expect(created[0]!.body).toMatchObject({ title: issueTitle('site'), labels: ['watchdog'] });
    expect((created[0]!.body as { body: string }).body).toContain('HTTP 404');
    expect(created[0]!.auth).toBe('Bearer t0k');
  });
  it('updates its own open issue instead of opening a duplicate; ignores look-alikes by others', async () => {
    const m = mockFetch({
      ...openList([
        { number: 3, title: 'Watchdog: site failing', user: { login: 'mallory' } },
        { number: 7, title: 'Watchdog: site failing', user: BOT },
      ]),
      ...closedList([]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`PATCH ${API}/issues/7`]: { body: {} },
    });
    const actions = await syncIssues({ fetch: m.fetch, repo: REPO, token: 't', now }, [
      { check: 'site', ok: false, details: 'still down' },
    ]);
    expect(actions).toEqual(['updated #7']);
    expect(m.calls.some((c) => c.url.endsWith('/issues/3'))).toBe(false);
  });
  it('reopens the most recent issue closed within 7 days instead of opening a new one', async () => {
    const m = mockFetch({
      ...openList([]),
      ...closedList([
        { number: 5, title: 'Watchdog: ci failing', user: BOT, closed_at: '2026-10-05T00:00:00Z' },
        { number: 8, title: 'Watchdog: ci failing', user: BOT, closed_at: '2026-10-08T00:00:00Z' },
      ]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`PATCH ${API}/issues/8`]: { body: {} },
    });
    const actions = await syncIssues({ fetch: m.fetch, repo: REPO, token: 't', now }, [
      { check: 'ci', ok: false, details: 'red' },
    ]);
    expect(actions).toEqual(['reopened #8']);
    expect(m.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ state: 'open' });
  });
  it('opens a new issue when the closed one is older than 7 days', async () => {
    const m = mockFetch({
      ...openList([]),
      ...closedList([
        { number: 2, title: 'Watchdog: ci failing', user: BOT, closed_at: '2026-09-01T00:00:00Z' },
      ]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`POST ${API}/issues`]: { status: 201, body: {} },
    });
    expect(
      await syncIssues({ fetch: m.fetch, repo: REPO, token: 't', now }, [
        { check: 'ci', ok: false, details: 'red' },
      ]),
    ).toEqual(['opened "Watchdog: ci failing"']);
  });
  it('comments and closes the issue once the check passes again', async () => {
    const m = mockFetch({
      ...openList([
        { number: 9, title: 'Watchdog: release failing', user: BOT },
        { number: 10, title: 'Watchdog: ci failing', user: BOT, pull_request: {} },
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
  it('throws when GitHub refuses a write (the watchdog itself failed)', async () => {
    const m = mockFetch({
      ...openList([]),
      ...closedList([]),
      [`POST ${API}/labels`]: { status: 422, body: {} },
      [`POST ${API}/issues`]: { status: 403, body: {} },
    });
    await expect(
      syncIssues({ fetch: m.fetch, repo: REPO, token: 't', now }, [
        { check: 'site', ok: false, details: 'down' },
      ]),
    ).rejects.toThrow(/HTTP 403/);
  });
});

describe('runWatchdog and main', () => {
  const site = { 'https://etffmc-crypto.github.io/dualforge/': { body: 'Download for Windows' } };

  it('checks the default Pages URL; a missing release is skipped', async () => {
    const m = mockFetch(site);
    const out = await runWatchdog({ fetch: m.fetch, repo: REPO, verifiedAsset: 'k' });
    expect(out.results.map((r) => [r.check, r.ok])).toEqual([
      ['site', true],
      ['release', true],
      ['ci', false],
    ]);
    expect(out.verifiedAsset).toBe('k');
  });

  it('exits 0 with failing checks, writes state and state_changed only when it changed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wd-'));
    const env = {
      GITHUB_REPOSITORY: REPO,
      WATCHDOG_STATE: join(dir, 'state.json'),
      GITHUB_OUTPUT: join(dir, 'out.txt'),
      WATCHDOG_DRY_RUN: '1',
    };
    writeFileSync(env.GITHUB_OUTPUT, '');
    const log = vi.fn();
    expect(await main(env, mockFetch({ ...site, ...releaseRoutes() }).fetch, log)).toBe(0);
    expect(JSON.parse(readFileSync(env.WATCHDOG_STATE, 'utf8'))).toEqual({ verifiedAsset: KEY });
    expect(await main(env, mockFetch({ ...site, ...releaseRoutes() }).fetch, log)).toBe(0);
    expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toBe(
      'state_changed=true\nstate_changed=false\n',
    );
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^FAIL ci/));
  });

  it('rejects (exit 1 in the CLI) when the repository is not set', async () => {
    await expect(main({}, mockFetch({}).fetch, vi.fn())).rejects.toThrow(/GITHUB_REPOSITORY/);
  });
});
