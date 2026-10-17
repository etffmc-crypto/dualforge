import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

type Exec = (file: string, args: string[]) => Promise<string>;
const defaultExec: Exec = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { encoding: 'utf8', timeout: 5000, windowsHide: true }, (err, out) =>
      err ? reject(err) : resolve(out),
    ),
  );

/** The MachineGuid value from `reg query` output, or '' when it is not there. */
export function parseMachineGuid(out: string): string {
  return /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{8,})/.exec(out)?.[1]?.toLowerCase() ?? '';
}

/**
 * A short, stable fingerprint of this PC for the license instance name: a hash of Windows' MachineGuid
 * (HKLM\SOFTWARE\Microsoft\Cryptography). Only the hash leaves the PC, never the GUID. '' when it cannot be read,
 * which turns the instance check off rather than guessing (a guess that changes would cost the user a seat).
 */
export async function machineFingerprint(exec: Exec = defaultExec): Promise<string> {
  let guid = '';
  try {
    guid = parseMachineGuid(
      await exec('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']),
    );
  } catch {
    guid = '';
  }
  if (!guid) return '';
  return createHash('sha256').update(`DualForge machine v1\n${guid}`).digest('hex').slice(0, 16);
}

/**
 * Starts reading the fingerprint in the background (never blocking the main process) and returns a getter: '' until
 * it is known, then the same value for the rest of the run.
 */
export function cachedFingerprint(
  compute: () => Promise<string> = machineFingerprint,
): () => string {
  let fp = '';
  void compute().then(
    (v) => {
      fp = v;
    },
    () => undefined,
  );
  return () => fp;
}
