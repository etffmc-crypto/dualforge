// Release helpers for .github/workflows/release.yml (also runnable locally):
//   node scripts/release.mjs verify-tag <tag>            fails unless tag === `v${package.json version}`
//   node scripts/release.mjs notes <tag> <out.md>        writes that version's CHANGELOG section (fails if missing)
//   node scripts/release.mjs sums <releaseDir> <out.txt> writes SHA256SUMS.txt for the installer, blockmap, latest.yml
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** True when the git tag names exactly this package version (`v0.3.3` for `0.3.3`). */
export function tagMatches(tag, version) {
  return typeof tag === 'string' && tag.replace(/^refs\/tags\//, '') === `v${version}`;
}

/** The body of `## <version>` in CHANGELOG.md, up to the next `## ` heading; null when absent or empty. */
export function changelogSection(md, version) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return body || null;
}

/** The files a release ships (besides SHA256SUMS.txt itself). */
export function releaseFiles(version) {
  return [
    `DualForge-Setup-${version}.exe`,
    `DualForge-Setup-${version}.exe.blockmap`,
    'latest.yml',
  ];
}

/** `sha256sum`-compatible lines: "<hex>  <name>". */
export function sha256sums(entries) {
  return entries
    .map(({ name, data }) => `${createHash('sha256').update(data).digest('hex')}  ${name}\n`)
    .join('');
}

function pkgVersion() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
}

function main(argv) {
  const [cmd, a, b] = argv;
  const version = pkgVersion();
  if (cmd === 'verify-tag') {
    if (!tagMatches(a, version)) {
      console.error(
        `Tag "${a}" does not match package.json version ${version} (expected v${version}).`,
      );
      return 1;
    }
    console.log(`Tag ${a} matches version ${version}.`);
    return 0;
  }
  if (cmd === 'notes') {
    if (!tagMatches(a, version)) {
      console.error(`Tag "${a}" does not match package.json version ${version}.`);
      return 1;
    }
    const body = changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);
    if (!body) {
      console.error(`CHANGELOG.md has no "## ${version}" section.`);
      return 1;
    }
    writeFileSync(b, `${body}\n`);
    console.log(`Wrote release notes for ${version} to ${b}.`);
    return 0;
  }
  if (cmd === 'sums') {
    const entries = releaseFiles(version).map((name) => ({
      name,
      data: readFileSync(join(a, name)),
    }));
    writeFileSync(b, sha256sums(entries));
    console.log(`Wrote ${basename(b)}:\n${readFileSync(b, 'utf8')}`);
    return 0;
  }
  console.error('usage: release.mjs verify-tag <tag> | notes <tag> <out> | sums <dir> <out>');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
