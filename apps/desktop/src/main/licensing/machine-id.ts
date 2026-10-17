import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';

type Exec = (file: string, args: string[]) => string;
const defaultExec: Exec = (file, args) =>
  execFileSync(file, args, { encoding: 'utf8', timeout: 3000, windowsHide: true });

/** The MachineGuid value from `reg query` output, or '' when it is not there. */
export function parseMachineGuid(out: string): string {
  return /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{8,})/.exec(out)?.[1]?.toLowerCase() ?? '';
}

/**
 * A short, stable fingerprint of this PC for the license instance name: a hash of Windows' MachineGuid
 * (HKLM\SOFTWARE\Microsoft\Cryptography), falling back to the host name. Only the hash leaves the PC, never the GUID.
 */
export function machineFingerprint(
  exec: Exec = defaultExec,
  hostname: () => string = () => os.hostname(),
): string {
  let source = '';
  try {
    source = parseMachineGuid(
      exec('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']),
    );
  } catch {
    source = '';
  }
  if (!source) source = `host:${hostname().toLowerCase()}`;
  return createHash('sha256').update(`DualForge machine v1\n${source}`).digest('hex').slice(0, 16);
}

/** Computed once per run (the reg query costs a few milliseconds). */
export function cachedFingerprint(compute: () => string = machineFingerprint): () => string {
  let fp: string | null = null;
  return () => (fp ??= compute());
}
