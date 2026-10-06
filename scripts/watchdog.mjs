// Watchdog for the public release surface (run by .github/workflows/watchdog.yml every 30 minutes):
//   site    - the download page answers 200 and contains "Download for Windows"
//   release - skipped until a release exists. Then, every run (no installer download): one installer .exe,
//             latest.yml and SHA256SUMS.txt; latest.yml names that exe, matches the tag and the asset size; GitHub's
//             asset digest equals the SHA256SUMS.txt line. Only when the installer asset changed (id + updated_at +
//             digest, cached between runs) the exe is downloaded and its size, sha512 and sha256 are verified.
//   ci      - the newest finished check.yml run on main (push event) succeeded
// Every failing check gets one open issue labelled `watchdog` titled "Watchdog: <check> failing" (updated in place,
// never duplicated; a matching issue closed within the last 7 days is reopened). It is closed with a comment once the
// check passes again. These issues are authored by github-actions[bot]; the responder checks `user.login`.
//
// Exit code: 0 when the checks ran and issues were filed (failing checks are reported through issues, not the exit
// code); 1 only when the watchdog itself failed (bad environment, GitHub API errors while filing issues).
//
// Env: GITHUB_REPOSITORY (owner/repo), GITHUB_TOKEN (issues), PAGES_URL (optional), WATCHDOG_STATE (state file),
// WATCHDOG_DRY_RUN=1 (print, no issue writes), GITHUB_OUTPUT (state_changed=true|false for the cache step).
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LABEL = 'watchdog';
export const BOT_LOGIN = 'github-actions[bot]';
export const CHECKS = ['site', 'release', 'ci'];
export const REOPEN_DAYS = 7;
export const MAX_DETAILS = 1024;
export const issueTitle = (check) => `Watchdog: ${check} failing`;

/** The fields of electron-builder's latest.yml the watchdog compares (flat `key: value` lines plus files[0]). */
export function parseLatestYml(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^(version|path|sha512):\s*['"]?([^'"]+?)['"]?\s*$/.exec(raw);
    if (m) out[m[1]] = m[2];
    const size = /^\s+size:\s*(\d+)\s*$/.exec(raw);
    if (size && out.size === undefined) out.size = Number(size[1]);
  }
  return out;
}

/** The hex sha256 listed for `name` in a sha256sum-style file, or null. */
export function hashFromSums(text, name) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line.trim());
    if (m && m[2] === name) return m[1].toLowerCase();
  }
  return null;
}

/** Identity of the installer asset: re-verify the bytes only when this changes. */
export const assetKey = (exe) => `${exe.id}:${exe.updated_at}:${exe.digest ?? ''}`;

