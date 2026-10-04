import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The renderer may only import engine modules that are pure (no node built-ins, no native addons).
const engineRoot = resolve(import.meta.dirname, '../../../../packages/engine');
const pkg = JSON.parse(readFileSync(resolve(engineRoot, 'package.json'), 'utf8')) as { exports: Record<string, string> };

describe('renderer-facing engine subpath exports', () => {
  for (const sub of ['./curve', './shape', './calibration']) {
    it(`${sub} imports nothing but @dualforge/shared types`, () => {
      const file = pkg.exports[sub];
      expect(file, sub).toBeDefined();
      const src = readFileSync(resolve(engineRoot, file!), 'utf8');
      const specs = [...src.matchAll(/^\s*import\s+(type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2] }));
      for (const s of specs) expect(s, `${sub}: ${s.spec}`).toEqual({ typeOnly: true, spec: '@dualforge/shared' });
    });
  }
});
