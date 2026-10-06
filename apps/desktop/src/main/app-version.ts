/**
 * The DualForge version. `app.getVersion()` can fall back to Electron's own version (seen as "44.5.1" in a
 * packaged 0.3.3 log), so the build-time constant wins; getVersion is only used when no constant exists
 * (unit tests) and is rejected when it merely echoes the Electron version.
 */
export function resolveAppVersion(opts: {
  built?: string | undefined;
  getVersion: () => string;
  electronVersion: string;
}): string {
  if (opts.built) return opts.built;
  const v = opts.getVersion();
  return v && v !== opts.electronVersion ? v : 'unknown';
}