/** Details text for an issue body: no backticks (cannot break out of the code block), at most 1 KB. */
export function sanitizeDetails(text) {
  const s = String(text).replace(/`/g, "'");
  return s.length > MAX_DETAILS ? `${s.slice(0, MAX_DETAILS - 1)}…` : s;
}

const pass = (check, details) => ({ check, ok: true, details });
const fail = (check, details) => ({ check, ok: false, details });

function api(fetchImpl, repo, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'dualforge-watchdog',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return async (path, init = {}) => {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: r.status, ok: r.ok, json };
  };
}

export async function checkSite(fetchImpl, url) {
  try {
    const r = await fetchImpl(url, { redirect: 'follow' });
    const body = await r.text();
    if (r.status !== 200) return fail('site', `${url} answered HTTP ${r.status}.`);
    if (!body.includes('Download for Windows'))
      return fail('site', `${url} answered 200 but does not contain "Download for Windows".`);
    return pass('site', `${url} is up.`);
  } catch (e) {
    return fail('site', `${url} could not be fetched: ${e.message}`);
  }
}

async function download(fetchImpl, url) {
  const r = await fetchImpl(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * @param {{ fetch: typeof fetch, repo: string, token?: string, verifiedAsset?: string | null }} d
 * @returns {Promise<{ check: 'release', ok: boolean, skipped?: boolean, details: string, tag?: string, verifiedAsset?: string }>}
 */
export async function checkRelease(d) {
  const gh = api(d.fetch, d.repo, d.token);
  let rel;
  try {
    const r = await gh('/releases/latest');
    if (r.status === 404)
      return { ...pass('release', 'No release published yet; skipped.'), skipped: true };
    if (!r.ok) return fail('release', `GET /releases/latest answered HTTP ${r.status}.`);
    rel = r.json;
  } catch (e) {
    return fail('release', `GET /releases/latest failed: ${e.message}`);
  }
  const tag = String(rel.tag_name ?? '');
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const exes = assets.filter((a) => /\.exe$/i.test(a.name));
  const latest = assets.find((a) => a.name === 'latest.yml');
  const sums = assets.find((a) => a.name === 'SHA256SUMS.txt');
  const problems = [];
  const failed = () => ({ ...fail('release', `${tag}: ${problems.join('; ')}.`), tag });
  if (exes.length !== 1) problems.push(`expected exactly one .exe asset, found ${exes.length}`);
  if (!latest) problems.push('latest.yml is missing');
  if (!sums) problems.push('SHA256SUMS.txt is missing');
  if (problems.length) return failed();
  const exe = exes[0];

  try {
    // every run: small files only
    const yml = parseLatestYml((await download(d.fetch, latest.browser_download_url)).toString());
    const sumsText = (await download(d.fetch, sums.browser_download_url)).toString();
    if (yml.version !== tag.replace(/^v/, ''))
      problems.push(`latest.yml version ${yml.version} does not match tag ${tag}`);
    if (yml.path !== exe.name) problems.push(`latest.yml path ${yml.path} is not ${exe.name}`);
    if (yml.size !== exe.size)
      problems.push(`latest.yml size ${yml.size} differs from the asset size ${exe.size}`);
    if (!yml.sha512) problems.push('latest.yml has no sha512');
    const listed = hashFromSums(sumsText, exe.name);
    if (!listed) problems.push(`SHA256SUMS.txt has no line for ${exe.name}`);
    const digest = /^sha256:([0-9a-f]{64})$/i.exec(exe.digest ?? '')?.[1]?.toLowerCase();
    if (listed && digest && digest !== listed)
      problems.push("GitHub's asset digest does not match SHA256SUMS.txt");
    if (problems.length) return failed();

    const key = assetKey(exe);
    if (d.verifiedAsset === key)
      return {
        ...pass('release', `${tag} is consistent (installer bytes verified earlier).`),
        tag,
        verifiedAsset: key,
      };

    // the installer asset is new or changed: verify the bytes once
    const bin = await download(d.fetch, exe.browser_download_url);
    const sha512 = createHash('sha512').update(bin).digest('base64');
    const sha256 = createHash('sha256').update(bin).digest('hex');
    if (bin.length !== exe.size)
      problems.push(`downloaded ${bin.length} bytes, asset says ${exe.size}`);
    if (sha512 !== yml.sha512)
      problems.push('installer sha512 does not match latest.yml (auto-update would reject it)');
    if (sha256 !== listed) problems.push('installer sha256 does not match SHA256SUMS.txt');
    if (problems.length) return failed();
    return {
      ...pass('release', `${tag} verified: size, sha512 and sha256 match.`),
      tag,
      verifiedAsset: key,
    };
  } catch (e) {
    return { ...fail('release', `${tag}: could not download release files: ${e.message}`), tag };
  }
}

export async function checkCi(d) {
  const gh = api(d.fetch, d.repo, d.token);
  try {
    const r = await gh(
      '/actions/workflows/check.yml/runs?branch=main&event=push&status=completed&per_page=10',
    );
    if (!r.ok) return fail('ci', `Listing check.yml runs answered HTTP ${r.status}.`);
    const run = (r.json?.workflow_runs ?? []).find(
      (x) => x.conclusion && !['cancelled', 'skipped'].includes(x.conclusion),
    );
    if (!run) return fail('ci', 'No finished check.yml run on main.');
    if (run.conclusion !== 'success')
      return fail(
        'ci',
        `The latest check.yml run on main ended "${run.conclusion}": ${run.html_url}`,
      );
    return pass('ci', `check.yml on main passed: ${run.html_url}`);
  } catch (e) {
    return fail('ci', `Listing check.yml runs failed: ${e.message}`);
  }
}

export function issueBody(result, now) {
  return [
    `The watchdog check **${result.check}** is failing.`,
    '',
    '```text',
    sanitizeDetails(result.details),
    '```',
    '',
    `Last seen failing: ${now}. This issue is updated in place while the check fails and closed automatically when it passes again.`,
    '',
    `Opened by the watchdog workflow as ${BOT_LOGIN}; an issue with this title from anyone else is not a watchdog report. See maintenance/RESPONDER.md.`,
  ].join('\n');
}

