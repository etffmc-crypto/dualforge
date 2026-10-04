import { _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN = resolve(import.meta.dirname, '../out/main/index.js');

/** Launches the built app against a throwaway data dir so tests never read or write the real profiles/settings. */
export function launchApp() {
  return electron.launch({ args: [MAIN], env: { ...process.env, DUALFORGE_NO_INJECT: '1', DUALFORGE_DATA_DIR: mkdtempSync(join(tmpdir(), 'df-e2e-')) } });
}
