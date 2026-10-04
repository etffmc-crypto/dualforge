# DualForge Plan 3A — Engine & Main: Digital Triggers, Mapping Extensions, Macros, SendInput, Gyro, Lights, Profile/Settings Stores, Game Watcher

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the remaining pages need from below the UI: digital-trigger handling, button→trigger/key/mouse/macro output with a real `SendInput` bridge, a macro scheduler, gyro→stick/mouse, lightbar animations, persisted profiles (4 slots) + settings, import/export/share codes, and per-game auto-switch.

**Architecture:** All new behaviour is pure in `packages/engine` (gyro stage, lights animator, macro scheduler, extended mapping) and compiled via `compileProfile`. `apps/desktop` adds a tiny N-API addon (`native/sendinput`) for keyboard/mouse injection and foreground-process lookup, a `ProfileStore`/`SettingsStore` with atomic JSON writes under `%APPDATA%\DualForge`, and a `GameWatcher`. IPC grows with zod-validated channels for profiles, settings and macros.

**Tech Stack:** as Plans 1–2; plus `node-addon-api` + `node-gyp` (Visual Studio 18 present) for the addon; `pako` is NOT needed — use Node `zlib` in main for share codes.

**Spec:** `docs/superpowers/specs/2026-10-03-dualforge-design.md` §3.1–3.2, §4.3 (pages 3, 6–10), §5, §6. Backlog: `docs/BACKLOG.md`.

## Global Constraints

