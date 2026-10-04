# DualForge Plan 3B — Pages: Overview, Buttons + Mapping Modal, Macros, Motion, Vibrations, Lights, Profiles, Settings, Gamepad Navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every UI task loads the `frontend-design` skill first and matches `docs/reference/gamesir-connect/*.png`.

**Goal:** Complete the GameSir-Connect feature set in the UI on top of Plan 3A's engine/main work.

**Architecture:** Same renderer stack; pages compose the Plan 2 control library; profile edits flow through `updateProfile`. New shared `Modal` component (focus trap, blurred backdrop, Escape) used by the mapping modal, macro editor and calibration wizard (migrate it). Header gains Profile 1–4 tabs and a working Reset. Gamepad navigation is a global hook driven by the virtual-pad snapshot while the window is focused.

**Spec:** `docs/superpowers/specs/2026-10-03-dualforge-design.md` §4. Reference screenshots: `ss2.png` (Overview grid), `ss3.png` (Buttons page with leader-line pills), `ss6.png` (mapping modal), `ss1.png` (Motion), `ss5.png` (Lights).

## Global Constraints
- Plan 1/2/3A constraints and visual tokens apply.
- User hardware defaults: triggers digital, no rumble → Vibrations page shows a "This controller has rumble motors" toggle (bound to `settings.hasRumble`) and greys out the sliders when off; Triggers page shows the **Digital (mouse-click) trigger** toggle at the top of each side and hides analog sections when on.
- Gamepad nav never leaks into games: it reads the snapshot only while `document.hasFocus()`; main also gates the injector (3A).
- Every page has: a unit test of its core edit path and an e2e assertion in `apps/desktop/e2e/pages.spec.ts`.

## File structure
```
components/Modal.tsx (+ modal.css reuse)      shared dialog with focus trap
components/ProfileTabs.tsx                    header Profile 1–4
components/useGamepadNav.ts                   global A/B/LB/RB/LT/RT/dpad navigation
pages/Overview.tsx                            2×3 card grid around the pad
pages/Buttons.tsx + buttons/{PadDiagram,MappingModal,KeyGrid,MouseGrid,ControllerGrid,MacroPicker}.tsx
pages/Macros.tsx + macros/{MacroList,MacroEditor,RecordDialog}.tsx
pages/Motion.tsx, pages/Vibrations.tsx, pages/Lights.tsx
pages/Profiles.tsx, pages/Settings.tsx
pages/Triggers.tsx (digital toggle), pages/Sticks.tsx (StickLive rings in calibrated space)
```

---

### Task 1: `Modal` + header Profile tabs + Reset + Settings page
- `Modal { open, title, onClose, children, width? }`: `role="dialog"`, `aria-modal`, focus trap (Tab loops), Escape closes, backdrop click closes, restores focus. Migrate `CalibrationWizard` to it.
- `ProfileTabs`: four tabs "Profile 1–4" (names from `profiles.list()`), active = `settings.activeProfile`; click → `profiles.activate(id)`; right-click/pencil → inline rename.
- Header Reset button → confirm Modal → `profiles.reset(active)`.
- Settings page (gear in header): toggles for `hasRumble`, `hidHide` (disabled with "Plan 4" tooltip), `startWithWindows`, `startMinimized`, `updates`; theme Dark/Light segmented (light theme = token overrides in `tokens.css` `[data-theme=light]`); "Open data folder" button (IPC `shell.openPath`).
- Tests: Modal focus trap + Escape; ProfileTabs activates; Settings toggle round-trips through a stubbed `settings.set`. E2E: rename Profile 2, reload page, name persists.
- Commit `feat(renderer): modal, profile tabs, reset, settings page`

### Task 2: Overview page (ss2)
- 2×3 card grid around the centered `DualSenseTop`: Lights (mode segmented + hue slider + brightness), Motion (summary rows with ">" → Motion page), Triggers (per-side deadzone/hair summary or "Digital" badge), Sticks (deadzone + anti sliders both sides + two `CurvePreview`s), Buttons (list of non-default mappings as `L4 ▸ [target]` style chips → Buttons page). Model name + battery pill under the render. Becomes the landing page after connect; Home stays the "not connected" screen (route: snapshot.connected ? overview : home on first load).
- Tests: cards render summaries from a stubbed profile; chip click navigates. Commit `feat(renderer): overview dashboard`

### Task 3: Buttons page + mapping modal (ss3, ss6)
- `PadDiagram`: `DualSenseTop` centered with leader lines to circular labelled pills arranged left/right/top like GameSir (left column: L1, L2, D-pad, L3, Create, touchpad; right column: R1, R2, △○✕□, R3, Options, mic; top: PS). Each pill shows the current mapping summary (icon/text) and opens the modal.
- `MappingModal` tabs **Controller · Keyboard · Mouse · Macro**: Controller grid = all `X_BUTTONS` + LT/RT (xtrigger) + "No output"; Keyboard = `KeyGrid` (full on-screen keyboard from `vk.ts` incl. nav/numpad/media); Mouse = Left/Right/Middle; Macro = `MacroPicker` list. Footer: "Map multiple buttons (up to 3)" toggle (shows chips of selected targets), "Continuous trigger" toggle, Turbo slider Off/5–30 Hz, Clear, Done. Edits via `updateProfile`.
- Tests: open modal for cross, choose keyboard Space → mapping `{type:'key',code:'VK_SPACE'}`; multi-map adds up to 3 then disables; turbo value persists. E2E: map square → B, replay fixture (cross pulses) unaffected; getProfile shows square→B.
- Commit `feat(renderer): buttons page with mapping modal`

