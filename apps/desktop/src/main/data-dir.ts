import { join } from 'node:path';

/**
 * Where profiles, settings, crash dumps and logs live. `DUALFORGE_DATA_DIR` (set by the e2e harness) redirects all of
 * it, so test and dev runs never write into the user's real %APPDATA%\DualForge.
 */
export function resolveDataDir(
  appDataPath: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return env.DUALFORGE_DATA_DIR || join(appDataPath, 'DualForge');
}

export const logDirFor = (dataDir: string): string => join(dataDir, 'logs');
