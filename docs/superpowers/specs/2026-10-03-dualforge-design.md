# DualForge — Design Spec

Date: 2026-10-03
Status: approved for planning

## 1. Goal

A Windows desktop configurator for a standard Sony PS5 DualSense connected
over USB, reproducing the feature set and the look of **GameSir Connect**
(primary visual reference) with the stick-tuning depth of **HyperStrike Hub**.
It must be reliable enough for daily use, with built-in diagnostics (A), a
full developer test pipeline (B), and a scheduled AI maintenance routine (C)
layered on top.

Research inventories for both reference apps live in the agent reports from
2026-10-03; official screenshots are kept under `docs/reference/` (copied
from the research scratchpad).

### Out of scope for v1
- Bluetooth transport (report layout + CRC differ; USB only).
- Firmware update (Sony only), polling-rate selection (fixed by firmware),
  stick quantization/bit-depth (DualSense sticks are 8-bit).
- DualSense Edge, third-party pads, multiple simultaneous controllers.
- Cloud sharing / "market". Share codes are local text only.
- Translations beyond English (strings are externalized so they can come later).

## 2. Stack

- **Electron 44 + TypeScript + React + Vite**, `electron-builder` for the
  NSIS installer. Same framework GameSir Connect uses.
- **node-hid** for DualSense HID I/O.
- **vigemclient** (ViGEmClient N-API bindings) for the virtual Xbox 360 pad.
  ViGEmBus driver installer is bundled and installed on first run with consent.
- **HidHide** optional: bundled installer; when enabled, the real DualSense
  is hidden from games so only the virtual pad is visible.
- Keyboard/mouse injection via a small N-API addon around `SendInput`
  (Visual Studio 18 is available to build it).
- Tests: **Vitest** (unit + integration), **Playwright** for Electron UI
  smoke tests. ESLint + typescript-eslint + Prettier. `npm audit` in CI.
- Logging: **pino** to rotating JSON files under
  `%APPDATA%\DualForge\logs\`. Crash dumps via Electron `crashReporter` to
  `%APPDATA%\DualForge\crashes\`.

## 3. Architecture

Three processes:

### 3.1 Main process
- Window lifecycle, frameless window chrome, tray icon, single-instance lock.
- **ProfileStore**: 4 profile slots + settings, JSON files under
  `%APPDATA%\DualForge\profiles\`. Atomic writes (write temp → rename),
  schema-versioned, validated with **zod** on load. Corrupt file → quarantine
  to `profiles\corrupt\` and load defaults; surfaced on Health page.
- **DriverManager**: detect ViGEmBus / HidHide services, run bundled
  installers (elevated), toggle HidHide whitelist.
- **EngineHost**: spawns/supervises the input engine `utilityProcess`,
  restarts it on crash with backoff (max 5 in 60 s, then surfaced as a Health
  error), forwards profile changes, relays state snapshots to the renderer.
- **GameWatcher**: polls foreground process every 2 s; auto-switches profile
  by executable name if configured.
- **HealthService**: runs checks (section 7), caches results, exposes repairs.
- **Updater**: `electron-updater` against a GitHub Releases feed (opt-in).

### 3.2 Input engine (`utilityProcess`)
Single-purpose, no Electron UI imports. Loop driven by `node-hid` async reads
(~1000 Hz on USB).

Pipeline per report (all stages are pure functions in `packages/engine/`):

```
rawReport(64B) → parseDualSense() → RawState
  → applyCalibration()        (center offset, outer radius per stick)
  → applyStickShaping()       (center/anti/outer deadzone, circular/square, invert)
  → applyStickCurve()         (preset or 8-point monotone piecewise-linear)
  → applyStickFilter()        (RC/smoothing: basic strength or speed-curve)
  → applyTriggers()           (deadzone, hair-trigger Off/Adaptive/Fixed, curve)
  → applyGyro()               (off | right-stick | mouse; always/hold/toggle)
  → applyMappings()           (button→gamepad/keyboard/mouse/macro, multi-map, turbo)
  → runMacros()               (scheduler for active macro sequences)
  → OutputFrame { xinput: XInputState, keys: KeyEvent[], mouse: MouseDelta }
