import type { Menu, MenuItemConstructorOptions, NativeImage, nativeImage, Tray } from 'electron';

export interface TrayActions {
  show(): void;
  activate(id: string): void;
  health(): void;
  quit(): void;
}
export interface TrayMenuInput extends TrayActions {
  profiles: { id: string; name: string }[];
  activeId: string;
}

/** Show DualForge, Profiles (radio list, active checked), Health, Quit. */
export function buildTrayMenu(d: TrayMenuInput): MenuItemConstructorOptions[] {
  return [
    { label: 'Show DualForge', click: () => d.show() },
    { type: 'separator' },
    {
      label: 'Profiles',
      submenu: d.profiles.map((p) => ({
        label: p.name,
        type: 'radio' as const,
        checked: p.id === d.activeId,
        click: () => d.activate(p.id),
      })),
    },
    { label: 'Health', click: () => d.health() },
    { type: 'separator' },
    { label: 'Quit', click: () => d.quit() },
  ];
}

export interface TrayDeps extends TrayActions {
  Tray: typeof Tray;
  Menu: Pick<typeof Menu, 'buildFromTemplate'>;
  nativeImage: Pick<typeof nativeImage, 'createFromPath'>;
  iconPath: string;
  profiles: () => { id: string; name: string }[];
  activeId: () => string;
  log: { error(o: object): void };
}

/** Creates the tray icon; without a loadable icon there is no tray (and close-to-tray stays off so the window can never be lost). */
export function createTray(d: TrayDeps) {
  let tray: Tray | null = null;
  const icon: NativeImage = d.nativeImage.createFromPath(d.iconPath);
  if (icon.isEmpty())
    d.log.error({ code: 'E_TRAY_ICON', msg: `tray icon not found at ${d.iconPath}` });
  else {
    tray = new d.Tray(icon);
    tray.setToolTip('DualForge');
    tray.on('click', () => d.show());
  }
  const refresh = () => {
    tray?.setContextMenu(
      d.Menu.buildFromTemplate(
        buildTrayMenu({
          profiles: d.profiles(),
          activeId: d.activeId(),
          show: d.show,
          activate: d.activate,
          health: d.health,
          quit: d.quit,
        }),
      ),
    );
  };
  refresh();
  return {
    exists: () => tray !== null,
    refresh,
    destroy: () => {
      tray?.destroy();
      tray = null;
    },
  };
}
export type AppTray = ReturnType<typeof createTray>;
