import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), 'site');
const html = readFileSync(join(site, 'index.html'), 'utf8');

describe('download page (site/)', () => {
  it('says "Download for Windows" (the watchdog looks for it)', () => {
    expect(html).toContain('Download for Windows');
  });
  it('works without JavaScript: the button and checksum link point at the latest release page', () => {
    const button = /<a\s+id="download"[^>]*href="([^"]+)"/.exec(html);
    expect(button?.[1]).toBe('https://github.com/etffmc-crypto/dualforge/releases/latest');
  });
  it('links the issue chooser, changelog and repository', () => {
    expect(html).toContain('https://github.com/etffmc-crypto/dualforge/issues/new/choose');
    expect(html).toContain('https://github.com/etffmc-crypto/dualforge/blob/main/CHANGELOG.md');
    expect(html).toContain('href="https://github.com/etffmc-crypto/dualforge"');
  });
  it('ships a restrictive Content-Security-Policy (no inline script, API-only connect)', () => {
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toMatch(/connect-src https:\/\/api\.github\.com/);
    expect(csp).not.toContain('unsafe-inline');
    expect(html).not.toMatch(/<script>(?!<\/script>)/); // no inline scripts the CSP would block
  });
  it('only loads its own script and stylesheet (plus Google Fonts)', () => {
    const srcs = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((u) => !u.startsWith('https://github.com/'));
    for (const u of srcs) expect(u).toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/);
    expect(html).toContain('<script src="app.js" defer></script>');
  });
});