```

Outputs:
- `xinput` → `vigemclient` target.
- `keys`/`mouse` → SendInput addon.
- Feedback: ViGEm rumble callback → scaled by profile intensities → DualSense
  output report (rumble, adaptive trigger effects, lightbar RGB, player LEDs,
  mic LED). Output report is sent only when its contents change or every
  250 ms as a keepalive.

State snapshot (`EngineSnapshot`: raw + processed sticks/triggers/buttons,
gyro, battery, report rate, engine health) is posted to main at 60 Hz for
the UI; the UI never reads hardware directly.

Engine also supports **replay mode**: fed from a recorded `.hidlog` file
instead of a device, used by integration tests and by the Health page's
"simulate" button when no pad is attached.

### 3.3 Renderer (React)
GameSir Connect shell. Zustand store mirroring the active profile; every
edit is debounced (100 ms) and sent to main → engine, so changes are live.
Strict IPC schema (zod) in `packages/shared/ipc.ts`; preload exposes only
typed channels via `contextBridge`.

## 4. UI

### 4.1 Visual language (from GameSir Connect screenshots)
- Frameless window, default 1280×800, min 1000×680. Custom min/max/close.
- Background: linear gradient 135°, `#3a1f28` → `#0b0b14`.
- Cards: `rgba(255,255,255,0.06)` fill, 1 px `rgba(255,255,255,0.10)` border,
  16 px radius. Accent `#e2403f`; focus ring `#f08a3c`; link `#3b82f6`;
  text `#f5f5f7` / muted `#a0a0ab`. Font: Poppins (bundled), mono for
  numeric readouts.
- Section labels prefixed with a 3 px red vertical bar.
- Controls: dual-handle range sliders with Initial/Max captions, segmented
  button groups, iOS-style red toggles, modals with blurred backdrop.
- Controller art: flat 2D top-view DualSense SVG (our own drawing), greyed,
  lightbar + player LEDs rendered live.
- Footer legend: `✚ Direction Control  Ⓐ Confirm  Ⓑ Back`. Full gamepad
  navigation: LB/RB switch top tabs, LT/RT switch sub-tabs, A/B confirm/back.
  Navigation uses the *processed* virtual-pad state only while the window is
  focused; it is disabled when unfocused so it never leaks into games.
- Light theme toggle exists (HyperStrike-style) but dark is default.

### 4.2 Header
Wordmark left · centered icon tab strip (Buttons · Sticks · Triggers ·
Motion · Vibrations · Lights · Macros) · right: Profile 1–4 tabs, Reset,
Input Test, Health, Home, Settings gear, window controls.

### 4.3 Pages
1. **Home** — detection status, battery %, USB/none, driver status chips,
   large pad render, "Unable to connect?" → Health.
2. **Overview** — 2×3 card summary around the pad render.
3. **Buttons** — pad diagram with leader-line pills for every input incl.
   touchpad click, mic, Create, Options, PS, L3/R3. Mapping modal tabs:
   Controller · Keyboard · Mouse · Macro. Multi-map ≤3 targets,
   "Continuous trigger" toggle, Turbo slider Off/5–30 Hz.
4. **Sticks** — L/R sub-tabs. Deadzones (center, anti, outer), curve presets
   (Linear, Aggressive, Precise, S-curve, Custom) + 8-point draggable editor
   with numeric inputs (0–100), circular/square, invert X/Y, center-offset
   nudge, RC filter (Basic strength slider; Advanced 5-point speed→strength
   curve), Calibration wizard (center → outer rotation → verify), live circle
   widgets with X/Y readouts and deviation test.
5. **Triggers** — L/R. Deadzone Initial/Max, Hair-trigger Off/Adaptive(1–100)/
   Fixed, curve, Adaptive Trigger Effect: Off · Resistance · Trigger · Weapon ·
   Vibration · Custom (start, end, force).
6. **Motion** — Output Off/Right stick/Mouse; Activate Always/Hold/Toggle +
   button; deadzone; curve preset; X/Y sensitivity; invert; Calibrate (flat,
   2 s sample).
7. **Vibrations** — L/R intensity 0–100 with Test; trigger-effect strength.
8. **Lights** — lightbar color picker, brightness, animation Off/Static/
   Breathing/Rainbow/Battery, speed; player-LED pattern; mic LED Off/On/Pulse.
9. **Macros** — list; Record from pad; step editor `[input, hold ms, delay ms]`
   ≤64 steps; loop toggle; assign to button.
10. **Profiles** — 4 slots, rename, duplicate, reset, export/import `.dfprofile`
    JSON, share-code (base64 of gzip JSON, prefix `DUALFORGE:`), per-game
    auto-switch table.
11. **Health** — see §7.
12. **Input Test** — every button/axis live, report-rate meter, raw vs
    processed view.
13. **Settings** — start with Windows, start minimized, HidHide on/off,
    theme, updates on/off, open data folder.

