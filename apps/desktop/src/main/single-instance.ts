import { join } from 'node:path';

export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  exit(code?: number): void;
  setPath?(name: 'userData', path: string): void;
}

/**
 * True for the first instance. A second launch exits right here (silently, with exit code 0): the guard module is
 * imported before the logger and every store, so a duplicate start writes no APP_START and creates no log worker.
 *
 * With `DUALFORGE_DATA_DIR` (the e2e harnesses) Electron's userData moves into that throwaway dir first: the
 * single-instance lock is keyed on userData, so a test run of the packaged build never meets (or wakes) an installed
 * DualForge that is running.
 */
export function acquireSingleInstance(
  app: InstanceApp,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.DUALFORGE_DATA_DIR) app.setPath?.('userData', join(env.DUALFORGE_DATA_DIR, 'electron'));
  if (app.requestSingleInstanceLock()) return true;
  app.exit(0);
  return false;
}
