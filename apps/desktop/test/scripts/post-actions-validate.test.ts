import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRANCH_RE,
  forbiddenPaths,
  renderComment,
  renderPrBody,
  validateActions,
} from '../../../../scripts/post-actions-validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const good = () => ({
  pushes: [{ branch: 'fix/issue-12' }],
  prs: [
    {
      branch: 'fix/issue-12',
      issue: 12,
      title: 'fix(engine): clamp trigger range (#12)',
      body: 'The trigger range could exceed 1.0. Clamped it and added a regression test.',
    },
  ],
  comments: [
    { issue: 12, templateId: 'fix-proposed', vars: { branch: 'fix/issue-12' } },
    { issue: 13, templateId: 'acknowledged' },
    {
      issue: 14,
      templateId: 'maintainer-action',
      vars: { action: 're-run check.yml on main' },
    },
  ],
  labels: [{ issue: 13, add: ['enhancement'] }],
});
const errorsOf = (x: unknown, opts = {}) => {
  const r = validateActions(x, opts);
  return r.ok ? [] : r.errors;
};

describe('post-actions validator', () => {
  it('accepts a well-formed plan', () => {
    const r = validateActions(good());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.prs[0]!.issue).toBe(12);
  });
  it('accepts an empty file', () => {
    expect(validateActions({}).ok).toBe(true);
  });

  it('only allows fix/issue-<n> and fix/watchdog-<check>-<date> branches', () => {
    for (const b of ['fix/issue-7', 'fix/watchdog-ci-2026-10-06'])
      expect(BRANCH_RE.test(b)).toBe(true);
    for (const b of [
      'main',
      'refs/heads/main',
      'fix/issue-7:main',
      'fix/issue-7 main',
      'v0.3.4',
      'fix/watchdog-ci-2026-10-6',
      'fix/issue-',
      'fix/../main',
      'FIX/issue-7',
    ])
      expect(errorsOf({ pushes: [{ branch: b }] })).not.toEqual([]);
  });

  it('refuses unknown keys, templates, labels and vars', () => {
    expect(errorsOf({ ...good(), merges: [] })).toContain('actions: unknown key "merges"');
    expect(errorsOf({ comments: [{ issue: 1, templateId: 'custom', vars: {} }] })[0]).toMatch(
      /templateId must be one of/,
    );
    expect(
      errorsOf({ comments: [{ issue: 1, templateId: 'acknowledged', vars: { text: 'hi' } }] }),
    ).toEqual(['comments[0].vars: unknown key "text"']);
    expect(errorsOf({ labels: [{ issue: 1, add: ['wontfix'] }] })[0]).toMatch(/only enhancement/);
    expect(
      errorsOf({
        comments: [{ issue: 1, templateId: 'maintainer-action', vars: { action: 'rm -rf /' } }],
      })[0],
    ).toMatch(/fixed maintainer actions/);
    expect(errorsOf({ comments: [{ issue: 1, templateId: 'toString' }] })[0]).toMatch(
      /templateId must be one of/,
    );
  });

  it('caps comments at 10 and PRs at 2, one comment per issue', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      issue: i + 1,
      templateId: 'acknowledged',
    }));
    expect(errorsOf({ comments: many })).toContain('comments: at most 10 entries (got 11)');
    expect(
      errorsOf({
        comments: [
          { issue: 3, templateId: 'acknowledged' },
          { issue: 3, templateId: 'investigating' },
        ],
      }),
    ).toContain('comments[1]: more than one comment for #3');
    const pushes = ['fix/issue-1', 'fix/issue-2', 'fix/issue-3'].map((branch) => ({ branch }));
    expect(errorsOf({ pushes })).toContain('pushes: at most 2 entries (got 3)');
  });

  it('PRs must reference a pushed branch with the same issue number', () => {
    const g = good();
    g.pushes = [];
    expect(errorsOf(g)).toContain('prs[0]: branch fix/issue-12 is not in pushes');
    const h = good();
    h.prs[0]!.issue = 99;
    expect(errorsOf(h)).toContain('prs[0]: branch and issue number differ');
    const k = good();
    k.comments[0]!.vars = { branch: 'fix/issue-77' };
    expect(errorsOf(k)).toContain('comments[0].vars.branch: must name a branch from prs');
  });

  it('PR text: one-line title, no foreign links, no @-mentions, no control characters, size caps', () => {
    const t = (patch: object) => {
      const g = good();
      Object.assign(g.prs[0]!, patch);
      return errorsOf(g).join('\n');
    };
    expect(t({ title: 'a\nb' })).toMatch(/must be one line/);
    expect(t({ body: 'see https://evil.example/x' })).toMatch(/links outside/);
    expect(t({ body: 'see https://github.com/etffmc-crypto/dualforge/issues/12' })).toBe('');
    expect(t({ body: 'thanks @someone' })).toMatch(/@-mention/);
    expect(t({ body: 'bell\u0007' })).toMatch(/control characters/);
    expect(t({ body: 'x'.repeat(4001) })).toMatch(/longer than 4000/);
  });

  it('refuses a plan that contains the token anywhere', () => {
    const g = good();
    g.prs[0]!.body = 'leak github_pat_SECRET123 here';
    expect(errorsOf(g, { token: 'github_pat_SECRET123' })).toContain(
      'actions.json contains the GitHub token',
    );
  });

  it('flags branch changes to protected paths', () => {
    expect(
      forbiddenPaths([
        'apps/desktop/src/main/updater.ts',
        '.github/workflows/release.yml',
        'package.json',
        'apps/desktop/package.json',
        'apps/desktop/vitest.config.ts',
        'maintenance/RESPONDER.md',
        'apps\\desktop\\tsconfig.node.json',
        'scripts/post-actions-validate.mjs',
        'site/index.html',
      ]),
    ).toEqual([
      '.github/workflows/release.yml',
      'package.json',
      'apps/desktop/package.json',
      'apps/desktop/vitest.config.ts',
      'maintenance/RESPONDER.md',
      'apps\\desktop\\tsconfig.node.json',
      'scripts/post-actions-validate.mjs',
    ]);
  });

  it('renders fixed comment texts with the marker and the PR footer', () => {
    expect(renderComment('fix-proposed', { pr: 41 })).toMatch(
      /^Status: fix proposed in #41\.[\s\S]*<!-- dualforge-responder -->$/,
    );
    expect(renderPrBody({ body: 'Clamp.', issue: 12 })).toMatch(/Clamp\.\n\nFixes #12\n/);
  });

  it('CLI prints the plan (exit 0) or the errors (exit 1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pa-'));
    const ok = join(dir, 'ok.json');
    const bad = join(dir, 'bad.json');
    writeFileSync(ok, JSON.stringify(good()));
    writeFileSync(bad, JSON.stringify({ pushes: [{ branch: 'main' }] }));
    const run = (f: string) =>
      spawnSync(process.execPath, [join(root, 'scripts/post-actions-validate.mjs'), f], {
        encoding: 'utf8',
        env: { ...process.env, DUALFORGE_GH_TOKEN: '' },
      });
    const a = run(ok);
    expect(a.status).toBe(0);
    const plan = JSON.parse(a.stdout) as { comments: { text: string }[]; prs: { body: string }[] };
    expect(plan.comments[0]!.text).toContain('#{{PR}}');
    expect(plan.prs[0]!.body).toContain('Fixes #12');
    const b = run(bad);
    expect(b.status).toBe(1);
    expect(b.stderr).toMatch(/branch must match/);
  });
});
