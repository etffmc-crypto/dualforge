# DualForge backlog (deferred review findings)

Carried from the Plan 1 and Plan 2 review ledgers. Triage into Plan 3/4 tasks.

## From Plan 2 (2026-10-04)

- Tasks 1-6 minor (deferred): buildOutputReport allocates per report (cache until feedback changes); triggers.test.ts repeated buildCurveLut; trigger-effect tests slice prefixes only; section.start<end not enforced in schema.
- Deferred minors (re-review): vigem-sink pad object orphaned if p.connect() fails (add try/catch disconnect+null); redundant status event after failed connect.
- Tasks 7-9 minor (deferred): points.slice(0,pointCount) truncation; no memo on 60 Hz path (DualSenseTop re-renders per tick); tabs lack roving tabindex/arrow nav/aria-controls; Toggle/Segmented/RangeSlider without label lack accessible name; test gaps (drag stop, keyboard nudge, document.fonts.check); hover/transition hard-coded colours.
- Deferred minor: DraftNumber doesn't refresh draft text when parent points change mid-edit (stale until blur). Carry into Task 11 dispatch (preset switch must reset drafts).
- Tasks 10-13 minor (deferred): RangeSlider pct unclamped (fill overflow when value outside range); stash-restore path untested; no focus trap in wizard; gamepad nav threshold on `out` may not fire under heavy curves; wizard step 3 lacks Back; lastError not surfaced on pages; per-frame setState in wizard.
- Deferred minors (final review): phantom virtual pad at launch; [done Plan 4] E_VIGEM_TARGET folded into E_VIGEM_INIT; [done Plan 4: spec amended] trigger effect modes narrowed vs spec (Trigger/Weapon/Custom → Plan 3); vibration hint wording; [done Plan 4: spec amended] anti-deadzone-before-curve; StickLive rings ignore calibration; wizard step 2 lacks live dot; .ttf vs .woff2; gamepad nav not built yet; lastError sticky; regression-test gaps (calibration+invert pipeline, stop clears effects — now added, filter dt=1 — now added, disconnect during in-flight connect).
- USER HANDS-ON CHECKS pending (user will run after merge): L2 stiffens with Resistance; calibration wizard → full-right X ≈ 1.0.

## From Plan 1 (2026-10-03/04)

- vitest workspace deprecation (done in Plan 2); tests not typechecked (done); parser button-bit coverage all-at-once; buildOutputReport doesn't mask micLed/brightness at runtime; prettier not enforced in check; dense formatting > printWidth; MouseEvent export shadows DOM name; hidlog hex length (done); E_VIGEM_TARGET folded into E_VIGEM_INIT [done Plan 4]; sink.update unwrapped; looped replay unpaced/t backwards; second-instance (done); replay mode not restored after engine restart; profile:set error not logged; a11y gaps; smoke test satisfiable by real pad; renderer bundle 772 kB; setProfile state reset (done in Plan 2); stage order (done in Plan 2); 2 s grace (done in Plan 2).

## From Plan 3A (2026-10-04)

