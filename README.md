# DualForge

DualForge is a Windows desktop app (Electron) that configures a PlayStation 5 DualSense controller over USB. It reads the pad, applies your profile (stick curves, deadzones, calibration, trigger effects), and presents the result to games as a virtual Xbox 360 controller through ViGEm.

## Status

Plan 2 of 4. Done so far: engine, Home, Input Test, Sticks and Triggers pages. Motion, Vibrations and Lights are placeholders (Plan 3); the health check, installer, HidHide and background agent come in Plan 4.

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

## Folder map

- `packages/shared` - types and schemas shared across packages
- `packages/engine` - pure processing pipeline (stick/trigger stages, profiles)
- `apps/desktop` - Electron app (main, preload, renderer)
- `docs/superpowers/{specs,plans}` - design specs and implementation plans
- `docs/reference` - reference material

## Logs

`%APPDATA%\DualForge\logs`

Not affiliated with Sony or GameSir.