### Task 4: Macros page
- `MacroList` (name, steps count, loop badge, assigned-to buttons, Edit/Delete/Duplicate), **New macro** → `MacroEditor` Modal: name, loop toggle, step table (target picker reusing modal grids, hold ms, delay ms, up/down/delete, ≤64), **Record** → `RecordDialog`: captures button presses from the snapshot with timings (hold = press duration, delay = gap) until Stop; "Play test" sends `engine:testMacro` (3A: add command `{type:'runMacro', id}` to EngineCommand in this task — small shared+loop edit).
- Tests: editor adds/reorders steps and saves via updateProfile; record dialog converts a scripted snapshot stream into steps. Commit `feat(renderer): macros page with recorder`

### Task 5: Motion page (ss1)
- Rows: Motion Mode (Off/Aim) → `output`; Output (Right stick / Mouse) segmented; Activate Method (Always/Hold/Toggle) + Activate Button picker (DsButton grid in a Modal); Deadzone slider (deg/s); Curve segmented; X/Y Sensitivity dual sliders with Horizontal/Vertical captions; Invert X/Y toggles; **Calibrate** button: 2 s still → averages raw gyro into `bias`. Right area: `CurvePreview` + pad render + a live "gyro meter" (yaw/pitch bars).
- Tests: toggling output and setting sensitivity edit the profile; calibrate computes bias from a scripted snapshot stream. Commit `feat(renderer): motion page`

### Task 6: Vibrations + Lights pages (ss5)
- Vibrations: `hasRumble` toggle (settings) at top; Left/Right intensity sliders with **Test** buttons (IPC `engine:testRumble {left,right,ms}` — add command); greyed when off.
- Lights: sub-tabs **Lightbar · Player LEDs · Mic**; Lightbar: Animations segmented Off/Static/Breathing/Rainbow/Battery, Color hue slider (rainbow strip track) + brightness + speed; Player LEDs: 5 toggles; Mic: Off/On/Pulse. Pad render shows the live lightbar (already) and LEDs.
- Tests: edits persist; e2e: set Rainbow, `getProfile().lights.mode === 'rainbow'`. Commit `feat(renderer): vibrations and lights pages`

### Task 7: Profiles page
- Four slot cards (name, active badge, Activate/Rename/Duplicate to…/Reset/Export/Import), **Share code** panel: Copy code for current / paste code → import to slot; **Auto-switch** table: rows `exe → profile` (add via "Pick running game" list from a new IPC `system:processes` returning running exe names, or typed), remove.
- Tests + e2e (share code round-trip into slot 3). Commit `feat(renderer): profiles page with share codes and auto-switch`

### Task 8: Triggers digital toggle, Sticks ring fix, Home/Input Test polish
- Triggers: `Digital (mouse-click) trigger` toggle per side; when on, hide deadzone/hair/curve/effect sections and show "Output: full pull — remap on the Buttons page" with a link.
- Sticks: `StickLive` deadzone rings drawn in calibrated space (apply calibration to raw dot; rings relative to calibrated center).
- Input Test: add gyro bars and touchpad finger dots; show `source: replay` badge when replaying (3A snapshot field — add `source` to `EngineSnapshotSchema` in this task).
- Commit `feat(renderer): digital trigger mode, calibrated stick rings, input test extras`

### Task 9: Gamepad navigation
- `useGamepadNav` (global, in Shell): while focused, LB/RB cycle header tabs, LT/RT cycle sub-tabs on the current page, D-pad moves focus among focusable controls (roving `tabindex` via a `data-nav` attribute scheme), A = click/toggle, B = back/close modal. Footer legend already exists. Repeat-rate 150 ms on held d-pad.
- Tests: scripted snapshot stream switches tabs; B closes an open Modal. Commit `feat(renderer): gamepad navigation`

### Task 10: Final e2e sweep + README
- `pages.spec.ts` covers one edit per page; README updated with page list and the paddles/digital-trigger notes. Commit `test: page coverage; docs`

## Self-review
Spec §4.3 pages 2,3,6,7,8,9,10,13 ✔ T2–T7, T1; gamepad nav ✔ T9; light theme toggle ✔ T1; Health/Input-test polling meter → Plan 4 (Health) except gyro/touch extras ✔ T8. Interfaces consumed from 3A: `profiles.*`, `settings.*` preload API; `EngineCommand` additions (`runMacro`, `testRumble`) are made here with their loop handlers.