- [done Plan 4] Hot path at 8 kHz: ~30 allocations/report (anti-deadzone objects, lightbar compute per report, buildOutputReport per report) → gate maybeWriteOutput on dirty flag/keepalive; anti<=0 fast path. (Remaining: stick shaping/LUT still allocate result objects.)
- Gyro: [done Plan 4] coalesce mouse SendInput to ~1 kHz; [done Plan 4] clamp dt (~20 ms) after stalls; [done Plan 4] reset toggle on profile swap; activation button also fires its own mapping (3B decides).
- [done Plan 4] Macros: catch-up after long stall (resync untilMs); zero-cycle loop comment wrong.
- Persistence: [done Plan 4] settings quarantines whole file for one bad field (salvage per field); writeJsonAtomic no fsync (open) / [done Plan 4] rename retry (EPERM/EBUSY); [done Plan 4] flush on session-end; set() throws uncoded errors (open).
- Security/input: [done Plan 4; exact once the addon exports `foregroundPid`, else falls back to exe name] focus gating is window-level (native dialogs blur) → gate on foreground pid ≠ own pid; autoSwitch exe length/count unbounded; watcher current not reset when rules change.
- Native addon (Plan 4): UIPI (elevated games) silently drops SendInput → Health warning via TokenElevation; VK_SNAPSHOT/VK_PAUSE via VK path; pointer acceleration note; bin/<abi> dir never populated; asarUnpack **/*.node; install script needs MSVC; psapi.lib unnecessary.
- [done Plan 4] Spec amendments needed: defaults (digital/no rumble) vs 'stock DualSense'; anti-deadzone after curve; share code = deflateRaw+base64url; export ext .dualforge.json; settings.json location.
- Misc: battery lightbar red until first report; e2e temp dirs not removed; settings-store.set uses this.get; E_INJECT_LOAD logged twice; legacy profile:get/set fixed in F6; renderer must use profiles.current()+onActive (3B).

## From Plan 3B (2026-10-04)

- Plan 4 hand-off: preload surface (flags.navReplay, profiles._, settings._, system.{openDataDir,processes}, engine.{runMacro,testRumble}); env DUALFORGE_DATA_DIR (logs ignore it — fix), DUALFORGE_NO_INJECT, DUALFORGE_NAV_REPLAY; e2e temp dirs never cleaned; nav e2e needs real window focus; Home auto-routes to Overview on first connected snapshot.
- stopMacro command + stop play-test on editor close/blur (keys can inject into another app after alt-tab).
- Store races: edits during profile switch lost (sequence counter); rename vs in-flight save (flushPending before rename); overlapping optimistic settings updates.
- system:openDataDir ignores shell.openPath error string; handler not in registerIpc (untested).
- Header: Home + Input Test duplicated (tab strip and right icons) — settle when adding Health.
- Header profile tabs vs active auto-switch semantics (manual activate during a game rule).
- [done Plan 4] Spec: .dfprofile vs .dualforge.json; Vibrations trigger-effect strength missing from schema (moot for digital triggers).
- a11y: ProfileTabs tablist contains pencil buttons/no arrow keys; Modal doesn't inert background; mcard-roll aria-hidden button.
- Gyro calibration: no stillness check; success shown even if updateProfile returned false; hue slider at red for white; linear sensitivity slider (log later); Motion stage re-renders pad+curve at 60 Hz; calibration unmount test.
- Settings: exe format refine in schema; [done Plan 4] >32 rules file quarantines whole settings (per-field salvage, autoSwitch resets to []); 'Services' session filter locale-dependent (use session number).
- Macros: play test persists new macro before cancel; recorder timing ~16 ms (document).
- Stale doc comments mentioning LT/RT in SettingsLayout.tsx and Sticks.tsx; main load() returns sparse mappings (renderer densifies).

## From Plan 4 (2026-10-04) — parked at final review

- Native addon: export foregroundPid (removes 2 s blur race + exe-name fallback for the inject gate); re-sample 100-200 ms after blur.
- HidHide: decline latch is in-memory only (prompts again next launch); verify admin requirement, CompatibleID filter and UAC flow on real install; Bluetooth instance paths not matched; quit drain 5 s untested in index.ts.
- Maintenance: Claude Code deny-rule matching for ~/AppData and //c/ forms unverified; wildcard looseness on 'git add apps/*'; unstaged report after a dirty run keeps the tree dirty for the next run; stale last-check.json when node missing.
- Installer: signer exact-CN/thumbprint check; per-driver ASSET_PATH; drain 3xx bodies; unsigned (SmartScreen); app-update.yml presence in installer build unverified; node-hid prebuild bloat; root scripts unlinted.
- Health: crash dumps never pruned (bundle UI should say dumps included); done-state releases nav hold before installer closes; failing probe logs every 5 min; access-denied counted as elevated.
- Persistence: rename retry rethrows uncoded; quarantine rename no retry; per-rule autoSwitch salvage.
- Updates toggle hidden until a real publish owner is configured.

## From Turbo mode review (2026-10-05)

- Toggle-latched analog trigger (digital=false) has no visible effect (hold mode works).
- Trigger used as the pressed button in an on-pad combo: analog pull not swallowed (digital press is).
- Consider skipping turboConfigured/pulse for mappings whose targets are all none.
- TurboControls 'Custom' state can go stale if a pad combo lands while the modal is open.
- E2E edge-count assertion only runs when snapshot sampling is dense enough (engine unit tests carry the precise checks).

## Review rule (added 2026-10-05 after the negative-smoothing miss)

Every feature whose point is a felt or visible effect must ship with a test that samples the output **the way the consumer does** (a game polling at 60–250 Hz, a screen at 60 fps, a human reading a message) and asserts the effect is present at that rate. Internal correctness at 8 kHz is not enough. Design briefs state the consumer's timescale; reviewers ask "is this observable at the consumer's sampling rate, and which test proves it?"

## From the 0.3.4 re-review (2026-10-05)

- Updater: with an `unknown` current version the fallback `version !== currentVersion` reports an update when electron-updater omits `isUpdateAvailable` (not reachable in the packaged build).
- Health "Retry now" shows Done even if the CLI hangs again; the card keeps its title (wording only).
- Health HidHide hang text hard-codes "2 s" / "30 minutes" instead of using HIDHIDE_PROBE_TIMEOUT_MS / HIDHIDE_BACKOFF_MS.
- A non-timeout, non-denied HidHideCLI list failure is still logged on every run (no memo).