- All Plan 1/2 Global Constraints apply (pure stages, renderer isolation, zod at IPC boundaries, `E_` codes, commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, no driver installs without an explicit yes).
- User hardware facts (binding for defaults): Demon-Workshop-modded DualSense — digital mouse-click triggers (raw snaps 0→1.0), **no rumble motors**, two back paddles wired to standard buttons. Defaults: `triggers.*.digital = true`, `settings.hasRumble = false`. Stock-DualSense users flip these.
- `schemaVersion` stays `1`; every new field has a zod `.default()`.
- Stage order (spec §3.2, now exact): shaping → curve → **anti-deadzone** → filter → triggers → gyro → mappings (mappings may override axes/triggers) → macros.
- Hot path: no per-report allocation beyond the existing `OutputFrame`; compile everything per profile.
- Keyboard/mouse injection only when `document`-independent: the engine injects regardless of window focus (games are the target), but **never** while the DualForge window itself is focused (so UI gamepad-nav doesn't type into the app) — main tells the engine `uiFocused` via a command.
- Macro limits: ≤64 steps, hold/delay 0–10 000 ms, ≤32 macros per profile.
- Share code format: `DUALFORGE:` + base64url( deflateRaw( JSON of the profile with `id` stripped ) ). Max 16 KiB decoded.

---

## File structure

```
packages/shared/src/profile.ts        + triggers.*.digital, gyro, lights ext, Mapping targets (xtrigger, macro), macros[], 
packages/shared/src/settings.ts       SettingsSchema, defaultSettings()
packages/shared/src/ipc.ts            + EngineCommand uiFocused/setSettings; new ProfileIpc channel schemas
packages/engine/src/stages/stick-shape.ts   anti-deadzone split out: applyAntiDeadzone()
packages/engine/src/stages/gyro.ts    applyGyro()
packages/engine/src/stages/mapping.ts targets xtrigger/macro; accepts pre-filled xinput; digital triggers
packages/engine/src/stages/macros.ts  MacroState, startMacro, tickMacros
packages/engine/src/lights.ts         computeLightbar(cfg, tMs, battery)
packages/engine/src/compile.ts        + gyro, lights, macros index, digital flags
packages/engine/src/pipeline.ts       new order; gyro + macros; mouse delta
packages/engine/src/share-code.ts     encodeShareCode/decodeShareCode (pure; takes deflate fns)
native/sendinput/{binding.gyp,package.json,src/sendinput.cc,index.js,index.d.ts}
apps/desktop/src/main/injector.ts     wraps addon: keys/mouse/foreground
apps/desktop/src/main/profile-store.ts
apps/desktop/src/main/settings-store.ts
apps/desktop/src/main/game-watcher.ts
apps/desktop/src/main/engine-loop.ts  gyro mouse, lights cadence, macros, injector hookup, hasRumble
apps/desktop/src/main/index.ts        IPC: profiles/settings/macros/share
apps/desktop/src/preload/index.ts     new API
```

---

### Task 1: Schema — digital triggers, gyro, lights, targets, macros, settings

**Files:** Modify `packages/shared/src/profile.ts`, `ipc.ts`, `index.ts`; Create `packages/shared/src/settings.ts`; Test `packages/shared/test/profile.test.ts`, `settings.test.ts`.

**Interfaces (produces):**
```ts
// profile.ts additions
TriggerConfigSchema: + digital: z.boolean().default(true)
export const GyroConfigSchema = z.object({
  output: z.enum(['off', 'rightStick', 'mouse']).default('off'),
  activate: z.enum(['always', 'hold', 'toggle']).default('always'),
  activateButton: z.enum(DS_BUTTONS).nullable().default(null),
  deadzoneDps: z.number().min(0).max(50).default(2),        // deg/s
  sensitivityX: z.number().min(0.05).max(20).default(1),     // stick: full deflection per (200/sens) dps; mouse: px per deg
  sensitivityY: z.number().min(0.05).max(20).default(1),
  invertX: z.boolean().default(false), invertY: z.boolean().default(false),
  curve: z.enum(CURVE_PRESETS).default('linear'),
  bias: z.object({ x: z.number(), y: z.number(), z: z.number() }).default({ x: 0, y: 0, z: 0 }), // raw LSB
});
LightsSchema: + mode: z.enum(['off','static','breathing','rainbow','battery']).default('static'),
              + speed: z.number().min(0).max(100).default(40), + micLed: z.number().int().min(0).max(2).default(0)
TargetSchema: + z.object({ type: z.literal('xtrigger'), trigger: z.enum(['lt','rt']) })   // full pull
MacroStepSchema = z.object({ target: TargetSchema, holdMs: z.number().int().min(0).max(10000), delayMs: z.number().int().min(0).max(10000) })
MacroSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(40), steps: z.array(MacroStepSchema).min(1).max(64), loop: z.boolean().default(false) })
ProfileSchema: + gyro: GyroConfigSchema.default({}), + macros: z.array(MacroSchema).max(32).default([])
  .refine: every mapping target of type 'macro' references an existing macro id.
defaultProfile(): l2 → { targets:[{type:'xtrigger',trigger:'lt'}] }, r2 → rt; triggers.*.digital true.
// settings.ts
export const SettingsSchema = z.object({
  schemaVersion: z.literal(1), activeProfile: z.string().default('p1'),
  autoSwitch: z.array(z.object({ exe: z.string().min(1), profileId: z.string().min(1) })).default([]),
  hasRumble: z.boolean().default(false), hidHide: z.boolean().default(false),
  startWithWindows: z.boolean().default(false), startMinimized: z.boolean().default(false),
  theme: z.enum(['dark','light']).default('dark'), updates: z.boolean().default(false),
}); export type Settings; export function defaultSettings(): Settings
// ipc.ts
EngineCommand: + { type:'uiFocused', focused: boolean } + { type:'setSettings', settings: SettingsSchema }
export const ProfileSummarySchema = z.object({ id, name, slot: z.number().int().min(1).max(4) })
```
- [ ] **Step 1: Failing tests** — old profile (no gyro/macros/digital) parses with defaults; macro target referencing a missing id is rejected; settings defaults; `defaultProfile().mappings.l2.targets[0]` is `xtrigger lt`.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(shared): digital triggers, gyro, lights, macros, settings schemas`

---

### Task 2: Engine — anti-deadzone after curve, digital triggers, extended mapping (xtrigger, pre-filled xinput)

**Files:** Modify `stick-shape.ts`, `pipeline.ts`, `mapping.ts`, `triggers.ts`, `compile.ts`; Tests `stick-shape.test.ts`, `pipeline.test.ts`, `mapping.test.ts`, `triggers.test.ts`.

**Interfaces:**
- `applyRadialDeadzone(mag, dz)` no longer applies `anti` (center/outer only). New `applyAntiDeadzone(x, y, anti): {x,y}` — if `hypot>0`, `mag' = anti + mag*(1-anti)`.
- `applyTrigger(v, cfg, lut, state)` — when `cfg.digital` is true returns `0` (analog ignored; the button mapping drives output).
- `applyMappings(raw, profile, state, nowMs, xinput: XInputState): OutputFrame` — fills buttons/targets INTO the passed `xinput` (already holding axes/triggers); `xtrigger` sets `lt/rt = 1`; returns `{ xinput, keys, mouse, mouseMove: {dx:0,dy:0}, macroStarts: string[] }` where `macroStarts` lists macro ids whose button was pressed this frame (rising edge).
- `processReport` order: shaping → LUT → anti → filter → triggers → (gyro, Task 4) → mappings.
- [ ] **Step 1: Failing tests** — anti after curve: with Precise curve and anti 0.3 a small live input yields ≥0.3 magnitude; digital trigger: `applyTrigger(0.6, {digital:true,...})` → 0 and pipeline with l2 pressed (byte 9 bit 2) + default profile → `lt === 1`; mapping into pre-filled xinput keeps `lx`; rising-edge macroStarts.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(engine): anti-deadzone after curve, digital triggers, mapping into pre-filled state`

---

### Task 3: Engine — macro scheduler

**Files:** Create `packages/engine/src/stages/macros.ts`; Modify `pipeline.ts`, `compile.ts`; Test `macros.test.ts`, `pipeline.test.ts`.

**Interfaces:**
```ts
export interface RunningMacro { id: string; step: number; phase: 'hold'|'delay'; untilMs: number }
export interface MacroState { running: RunningMacro[] }
export const createMacroState = (): MacroState => ({ running: [] });
export function startMacro(s: MacroState, id: string, nowMs: number, macros: Map<string, Macro>): void  // ignores if already running (no re-trigger) 
export function stopMacro(s: MacroState, id: string): void
export function tickMacros(s: MacroState, nowMs: number, macros: Map<string, Macro>, out: { xinput: XInputState; keysWanted: Set<string>; mouseWanted: Set<MouseButton> }): void
// semantics: on start → step 0 phase hold until now+holdMs; while phase hold, the step's target is "active" (applied to out); when untilMs passes → phase delay until +delayMs (target inactive); after last step → loop ? restart : remove.
```
- The mapping stage computes key/mouse transition events from the union of button-driven and macro-driven wanted sets (move the transition diffing after macros).
- `CompiledProfile.macros: Map<string, Macro>`.
- [ ] **Step 1: Failing tests** — a 2-step macro (A hold 100 delay 50, B hold 100) started at t=0: A active at 0–99, nothing at 100–149, B active 150–249, finished at 250; loop restarts; key target within a macro emits down at start and up after hold (via pipeline); starting an already-running macro is a no-op.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(engine): macro scheduler`

---

### Task 4: Engine — gyro stage

**Files:** Create `packages/engine/src/stages/gyro.ts`; Modify `pipeline.ts`, `compile.ts`; Test `gyro.test.ts`, `pipeline.test.ts`.

**Interfaces:**
```ts
export const GYRO_LSB_PER_DPS = 16.384;   // DualSense ±2000 dps over int16
export interface GyroState { toggled: boolean; prevActivate: boolean; mouseAccX: number; mouseAccY: number }
export const createGyroState = (): GyroState => ({ toggled:false, prevActivate:false, mouseAccX:0, mouseAccY:0 });
export function applyGyro(raw: RawState, cfg: GyroConfig, lut: Float32Array, s: GyroState, dtMs: number): { rx: number; ry: number; dx: number; dy: number; active: boolean }
// yaw = (raw.gyro.y - bias.y)/GYRO_LSB_PER_DPS (deg/s, + = turn left on DualSense; map to +rx = right by negating), pitch = (raw.gyro.x - bias.x)/LSB.
// deadzone: |v| < deadzoneDps → 0. activation: always | hold (button down) | toggle (rising edge flips).
// rightStick: rx = clamp(evaluateLut(lut, min(1, |yaw|/(200/sensX))) * sign), same for ry with pitch; invert flags.
// mouse: dx += yaw * sensX * dt/1000 * 10 (px); accumulate fractional, emit integer part.
```
- `processReport`: when gyro active and output=rightStick, **add** to the processed right stick (clamp to unit circle); when mouse, set `frame.mouseMove`.
- [ ] **Step 1: Failing tests** — bias subtraction; deadzone; hold/toggle activation edges; rightStick scaling at sens 1 (100 dps → 0.5); mouse accumulates fractional px and emits ints; invert.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(engine): gyro to right stick / mouse`

---

### Task 5: Engine — lightbar animator + share-code codec

**Files:** Create `packages/engine/src/lights.ts`, `packages/engine/src/share-code.ts`; Test `lights.test.ts`, `share-code.test.ts`; export from index.

**Interfaces:**
```ts
export function computeLightbar(cfg: Profile['lights'], tMs: number, battery: Battery): { r: number; g: number; b: number; brightness: 0|1|2; playerLeds: number; micLed: 0|1|2; animated: boolean }
// off → 0,0,0; static → rgb; breathing → rgb * (0.15 + 0.85*(0.5+0.5*sin(2π t / period))), period = 4000 - 35*speed ms; rainbow → HSV hue = (t / (6000 - 55*speed)) mod 1 at full S/V; battery → green ≥60, orange 20–59, red <20, blinking at 1 Hz when charging.
export function encodeShareCode(profile: Profile, deflate: (b: Uint8Array) => Uint8Array): string   // 'DUALFORGE:' + base64url
export function decodeShareCode(code: string, inflate: (b: Uint8Array) => Uint8Array): Profile      // validates with ProfileSchema, assigns a fresh id, throws E_SHARE_CODE on any failure or > 16 KiB
```
- [ ] **Step 1: Failing tests** — each mode's colour at t=0 and mid-period; animated flag; share code round-trip with identity deflate; bad prefix/garbage → `E_SHARE_CODE`; oversize rejected.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(engine): lightbar animator and share-code codec`

---

### Task 6: Native addon — SendInput + foreground process

**Files:** Create `native/sendinput/package.json`, `binding.gyp`, `src/sendinput.cc`, `index.js`, `index.d.ts`; Modify root `package.json` workspaces (`native/*`), `apps/desktop/package.json` (dep `@dualforge/sendinput`, rebuild script), `electron.vite.config.ts` (externalize the addon); Create `apps/desktop/src/main/injector.ts`; Test `apps/desktop/test/injector.test.ts` (mocks the addon).

**Addon API (`index.d.ts`):**
```ts
export function sendKey(vk: number, down: boolean): void;            // INPUT_KEYBOARD with KEYEVENTF_SCANCODE via MapVirtualKey, extended-key flag for arrows/nav
export function sendMouseButton(button: 0|1|2, down: boolean): void; // left/right/middle
export function sendMouseMove(dx: number, dy: number): void;         // MOUSEEVENTF_MOVE relative
export function foregroundProcessName(): string;                     // basename of exe owning GetForegroundWindow, '' if none
```
`sendinput.cc` ≈ 90 lines with `node-addon-api`; `binding.gyp` targets `sendinput`, `win_delay_load_hook` default, links `user32.lib`, `psapi.lib` (use `QueryFullProcessImageNameW`).
`injector.ts`: `createInjector(): { key(code: string, down), mouse(btn, down), move(dx,dy), foreground(): string, available: boolean }` — maps `VK_*` names to codes via a table in `packages/shared/src/vk.ts` (create: ~120 common keys incl. letters, digits, F1–F12, modifiers, arrows, nav, numpad, media); loads the addon lazily in try/catch → `available=false` + `E_INJECT_LOAD` logged.
- [ ] **Step 1: Build the addon** (`npm run rebuild` must rebuild it for Electron too — add to the `electron-rebuild -w` list). Verify by a one-off script: `foregroundProcessName()` returns a name.
- [ ] **Step 2: Failing test** for `injector.ts` with the addon mocked (`vi.mock`): `key('VK_SPACE', true)` → `sendKey(0x20, true)`; unknown key → logged `E_INJECT_KEY`, no call; unavailable addon → `available=false` and calls are no-ops.
- [ ] **Step 3: Implement.** **Step 4: `npm run check`.** **Commit** `feat(native): SendInput addon and injector`

---

### Task 7: Engine loop — injector hookup, uiFocused gate, gyro mouse, lights cadence, macros, hasRumble

**Files:** Modify `engine-loop.ts`, `engine-process.ts`; Test `engine-loop.test.ts`.

**Behaviour:**
- `LoopDeps.injector` (interface from Task 6; test passes a fake). After each `processReport`: for `keys`/`mouse` events call injector unless `uiFocused`; `mouseMove` likewise.
- `uiFocused` command toggles the gate; when it becomes true, release any held injected keys/mouse (emit ups).
- Lights: `feedback()` uses `computeLightbar(profile.lights, now - t0, battery)`; when `animated`, the idle timer runs at 30 Hz and writes output on change (byte compare already exists).
- `settings.hasRumble === false` → `rumble` forced `{0,0}` and the sink's vibration callback is ignored.
- Macros: pipeline handles via `macroStarts` → `startMacro`; nothing extra in loop beyond passing `nowMs`.
- [ ] **Step 1: Failing tests** — key events reach the injector; none while uiFocused; held key released on focus; hasRumble false → bytes 3/4 stay 0 even after sink rumble; breathing mode → ≥2 distinct lightbar RGB writes within 1 s under fake timers.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(desktop): injector gate, lights animation cadence, rumble setting`

---

### Task 8: Main — ProfileStore, SettingsStore (atomic JSON, quarantine), IPC + preload

**Files:** Create `profile-store.ts`, `settings-store.ts`; Modify `index.ts`, `preload/index.ts`; Test `apps/desktop/test/profile-store.test.ts`, `settings-store.test.ts` (use a temp dir).

**Interfaces:**
```ts
createProfileStore(dir: string, log): {
  list(): ProfileSummary[]; get(id): Profile; set(profile): void; rename(id, name); duplicate(fromId, toSlot); reset(id); 
  exportTo(id, filePath); importFrom(filePath, toSlot): Profile; 
}
// 4 fixed slots p1..p4 → files <dir>/profiles/p{n}.json; missing → defaultProfile(`p${n}`, `Profile ${n}`); write = temp file + rename; invalid JSON/schema → move to <dir>/profiles/corrupt/<name>.<ts>.json, log E_PROFILE_SCHEMA, return default.
createSettingsStore(dir, log): { get(): Settings; set(patch: Partial<Settings>): Settings }  // same atomic/quarantine rules
```
IPC (all zod-validated in main): `profiles:list`, `profiles:get(id)`, `profiles:set(profile)`, `profiles:rename(id,name)`, `profiles:duplicate(from,toSlot)`, `profiles:reset(id)`, `profiles:export(id)` (dialog.showSaveDialog), `profiles:import(toSlot)` (dialog.showOpenDialog), `profiles:shareCode(id)` → string, `profiles:importShareCode(code,toSlot)`, `profiles:activate(id)` (sets settings.activeProfile + engine setProfile), `settings:get`, `settings:set(patch)`. Replace the Plan 1 in-memory `profile` with `store.get(settings.activeProfile)`. Window focus/blur → `engine.send({type:'uiFocused'})`.
Preload API mirrors these (`window.dualforge.profiles.*`, `window.dualforge.settings.*`).
- [ ] **Step 1: Failing tests** — round-trip set/get; atomic (no partial file after a simulated throw mid-write — write to temp then rename); corrupt file quarantined and default returned; settings patch merge.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(desktop): persisted profiles and settings with atomic writes and quarantine`

---

### Task 9: Main — GameWatcher auto-switch

**Files:** Create `game-watcher.ts`; Modify `index.ts`; Test `game-watcher.test.ts`.
- `createGameWatcher({ foreground: () => string, settings: () => Settings, onSwitch: (profileId) => void, intervalMs = 2000 })` with `start()/stop()`; polls; when the foreground exe (case-insensitive) matches an `autoSwitch` rule and differs from the current active profile → `onSwitch(profileId)` once; when no rule matches, returns to the profile that was active before the first auto-switch (remember `manualProfile`).
- [ ] **Step 1: Failing tests** with fake timers and a scripted foreground sequence (`explorer.exe` → `cod.exe` → `explorer.exe`): switch to the mapped profile once, then back.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(desktop): per-game profile auto-switch`

---

### Task 10: Playwright + hardware sanity for 3A

**Files:** `apps/desktop/e2e/pages.spec.ts` additions (profiles IPC round-trip via preload: rename p2, list shows it, activate p2, getProfile returns p2); README update (profiles folder, share codes, auto-switch).
- Hardware check (pad attached): set a mapping cross → `key VK_SPACE` via `window.dualforge.profiles.set(...)` in DevTools with Notepad focused; press cross; a space appears. Report the result. Reset the mapping afterwards.
- [ ] **`npm run check`** green. **Commit** `test(desktop): profiles e2e; docs`

---

## Self-review
Spec coverage (3A): §3.1 ProfileStore/GameWatcher/uiFocused ✔ T8/T9/T7; §3.2 gyro ✔ T4, macros ✔ T3, mappings extended ✔ T2, SendInput ✔ T6, lights ✔ T5/T7; §5 settings ✔ T1; share codes ✔ T5/T8; hasRumble ✔ T7. Pages → Plan 3B. Health/HidHide/installer/agent → Plan 4.
Type consistency: `applyMappings(raw, profile, state, nowMs, xinput)` (T2) used by pipeline (T2–T4); `OutputFrame.mouseMove`/`macroStarts` (T2) consumed by T3/T4/T7; `computeLightbar` (T5) in T7; `Settings` (T1) in T7/T8/T9; injector interface (T6) in T7.
Placeholders: none — UI-free plan, every task has concrete interfaces and named tests; implementers write test bodies from the stated cases.
