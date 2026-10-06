export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  exit(code?: number): void;
}

/**
 * True for the first instance. A second launch exits right here (silently, with exit code 0): the guard module is
 * imported before the logger and every store, so a duplicate start writes no APP_START and creates no log worker.
 */
export function acquireSingleInstance(app: InstanceApp): boolean {
  if (app.requestSingleInstanceLock()) return true;
  app.exit(0);
  return false;
}
