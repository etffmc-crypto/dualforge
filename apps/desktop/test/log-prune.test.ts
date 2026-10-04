import { describe, expect, it } from 'vitest';
import { selectLogsToPrune } from '../src/main/log-prune.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 4);

describe('selectLogsToPrune', () => {
  it('selects app*.log files older than 14 days only', () => {
    const files = [
      { name: 'app.2026-09-01.1.log', mtimeMs: now - 20 * DAY },
      { name: 'app.2026-09-30.1.log', mtimeMs: now - 4 * DAY },
      { name: 'app.1.log', mtimeMs: now - 14 * DAY - 1 },
      { name: 'app.log', mtimeMs: now - 14 * DAY },       // exactly 14 d: kept
      { name: 'notes.txt', mtimeMs: now - 90 * DAY },     // not a log: never touched
      { name: 'other.log', mtimeMs: now - 90 * DAY },     // not app*: never touched
    ];
    expect(selectLogsToPrune(files, now)).toEqual(['app.2026-09-01.1.log', 'app.1.log']);
  });

  it('returns nothing for an empty folder', () => {
    expect(selectLogsToPrune([], now)).toEqual([]);
  });
});

describe('selectLogsToClear', () => {
  it('keeps the newest app log and ignores other files', async () => {
    const { selectLogsToClear } = await import('../src/main/log-prune.js');
    expect(selectLogsToClear([
      { name: 'app.1.log', mtimeMs: 1 }, { name: 'app.3.log', mtimeMs: 3 }, { name: 'app.2.log', mtimeMs: 2 }, { name: 'x.txt', mtimeMs: 0 },
    ])).toEqual(['app.2.log', 'app.1.log']);
    expect(selectLogsToClear([{ name: 'app.1.log', mtimeMs: 1 }])).toEqual([]);
  });
});