/** Opens, reopens, updates or closes one `watchdog` issue per check. Returns the actions taken (for the log). */
export async function syncIssues(d, results) {
  const gh = api(d.fetch, d.repo, d.token);
  const nowIso = (d.now ?? (() => new Date().toISOString()))();
  const nowMs = Date.parse(nowIso);
  const actions = [];
  const must = (r, what) => {
    if (!r.ok) throw new Error(`${what} answered HTTP ${r.status}`);
    return r;
  };
  const mine = (i) => !i.pull_request && i.user?.login === BOT_LOGIN;
  const open = (
    must(await gh(`/issues?state=open&labels=${LABEL}&per_page=100`), 'listing open issues').json ??
    []
  ).filter(mine);
  const failing = results.filter((x) => !x.ok);
  let closed = [];
  if (failing.length) {
    const lr = await gh('/labels', {
      method: 'POST',
      body: JSON.stringify({
        name: LABEL,
        color: 'e2403f',
        description: 'Opened by the watchdog workflow',
      }),
    });
    if (!lr.ok && lr.status !== 422) actions.push(`label create answered HTTP ${lr.status}`);
    closed = (
      must(
        await gh(`/issues?state=closed&labels=${LABEL}&sort=updated&direction=desc&per_page=30`),
        'listing closed issues',
      ).json ?? []
    ).filter(mine);
  }
  for (const res of results) {
    const title = issueTitle(res.check);
    const existing = open.find((i) => i.title === title);
    if (!res.ok && existing) {
      must(
        await gh(`/issues/${existing.number}`, {
          method: 'PATCH',
          body: JSON.stringify({ body: issueBody(res, nowIso) }),
        }),
        `updating #${existing.number}`,
      );
      actions.push(`updated #${existing.number}`);
    } else if (!res.ok) {
      const recent = closed
        .filter((i) => i.title === title && i.closed_at)
        .filter((i) => nowMs - Date.parse(i.closed_at) <= REOPEN_DAYS * 86_400_000)
        .sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at))[0];
      if (recent) {
        must(
          await gh(`/issues/${recent.number}`, {
            method: 'PATCH',
            body: JSON.stringify({ state: 'open', body: issueBody(res, nowIso) }),
          }),
          `reopening #${recent.number}`,
        );
        actions.push(`reopened #${recent.number}`);
      } else {
        must(
          await gh('/issues', {
            method: 'POST',
            body: JSON.stringify({ title, body: issueBody(res, nowIso), labels: [LABEL] }),
          }),
          `opening "${title}"`,
        );
        actions.push(`opened "${title}"`);
      }
    } else if (existing) {
      must(
        await gh(`/issues/${existing.number}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            body: `Passing again at ${nowIso}: ${sanitizeDetails(res.details)}`,
          }),
        }),
        `commenting on #${existing.number}`,
      );
      must(
        await gh(`/issues/${existing.number}`, {
          method: 'PATCH',
          body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
        }),
        `closing #${existing.number}`,
      );
      actions.push(`closed #${existing.number}`);
    }
  }
  return actions;
}

export async function runWatchdog(d) {
  const [owner, name] = d.repo.split('/');
  const pagesUrl = d.pagesUrl || `https://${owner}.github.io/${name}/`;
  const release = await checkRelease(d);
  const results = [await checkSite(d.fetch, pagesUrl), release, await checkCi(d)];
  const verifiedAsset = release.verifiedAsset ?? d.verifiedAsset ?? null;
  return { results, verifiedAsset };
}

function readState(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/** One watchdog run; returns the process exit code. */
export async function main(env = process.env, fetchImpl = fetch, log = console.log) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is not set');
  const token = env.GITHUB_TOKEN || undefined;
  const statePath = env.WATCHDOG_STATE || '.watchdog/state.json';
  const state = readState(statePath);
  const before = state.verifiedAsset ?? null;
  const { results, verifiedAsset } = await runWatchdog({
    fetch: fetchImpl,
    repo,
    token,
    pagesUrl: env.PAGES_URL,
    verifiedAsset: before,
  });
  for (const r of results)
    log(`${r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'} ${r.check}: ${r.details}`);
  const changed = verifiedAsset !== before;
  if (changed) {
    mkdirSync(dirname(resolve(statePath)), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ verifiedAsset }, null, 2));
  }
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `state_changed=${changed}\n`);
  if (env.WATCHDOG_DRY_RUN === '1' || !token) {
    log('Dry run (or no token): no issues opened, updated or closed.');
  } else {
    for (const a of await syncIssues({ fetch: fetchImpl, repo, token }, results)) log(a);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e);
      process.exitCode = 1;
    },
  );
}
