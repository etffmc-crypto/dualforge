# DualForge

DualForge is a Windows desktop app (Electron) that configures a PlayStation 5 DualSense controller over USB. It reads the pad, applies your profile (button mappings, macros, stick curves, deadzones, calibration, trigger effects, gyro, lights), and presents the result to games as a virtual Xbox 360 controller through ViGEm.

Version 0.2.0. See [CHANGELOG.md](CHANGELOG.md).

## Install

**From the installer (recommended).** Run `DualForge-Setup-<version>.exe` (per-user, you choose the folder). The installer is unsigned, so Windows SmartScreen may warn: click **More info**, then **Run anyway**.

**From source.** Needs Node 24 (npm 11), Windows 11 and the Visual Studio C++ build tools:

```
npm install
npm run dev
```

## Drivers

- **ViGEmBus** is required: it provides the virtual Xbox 360 pad. Install it from the Health page (only with your explicit consent).
- **HidHide** is optional: it hides the real DualSense from games so they see only the virtual pad. Without it, games see both and inputs may register twice. Install it from the Health page.

## First run

1. Plug the DualSense in over USB.
2. Open **Health** (from the Home page or the header) and press **Run checks now**. Install ViGEmBus if it is flagged; install HidHide if you want to avoid double input.
3. Once the controller connects you land on **Overview**. Pick a profile slot and adjust pages to taste.
4. Open **Settings** to choose startup behaviour, theme and updates.

## Tray and startup

DualForge lives in the notification area. In **Settings** you can start it with Windows, start it minimized, and make the close button hide it to the tray so your profile keeps working (use **Quit** in the tray menu to exit).

## Pages

- **Home** - controller status (USB / replay, battery) and driver hints.
- **Overview** - dashboard: live pad render with tiles summarising Buttons, Sticks, Triggers, Motion and Lights, with quick edits.
- **Buttons** - remap any DualSense button to Xbox buttons, keys, mouse buttons or a macro, with turbo.
- **Sticks** - per-stick deadzones, response curves (presets or custom points), calibration, invert, smoothing.
- **Triggers** - per-trigger digital (mouse-click) mode, hair trigger, ranges and adaptive trigger effects.
- **Motion** - gyro aim / steering to the right stick or the mouse, sensitivities and calibration.
- **Vibrations** - rumble strength and motor tests (greyed out until "This controller has rumble motors" is on).
- **Lights** - lightbar colour and animation, player LEDs, mic LED.
- **Macros** - build or record step sequences, play-test them on the virtual pad, assign them on Buttons.
- **Input Test** - raw DualSense input next to the virtual Xbox output, gyro and touchpad; shows REPLAY during a recording.
- **Health** - status of the controller, drivers, native addon, startup and updates; driver install; recent log lines; diagnostics bundle.
- **Profiles** (header) - four slots: rename, duplicate, reset, share codes, per-game auto-switch rules.
- **Settings** (header) - theme (dark / light), hardware (rumble motors, HidHide), startup, tray, updates and data folder.

## Profiles, share codes and auto-switch

