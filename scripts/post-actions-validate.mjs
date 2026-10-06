// Strict validator for maintenance/outbox/actions.json, the only thing the issue responder (stage 1, an LLM without a
// token) can hand to maintenance/post-actions.ps1 (stage 2, no LLM, holds the token). Anything not explicitly allowed
// is refused, and one bad entry refuses the whole file.
//
//   node scripts/post-actions-validate.mjs <actions.json>   prints the normalized plan as JSON, exit 0
//                                                           or the list of errors on stderr, exit 1
// Env: DUALFORGE_GH_TOKEN (optional) - the plan is refused if any text in it contains the token.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'etffmc-crypto/dualforge';
export const LIMITS = { comments: 10, labels: 10, pushes: 2, prs: 2 };
export const BRANCH_RE = /^fix\/(issue-\d+|watchdog-[a-z]+-\d{4}-\d{2}-\d{2})$/;
export const ALLOWED_LABELS = ['enhancement'];
export const MAINTAINER_ACTIONS = [
  'enable GitHub Pages',
  're-run the release workflow for the latest tag',
  're-run check.yml on main',
  'workflow change proposed in the responder report',
];

/** Fixed comment texts; `vars` are checked per template, never free text. */
export const TEMPLATES = {
  investigating: {
    vars: {},
    render: () =>
      'Status: investigating. Thanks for the report. If you have not yet, please attach the diagnostics bundle (Health > Export diagnostics bundle; review it first, issues are public) and the error code from the app footer.',
  },
  'fix-proposed': {
    // the PR number is only known in stage 2, which opens the PR for `branch` first
    vars: { branch: 'branch' },
    render: (v) =>
      `Status: fix proposed in #${v.pr}. It will ship in the next release; the download page and the in-app updater will offer it.`,
  },
  acknowledged: {
    vars: {},
    render: () => 'Thanks, noted as a feature request. It will be considered for a future version.',
  },
  'maintainer-action': {
    vars: { action: 'maintainerAction' },
    render: (v) => `Status: needs a maintainer action, not a code change: ${v.action}.`,
  },
};
export const MARKER = '<!-- dualforge-responder -->';

/** Paths a responder branch may not change (stage 2 refuses to push such a branch). */
export const FORBIDDEN_PATHS = [
  /^\.github\//,
  /^\.git\//,
  /^maintenance\//,
  /^native\//,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)vitest\.config\.[cm]?[jt]s$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^eslint\.config\.js$/,
  /^\.prettier(rc|ignore)$/,
  /(^|\/)electron-builder\.yml$/,
  /(^|\/)electron\.vite\.config\.ts$/,
  /^scripts\/(post-actions|watchdog|release)/,
];
export function forbiddenPaths(paths) {
  return paths.filter((p) => FORBIDDEN_PATHS.some((re) => re.test(p.replace(/\\/g, '/'))));
}

const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const isIssue = (n) => Number.isInteger(n) && n > 0 && n < 1e7;
const URL_RE = /https?:\/\/[^\s)>\]]+/gi;

function checkText(errors, where, s, max) {
  if (typeof s !== 'string' || !s.trim())
    return errors.push(`${where}: must be a non-empty string`);
  if (s.length > max) errors.push(`${where}: longer than ${max} characters`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))
    errors.push(`${where}: contains control characters`);
  for (const u of s.match(URL_RE) ?? [])
    if (!u.startsWith(`https://github.com/${REPO}`))
      errors.push(`${where}: links outside https://github.com/${REPO} (${u.slice(0, 60)})`);
  if (/(^|\s)@[a-z0-9-]/i.test(s)) errors.push(`${where}: must not @-mention anyone`);
}

function onlyKeys(errors, where, o, keys) {
  for (const k of Object.keys(o))
    if (!keys.includes(k)) errors.push(`${where}: unknown key "${k}"`);
}

/**
 * @returns {{ ok: true, plan: object } | { ok: false, errors: string[] }}
 */
