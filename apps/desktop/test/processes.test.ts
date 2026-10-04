import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { TASKLIST, createProcessLister, parseTasklist } from '../src/main/processes.js';

const CSV = [
  '"System Idle Process","0","Services","0","8 K"',
  '"System","4","Services","0","2,148 K"',
  '"svchost.exe","1100","Services","0","12,004 K"',
  '"explorer.exe","5120","Console","1","180,220 K"',
  '"EldenRing.exe","9001","Console","1","4,100,220 K"',
  '"eldenring.exe","9002","Console","1","1,220 K"',
  '"Discord.exe","7000","Console","1","90,000 K"',
  '"DualForge.exe","42","Console","1","90,000 K"',
  '"cs2.exe","8000","Console","1","2,000,000 K"',
  '"AMDRSServ.exe","3000","Services","0","20,000 K"',
  '',
].join('\r\n');

describe('parseTasklist', () => {
  it('returns lowercased, deduped, sorted exe names without system, background or Services-session processes', () => {
    expect(parseTasklist(CSV, ['dualforge.exe'])).toEqual(['cs2.exe', 'discord.exe', 'eldenring.exe']);
  });
  it('ignores malformed lines, non-exe names and names over 64 characters', () => {
    const long = `${'a'.repeat(61)}.exe`;
    expect(parseTasklist(`garbage\r\n"notes.txt","1"\r\n"${long}","2"\r\n"ok.exe","3"`)).toEqual(['ok.exe']);
  });
});

describe('createProcessLister', () => {
  it('runs tasklist hidden in CSV mode and parses its output', async () => {
    const exec = vi.fn(async () => CSV);
    const list = createProcessLister(exec, ['dualforge.exe']);
    expect(await list()).toEqual(['cs2.exe', 'discord.exe', 'eldenring.exe']);
    // by full path from the Windows directory, never a `tasklist` found on PATH or in the working directory
    const sysRoot = process.env.SystemRoot ?? 'C:\\Windows';
    expect(exec).toHaveBeenCalledWith(join(sysRoot, 'System32', 'tasklist.exe'), ['/fo', 'csv', '/nh']);
    expect(TASKLIST).toMatch(/[\\/]System32[\\/]tasklist\.exe$/i);
  });
});
