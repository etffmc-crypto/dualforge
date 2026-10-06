import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  changelogSection,
  releaseFiles,
  sha256sums,
  tagMatches,
} from '../../../../scripts/release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('release helpers', () => {
  it('the tag must be exactly v<package version>', () => {
    expect(tagMatches('v0.3.3', '0.3.3')).toBe(true);
    expect(tagMatches('refs/tags/v0.3.3', '0.3.3')).toBe(true);
    expect(tagMatches('0.3.3', '0.3.3')).toBe(false);
    expect(tagMatches('v0.3.4', '0.3.3')).toBe(false);
    expect(tagMatches('v0.3.3-rc1', '0.3.3')).toBe(false);
    expect(tagMatches(undefined, '0.3.3')).toBe(false);
  });

  it('extracts one version section of the changelog', () => {
    const md = '# Changelog\r\n\r\n## 0.2.0\r\n\r\n- new\r\n\r\n## 0.1.0\r\n\r\n- old\r\n';
    expect(changelogSection(md, '0.2.0')).toBe('- new');
    expect(changelogSection(md, '0.1.0')).toBe('- old');
    expect(changelogSection(md, '0.0.9')).toBeNull();
    expect(changelogSection('## 1.0.0\n\n## 0.9.0\n- x', '1.0.0')).toBeNull(); // empty section
  });

  it('the real CHANGELOG has a section for the current package version', () => {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(
      changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version),
    ).toBeTruthy();
  });

  it('ships the installer, its blockmap and latest.yml', () => {
    expect(releaseFiles('0.3.3')).toEqual([
      'DualForge-Setup-0.3.3.exe',
      'DualForge-Setup-0.3.3.exe.blockmap',
      'latest.yml',
    ]);
  });

  it('writes sha256sum-compatible lines', () => {
    const hex = createHash('sha256').update('abc').digest('hex');
    expect(sha256sums([{ name: 'a.exe', data: 'abc' }])).toBe(`${hex}  a.exe\n`);
  });
});
