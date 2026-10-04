# DualForge Plan 4 — Health & Diagnostics (A), HidHide, Installer & Startup, Pipeline (B), Maintenance Agent (C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks load the `frontend-design` skill.

**Goal:** Make DualForge a daily driver: it diagnoses and repairs its own environment, hides the real pad from games, installs/starts like a product, and keeps itself healthy via a test pipeline and a scheduled AI maintenance routine.

**Architecture:** `HealthService` in main runs pure check functions (engine-side facts come from snapshots/events; driver facts from `sc`/registry/HidHide CLI) and exposes results + repairs over zod IPC. HidHide is driven through its documented CLI (`HidHideCLI.exe`) rather than a custom driver interface. The installer is electron-builder NSIS with the addon unpacked from asar; ViGEmBus/HidHide installers are downloaded on demand with hash verification and run only after explicit user consent inside the app. Pipeline B is `npm run check` + coverage + audit + a GitHub Actions workflow file (runs if a remote exists). Agent C is a prompt file + a scheduled Claude Code routine that runs the pipeline, reads logs/crash dumps, triages by `E_` code, and writes a dated report.

**Spec:** `docs/superpowers/specs/2026-10-03-dualforge-design.md` §3.1 (DriverManager, HealthService, Updater), §6, §7, §8, §9, §10. Backlog: `docs/BACKLOG.md` (Plan 4 items are pulled in below).

