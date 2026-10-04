import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';

/** Most lines one `logs:tail` call may ask for. */
export const LOG_TAIL_MAX = 500;
/** Only the end of the file is read, so a 10 MB log never lands in memory whole. */
export const LOG_TAIL_BYTES = 512 * 1024;
export const LogTailRequestSchema = z
  .object({ lines: z.number().int().min(1).max(LOG_TAIL_MAX) })
  .strict();

/** The most recently written `app*.log` file in `dir` (the one the logger writes today), or null. */
export function newestLog(dir: string): string | null {
  let best: { p: string; t: number } | null = null;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!/^app.*\.log$/.test(name)) continue;
    const p = join(dir, name);
    try {
      const s = statSync(p);
      if (s.isFile() && (!best || s.mtimeMs > best.t)) best = { p, t: s.mtimeMs };
    } catch {
      /* vanished */
    }
  }
  return best?.p ?? null;
}

/** The last `n` non-empty lines of the newest log in `dir`; reads at most `maxBytes` from its end. */
export function readLogTail(
  dir: string,
  n: number,
  maxBytes = LOG_TAIL_BYTES,
): { file: string | null; lines: string[] } {
  const file = newestLog(dir);
  if (!file) return { file: null, lines: [] };
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    let lines = buf.toString('utf8').split(/\r?\n/);
    if (start > 0) lines = lines.slice(1); // the first line was cut by the byte window
    return { file: basename(file), lines: lines.filter((l) => l.trim() !== '').slice(-n) };
  } finally {
    closeSync(fd);
  }
}

type Handler = (event: unknown, ...args: unknown[]) => unknown;
/** `logs:tail { lines }` (zod-validated, ≤ 500): the renderer never names a file, main only reads the logs folder. */
export function registerLogIpc(d: {
  ipc: { handle(channel: string, fn: Handler): void };
  dir: string;
  log: { error(o: object): void };
}): void {
  d.ipc.handle('logs:tail', (_e, raw) => {
    const p = LogTailRequestSchema.safeParse(raw);
    if (!p.success) {
      d.log.error({ code: 'E_LOGS_REQUEST', msg: 'logs:tail rejected' });
      throw new Error('E_LOGS_REQUEST');
    }
    try {
      return readLogTail(d.dir, p.data.lines);
    } catch (e) {
      d.log.error({ code: 'E_LOGS_READ', msg: (e as Error).message });
      throw new Error('E_LOGS_READ');
    }
  });
}
