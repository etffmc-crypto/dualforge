import type { LicenseView } from '@dualforge/shared';
import type { IpcLike } from '../register-ipc.js';

export interface LicenseIpcDeps {
  ipc: IpcLike;
  service: {
    view(): LicenseView;
    activate(text: unknown): Promise<LicenseView>;
    check(): Promise<LicenseView>;
    remove(): Promise<LicenseView>;
  };
  /** Opens the baked checkout link (the renderer never passes a URL); '' = none. */
  checkoutUrl: string;
  /** The billing portal link; '' = none. */
  portalUrl?: string;
  openExternal(url: string): Promise<void> | void;
}

const MAX_KEY_TEXT = 4096;

/** The Plan card's channels. The key text is the only renderer input and is length-capped before the service sees it. */
export function registerLicenseIpc(d: LicenseIpcDeps): void {
  d.ipc.handle('license:get', () => d.service.view());
  d.ipc.handle('license:activate', (_e, text) =>
    typeof text === 'string' && text.length <= MAX_KEY_TEXT
      ? d.service.activate(text)
      : d.service.activate(''),
  );
  d.ipc.handle('license:check', () => d.service.check());
  d.ipc.handle('license:remove', () => d.service.remove());
  const opener = (url: string | undefined) => async () => {
    if (!url) return false;
    await d.openExternal(url);
    return true;
  };
  d.ipc.handle('license:openCheckout', opener(d.checkoutUrl));
  d.ipc.handle('license:openPortal', opener(d.portalUrl));
}
