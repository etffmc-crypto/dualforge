import type { Settings } from '@dualforge/shared';

export const START_ARG = '--minimized';

export function parseStartupArgs(argv: readonly string[]): { minimized: boolean } {
  return { minimized: argv.includes(START_ARG) };
}

/** The window is created hidden for a login launch (--minimized) or when the user prefers it, but only when a tray exists to bring it back. */
export function shouldStartHidden(
  argv: readonly string[],
  s: Pick<Settings, 'startMinimized'>,
  hasTray: boolean,
): boolean {
  return hasTray && (parseStartupArgs(argv).minimized || s.startMinimized);
}

export function loginItemOptions(s: Pick<Settings, 'startWithWindows'>): {
  openAtLogin: boolean;
  args: string[];
} {
  return { openAtLogin: s.startWithWindows, args: [START_ARG] };
}

export interface LoginItemApp {
  isPackaged: boolean;
  setLoginItemSettings(o: { openAtLogin: boolean; args: string[] }): void;
}

/** A dev run would register the bare Electron exe, which cannot start the app by itself, so only packaged builds touch the registry. */
export function applyLoginItem(
  app: LoginItemApp,
  s: Pick<Settings, 'startWithWindows'>,
  log: { info(o: object): void },
): void {
  if (!app.isPackaged) {
    log.info({ code: 'LOGIN_ITEM_SKIPPED', reason: 'not packaged' });
    return;
  }
  app.setLoginItemSettings(loginItemOptions(s));
}

/** Close button: hide to the tray when enabled, unless a real quit is under way or there is no tray to restore from. */
export function shouldHideOnClose(d: {
  closeToTray: boolean;
  hasTray: boolean;
  quitting: boolean;
}): boolean {
  return d.closeToTray && d.hasTray && !d.quitting;
}
