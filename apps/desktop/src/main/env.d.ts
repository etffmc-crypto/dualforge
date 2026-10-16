/** True only when electron-builder.yml publishes to a real owner (not the `dualforge` placeholder); see electron.vite.config.ts. */
declare const __UPDATES_ENABLED__: boolean;
/** DualForge's own version (root package.json), injected at build time; see electron.vite.config.ts. */
declare const __APP_VERSION__: string | undefined;
/** Lemon Squeezy build config (store id, product ids, checkout URL, variant ids); see electron.vite.config.ts. */
declare const __LICENSE_CONFIG__:
  | {
      storeId: string;
      productIds: string[];
      checkoutUrl: string;
      portalUrl: string;
      variants: { monthly: string; yearly: string; lifetime: string; founder: string };
    }
  | undefined;
