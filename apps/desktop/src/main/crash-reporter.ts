/**
 * Crash dumps stay on this machine: no upload, compressed, written to `crashDir`. Must run before `app.whenReady()`
 * (the reporter only covers processes started after it).
 */
export function startCrashReporter(
  app: { setPath(name: 'crashDumps', path: string): void },
  crashReporter: {
    start(opts: { submitURL: string; uploadToServer: boolean; compress: boolean }): void;
  },
  crashDir: string,
): void {
  app.setPath('crashDumps', crashDir);
  crashReporter.start({ submitURL: '', uploadToServer: false, compress: true });
}