export function validateActions(input, opts = {}) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ['actions.json must be a JSON object'] };
  onlyKeys(errors, 'actions', input, ['comments', 'labels', 'pushes', 'prs']);
  const list = (k) => {
    const v = input[k] ?? [];
    if (!Array.isArray(v)) {
      errors.push(`${k}: must be an array`);
      return [];
    }
    if (v.length > LIMITS[k]) errors.push(`${k}: at most ${LIMITS[k]} entries (got ${v.length})`);
    return v;
  };
  const comments = list('comments');
  const labels = list('labels');
  const pushes = list('pushes');
  const prs = list('prs');

  const pushed = new Set();
  pushes.forEach((p, i) => {
    const w = `pushes[${i}]`;
    if (!isObj(p)) return errors.push(`${w}: must be an object`);
    onlyKeys(errors, w, p, ['branch']);
    if (typeof p.branch !== 'string' || !BRANCH_RE.test(p.branch))
      return errors.push(`${w}: branch must match ${BRANCH_RE}`);
    if (pushed.has(p.branch)) errors.push(`${w}: duplicate branch ${p.branch}`);
    pushed.add(p.branch);
  });

  const prBranches = new Set();
  const outPrs = [];
  prs.forEach((p, i) => {
    const w = `prs[${i}]`;
    if (!isObj(p)) return errors.push(`${w}: must be an object`);
    onlyKeys(errors, w, p, ['branch', 'issue', 'title', 'body']);
    if (typeof p.branch !== 'string' || !BRANCH_RE.test(p.branch))
      errors.push(`${w}: branch must match ${BRANCH_RE}`);
    else if (!pushed.has(p.branch)) errors.push(`${w}: branch ${p.branch} is not in pushes`);
    if (!isIssue(p.issue)) errors.push(`${w}: issue must be a positive integer`);
    const m = /^fix\/issue-(\d+)$/.exec(String(p.branch));
    if (m && Number(m[1]) !== p.issue) errors.push(`${w}: branch and issue number differ`);
    checkText(errors, `${w}.title`, p.title, 120);
    if (typeof p.title === 'string' && /[\r\n]/.test(p.title))
      errors.push(`${w}.title: must be one line`);
    checkText(errors, `${w}.body`, p.body, 4000);
    if (prBranches.has(p.branch)) errors.push(`${w}: duplicate PR for ${p.branch}`);
    prBranches.add(p.branch);
    outPrs.push({ branch: p.branch, issue: p.issue, title: p.title, body: p.body });
  });

  const outComments = [];
  const commented = new Set();
  comments.forEach((c, i) => {
    const w = `comments[${i}]`;
    if (!isObj(c)) return errors.push(`${w}: must be an object`);
    onlyKeys(errors, w, c, ['issue', 'templateId', 'vars']);
    if (!isIssue(c.issue)) errors.push(`${w}: issue must be a positive integer`);
    if (commented.has(c.issue)) errors.push(`${w}: more than one comment for #${c.issue}`);
    commented.add(c.issue);
    const t = Object.hasOwn(TEMPLATES, c.templateId) ? TEMPLATES[c.templateId] : null;
    if (!t)
      return errors.push(`${w}: templateId must be one of ${Object.keys(TEMPLATES).join(', ')}`);
    const vars = c.vars ?? {};
    if (!isObj(vars)) return errors.push(`${w}.vars: must be an object`);
    onlyKeys(errors, `${w}.vars`, vars, Object.keys(t.vars));
    for (const [k, kind] of Object.entries(t.vars)) {
      const v = vars[k];
      if (kind === 'branch' && !(typeof v === 'string' && prBranches.has(v)))
        errors.push(`${w}.vars.${k}: must name a branch from prs`);
      if (kind === 'maintainerAction' && !MAINTAINER_ACTIONS.includes(v))
        errors.push(`${w}.vars.${k}: must be one of the fixed maintainer actions`);
    }
    outComments.push({ issue: c.issue, templateId: c.templateId, vars: { ...vars } });
  });

  const outLabels = [];
  labels.forEach((l, i) => {
    const w = `labels[${i}]`;
    if (!isObj(l)) return errors.push(`${w}: must be an object`);
    onlyKeys(errors, w, l, ['issue', 'add']);
    if (!isIssue(l.issue)) errors.push(`${w}: issue must be a positive integer`);
    if (!Array.isArray(l.add) || !l.add.length || l.add.some((x) => !ALLOWED_LABELS.includes(x)))
      errors.push(`${w}.add: only ${ALLOWED_LABELS.join(', ')}`);
    else outLabels.push({ issue: l.issue, add: [...new Set(l.add)] });
  });

  if (opts.token && JSON.stringify(input).includes(opts.token))
    errors.push('actions.json contains the GitHub token');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      pushes: [...pushed].map((branch) => ({ branch })),
      prs: outPrs,
      comments: outComments,
      labels: outLabels,
    },
  };
}

/** The final comment text (template + marker); `pr` is filled in by stage 2 for fix-proposed. */
export function renderComment(templateId, vars) {
  const t = TEMPLATES[templateId];
  if (!t) throw new Error(`unknown template ${templateId}`);
  return `${t.render(vars)}\n\n${MARKER}`;
}

/** PR body as posted: the responder's text, then the fixed footer. */
export function renderPrBody(pr) {
  return `${pr.body}\n\nFixes #${pr.issue}\n\n_Proposed by the DualForge issue responder (automated). Review before merging._`;
}

function main(argv, env) {
  if (argv[0] === '--check-paths') {
    // stage 2 passes `git diff --name-only` output; prints the forbidden ones, exit 1 if any
    const bad = forbiddenPaths(
      readFileSync(argv[1], 'utf8')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(Boolean),
    );
    for (const p of bad) console.error(`forbidden path: ${p}`);
    return bad.length ? 1 : 0;
  }
  const file = argv[0];
  if (!file) {
    console.error('usage: post-actions-validate.mjs <actions.json>');
    return 2;
  }
  let input;
  try {
    input = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    console.error(`cannot read ${file}: ${e.message}`);
    return 1;
  }
  const r = validateActions(input, { token: env.DUALFORGE_GH_TOKEN });
  if (!r.ok) {
    for (const e of r.errors) console.error(e);
    return 1;
  }
  // stage 2 posts exactly these texts
  const plan = {
    ...r.plan,
    prs: r.plan.prs.map((p) => ({ ...p, body: renderPrBody(p) })),
    comments: r.plan.comments.map((c) => ({
      ...c,
      // fix-proposed needs the PR number: stage 2 substitutes {{PR}}
      text: renderComment(c.templateId, { ...c.vars, pr: '{{PR}}' }),
    })),
  };
  console.log(JSON.stringify(plan));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
