import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE_DIRS = [
  'apps/desktop/src',
  'packages/shared/src',
  'packages/engine/src',
  'native/sendinput/src',
];
const EXTS = new Set(['.ts', '.tsx', '.cc', '.js']);
/** Documentation placeholders that look like codes but are not. */
const PLACEHOLDERS = new Set(['E_CODE']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

function codesInSource(): Map<string, string> {
  const found = new Map<string, string>();
  for (const d of SOURCE_DIRS) {
    for (const f of walk(join(root, d))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bE_[A-Z][A-Z0-9_]*[A-Z0-9]\b/g)) {
        if (!PLACEHOLDERS.has(m[0])) found.set(m[0], f);
      }
    }
  }
  return found;
}

describe('error-code registry', () => {
  const doc = readFileSync(join(root, 'docs/ERROR_CODES.md'), 'utf8');
  const documented = new Set([...doc.matchAll(/^### (\S+)\s*$/gm)].map((m) => m[1]!));

  it('finds a sane number of codes in source (guards against a broken scan)', () => {
    expect(codesInSource().size).toBeGreaterThan(30);
  });

  it('documents every E_ code used in source as a "### CODE" heading', () => {
    const missing = [...codesInSource()]
      .filter(([c]) => !documented.has(c))
      .map(([c, f]) => `${c} (${f})`);
    expect(missing).toEqual([]);
  });

  it('lists the non-E_ structured log codes', () => {
    for (const c of [
      'APP_START',
      'ENGINE_STATUS',
      'ENGINE_EXIT',
      'ENGINE_STDERR',
      'HIDHIDE_CLI_HANG',
      'HIDHIDE_STILL_CLOAKED',
    ])
      expect(documented.has(c)).toBe(true);
  });
});