## Global Constraints
- All prior Global Constraints apply (zod at IPC, `E_` codes, renderer isolation, commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, never touch other apps/clipboard in tests).
- **Driver installs (ViGEmBus, HidHide) run only after the user clicks a consent button in the app**; the installer binary is downloaded from the official GitHub release, SHA-256 printed in the Health log, and Authenticode signer checked (`Nefarius Software Solutions e.U.`) before launch. Implementers never run these installers themselves (ViGEmBus is already installed; HidHide is NOT — the user will trigger it from the Health page).
- Health checks must be pure functions over inputs gathered by thin adapters (so they unit-test without drivers).
- No network calls except: driver installer download (user-triggered) and the optional updater (default off).
- Logs: pino JSON under `%APPDATA%\DualForge\logs\` (exists), crash dumps via `crashReporter` to `crashes\`, diagnostics bundle = zip of logs + crashes + profiles + settings + health JSON + system info (no secrets).
- Error codes used by the agent must be stable: keep `docs/ERROR_CODES.md` as the registry (new task).

---

## File structure
```
apps/desktop/src/main/health/{checks.ts,service.ts,adapters.ts,repairs.ts,bundle.ts}
apps/desktop/src/main/hidhide.ts                 CLI wrapper (whitelist DualForge, hide DualSense)
apps/desktop/src/main/driver-installer.ts        download+verify+launch (consent gated)
apps/desktop/src/main/startup.ts                 start with Windows (app.setLoginItemSettings), start minimized, tray
apps/desktop/src/main/tray.ts
apps/desktop/src/main/updater.ts                 electron-updater, opt-in
apps/desktop/src/renderer/pages/Health.tsx + health/*
apps/desktop/electron-builder.yml                NSIS, asarUnpack **/*.node, extraResources
native/sendinput: prebuild script + bin dir fix (BACKLOG)
packages/engine: hot-path allocation pass (BACKLOG)
docs/ERROR_CODES.md
.github/workflows/check.yml
maintenance/AGENT.md, maintenance/run-checks.ps1, maintenance/reports/
vitest coverage thresholds (85% packages/engine)
```

---

### Task 1: Error-code registry + log hygiene
- Create `docs/ERROR_CODES.md` listing every `E_*` and `ENGINE_*`/`APP_*` code in the codebase (grep), with meaning + typical cause + user-facing fix. Add a unit test that greps `apps/desktop/src` + `packages` for `E_[A-Z_]+` and fails if any code is missing from the doc (keeps the registry honest).
- Logging: engine `E_INJECT_LOAD` logged once (dedupe at host); status transitions at info; log rotation already daily/10 MB — add a startup prune of files older than 14 days.
- Commit `docs: error code registry; log hygiene`

### Task 2: Health checks (pure) + adapters + service + IPC
- `checks.ts`: `runChecks(input: HealthInput): HealthResult[]` with inputs `{ vigem: {serviceState, busDevicePresent}, hidhide: {installed, cliPath, whitelisted, deviceHidden}, device: {present, reportHz, source}, engine: {alive, restartsLastHour, p99Ms, lastErrorCodes: string[]}, profiles: {slot, status: 'ok'|'quarantined'|'default'}[], disk: {logBytes, logFiles}, app: {version, updateAvailable: boolean|null}, inject: {available, foregroundElevated: boolean|null} }` → results `{ id, status: 'ok'|'warn'|'error', title, detail, repair?: RepairId }`. Rules per spec §7 (reportHz warn < 800 for a 1 kHz pad — but the user's pad runs 8 kHz: warn when < 800 **or** when a previously seen rate drops by > 50 %), p99 warn > 2 ms, restart limit error, quarantined profile warn, logs > 200 MB warn, injector unavailable warn, elevated foreground game warn ("keys/mouse can't be injected into an elevated game").
- `adapters.ts`: gather inputs (`sc query ViGEmBus` via `execFile`, PnP via `Get-PnpDevice` PowerShell call with timeout, HidHide CLI `--dev-list`/`--app-list`, snapshot cache from EngineHost, store statuses, fs stats, `TokenElevation` via the sendinput addon — add `foregroundElevated(): boolean` to the addon). All with 5 s timeouts and coded errors.
- `service.ts`: runs on startup, every 5 min, on demand; caches last result; emits `health:changed` to the renderer; repairs: `installViGEm`, `installHidHide` (consent flow → Task 4), `enableHidHide`, `restartEngine`, `resetProfile(id)`, `clearLogs`, `openLogs`, `exportBundle` (Task 3).
- IPC: `health:get`, `health:run`, `health:repair {id, arg?}` zod-validated; preload `window.dualforge.health.*`.
- Tests: checks are table-driven; adapters mocked; service scheduling with fake timers.
- Commit `feat(desktop): health checks, adapters, service and IPC`

### Task 3: Diagnostics bundle + crash reporter
- `bundle.ts`: zip (use `archiver` or Node 24 `zlib` + a minimal zip writer — prefer `yazl`) of logs (last 7 days), crashes, profiles, settings, latest health JSON, `system.json` (OS build, CPU, Electron/Node versions, addon ABI, driver versions). Save via `dialog.showSaveDialog`. Redact nothing sensitive is included (profiles contain no secrets).
- `crashReporter.start({ uploadToServer: false, submitURL: '' , compress: true })` in main before `whenReady`; renderer/engine crashes land in `crashes\`.
- Tests: bundle contents listing (temp dir), size cap 50 MB.
- Commit `feat(desktop): diagnostics bundle and crash dumps`

### Task 4: Driver installer flow (ViGEmBus repair, HidHide install) — consent gated
- `driver-installer.ts`: `fetchRelease(repo)` → latest asset `.exe`; download to `%TEMP%` with progress events; SHA-256 computed and logged; Authenticode check via PowerShell `Get-AuthenticodeSignature` (status Valid + subject contains `Nefarius Software Solutions`); then `shell.openPath`/`execFile` the installer (UAC prompt appears). Status events to the renderer: `idle → downloading(pct) → verifying → launching → done|failed(code)`.
- Health page shows a consent card before anything downloads ("Install HidHide (driver by Nefarius, ~3 MB). You'll see a Windows UAC prompt.") with the exact URL and, after download, the hash.
- Tests: fetch/verify logic with mocked fetch/execFile; signature-check parser.
- **Implementers must not run the HidHide installer**; the user does it from the Health page.
- Commit `feat(desktop): consent-gated driver installer`

### Task 5: HidHide integration
- `hidhide.ts`: locate `HidHideCLI.exe` (`%ProgramFiles%\Nefarius Software Solutions\HidHide\x64\HidHideCLI.exe`), commands: `--app-reg <DualForge exe>`, `--dev-hide <instance path of the DualSense HID game controller>`, `--cloak-on/--cloak-off`, `--dev-list`, `--app-list`. Device instance path from PnP (`HID\VID_054C&PID_0CE6…`). Settings `hidHide` toggle → enable = register app + hide device + cloak on; disable = cloak off (keep registrations). Health check reports state; repair `enableHidHide`.
- Edge: when the engine is not running or DualForge quits with cloak on, games can't see the pad at all → on `before-quit`, if `hidHide` enabled, run `--cloak-off`; on start, cloak on again. Document the trade-off in Settings ("While DualForge is closed the DualSense is visible again").
- Tests: command composition and output parsing with mocked execFile.
- Commit `feat(desktop): HidHide integration`

### Task 6: Startup, tray, updater
- `startup.ts`: `app.setLoginItemSettings({ openAtLogin, args: ['--minimized'] })` from `settings.startWithWindows`; `--minimized` → create window hidden; `tray.ts`: tray icon with Show/Hide, active profile submenu (switch), Quit; close button minimizes to tray when `startMinimized` (else quits) — add setting `closeToTray` default true.
- `updater.ts`: `electron-updater` GitHub provider, only when `settings.updates`; manual "Check now" on Settings; never auto-install; Health `app.update` check uses its result.
- Settings page: remove the "Not active yet" hints; add Close-to-tray toggle.
- Tests: startup args parsing; tray menu builder; updater gating.
- Commit `feat(desktop): start with Windows, tray, opt-in updater`

### Task 7: Health page (UI)
- Layout: top status banner (All good / N warnings / Problems), list of checks as cards with status dot, title, detail, and a Repair button when applicable (with progress for driver installs), "Run checks now", "Export diagnostics bundle", "Open logs folder", "View log" (tail of today's log in a mono panel with level filter). Add Health to the header right icons (heart-pulse icon) and route from Home's "Unable to connect?".
- Tests: renders results from a stubbed `health.get`; repair button invokes `health.repair`; e2e: Health page lists `device.present` ok with the pad attached.
- Commit `feat(renderer): health page`

### Task 8: Packaging
- `electron-builder.yml`: appId `com.dualforge.app`, NSIS (per-user, oneClick false, allow dir change), `asarUnpack: ["**/*.node"]`, `files` include the sendinput addon build, icon (generate a simple 256px D badge PNG → ICO via `png-to-ico`), `extraResources` none (drivers downloaded on demand). `npm run dist` script. Fix the addon `bin/<abi>` dir issue from BACKLOG (prefer `build/Release` only, remove bin lookup) and add a `prebuild` check that fails the build if the addon is missing.
- Verify: build the installer, install to a temp per-user location via `/S`?? — **no silent install of our own app without consent either**: just build and smoke-run the unpacked `win-unpacked\DualForge.exe` with Playwright (`executablePath`) to prove the packaged app starts, loads the addon, and shows Connected.
- Commit `build: NSIS installer, asar unpack for native addon`

### Task 9: Pipeline B
- `vitest.config.ts`: coverage (v8) thresholds `packages/engine` 85 % lines/branches; `npm run coverage`.
- `npm run audit` = `npm audit --omit=dev --audit-level=high` + `npm outdated` report (non-failing).
- `npm run check:full` = typecheck + lint + prettier --check + test + coverage + test:ui + audit. Enforce prettier (format the repo once; BACKLOG).
- `.github/workflows/check.yml` (windows-latest; node 24; MSVC present on the runner; runs `check:full` minus e2e, since no display/driver) — committed even without a remote.
- `maintenance/run-checks.ps1`: wrapper that runs `check:full`, writes `maintenance/reports/last-check.json` (pass/fail per step, durations).
- Commit `ci: coverage thresholds, audit, prettier, workflow, check runner`

### Task 10: Maintenance agent C
- `maintenance/AGENT.md`: the routine's prompt (from spec §9): pull if remote, `npm ci`, `run-checks.ps1`, read last 24 h of `%APPDATA%\DualForge\logs\*.log` + `crashes\`, group by `code` using `docs/ERROR_CODES.md`, triage, propose fixes on a branch `maint/YYYY-MM-DD` with tests, never force-push, never touch installers/drivers/profiles, write `maintenance/reports/YYYY-MM-DD.md`, stop with a note if checks can't run. Guardrails section + a "user actions suggested" section.
- `maintenance/README.md`: how to schedule it with the Claude Code scheduler (`/schedule` daily 09:00) and how to run it manually.
- A scheduled routine is created by the **controller** at the end (user already asked for C), not by the implementer.
- Commit `docs: maintenance agent routine`

### Task 11: Backlog sweep (engine hot path + misc)
- Engine: `maybeWriteOutput` only on dirty/keepalive; anti-deadzone fast path; gyro mouse coalescing to 1 kHz; dt clamp 20 ms; macro catch-up resync; settings per-field salvage; `writeJsonAtomic` rename retry; flush on `session-end`; foreground-pid focus gating; `E_VIGEM_TARGET` distinct code; spec text amendments (defaults, anti-deadzone order, share-code format, export extension, settings location). Each with a test where behaviour changes.
- Commit `perf/fix: engine hot path and robustness backlog`

### Task 12: Final e2e + README + version bump 0.2.0
- E2E: Health page; packaged-app smoke (Task 8) kept as a separate script not in `check` (needs a build).
- README: install, drivers, Health, tray, maintenance; `package.json` version 0.2.0 (footer shows it).
- Commit `chore: release 0.2.0 docs`

## Self-review
Spec §3.1 DriverManager ✔ T4/T5, HealthService ✔ T2, Updater ✔ T6, GameWatcher done (3A); §7 Health ✔ T2/T3/T7; §8 pipeline ✔ T9; §9 agent ✔ T10; §4.3 page 11 ✔ T7, page 13 settings completion ✔ T6; HidHide ✔ T5; installer ✔ T8; backlog ✔ T11. Placeholders: none (tasks are specified by behaviour + tests; implementers write code). Consistency: `health.*` preload used by T7; `foregroundElevated` addon fn added in T2 used by checks; settings `closeToTray` added in T6 used by tray.
