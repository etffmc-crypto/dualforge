import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const LOG_MAX_AGE_MS = 14 * 86_400_000;

export interface LogFile {
  name: string;
  mtimeMs: number;
}

/** Names of `app*.log` files whose mtime is more than 14 days before `now`. Anything else is never selected. */
export function selectLogsToPrune(files: readonly LogFile[], now: number): string[] {
  return files
    .filter((f) => /^app.*\.log$/.test(f.name) && now - f.mtimeMs > LOG_MAX_AGE_MS)
    .map((f) => f.name);
}

/** Startup prune of the logs folder; failures are reported through `onError` and never thrown. Returns the deleted names. */
export function pruneLogs(dir: string, now: number, onError: (msg: string) => void): string[] {
  const deleted: string[] = [];
  let files: LogFile[];
  try {
    files = readdirSync(dir).flatMap((name) => {
      try {
        return [{ name, mtimeMs: statSync(join(dir, name)).mtimeMs }];
      } catch {
        return [];
      }
    });
  } catch (e) {
    onError((e as Error).message);
    return deleted;
  }
  for (const name of selectLogsToPrune(files, now)) {
    try {
      unlinkSync(join(dir, name));
      deleted.push(name);
    } catch (e) {
      onError(`${name}: ${(e as Error).message}`);
    }
  }
  return deleted;
}

/** Every `app*.log` except the newest (the one the logger is still writing). */
export function selectLogsToClear(files: readonly LogFile[]): string[] {
  const logs = files
    .filter((f) => /^app.*\.log$/.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return logs.slice(1).map((f) => f.name);
}

/** Health "clear logs" repair; a file that cannot be deleted (still open) is skipped. Returns how many were removed. */
export function clearLogs(dir: string): number {
  let files: LogFile[];
  try {
    files = readdirSync(dir).flatMap((name) => {
      try {
        return [{ name, mtimeMs: statSync(join(dir, name)).mtimeMs }];
      } catch {
        return [];
      }
    });
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of selectLogsToClear(files)) {
    try {
      unlinkSync(join(dir, name));
      n++;
    } catch {
      /* in use */
    }
  }
  return n;
}
