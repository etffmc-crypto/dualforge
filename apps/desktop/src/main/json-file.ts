import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface FileIo {
  writeFileSync(path: string, data: string): void;
  renameSync(from: string, to: string): void;
  unlinkSync(path: string): void;
}
export const nodeIo: FileIo = {
  writeFileSync: (p, d) => writeFileSync(p, d, 'utf8'),
  renameSync,
  unlinkSync,
};
export interface StoreLog {
  error(o: object): void;
  warn(o: object): void;
}

/** Temp file in the same directory + rename: readers never see a partial file, and a failed write leaves the old file intact. */
export function writeJsonAtomic(file: string, data: unknown, io: FileIo = nodeIo): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    io.writeFileSync(tmp, JSON.stringify(data, null, 2));
    io.renameSync(tmp, file);
  } catch (e) {
    try {
      io.unlinkSync(tmp);
    } catch {
      /* temp file may not exist */
    }
    throw e;
  }
}

/** undefined when the file does not exist; throws on unreadable / non-JSON content. */
export function readJsonFile(file: string): unknown {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

/** Moves a bad file to `<corruptDir>/<name>.<ts>.json` so it is never silently overwritten, and logs `code`. */
export function quarantine(
  file: string,
  corruptDir: string,
  log: StoreLog,
  code: string,
  reason: string,
  io: FileIo = nodeIo,
): void {
  try {
    mkdirSync(corruptDir, { recursive: true });
    const base = basename(file).replace(/\.json$/i, '');
    io.renameSync(file, join(corruptDir, `${base}.${Date.now()}.json`));
  } catch (e) {
    log.error({ code, msg: `could not quarantine ${basename(file)}: ${(e as Error).message}` });
  }
  log.error({ code, msg: `${basename(file)} rejected: ${reason}` });
}
