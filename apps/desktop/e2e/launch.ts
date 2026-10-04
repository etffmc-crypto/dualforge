import { _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN = resolve(import.meta.dirname, '../out/main/index.js');

/**
 * Launches the built app against a throwaway data dir so tests never read or write the real profiles/settings.
 * `extraEnv` adds variables for one launch (e.g. DUALFORGE_NAV_REPLAY=1); DUALFORGE_NAV_REPLAY is never inherited.
 */
export function launchApp(extraEnv: Record<string, string> = {}) {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'DUALFORGE_NAV_REPLAY') env[k] = v;
  return electron.launch({
    args: [MAIN],
    env: {
      ...env,
      DUALFORGE_NO_INJECT: '1',
      DUALFORGE_DATA_DIR: mkdtempSync(join(tmpdir(), 'df-e2e-')),
      ...extraEnv,
    },
  });
}