## 5. Data model (summary)

```ts
Profile {
  schemaVersion: 1; id; name;
  sticks: { left: StickConfig; right: StickConfig };
  triggers: { left: TriggerConfig; right: TriggerConfig };
  gyro: GyroConfig;
  vibration: { left: 0..100; right: 0..100; triggerEffects: 0..100 };
  lights: LightsConfig;
  mappings: Record<DsButton, Mapping>;   // Mapping = { targets: Target[≤3], turboHz?, continuous? }
  macros: Macro[];
}
StickConfig { calibration{cx,cy,radius}; deadzone{center,anti,outer}; circular; invertX; invertY;
              curve: {preset} | {points: [in,out][8]}; filter: {enabled, basic} | {enabled, points[5]} }
Settings { activeProfile; autoSwitch: {exe,profileId}[]; hidHide; startWithWindows; startMinimized; theme; updates }
```

Defaults reproduce a stock DualSense → stock Xbox 360 mapping with no shaping.

## 6. Error handling

- Device unplug: engine emits `disconnected`, releases ViGEm target after
  2 s grace (avoids re-enumeration flap), UI shows Home with status; auto-
  reconnect on re-plug.
- HID read error ×3 consecutive → close/reopen device; ×3 reopen failures →
  engine reports `deviceError`, main surfaces toast + Health entry.
- ViGEm unavailable → engine still runs for lights/triggers/live view; remap
  pipeline disabled with a clear banner and a "Install driver" button.
- Engine crash → EngineHost restart with backoff; after limit, Health shows
  red with the last 200 log lines attached.
- Profile corrupt → quarantine + defaults + Health warning.
- All errors logged with a stable `code` (e.g. `E_HID_OPEN`, `E_VIGEM_INIT`,
  `E_PROFILE_SCHEMA`) so the maintenance agent can triage by code.

## 7. Health (A)

Checks (run at startup, every 5 min, and on demand):
`driver.vigem`, `driver.hidhide`, `device.present`, `device.reportRate`
(warn < 800 Hz), `engine.alive`, `engine.latency` (p99 pipeline time, warn
> 2 ms), `profiles.integrity`, `disk.logs` (size, rotation), `app.update`.
Each → `ok | warn | error` + message + optional repair action:
install/repair ViGEm, enable HidHide, reset profile, restart engine,
clear logs, open logs folder, export diagnostic bundle (zip of logs,
crash dumps, profiles, health JSON, system info).

## 8. Developer pipeline (B)

- `npm run check` = typecheck + lint + unit + integration (replay-based).
- `npm run test:ui` = Playwright Electron smoke (launch, each page renders,
  mapping modal opens, profile save/load round-trip).
- Fixtures: recorded `.hidlog` captures (idle, full stick rotation, trigger
  sweeps, button chords) committed under `fixtures/`.
- Coverage threshold 85 % on `packages/engine`.
- `npm run audit` = `npm audit --omit=dev` + outdated report.
- GitHub Actions on push (if a remote is added) running the same.

## 9. Maintenance agent (C)

A scheduled Claude Code routine (daily) with a prompt file at
`maintenance/AGENT.md`:
1. `git pull`, `npm ci`, `npm run check`, `npm run audit`.
2. Read `%APPDATA%\DualForge\logs\*.json` (last 24 h) and `crashes\`.
3. Group by error `code`; for each new/recurring issue write a short
   triage note, propose a fix on a branch with tests, never force-push,
   never touch installers/drivers.
4. Write `maintenance/reports/YYYY-MM-DD.md` summary (what ran, pass/fail,
   issues found, PR/branch names, suggested user actions).
Guardrails: read-only on profiles; no dependency major bumps without a
report; stops and leaves a note if tests cannot run.

## 10. Repository layout

```
DualForge/
  package.json  (workspaces)
  apps/desktop/        electron main + preload + renderer
  packages/engine/     pure pipeline + DualSense report codec + replay
  packages/shared/     profile schema (zod), IPC types, constants
  native/sendinput/    N-API SendInput addon
  fixtures/            .hidlog recordings
  maintenance/         AGENT.md, reports/
  docs/                specs, reference screenshots
```

## 11. Milestones

1. Scaffold + engine codec + replay tests (no hardware needed).
2. ViGEm output + live remap + Home/Input Test pages (first usable build).
3. Sticks/Triggers/Motion/Vibration/Lights pages + output report.
4. Buttons modal, Macros, Profiles, auto-switch.
5. Health, logging, crash reports, installer, HidHide.
6. Pipeline B + maintenance agent C.
