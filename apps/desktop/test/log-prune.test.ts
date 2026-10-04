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
