# DualForge

DualForge is a Windows desktop app (Electron) that configures a PlayStation 5 DualSense controller over USB. It reads the pad, applies your profile (stick curves, deadzones, calibration, trigger effects), and presents the result to games as a virtual Xbox 360 controller through ViGEm.

## Status

Plan 3A of 4. Done so far: engine (button mappings, macros, gyro, lights), key/mouse injection, profile storage, share codes, per-game auto-switch, plus the Home, Input Test, Sticks and Triggers pages. The remaining pages are Plan 3B; the health check, installer, HidHide and background agent come in Plan 4.

## Prerequisites

- Node 24 (npm 11), Windows 11
- ViGEmBus driver (installed only with your explicit consent)
- HidHide (planned, Plan 4)

**Double-input caveat:** until HidHide is integrated, games see both the real DualSense and the virtual Xbox 360 pad, so inputs may register twice.

## Commands

```
npm install
npm run dev      # start the app in development
npm run check    # typecheck, lint, unit tests, e2e
```

### Native modules

Needs the Visual Studio C++ build tools. `native/sendinput` (keyboard/mouse injection and foreground-process lookup) is built by `npm install`. If npm skips install scripts, or after changing Electron versions, build it explicitly:

```
cd native/sendinput && npx node-gyp rebuild    # for Node (scripts, ad-hoc checks)
cd ../.. && npm run rebuild -w @dualforge/desktop   # for Electron: node-hid, vigemclient, @dualforge/sendinput
```

If the addon is missing the app still runs, but keyboard/mouse mappings and per-game auto-switch are disabled (`E_INJECT_LOAD` is logged).

## Profiles

Four profile slots live in `%APPDATA%\DualForge\profiles\p1.json` .. `p4.json` (override the data dir with `DUALFORGE_DATA_DIR`). `settings.json` next to it holds the active profile and settings. A file that fails validation is moved to `profiles\corrupt\` (quarantine) and the slot falls back to defaults; the failure is logged.

**Share codes:** a profile can be exported as a text code starting with `DUALFORGE:` (deflated, base64url) and imported into any slot.

**Auto-switch:** `settings.autoSwitch` maps process names (e.g. `game.exe`, case-insensitive) to a profile. While that process is in the foreground the profile is applied; otherwise the active profile returns. Needs the native addon.

**Hardware defaults:** triggers default to digital (click) mode and rumble is off (`hasRumble: false`), matching the author's modified pad. Stock DualSense users should set `triggers.*.digital = false` and `hasRumble = true`. The two back paddles are wired to standard buttons, so they are mapped like any other button.

## Folder map

- `packages/shared` - types and schemas shared across packages
- `packages/engine` - pure processing pipeline (stick/trigger stages, profiles)
- `apps/desktop` - Electron app (main, preload, renderer)
- `docs/superpowers/{specs,plans}` - design specs and implementation plans
- `docs/reference` - reference material

## Logs

`%APPDATA%\DualForge\logs`

Not affiliated with Sony or GameSir.
