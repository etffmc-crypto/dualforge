/** True only when electron-builder.yml publishes to a real owner (not the `dualforge` placeholder); see electron.vite.config.ts. */
declare const __UPDATES_ENABLED__: boolean;
/** DualForge's own version (root package.json), injected at build time; see electron.vite.config.ts. */
declare const __APP_VERSION__: string | undefined;
