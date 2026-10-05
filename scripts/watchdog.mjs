// Watchdog for the public release surface (run by .github/workflows/watchdog.yml every 30 minutes):
//   site    - the download page answers 200 and contains "Download for Windows"
//   release - the latest release has one installer .exe, latest.yml and SHA256SUMS.txt; latest.yml names that exe,
//             its version matches the tag, and (only when the tag changed since the last verified run) the exe's
//             size, sha512 and sha256 match latest.yml and SHA256SUMS.txt
//   ci      - the newest finished check.yml run on main succeeded
// Every failing check gets one open issue labelled `watchdog` titled "Watchdog: <check> failing" (updated in place,
// never duplicated); it is closed with a comment once the check passes again.
//
// Env: GITHUB_REPOSITORY (owner/repo), GITHUB_TOKEN (issues), PAGES_URL (optional), WATCHDOG_STATE (state file path,
// holds the last verified tag; cached between runs by the workflow), WATCHDOG_DRY_RUN=1 (print, no issue writes).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LABEL = 'watchdog';
export const CHECKS = ['site', 'release', 'ci'];
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
 * @param {{ fetch: typeof fetch, repo: string, token?: string, lastVerifiedTag?: string | null }} d
 * @returns {Promise<{ check: 'release', ok: boolean, details: string, tag?: string, verifiedTag?: string | null }>}
 */
export async function checkRelease(d) {
  const gh = api(d.fetch, d.repo, d.token);
  let rel;
  try {
    const r = await gh('/releases/latest');
    if (r.status === 404) return fail('release', 'There is no published release.');
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
  if (exes.length !== 1) problems.push(`expected exactly one .exe asset, found ${exes.length}`);
  if (!latest) problems.push('latest.yml is missing');
  if (!sums) problems.push('SHA256SUMS.txt is missing');
  if (problems.length) return { ...fail('release', `${tag}: ${problems.join('; ')}.`), tag };
  const exe = exes[0];

  try {
    const yml = parseLatestYml((await download(d.fetch, latest.browser_download_url)).toString());
    if (yml.version !== tag.replace(/^v/, ''))
      problems.push(`latest.yml version ${yml.version} does not match tag ${tag}`);
    if (yml.path !== exe.name) problems.push(`latest.yml path ${yml.path} is not ${exe.name}`);
    if (yml.size !== undefined && yml.size !== exe.size)
      problems.push(`latest.yml size ${yml.size} differs from the asset size ${exe.size}`);
    if (!yml.sha512) problems.push('latest.yml has no sha512');
    if (problems.length) return { ...fail('release', `${tag}: ${problems.join('; ')}.`), tag };

    if (d.lastVerifiedTag === tag)
      return {
        ...pass('release', `${tag} is consistent (installer hash verified earlier).`),
        tag,
        verifiedTag: tag,
      };

    const sumsText = (await download(d.fetch, sums.browser_download_url)).toString();
    const bin = await download(d.fetch, exe.browser_download_url);
    const sha512 = createHash('sha512').update(bin).digest('base64');
    const sha256 = createHash('sha256').update(bin).digest('hex');
    if (bin.length !== exe.size)
      problems.push(`downloaded ${bin.length} bytes, asset says ${exe.size}`);
    if (sha512 !== yml.sha512)
      problems.push('installer sha512 does not match latest.yml (auto-update would reject it)');
    const listed = hashFromSums(sumsText, exe.name);
    if (!listed) problems.push(`SHA256SUMS.txt has no line for ${exe.name}`);
    else if (listed !== sha256) problems.push('installer sha256 does not match SHA256SUMS.txt');
    if (problems.length) return { ...fail('release', `${tag}: ${problems.join('; ')}.`), tag };
    return {
      ...pass('release', `${tag} verified: size, sha512 and sha256 match.`),
      tag,
      verifiedTag: tag,
    };
  } catch (e) {
    return { ...fail('release', `${tag}: could not download release files: ${e.message}`), tag };
  }
}

export async function checkCi(d) {
  const gh = api(d.fetch, d.repo, d.token);
  try {
    const r = await gh(
      '/actions/workflows/check.yml/runs?branch=main&status=completed&per_page=10',
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

function issueBody(result, now) {
  return [
    `The watchdog check **${result.check}** is failing.`,
    '',
    '```text',
    result.details,
    '```',
    '',
    `Last seen failing: ${now}. This issue is updated in place while the check fails and closed automatically when it passes again.`,
    '',
    'See maintenance/RESPONDER.md for how these are handled.',
  ].join('\n');
}

/** Opens, updates or closes one `watchdog` issue per check. Returns the actions taken (for the log). */
export async function syncIssues(d, results) {
  const gh = api(d.fetch, d.repo, d.token);
  const now = (d.now ?? (() => new Date().toISOString()))();
  const actions = [];
  const r = await gh(`/issues?state=open&labels=${LABEL}&per_page=100`);
  if (!r.ok) throw new Error(`listing watchdog issues answered HTTP ${r.status}`);
  const open = (r.json ?? []).filter((i) => !i.pull_request);
  if (results.some((x) => !x.ok)) {
    const lr = await gh('/labels', {
      method: 'POST',
      body: JSON.stringify({
        name: LABEL,
        color: 'e2403f',
        description: 'Opened by the watchdog workflow',
      }),
    });
    if (!lr.ok && lr.status !== 422) actions.push(`label create answered HTTP ${lr.status}`);
  }
  for (const res of results) {
    const title = issueTitle(res.check);
    const existing = open.find((i) => i.title === title);
    if (!res.ok && !existing) {
      const c = await gh('/issues', {
        method: 'POST',
        body: JSON.stringify({ title, body: issueBody(res, now), labels: [LABEL] }),
      });
      actions.push(`opened "${title}" (HTTP ${c.status})`);
    } else if (!res.ok && existing) {
      const u = await gh(`/issues/${existing.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: issueBody(res, now) }),
      });
      actions.push(`updated #${existing.number} (HTTP ${u.status})`);
    } else if (res.ok && existing) {
      await gh(`/issues/${existing.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: `Passing again at ${now}: ${res.details}` }),
      });
      const c = await gh(`/issues/${existing.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
      });
      actions.push(`closed #${existing.number} (HTTP ${c.status})`);
    }
  }
  return actions;
}

export async function runWatchdog(d) {
  const [owner, name] = d.repo.split('/');
  const pagesUrl = d.pagesUrl || `https://${owner}.github.io/${name}/`;
  const release = await checkRelease(d);
  const results = [await checkSite(d.fetch, pagesUrl), release, await checkCi(d)];
  const verifiedTag = release.verifiedTag ?? d.lastVerifiedTag ?? null;
  return { results, verifiedTag };
}

function readState(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set');
  const token = process.env.GITHUB_TOKEN || undefined;
  const statePath = process.env.WATCHDOG_STATE || '.watchdog/state.json';
  const state = readState(statePath);
  const { results, verifiedTag } = await runWatchdog({
    fetch,
    repo,
    token,
    pagesUrl: process.env.PAGES_URL,
    lastVerifiedTag: state.lastVerifiedTag ?? null,
  });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.check}: ${r.details}`);
  mkdirSync(dirname(resolve(statePath)), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ lastVerifiedTag: verifiedTag }, null, 2));
  if (process.env.WATCHDOG_DRY_RUN === '1' || !token) {
    console.log('Dry run (or no token): no issues opened, updated or closed.');
  } else {
    for (const a of await syncIssues({ fetch, repo, token }, results)) console.log(a);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e);
      process.exitCode = 2;
    },
  );
}