Four profile slots live in `%APPDATA%\DualForge\profiles\p1.json` .. `p4.json` (override the data dir with `DUALFORGE_DATA_DIR`). `settings.json` next to it holds the active profile and settings. A file that fails validation is moved to `profiles\corrupt\` (quarantine) and the slot falls back to defaults; the failure is logged.

**Share codes:** a profile can be exported as a text code starting with `DUALFORGE:` (deflated, base64url) and imported into any slot.

**Auto-switch:** `settings.autoSwitch` maps process names (e.g. `game.exe`, case-insensitive) to a profile. While that process is in the foreground the profile is applied; otherwise the active profile returns. Needs the native addon.

## Gamepad navigation

While the DualForge window has focus the pad drives the UI (it is ignored when a game has focus, and while a macro is being recorded or play-tested):

| Pad     | Action                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| LB / RB | previous / next page (inside a dialog: its tabs)                                                                                  |
| LT / RT | previous / next sub-tab on the page (e.g. Left / Right stick)                                                                     |
| D-pad   | move focus to the nearest control in that direction (repeats every 150 ms while held); left / right on a slider changes its value |
| A       | press the focused control                                                                                                         |
| B       | close the open dialog, otherwise go back to Overview                                                                              |

Navigation reads the processed virtual-pad output, so it follows your button mappings.

## Your controller (notes)

- **Digital triggers:** triggers default to digital (click) mode, matching the author's modified pad. Stock DualSense users should turn off **Digital (mouse-click) trigger** on the Triggers page (each side).
- **No rumble:** rumble defaults to off (`hasRumble: false`). With a stock pad turn on **This controller has rumble motors** on the Vibrations or Settings page.
- **Back paddles:** the two back paddles are wired to face buttons, so they follow those buttons' mappings; they cannot be remapped separately.

## Health and diagnostics

The Health page runs checks on demand (and in the background) and shows a lamp in the header. Each problem comes with the action that fixes it. **Export diagnostics bundle** writes a file with recent logs and system information to share when reporting a problem. Logs live in `%APPDATA%\DualForge\logs`. Error codes are explained in [docs/ERROR_CODES.md](docs/ERROR_CODES.md).

## Maintenance

A Claude Code routine can check the project health, triage logs and crashes and write a dated report. See [maintenance/README.md](maintenance/README.md) for running and scheduling it.

## Development

```
npm run check            # typecheck, lint, unit tests, UI e2e
npm run check:full       # check plus prettier, coverage and dependency audit
npm run dev              # start the app in development
npm run rebuild -w @dualforge/desktop   # Electron-ABI native modules
npm run dist             # unpacked app: apps/desktop/release/win-unpacked/DualForge.exe
npm run dist:installer   # also builds apps/desktop/release/DualForge-Setup-<version>.exe
npm run test:packaged    # smoke-launch win-unpacked with Playwright (needs `npm run dist`)
```

### Native modules

`native/sendinput` (keyboard/mouse injection and foreground-process lookup) is built by `npm install`. If npm skips install scripts, or after changing Electron versions, build it explicitly:

```
cd native/sendinput && npx node-gyp rebuild    # for Node (scripts, ad-hoc checks)
cd ../.. && npm run rebuild -w @dualforge/desktop   # for Electron: node-hid, vigemclient, @dualforge/sendinput
```

If the addon is missing the app still runs, but keyboard/mouse mappings and per-game auto-switch are disabled (`E_INJECT_LOAD` is logged).

### Packaging

Config: `apps/desktop/electron-builder.yml` (NSIS, per-user, directory choice, GitHub publish provider placeholders; nothing is published). Native `.node` files are `asarUnpack`ed and the tray icons ship via `extraResources`. The app icon is generated by `node apps/desktop/scripts/make-icon.mjs`. electron-builder runs with `npmRebuild: false` (we rebuild ourselves) and an explicit `electronVersion`/`electronDist`, because Electron is hoisted to the root `node_modules`; bump `electronVersion` with the Electron dependency. Auto-update needs a real `owner`/`repo` in `publish`.

### Folder map

- `packages/shared` - types and schemas shared across packages
- `packages/engine` - pure processing pipeline (stick/trigger stages, profiles)
- `apps/desktop` - Electron app (main, preload, renderer)
- `native/sendinput` - native addon for key/mouse injection and foreground-process lookup
- `maintenance` - maintenance agent prompt, check script and reports
- `docs/superpowers/{specs,plans}` - design specs and implementation plans
- `docs/reference` - reference material
- [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md) - registry of stable `E_*` error codes (a test enforces completeness)
- [`docs/BACKLOG.md`](docs/BACKLOG.md) - deferred review findings

Not affiliated with Sony or GameSir.
