# DualForge Plan 1 — Core Engine, ViGEm Output, App Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Electron app that reads a USB DualSense, runs the stick/trigger/mapping pipeline, drives a virtual Xbox 360 pad through ViGEm, and shows live state on Home and Input Test pages — with the whole pipeline covered by hardware-free replay tests.

**Architecture:** npm-workspaces monorepo. `packages/shared` holds types + zod profile schema. `packages/engine` holds pure pipeline stages, the DualSense report codec, and a replay reader. `apps/desktop` is electron-vite (main / preload / renderer / a second main entry `engine-process` run as an Electron `utilityProcess`). Renderer never touches hardware; it receives 60 Hz `EngineSnapshot`s over typed IPC.

**Tech Stack:** Node 24, TypeScript 5 (strict, ESM), Vitest, ESLint + typescript-eslint + Prettier, Electron 44, electron-vite, React 19, Zustand, zod, node-hid 3, vigemclient 1.5, pino.

**Spec:** `docs/superpowers/specs/2026-10-03-dualforge-design.md`

## Global Constraints

- Windows 10+ x64 only; USB DualSense only (VID `0x054C`, PID `0x0CE6`); Bluetooth out of scope.
- All pipeline stages in `packages/engine/src/stages/` are **pure functions** (no I/O, no globals) so replay tests cover them.
- Renderer must never import `node-hid`, `vigemclient`, or anything from `apps/desktop/src/main`.
- IPC payloads are validated with zod schemas from `packages/shared/src/ipc.ts`.
- Error codes are `UPPER_SNAKE` strings prefixed `E_` (e.g. `E_HID_OPEN`) and logged as `{ code, msg, ...ctx }` via pino.
- Visual tokens (spec §4.1): background gradient 135° `#3a1f28 → #0b0b14`; card fill `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.10)`, radius 16px; accent `#e2403f`; focus `#f08a3c`; link `#3b82f6`; text `#f5f5f7`; muted `#a0a0ab`; font Poppins.
- Commit after every task with a conventional-commit message; end commit messages with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not download or run third-party installers (ViGEmBus, HidHide) without the user's explicit go-ahead in chat.

---

## File structure (what this plan creates)

```
DualForge/
  package.json                  workspaces root, scripts: check, test, lint, typecheck, dev, build
  tsconfig.base.json
  eslint.config.js  .prettierrc  vitest.workspace.ts
  packages/shared/
    package.json  tsconfig.json
    src/index.ts
    src/dualsense.ts            DsButton list, RawState, TouchPoint, Battery types
    src/xinput.ts               XButton list, XInputState, emptyXInput()
    src/profile.ts              zod Profile/StickConfig/TriggerConfig/Mapping schemas + defaultProfile()
    src/ipc.ts                  EngineSnapshot, EngineCommand, EngineEvent schemas
  packages/engine/
    package.json  tsconfig.json
    src/index.ts
    src/codec/parse-input.ts    parseDualSenseUsb(buf): RawState
    src/codec/build-output.ts   buildOutputReport(fb): Buffer  (rumble, lightbar, player LEDs)
    src/stages/stick-shape.ts   applyDeadzones, applyStickShaping
    src/stages/stick-curve.ts   presets + evaluateCurve + applyStickCurve
    src/stages/stick-filter.ts  createFilterState, applyStickFilter (basic EMA)
    src/stages/triggers.ts      applyTrigger
    src/stages/mapping.ts       applyMappings (button→xinput, turbo)
    src/pipeline.ts             createPipelineState, processReport(raw, profile, state, nowMs): OutputFrame
    src/replay/hidlog.ts        parseHidlog / serializeHidlog (JSONL {t, hex})
    test/fixtures/*.hidlog
    test/**/*.test.ts
  apps/desktop/
    package.json  tsconfig*.json  electron.vite.config.ts  index.html
    src/main/index.ts           app lifecycle, window, EngineHost wiring
    src/main/logger.ts          pino → %APPDATA%\DualForge\logs
    src/main/engine-host.ts     spawns utilityProcess, relays snapshots/commands
    src/main/engine-process.ts  utilityProcess entry: DeviceSource + ViGEmSink + pipeline loop
    src/main/device-source.ts   node-hid DualSense discovery/open/read/write
    src/main/vigem-sink.ts      vigemclient X360 target
    src/preload/index.ts        contextBridge typed API
    src/renderer/main.tsx  App.tsx
    src/renderer/styles/tokens.css  global.css
    src/renderer/store.ts       Zustand: snapshot, page, profile
    src/renderer/components/{Shell,Header,TabStrip,Footer,Card,StickCircle,TriggerBar}.tsx
    src/renderer/pages/{Home,InputTest}.tsx
    src/renderer/art/DualSenseTop.tsx   flat top-view SVG
```

---

### Task 1: Monorepo scaffold with a passing `npm run check`

**Files:**

- Create: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `vitest.workspace.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/test/smoke.test.ts`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`

**Interfaces:**

- Produces: `npm run check` (typecheck + lint + test) that later tasks must keep green; workspace aliases `@dualforge/shared`, `@dualforge/engine`.

- [ ] **Step 1: Root package.json**

```json
{
  "name": "dualforge",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "tsc -b packages/shared packages/engine",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "npm run typecheck && npm run lint && npm run test",
    "dev": "npm run dev -w @dualforge/desktop",
    "build": "npm run build -w @dualforge/desktop"
  },
  "devDependencies": {
    "@eslint/js": "^9.30.0",
    "@types/node": "^24.0.0",
    "eslint": "^9.30.0",
    "eslint-config-prettier": "^10.1.0",
    "prettier": "^3.6.0",
    "typescript": "^5.8.0",
    "typescript-eslint": "^8.35.0",
    "vitest": "^3.2.0"
  },
  "engines": { "node": ">=24" }
}
```

- [ ] **Step 2: tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Lint / format / vitest configs**

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/release/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
```

`.prettierrc`:

```json
{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }
```

`vitest.workspace.ts`:

```ts
export default ['packages/*', 'apps/*'];
```

- [ ] **Step 4: packages/shared**

`packages/shared/package.json`:

```json
{
  "name": "@dualforge/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.25.0" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "noEmit": false },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:

```ts
export const SHARED_VERSION = '0.1.0';
```

`packages/shared/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SHARED_VERSION } from '../src/index.js';

describe('shared', () => {
  it('exports a version', () => {
    expect(SHARED_VERSION).toBe('0.1.0');
  });
});
```

- [ ] **Step 5: packages/engine**

`packages/engine/package.json`:

```json
{
  "name": "@dualforge/engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@dualforge/shared": "*" }
}
```

`packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "noEmit": false },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

`packages/engine/src/index.ts`:

```ts
export {};
```

- [ ] **Step 6: Install and run check**

Run: `npm install` then `npm run check`
Expected: typecheck clean, eslint clean, vitest `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: monorepo scaffold with typecheck, lint, vitest"
```

---

### Task 2: Shared types — DualSense input, XInput state, profile schema, IPC

**Files:**

- Create: `packages/shared/src/dualsense.ts`, `packages/shared/src/xinput.ts`, `packages/shared/src/profile.ts`, `packages/shared/src/ipc.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/profile.test.ts`

**Interfaces:**

- Produces: `DS_BUTTONS`, `DsButton`, `RawState`, `TouchPoint`, `Battery`; `X_BUTTONS`, `XButton`, `XInputState`, `emptyXInput()`; `ProfileSchema`, `Profile`, `StickConfig`, `TriggerConfig`, `Mapping`, `Target`, `defaultProfile()`; `EngineSnapshotSchema`, `EngineSnapshot`, `EngineCommandSchema`, `EngineCommand`, `EngineEventSchema`, `EngineEvent`.

- [ ] **Step 1: Write failing test**

`packages/shared/test/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ProfileSchema, defaultProfile, DS_BUTTONS } from '../src/index.js';

describe('profile schema', () => {
  it('default profile validates', () => {
    expect(ProfileSchema.safeParse(defaultProfile('p1', 'Profile 1')).success).toBe(true);
  });
  it('default profile maps every DualSense button', () => {
    const p = defaultProfile('p1', 'Profile 1');
    for (const b of DS_BUTTONS) expect(p.mappings[b]).toBeDefined();
  });
  it('rejects out-of-range deadzone', () => {
    const p = defaultProfile('p1', 'Profile 1');
    p.sticks.left.deadzone.center = 1.5;
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/shared`
Expected: FAIL — `ProfileSchema` not exported.

- [ ] **Step 3: dualsense.ts**

```ts
export const DS_BUTTONS = [
  'cross',
  'circle',
  'square',
  'triangle',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'create',
  'options',
  'ps',
  'touchpad',
  'mic',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
] as const;
export type DsButton = (typeof DS_BUTTONS)[number];

export interface TouchPoint {
  active: boolean;
  id: number;
  x: number; // 0..1919
  y: number; // 0..1079
}

export type BatteryState = 'discharging' | 'charging' | 'full' | 'unknown';
export interface Battery {
  percent: number; // 0..100
  state: BatteryState;
}

/** Normalized DualSense input. Sticks -1..1 with +Y = up; triggers 0..1. */
export interface RawState {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  l2: number;
  r2: number;
  buttons: Record<DsButton, boolean>;
  gyro: { x: number; y: number; z: number }; // raw int16
  accel: { x: number; y: number; z: number }; // raw int16
  touch: [TouchPoint, TouchPoint];
  battery: Battery;
  seq: number;
}

export function emptyButtons(): Record<DsButton, boolean> {
  return Object.fromEntries(DS_BUTTONS.map((b) => [b, false])) as Record<DsButton, boolean>;
}
```

- [ ] **Step 4: xinput.ts**

```ts
export const X_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LS',
  'RS',
  'BACK',
  'START',
  'GUIDE',
  'DPAD_UP',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'DPAD_RIGHT',
] as const;
export type XButton = (typeof X_BUTTONS)[number];

/** Virtual Xbox 360 state. Sticks -1..1 (+Y up), triggers 0..1. */
export interface XInputState {
  buttons: Record<XButton, boolean>;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
}

export function emptyXInput(): XInputState {
  return {
    buttons: Object.fromEntries(X_BUTTONS.map((b) => [b, false])) as Record<XButton, boolean>,
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    lt: 0,
    rt: 0,
  };
}
```

- [ ] **Step 5: profile.ts**

```ts
import { z } from 'zod';
import { DS_BUTTONS, type DsButton } from './dualsense.js';
import { X_BUTTONS } from './xinput.js';

const unit = z.number().min(0).max(1);

export const CurvePointSchema = z.tuple([unit, unit]);
export const CURVE_PRESETS = ['linear', 'aggressive', 'precise', 'scurve'] as const;
export const StickCurveSchema = z.union([
  z.object({ kind: z.literal('preset'), preset: z.enum(CURVE_PRESETS) }),
  z.object({ kind: z.literal('custom'), points: z.array(CurvePointSchema).length(8) }),
]);

export const StickFilterSchema = z.object({
  enabled: z.boolean(),
  strength: z.number().min(0).max(100), // 0 = off, 100 = heavy smoothing
});

export const StickConfigSchema = z.object({
  calibration: z.object({
    cx: z.number().min(-1).max(1),
    cy: z.number().min(-1).max(1),
    radius: z.number().min(0.5).max(1.5),
  }),
  deadzone: z.object({ center: unit, anti: unit, outer: unit }),
  circular: z.boolean(),
  invertX: z.boolean(),
  invertY: z.boolean(),
  curve: StickCurveSchema,
  filter: StickFilterSchema,
});
export type StickConfig = z.infer<typeof StickConfigSchema>;

export const TriggerConfigSchema = z.object({
  deadzone: z.object({ initial: unit, max: unit }),
  hairTrigger: z.union([
    z.object({ mode: z.literal('off') }),
    z.object({ mode: z.literal('fixed') }), // any press past `initial` = full
    z.object({ mode: z.literal('adaptive'), value: z.number().min(1).max(100) }),
  ]),
  curve: z.enum(CURVE_PRESETS),
});
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

export const TargetSchema = z.union([
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('xbutton'), button: z.enum(X_BUTTONS) }),
  z.object({ type: z.literal('key'), code: z.string().min(1) }), // Windows VK name, e.g. "VK_SPACE"
  z.object({ type: z.literal('mouse'), button: z.enum(['left', 'right', 'middle']) }),
  z.object({ type: z.literal('macro'), macroId: z.string().min(1) }),
]);
export type Target = z.infer<typeof TargetSchema>;

export const MappingSchema = z.object({
  targets: z.array(TargetSchema).min(1).max(3),
  turboHz: z.number().min(0).max(30), // 0 = off
  continuous: z.boolean(),
});
export type Mapping = z.infer<typeof MappingSchema>;

export const ProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  sticks: z.object({ left: StickConfigSchema, right: StickConfigSchema }),
  triggers: z.object({ left: TriggerConfigSchema, right: TriggerConfigSchema }),
  vibration: z.object({ left: z.number().min(0).max(100), right: z.number().min(0).max(100) }),
  lights: z.object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
    brightness: z.number().int().min(0).max(2), // 0 high, 1 medium, 2 low (DualSense semantics)
    playerLeds: z.number().int().min(0).max(31),
  }),
  mappings: z.record(z.enum(DS_BUTTONS), MappingSchema),
});
export type Profile = z.infer<typeof ProfileSchema>;

function defaultStick(): StickConfig {
  return {
    calibration: { cx: 0, cy: 0, radius: 1 },
    deadzone: { center: 0.05, anti: 0, outer: 0.02 },
    circular: true,
    invertX: false,
    invertY: false,
    curve: { kind: 'preset', preset: 'linear' },
    filter: { enabled: false, strength: 0 },
  };
}
function defaultTrigger(): TriggerConfig {
  return { deadzone: { initial: 0.02, max: 0.98 }, hairTrigger: { mode: 'off' }, curve: 'linear' };
}
const DEFAULT_TARGET: Record<DsButton, Target> = {
  cross: { type: 'xbutton', button: 'A' },
  circle: { type: 'xbutton', button: 'B' },
  square: { type: 'xbutton', button: 'X' },
  triangle: { type: 'xbutton', button: 'Y' },
  l1: { type: 'xbutton', button: 'LB' },
  r1: { type: 'xbutton', button: 'RB' },
  l2: { type: 'none' },
  r2: { type: 'none' }, // analog triggers pass through
  l3: { type: 'xbutton', button: 'LS' },
  r3: { type: 'xbutton', button: 'RS' },
  create: { type: 'xbutton', button: 'BACK' },
  options: { type: 'xbutton', button: 'START' },
  ps: { type: 'xbutton', button: 'GUIDE' },
  touchpad: { type: 'none' },
  mic: { type: 'none' },
  dpadUp: { type: 'xbutton', button: 'DPAD_UP' },
  dpadDown: { type: 'xbutton', button: 'DPAD_DOWN' },
  dpadLeft: { type: 'xbutton', button: 'DPAD_LEFT' },
  dpadRight: { type: 'xbutton', button: 'DPAD_RIGHT' },
};

export function defaultProfile(id: string, name: string): Profile {
  return {
    schemaVersion: 1,
    id,
    name,
    sticks: { left: defaultStick(), right: defaultStick() },
    triggers: { left: defaultTrigger(), right: defaultTrigger() },
    vibration: { left: 100, right: 100 },
    lights: { r: 0, g: 80, b: 255, brightness: 0, playerLeds: 0b00100 },
    mappings: Object.fromEntries(
      DS_BUTTONS.map((b) => [b, { targets: [DEFAULT_TARGET[b]], turboHz: 0, continuous: false }]),
    ) as Record<DsButton, Mapping>,
  };
}
```

- [ ] **Step 6: ipc.ts**

```ts
import { z } from 'zod';
import { ProfileSchema } from './profile.js';

export const EngineSnapshotSchema = z.object({
  t: z.number(), // ms since engine start
  connected: z.boolean(),
  vigemReady: z.boolean(),
  reportHz: z.number(),
  pipelineP99Ms: z.number(),
  battery: z.object({
    percent: z.number(),
    state: z.enum(['discharging', 'charging', 'full', 'unknown']),
  }),
  raw: z.object({
    lx: z.number(),
    ly: z.number(),
    rx: z.number(),
    ry: z.number(),
    l2: z.number(),
    r2: z.number(),
    buttons: z.record(z.string(), z.boolean()),
    gyro: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }),
  out: z.object({
    lx: z.number(),
    ly: z.number(),
    rx: z.number(),
    ry: z.number(),
    lt: z.number(),
    rt: z.number(),
    buttons: z.record(z.string(), z.boolean()),
  }),
});
export type EngineSnapshot = z.infer<typeof EngineSnapshotSchema>;

export const EngineCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setProfile'), profile: ProfileSchema }),
  z.object({ type: z.literal('replay'), path: z.string() }), // use a .hidlog instead of a device
  z.object({ type: z.literal('useDevice') }),
  z.object({ type: z.literal('shutdown') }),
]);
export type EngineCommand = z.infer<typeof EngineCommandSchema>;

export const EngineEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: EngineSnapshotSchema }),
  z.object({ type: z.literal('status'), connected: z.boolean(), vigemReady: z.boolean() }),
  z.object({ type: z.literal('error'), code: z.string(), msg: z.string() }),
]);
export type EngineEvent = z.infer<typeof EngineEventSchema>;
```

- [ ] **Step 7: index.ts re-exports**

```ts
export const SHARED_VERSION = '0.1.0';
export * from './dualsense.js';
export * from './xinput.js';
export * from './profile.js';
export * from './ipc.js';
```

- [ ] **Step 8: Run tests and check**

Run: `npm install` (pulls zod) then `npm run check`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(shared): DualSense/XInput types, profile schema, IPC schemas"
```

---

### Task 3: DualSense USB input report codec

**Files:**

- Create: `packages/engine/src/codec/parse-input.ts`
- Test: `packages/engine/test/codec/parse-input.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**

- Produces: `parseDualSenseUsb(buf: Uint8Array): RawState` and `DUALSENSE_VID = 0x054c`, `DUALSENSE_PID = 0x0ce6`, `USB_INPUT_REPORT_ID = 0x01`, `USB_INPUT_REPORT_LEN = 64`.

Report layout (USB, report id at byte 0): `1 LX, 2 LY, 3 RX, 4 RY, 5 L2, 6 R2, 7 seq, 8 dpad(lo nibble: 0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW,8=none)+square b4,cross b5,circle b6,triangle b7; 9 L1 b0,R1 b1,L2 b2,R2 b3,Create b4,Options b5,L3 b6,R3 b7; 10 PS b0,touchpad b1,mic b2; 16..21 gyro int16 LE ×3; 22..27 accel int16 LE ×3; 33..36 touch0; 37..40 touch1; 53 battery (lo nibble ×10 = %, hi nibble 0 discharging/1 charging/2 full)`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseDualSenseUsb } from '../../src/codec/parse-input.js';

function report(mut: (b: Uint8Array) => void = () => {}): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x01;
  b[1] = 128;
  b[2] = 128;
  b[3] = 128;
  b[4] = 128; // centered
  b[8] = 0x08; // dpad neutral
  b[53] = 0x08; // 80% discharging
  mut(b);
  return b;
}

describe('parseDualSenseUsb', () => {
  it('centers sticks near zero', () => {
    const s = parseDualSenseUsb(report());
    expect(Math.abs(s.lx)).toBeLessThan(0.01);
    expect(Math.abs(s.ly)).toBeLessThan(0.01);
  });
  it('maps stick extremes with +Y up', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[1] = 255;
        b[2] = 0;
        b[3] = 0;
        b[4] = 255;
      }),
    );
    expect(s.lx).toBeCloseTo(1, 2);
    expect(s.ly).toBeCloseTo(1, 2); // HID y=0 is top → +1
    expect(s.rx).toBeCloseTo(-1, 2);
    expect(s.ry).toBeCloseTo(-1, 2);
  });
  it('maps triggers 0..1', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[5] = 255;
        b[6] = 128;
      }),
    );
    expect(s.l2).toBe(1);
    expect(s.r2).toBeCloseTo(0.502, 2);
  });
  it('decodes face buttons and dpad', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[8] = 0x20 | 0x01;
      }),
    ); // cross + NE
    expect(s.buttons.cross).toBe(true);
    expect(s.buttons.dpadUp).toBe(true);
    expect(s.buttons.dpadRight).toBe(true);
    expect(s.buttons.dpadDown).toBe(false);
  });
  it('decodes shoulder/system buttons', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[9] = 0b1111_1111;
        b[10] = 0b111;
      }),
    );
    for (const k of [
      'l1',
      'r1',
      'l2',
      'r2',
      'create',
      'options',
      'l3',
      'r3',
      'ps',
      'touchpad',
      'mic',
    ] as const)
      expect(s.buttons[k]).toBe(true);
  });
  it('decodes battery', () => {
    expect(parseDualSenseUsb(report()).battery).toEqual({ percent: 80, state: 'discharging' });
    expect(
      parseDualSenseUsb(
        report((b) => {
          b[53] = 0x1a;
        }),
      ).battery,
    ).toEqual({ percent: 100, state: 'charging' });
    expect(
      parseDualSenseUsb(
        report((b) => {
          b[53] = 0x20;
        }),
      ).battery.state,
    ).toBe('full');
  });
  it('decodes gyro int16', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[16] = 0xff;
        b[17] = 0xff;
        b[18] = 0x10;
        b[19] = 0x00;
      }),
    );
    expect(s.gyro.x).toBe(-1);
    expect(s.gyro.y).toBe(16);
  });
  it('decodes touch point', () => {
    const s = parseDualSenseUsb(
      report((b) => {
        b[33] = 0x05;
        b[34] = 0x34;
        b[35] = 0x12;
        b[36] = 0x02;
      }),
    );
    expect(s.touch[0]).toEqual({ active: true, id: 5, x: 0x234, y: 0x021 });
    expect(s.touch[1].active).toBe(false);
  });
  it('throws on wrong report id or length', () => {
    expect(() => parseDualSenseUsb(new Uint8Array(10))).toThrow();
    expect(() =>
      parseDualSenseUsb(
        report((b) => {
          b[0] = 0x31;
        }),
      ),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run packages/engine`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { emptyButtons, type RawState, type TouchPoint } from '@dualforge/shared';

export const DUALSENSE_VID = 0x054c;
export const DUALSENSE_PID = 0x0ce6;
export const USB_INPUT_REPORT_ID = 0x01;
export const USB_INPUT_REPORT_LEN = 64;

const axis = (v: number) => (v - 127.5) / 127.5;
const i16 = (b: Uint8Array, o: number) => {
  const v = (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
  return v > 0x7fff ? v - 0x10000 : v;
};
const touch = (b: Uint8Array, o: number): TouchPoint => {
  const b0 = b[o] ?? 0,
    b1 = b[o + 1] ?? 0,
    b2 = b[o + 2] ?? 0,
    b3 = b[o + 3] ?? 0;
  return {
    active: (b0 & 0x80) === 0,
    id: b0 & 0x7f,
    x: b1 | ((b2 & 0x0f) << 8),
    y: (b2 >> 4) | (b3 << 4),
  };
};

export function parseDualSenseUsb(b: Uint8Array): RawState {
  if (b.length < USB_INPUT_REPORT_LEN) throw new Error(`E_REPORT_LEN: ${b.length}`);
  if (b[0] !== USB_INPUT_REPORT_ID) throw new Error(`E_REPORT_ID: ${b[0]}`);

  const buttons = emptyButtons();
  const b8 = b[8] ?? 0x08,
    b9 = b[9] ?? 0,
    b10 = b[10] ?? 0;
  const dpad = b8 & 0x0f;
  buttons.dpadUp = dpad === 7 || dpad === 0 || dpad === 1;
  buttons.dpadRight = dpad >= 1 && dpad <= 3;
  buttons.dpadDown = dpad >= 3 && dpad <= 5;
  buttons.dpadLeft = dpad >= 5 && dpad <= 7;
  buttons.square = !!(b8 & 0x10);
  buttons.cross = !!(b8 & 0x20);
  buttons.circle = !!(b8 & 0x40);
  buttons.triangle = !!(b8 & 0x80);
  buttons.l1 = !!(b9 & 0x01);
  buttons.r1 = !!(b9 & 0x02);
  buttons.l2 = !!(b9 & 0x04);
  buttons.r2 = !!(b9 & 0x08);
  buttons.create = !!(b9 & 0x10);
  buttons.options = !!(b9 & 0x20);
  buttons.l3 = !!(b9 & 0x40);
  buttons.r3 = !!(b9 & 0x80);
  buttons.ps = !!(b10 & 0x01);
  buttons.touchpad = !!(b10 & 0x02);
  buttons.mic = !!(b10 & 0x04);

  const bat = b[53] ?? 0;
  const stateCode = bat >> 4;
  const state =
    stateCode === 0
      ? 'discharging'
      : stateCode === 1
        ? 'charging'
        : stateCode === 2
          ? 'full'
          : 'unknown';

  return {
    lx: axis(b[1] ?? 128),
    ly: -axis(b[2] ?? 128),
    rx: axis(b[3] ?? 128),
    ry: -axis(b[4] ?? 128),
    l2: (b[5] ?? 0) / 255,
    r2: (b[6] ?? 0) / 255,
    buttons,
    gyro: { x: i16(b, 16), y: i16(b, 18), z: i16(b, 20) },
    accel: { x: i16(b, 22), y: i16(b, 24), z: i16(b, 26) },
    touch: [touch(b, 33), touch(b, 37)],
    battery: { percent: Math.min(100, (bat & 0x0f) * 10), state },
    seq: b[7] ?? 0,
  };
}
```

`packages/engine/src/index.ts`:

```ts
export * from './codec/parse-input.js';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine` — Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): DualSense USB input report parser"
```

---

### Task 4: DualSense output report builder (rumble, lightbar, player LEDs, mic LED)

**Files:**

- Create: `packages/engine/src/codec/build-output.ts`
- Test: `packages/engine/test/codec/build-output.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**

- Produces: `interface Feedback { rumbleLeft: number; rumbleRight: number; lightbar: {r,g,b}; brightness: 0|1|2; playerLeds: number; micLed: 0|1|2 }`, `buildOutputReport(fb: Feedback): Uint8Array` (48 bytes, id `0x02`), `USB_OUTPUT_REPORT_ID = 0x02`.

Layout (USB): `0 id=0x02; 1 flag0 (b0 compatible vibration, b1 haptics select); 2 flag1 (b0 mic LED, b1 power save, b2 lightbar, b3 release LEDs, b4 player LEDs); 3 motorRight; 4 motorLeft; 9 micLed; 39 flag2 (b1 lightbar setup, b2 compatible vibration v2); 42 lightbarSetup=0x02; 43 brightness; 44 playerLeds; 45 R; 46 G; 47 B`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildOutputReport, type Feedback } from '../../src/codec/build-output.js';

const fb: Feedback = {
  rumbleLeft: 1,
  rumbleRight: 0.5,
  lightbar: { r: 10, g: 20, b: 30 },
  brightness: 1,
  playerLeds: 0b00100,
  micLed: 2,
};

describe('buildOutputReport', () => {
  it('is 48 bytes with report id 0x02', () => {
    const r = buildOutputReport(fb);
    expect(r.length).toBe(48);
    expect(r[0]).toBe(0x02);
  });
  it('sets valid flags', () => {
    const r = buildOutputReport(fb);
    expect(r[1] & 0x03).toBe(0x03); // vibration + haptics select
    expect(r[2] & 0x15).toBe(0x15); // mic LED, lightbar, player LEDs
    expect(r[39] & 0x06).toBe(0x06); // lightbar setup + vibration v2
  });
  it('scales motors 0..255 (right=small, left=large)', () => {
    const r = buildOutputReport(fb);
    expect(r[3]).toBe(128);
    expect(r[4]).toBe(255);
  });
  it('writes lightbar, brightness, player LEDs, mic LED', () => {
    const r = buildOutputReport(fb);
    expect([r[45], r[46], r[47]]).toEqual([10, 20, 30]);
    expect(r[42]).toBe(0x02);
    expect(r[43]).toBe(1);
    expect(r[44]).toBe(0b00100);
    expect(r[9]).toBe(2);
  });
  it('clamps out-of-range motor values', () => {
    const r = buildOutputReport({ ...fb, rumbleLeft: 7, rumbleRight: -3 });
    expect(r[4]).toBe(255);
    expect(r[3]).toBe(0);
  });
});
```

- [ ] **Step 2: Verify fail** — `npx vitest run packages/engine` → module not found.

- [ ] **Step 3: Implement**

```ts
export const USB_OUTPUT_REPORT_ID = 0x02;
export const USB_OUTPUT_REPORT_LEN = 48;

export interface Feedback {
  rumbleLeft: number; // 0..1 (large motor)
  rumbleRight: number; // 0..1 (small motor)
  lightbar: { r: number; g: number; b: number };
  brightness: 0 | 1 | 2;
  playerLeds: number; // 5-bit mask
  micLed: 0 | 1 | 2; // off, on, pulse
}

const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function buildOutputReport(fb: Feedback): Uint8Array {
  const r = new Uint8Array(USB_OUTPUT_REPORT_LEN);
  r[0] = USB_OUTPUT_REPORT_ID;
  r[1] = 0x01 | 0x02; // compatible vibration, haptics select
  r[2] = 0x01 | 0x04 | 0x10; // mic LED, lightbar, player LEDs
  r[3] = u8(fb.rumbleRight * 255);
  r[4] = u8(fb.rumbleLeft * 255);
  r[9] = fb.micLed;
  r[39] = 0x02 | 0x04; // lightbar setup, improved rumble
  r[42] = 0x02;
  r[43] = fb.brightness;
  r[44] = fb.playerLeds & 0x1f;
  r[45] = u8(fb.lightbar.r);
  r[46] = u8(fb.lightbar.g);
  r[47] = u8(fb.lightbar.b);
  return r;
}
```

Add `export * from './codec/build-output.js';` to `index.ts`.

- [ ] **Step 4: Run tests** → 14 passed. **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): DualSense USB output report builder"
```

---

### Task 5: Stick shaping stage (calibration, deadzones, circular/square, invert)

**Files:**

- Create: `packages/engine/src/stages/stick-shape.ts`
- Test: `packages/engine/test/stages/stick-shape.test.ts`

**Interfaces:**

- Produces: `applyRadialDeadzone(mag: number, dz: {center,anti,outer}): number`, `applyStickShaping(x: number, y: number, cfg: StickConfig): {x,y}`.

Semantics: subtract calibration center, divide by radius; if `circular`, process the magnitude radially and keep the angle; otherwise process each axis independently (square response). Center DZ removes `center`, outer DZ saturates at `1-outer`, anti-deadzone remaps any non-zero output to start at `anti`. Clamp to unit circle (circular) or unit square.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { applyRadialDeadzone, applyStickShaping } from '../../src/stages/stick-shape.js';

const cfg = () => defaultProfile('p', 'p').sticks.left;

describe('applyRadialDeadzone', () => {
  const dz = { center: 0.1, anti: 0.2, outer: 0.1 };
  it('zero inside center deadzone', () => expect(applyRadialDeadzone(0.05, dz)).toBe(0));
  it('one at/after outer deadzone', () => expect(applyRadialDeadzone(0.95, dz)).toBe(1));
  it('rescales linearly between, then applies anti', () => {
    // mag 0.5 → (0.5-0.1)/(0.9-0.1)=0.5 → anti: 0.2+0.5*0.8=0.6
    expect(applyRadialDeadzone(0.5, dz)).toBeCloseTo(0.6, 6);
  });
  it('anti-deadzone makes smallest live input jump to anti', () => {
    expect(applyRadialDeadzone(0.1001, dz)).toBeCloseTo(0.2, 2);
  });
});

describe('applyStickShaping', () => {
  it('centered input stays zero', () =>
    expect(applyStickShaping(0.02, -0.02, cfg())).toEqual({ x: 0, y: 0 }));
  it('preserves angle in circular mode', () => {
    const c = cfg();
    c.deadzone = { center: 0.2, anti: 0, outer: 0 };
    const o = applyStickShaping(0.5, 0.5, c);
    expect(o.x).toBeCloseTo(o.y, 6);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo((Math.hypot(0.5, 0.5) - 0.2) / 0.8, 6);
  });
  it('square mode processes axes independently', () => {
    const c = cfg();
    c.circular = false;
    c.deadzone = { center: 0.2, anti: 0, outer: 0 };
    expect(applyStickShaping(0.1, 0.6, c)).toEqual({ x: 0, y: 0.5 });
  });
  it('applies calibration center and radius', () => {
    const c = cfg();
    c.calibration = { cx: 0.1, cy: -0.1, radius: 0.9 };
    c.deadzone = { center: 0, anti: 0, outer: 0 };
    const o = applyStickShaping(0.1, -0.1, c);
    expect(o).toEqual({ x: 0, y: 0 });
    expect(applyStickShaping(1, -0.1, c).x).toBeCloseTo(1, 6); // (1-0.1)/0.9 = 1
  });
  it('inverts axes', () => {
    const c = cfg();
    c.invertX = true;
    c.invertY = true;
    c.deadzone = { center: 0, anti: 0, outer: 0 };
    expect(applyStickShaping(0.5, 0.25, c)).toEqual({ x: -0.5, y: -0.25 });
  });
  it('clamps to unit circle when circular', () => {
    const c = cfg();
    c.deadzone = { center: 0, anti: 0, outer: 0 };
    expect(Math.hypot(...Object.values(applyStickShaping(1, 1, c)))).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Verify fail.** **Step 3: Implement**

```ts
import type { StickConfig } from '@dualforge/shared';

export interface Deadzone {
  center: number;
  anti: number;
  outer: number;
}

export function applyRadialDeadzone(mag: number, dz: Deadzone): number {
  const hi = 1 - dz.outer;
  if (mag <= dz.center) return 0;
  if (mag >= hi) return 1;
  const span = Math.max(1e-6, hi - dz.center);
  const t = (mag - dz.center) / span;
  return dz.anti + t * (1 - dz.anti);
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function applyStickShaping(
  x: number,
  y: number,
  cfg: StickConfig,
): { x: number; y: number } {
  let px = (x - cfg.calibration.cx) / cfg.calibration.radius;
  let py = (y - cfg.calibration.cy) / cfg.calibration.radius;

  if (cfg.circular) {
    const mag = Math.hypot(px, py);
    const out = applyRadialDeadzone(Math.min(1, mag), cfg.deadzone);
    if (out === 0 || mag === 0) {
      px = 0;
      py = 0;
    } else {
      px = (px / mag) * out;
      py = (py / mag) * out;
    }
  } else {
    const sx = applyRadialDeadzone(Math.min(1, Math.abs(px)), cfg.deadzone);
    const sy = applyRadialDeadzone(Math.min(1, Math.abs(py)), cfg.deadzone);
    px = Math.sign(px) * sx;
    py = Math.sign(py) * sy;
  }

  if (cfg.invertX) px = -px;
  if (cfg.invertY) py = -py;
  // normalize -0 to 0 for stable equality in tests/UI
  return { x: clamp1(px) || 0, y: clamp1(py) || 0 };
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat(engine): stick shaping stage`

---

### Task 6: Stick curve stage (presets + 8-point custom)

**Files:**

- Create: `packages/engine/src/stages/stick-curve.ts`
- Test: `packages/engine/test/stages/stick-curve.test.ts`

**Interfaces:**

- Produces: `presetPoints(preset): [number,number][]` (8 points), `evaluateCurve(points, input): number`, `applyStickCurve(x, y, curve: StickConfig['curve']): {x,y}` (radial: scales magnitude, keeps angle).

Curve = polyline through `(0,0)`, the 8 points sorted by input, output clamped `[0,1]`; inputs past the last point hold its output (HyperStrike semantics: P8 = (0.5,1) ⇒ full output at half travel).

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { applyStickCurve, evaluateCurve, presetPoints } from '../../src/stages/stick-curve.js';

describe('evaluateCurve', () => {
  const linear = presetPoints('linear');
  it('linear preset is identity', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) expect(evaluateCurve(linear, v)).toBeCloseTo(v, 6);
  });
  it('interpolates between points', () => {
    const pts: [number, number][] = [
      [0.1, 0],
      [0.2, 0.1],
      [0.3, 0.2],
      [0.4, 0.3],
      [0.5, 1],
      [0.6, 1],
      [0.8, 1],
      [1, 1],
    ];
    expect(evaluateCurve(pts, 0.45)).toBeCloseTo(0.65, 6);
    expect(evaluateCurve(pts, 0.05)).toBeCloseTo(0, 6);
  });
  it('holds last output past final point', () => {
    const pts: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.2],
      [0.3, 0.3],
      [0.4, 0.4],
      [0.5, 0.9],
      [0.5, 0.9],
      [0.5, 0.9],
      [0.5, 0.9],
    ];
    expect(evaluateCurve(pts, 0.9)).toBeCloseTo(0.9, 6);
  });
  it('presets are monotone and end at 1', () => {
    for (const p of ['aggressive', 'precise', 'scurve'] as const) {
      const pts = presetPoints(p);
      let last = 0;
      for (const [, o] of pts) {
        expect(o).toBeGreaterThanOrEqual(last);
        last = o;
      }
      expect(evaluateCurve(pts, 1)).toBeCloseTo(1, 6);
    }
  });
  it('aggressive > linear > precise mid-travel', () => {
    expect(evaluateCurve(presetPoints('aggressive'), 0.5)).toBeGreaterThan(0.5);
    expect(evaluateCurve(presetPoints('precise'), 0.5)).toBeLessThan(0.5);
  });
});

describe('applyStickCurve', () => {
  it('keeps angle, scales magnitude', () => {
    const o = applyStickCurve(0.3, 0.4, { kind: 'preset', preset: 'aggressive' });
    expect(o.x / o.y).toBeCloseTo(0.75, 6);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(evaluateCurve(presetPoints('aggressive'), 0.5), 6);
  });
  it('zero stays zero', () =>
    expect(applyStickCurve(0, 0, { kind: 'preset', preset: 'scurve' })).toEqual({ x: 0, y: 0 }));
});
```

- [ ] **Step 2: Verify fail.** **Step 3: Implement**

```ts
import type { StickConfig } from '@dualforge/shared';

export type CurvePoint = [number, number];
type Preset = Extract<StickConfig['curve'], { kind: 'preset' }>['preset'];

const sample = (f: (t: number) => number): CurvePoint[] =>
  Array.from({ length: 8 }, (_, i) => {
    const t = (i + 1) / 8;
    return [t, Math.min(1, Math.max(0, f(t)))];
  });

export function presetPoints(preset: Preset): CurvePoint[] {
  switch (preset) {
    case 'linear':
      return sample((t) => t);
    case 'aggressive':
      return sample((t) => Math.pow(t, 0.6));
    case 'precise':
      return sample((t) => Math.pow(t, 1.8));
    case 'scurve':
      return sample((t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
  }
}

export function evaluateCurve(points: readonly CurvePoint[], input: number): number {
  const v = Math.max(0, Math.min(1, input));
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  let [px, py] = [0, 0];
  for (const [x, y] of pts) {
    if (v <= x) {
      if (x === px) return Math.max(0, Math.min(1, y));
      return Math.max(0, Math.min(1, py + ((v - px) / (x - px)) * (y - py)));
    }
    px = x;
    py = y;
  }
  return Math.max(0, Math.min(1, py)); // past last point: hold
}

export function applyStickCurve(
  x: number,
  y: number,
  curve: StickConfig['curve'],
): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag === 0) return { x: 0, y: 0 };
  const pts = curve.kind === 'preset' ? presetPoints(curve.preset) : curve.points;
  const out = evaluateCurve(pts, Math.min(1, mag));
  return { x: (x / mag) * out, y: (y / mag) * out };
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat(engine): stick curve presets and 8-point custom curve`

---

### Task 7: Stick filter stage (basic smoothing) and trigger stage

**Files:**

- Create: `packages/engine/src/stages/stick-filter.ts`, `packages/engine/src/stages/triggers.ts`
- Test: `packages/engine/test/stages/stick-filter.test.ts`, `packages/engine/test/stages/triggers.test.ts`

**Interfaces:**

- Produces: `interface FilterState { x: number; y: number; init: boolean }`, `createFilterState(): FilterState`, `applyStickFilter(x, y, cfg: StickConfig['filter'], state: FilterState, dtMs: number): {x,y}` (mutates state); `applyTrigger(v: number, cfg: TriggerConfig, state: TriggerState): number`, `interface TriggerState { engaged: boolean }`, `createTriggerState()`.

Filter: time-corrected EMA. `strength` 0 → pass-through; 100 → time constant 60 ms. `tau = strength/100 * 60`; `alpha = 1 - exp(-dt/tau)`.
Trigger: rescale `[initial,max] → [0,1]`, then hair-trigger: `fixed` ⇒ any value > 0 → 1; `adaptive(value)` ⇒ once input exceeds `value/100` of travel it snaps to 1 and stays until it drops below `value/100 - 0.1` (hysteresis); then curve preset applied.

- [ ] **Step 1: Failing tests**

`stick-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyStickFilter, createFilterState } from '../../src/stages/stick-filter.js';

describe('applyStickFilter', () => {
  it('passes through when disabled', () => {
    const s = createFilterState();
    expect(applyStickFilter(0.7, -0.2, { enabled: false, strength: 100 }, s, 1)).toEqual({
      x: 0.7,
      y: -0.2,
    });
  });
  it('first sample initializes without lag', () => {
    const s = createFilterState();
    expect(applyStickFilter(1, 1, { enabled: true, strength: 100 }, s, 1)).toEqual({ x: 1, y: 1 });
  });
  it('smooths a step and converges', () => {
    const s = createFilterState();
    const cfg = { enabled: true, strength: 100 };
    applyStickFilter(0, 0, cfg, s, 1);
    const first = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.1);
    let v = first;
    for (let i = 0; i < 1000; i++) v = applyStickFilter(1, 0, cfg, s, 1).x;
    expect(v).toBeCloseTo(1, 3);
  });
  it('lower strength smooths less', () => {
    const a = createFilterState(),
      b = createFilterState();
    applyStickFilter(0, 0, { enabled: true, strength: 20 }, a, 1);
    applyStickFilter(0, 0, { enabled: true, strength: 80 }, b, 1);
    expect(applyStickFilter(1, 0, { enabled: true, strength: 20 }, a, 1).x).toBeGreaterThan(
      applyStickFilter(1, 0, { enabled: true, strength: 80 }, b, 1).x,
    );
  });
});
```

`triggers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { applyTrigger, createTriggerState } from '../../src/stages/triggers.js';

const cfg = () => defaultProfile('p', 'p').triggers.left;

describe('applyTrigger', () => {
  it('rescales deadzone window', () => {
    const c = cfg();
    c.deadzone = { initial: 0.2, max: 0.8 };
    const s = createTriggerState();
    expect(applyTrigger(0.1, c, s)).toBe(0);
    expect(applyTrigger(0.5, c, s)).toBeCloseTo(0.5, 6);
    expect(applyTrigger(0.9, c, s)).toBe(1);
  });
  it('fixed hair trigger snaps to full', () => {
    const c = cfg();
    c.hairTrigger = { mode: 'fixed' };
    expect(applyTrigger(0.05, c, createTriggerState())).toBe(1);
    expect(applyTrigger(0.0, c, createTriggerState())).toBe(0);
  });
  it('adaptive hair trigger engages at threshold with hysteresis', () => {
    const c = cfg();
    c.deadzone = { initial: 0, max: 1 };
    c.hairTrigger = { mode: 'adaptive', value: 50 };
    const s = createTriggerState();
    expect(applyTrigger(0.4, c, s)).toBeCloseTo(0.4, 6);
    expect(applyTrigger(0.55, c, s)).toBe(1);
    expect(applyTrigger(0.45, c, s)).toBe(1); // still engaged (hysteresis)
    expect(applyTrigger(0.3, c, s)).toBeCloseTo(0.3, 6);
  });
  it('applies curve preset', () => {
    const c = cfg();
    c.deadzone = { initial: 0, max: 1 };
    c.curve = 'precise';
    expect(applyTrigger(0.5, c, createTriggerState())).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Verify fail.** **Step 3: Implement**

`stick-filter.ts`:

```ts
import type { StickConfig } from '@dualforge/shared';

export interface FilterState {
  x: number;
  y: number;
  init: boolean;
}
export const createFilterState = (): FilterState => ({ x: 0, y: 0, init: false });

const MAX_TAU_MS = 60;

export function applyStickFilter(
  x: number,
  y: number,
  cfg: StickConfig['filter'],
  s: FilterState,
  dtMs: number,
): { x: number; y: number } {
  if (!cfg.enabled || cfg.strength <= 0) {
    s.x = x;
    s.y = y;
    s.init = true;
    return { x, y };
  }
  if (!s.init) {
    s.x = x;
    s.y = y;
    s.init = true;
    return { x, y };
  }
  const tau = (cfg.strength / 100) * MAX_TAU_MS;
  const alpha = 1 - Math.exp(-Math.max(0.01, dtMs) / tau);
  s.x += alpha * (x - s.x);
  s.y += alpha * (y - s.y);
  return { x: s.x, y: s.y };
}
```

`triggers.ts`:

```ts
import type { TriggerConfig } from '@dualforge/shared';
import { evaluateCurve, presetPoints } from './stick-curve.js';

export interface TriggerState {
  engaged: boolean;
}
export const createTriggerState = (): TriggerState => ({ engaged: false });

export function applyTrigger(v: number, cfg: TriggerConfig, s: TriggerState): number {
  const { initial, max } = cfg.deadzone;
  let t = v <= initial ? 0 : v >= max ? 1 : (v - initial) / Math.max(1e-6, max - initial);

  const ht = cfg.hairTrigger;
  if (ht.mode === 'fixed') {
    t = t > 0 ? 1 : 0;
  } else if (ht.mode === 'adaptive') {
    const thr = ht.value / 100;
    if (s.engaged) {
      if (t < thr - 0.1) s.engaged = false;
    } else if (t >= thr) s.engaged = true;
    if (s.engaged) t = 1;
  }
  return evaluateCurve(presetPoints(cfg.curve), t);
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat(engine): stick smoothing filter and trigger stage`

---

### Task 8: Mapping stage (button → XInput, turbo) and pipeline composition

**Files:**

- Create: `packages/engine/src/stages/mapping.ts`, `packages/engine/src/pipeline.ts`
- Test: `packages/engine/test/stages/mapping.test.ts`, `packages/engine/test/pipeline.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**

- Produces: `interface OutputFrame { xinput: XInputState; keys: KeyEvent[]; mouse: MouseEvent[] }`, `interface KeyEvent { code: string; down: boolean }`, `interface MouseEvent { button: 'left'|'right'|'middle'; down: boolean }`; `createMappingState()`, `applyMappings(raw: RawState, profile: Profile, state: MappingState, nowMs: number): OutputFrame` (buttons only; sticks/triggers filled by pipeline); `createPipelineState()`, `processReport(raw, profile, state, nowMs): OutputFrame`.
- Macro targets are accepted by schema but produce no output in this plan (Plan 3 adds the scheduler).

Turbo: while a button with `turboHz > 0` is held, its targets toggle on/off at that frequency (50 % duty). Key/mouse targets emit a `down`/`up` event only on transitions (state tracks previous pressed set).

- [ ] **Step 1: Failing tests**

`mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultProfile, emptyButtons, type RawState } from '@dualforge/shared';
import { applyMappings, createMappingState } from '../../src/stages/mapping.js';

const raw = (pressed: string[] = []): RawState => {
  const buttons = emptyButtons();
  for (const p of pressed) (buttons as Record<string, boolean>)[p] = true;
  return {
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    l2: 0,
    r2: 0,
    buttons,
    gyro: { x: 0, y: 0, z: 0 },
    accel: { x: 0, y: 0, z: 0 },
    touch: [
      { active: false, id: 0, x: 0, y: 0 },
      { active: false, id: 0, x: 0, y: 0 },
    ],
    battery: { percent: 100, state: 'full' },
    seq: 0,
  };
};

describe('applyMappings', () => {
  it('default profile maps cross→A, options→START, dpad', () => {
    const p = defaultProfile('p', 'p');
    const o = applyMappings(raw(['cross', 'options', 'dpadLeft']), p, createMappingState(), 0);
    expect(o.xinput.buttons.A).toBe(true);
    expect(o.xinput.buttons.START).toBe(true);
    expect(o.xinput.buttons.DPAD_LEFT).toBe(true);
    expect(o.xinput.buttons.B).toBe(false);
  });
  it('multi-map presses all targets', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = {
      targets: [
        { type: 'xbutton', button: 'A' },
        { type: 'xbutton', button: 'X' },
      ],
      turboHz: 0,
      continuous: false,
    };
    const o = applyMappings(raw(['cross']), p, createMappingState(), 0);
    expect(o.xinput.buttons.A && o.xinput.buttons.X).toBe(true);
  });
  it('emits key down/up only on transitions', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.square = {
      targets: [{ type: 'key', code: 'VK_SPACE' }],
      turboHz: 0,
      continuous: false,
    };
    const s = createMappingState();
    expect(applyMappings(raw(['square']), p, s, 0).keys).toEqual([
      { code: 'VK_SPACE', down: true },
    ]);
    expect(applyMappings(raw(['square']), p, s, 1).keys).toEqual([]);
    expect(applyMappings(raw([]), p, s, 2).keys).toEqual([{ code: 'VK_SPACE', down: false }]);
  });
  it('turbo toggles at the configured frequency', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.cross = {
      targets: [{ type: 'xbutton', button: 'A' }],
      turboHz: 10,
      continuous: false,
    }; // 100 ms period
    const s = createMappingState();
    expect(applyMappings(raw(['cross']), p, s, 0).xinput.buttons.A).toBe(true);
    expect(applyMappings(raw(['cross']), p, s, 60).xinput.buttons.A).toBe(false);
    expect(applyMappings(raw(['cross']), p, s, 110).xinput.buttons.A).toBe(true);
  });
  it('mouse targets emit transitions', () => {
    const p = defaultProfile('p', 'p');
    p.mappings.r1 = { targets: [{ type: 'mouse', button: 'left' }], turboHz: 0, continuous: false };
    const s = createMappingState();
    expect(applyMappings(raw(['r1']), p, s, 0).mouse).toEqual([{ button: 'left', down: true }]);
  });
});
```

`pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { parseDualSenseUsb } from '../src/codec/parse-input.js';
import { createPipelineState, processReport } from '../src/pipeline.js';

function report(mut: (b: Uint8Array) => void): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 1;
  b[1] = b[2] = b[3] = b[4] = 128;
  b[8] = 8;
  mut(b);
  return b;
}

describe('processReport', () => {
  it('passes a full-right left stick through to xinput', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[1] = 255;
        }),
      ),
      p,
      createPipelineState(),
      0,
    );
    expect(o.xinput.lx).toBeCloseTo(1, 2);
    expect(o.xinput.ly).toBeCloseTo(0, 2);
  });
  it('applies trigger stage to analog triggers', () => {
    const p = defaultProfile('p', 'p');
    p.triggers.right.hairTrigger = { mode: 'fixed' };
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[6] = 30;
        }),
      ),
      p,
      createPipelineState(),
      0,
    );
    expect(o.xinput.rt).toBe(1);
  });
  it('small jitter inside deadzone yields exact zero', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[3] = 131;
          b[4] = 125;
        }),
      ),
      p,
      createPipelineState(),
      0,
    );
    expect(o.xinput.rx).toBe(0);
    expect(o.xinput.ry).toBe(0);
  });
  it('maps buttons via mapping stage', () => {
    const p = defaultProfile('p', 'p');
    const o = processReport(
      parseDualSenseUsb(
        report((b) => {
          b[9] = 0x01;
        }),
      ),
      p,
      createPipelineState(),
      0,
    );
    expect(o.xinput.buttons.LB).toBe(true);
  });
});
```

- [ ] **Step 2: Verify fail.** **Step 3: Implement**

`mapping.ts`:

```ts
import {
  DS_BUTTONS,
  emptyXInput,
  type Profile,
  type RawState,
  type Target,
  type XInputState,
} from '@dualforge/shared';

export interface KeyEvent {
  code: string;
  down: boolean;
}
export interface MouseEvent {
  button: 'left' | 'right' | 'middle';
  down: boolean;
}
export interface OutputFrame {
  xinput: XInputState;
  keys: KeyEvent[];
  mouse: MouseEvent[];
}

export interface MappingState {
  turboStart: Partial<Record<string, number>>; // DsButton → ms when hold began
  keysDown: Set<string>;
  mouseDown: Set<MouseEvent['button']>;
}
export const createMappingState = (): MappingState => ({
  turboStart: {},
  keysDown: new Set(),
  mouseDown: new Set(),
});

export function applyMappings(
  raw: RawState,
  profile: Profile,
  s: MappingState,
  nowMs: number,
): OutputFrame {
  const xinput = emptyXInput();
  const wantKeys = new Set<string>();
  const wantMouse = new Set<MouseEvent['button']>();

  for (const b of DS_BUTTONS) {
    const m = profile.mappings[b];
    if (!m) continue;
    const held = raw.buttons[b];
    if (!held) {
      delete s.turboStart[b];
      continue;
    }

    let active = true;
    if (m.turboHz > 0) {
      const start = s.turboStart[b] ?? (s.turboStart[b] = nowMs);
      const period = 1000 / m.turboHz;
      active = (nowMs - start) % period < period / 2;
    }
    if (!active) continue;

    for (const t of m.targets) activate(t, xinput, wantKeys, wantMouse);
  }

  const keys: KeyEvent[] = [];
  for (const k of wantKeys) if (!s.keysDown.has(k)) keys.push({ code: k, down: true });
  for (const k of s.keysDown) if (!wantKeys.has(k)) keys.push({ code: k, down: false });
  s.keysDown = wantKeys;

  const mouse: MouseEvent[] = [];
  for (const k of wantMouse) if (!s.mouseDown.has(k)) mouse.push({ button: k, down: true });
  for (const k of s.mouseDown) if (!wantMouse.has(k)) mouse.push({ button: k, down: false });
  s.mouseDown = wantMouse;

  return { xinput, keys, mouse };
}

function activate(
  t: Target,
  x: XInputState,
  keys: Set<string>,
  mouse: Set<MouseEvent['button']>,
): void {
  switch (t.type) {
    case 'xbutton':
      x.buttons[t.button] = true;
      break;
    case 'key':
      keys.add(t.code);
      break;
    case 'mouse':
      mouse.add(t.button);
      break;
    case 'macro':
    case 'none':
      break; // macros: Plan 3
  }
}
```

`pipeline.ts`:

```ts
import type { Profile, RawState } from '@dualforge/shared';
import { applyStickShaping } from './stages/stick-shape.js';
import { applyStickCurve } from './stages/stick-curve.js';
import { applyStickFilter, createFilterState, type FilterState } from './stages/stick-filter.js';
import { applyTrigger, createTriggerState, type TriggerState } from './stages/triggers.js';
import {
  applyMappings,
  createMappingState,
  type MappingState,
  type OutputFrame,
} from './stages/mapping.js';

export interface PipelineState {
  filterL: FilterState;
  filterR: FilterState;
  trigL: TriggerState;
  trigR: TriggerState;
  mapping: MappingState;
  lastMs: number;
}
export const createPipelineState = (): PipelineState => ({
  filterL: createFilterState(),
  filterR: createFilterState(),
  trigL: createTriggerState(),
  trigR: createTriggerState(),
  mapping: createMappingState(),
  lastMs: -1,
});

export function processReport(
  raw: RawState,
  profile: Profile,
  s: PipelineState,
  nowMs: number,
): OutputFrame {
  const dt = s.lastMs < 0 ? 1 : Math.max(0.01, nowMs - s.lastMs);
  s.lastMs = nowMs;

  const frame = applyMappings(raw, profile, s.mapping, nowMs);

  const L = profile.sticks.left,
    R = profile.sticks.right;
  let l = applyStickShaping(raw.lx, raw.ly, L);
  l = applyStickCurve(l.x, l.y, L.curve);
  l = applyStickFilter(l.x, l.y, L.filter, s.filterL, dt);
  let r = applyStickShaping(raw.rx, raw.ry, R);
  r = applyStickCurve(r.x, r.y, R.curve);
  r = applyStickFilter(r.x, r.y, R.filter, s.filterR, dt);

  frame.xinput.lx = l.x;
  frame.xinput.ly = l.y;
  frame.xinput.rx = r.x;
  frame.xinput.ry = r.y;
  frame.xinput.lt = applyTrigger(raw.l2, profile.triggers.left, s.trigL);
  frame.xinput.rt = applyTrigger(raw.r2, profile.triggers.right, s.trigR);
  return frame;
}
```

`index.ts` additions:

```ts
export * from './stages/stick-shape.js';
export * from './stages/stick-curve.js';
export * from './stages/stick-filter.js';
export * from './stages/triggers.js';
export * from './stages/mapping.js';
export * from './pipeline.js';
```

- [ ] **Step 4: Run** `npm run check` → pass. **Step 5: Commit** `feat(engine): mapping stage with turbo and full pipeline composition`

---

### Task 9: `.hidlog` replay format, fixtures, and integration test

**Files:**

- Create: `packages/engine/src/replay/hidlog.ts`, `packages/engine/test/fixtures/stick-sweep.hidlog`, `packages/engine/test/fixtures/make-fixtures.ts`
- Test: `packages/engine/test/replay/hidlog.test.ts`, `packages/engine/test/replay/integration.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**

- Produces: `interface HidlogEntry { t: number; hex: string }`, `parseHidlog(text: string): HidlogEntry[]`, `serializeHidlog(entries): string`, `entryBytes(e): Uint8Array`. Format: JSON Lines, one `{"t":<ms>,"hex":"<128 hex chars>"}` per line; `#` lines are comments.

- [ ] **Step 1: Fixture generator** — `make-fixtures.ts` (run once with `npx tsx`; commit the output):

```ts
import { writeFileSync } from 'node:fs';
import { serializeHidlog, type HidlogEntry } from '../../src/replay/hidlog.js';

const entries: HidlogEntry[] = [];
for (let i = 0; i <= 200; i++) {
  const b = new Uint8Array(64);
  b[0] = 1;
  b[8] = 8;
  b[53] = 0x09;
  const a = (i / 200) * Math.PI * 2; // left stick full circle
  b[1] = Math.round(127.5 + 127.5 * Math.cos(a));
  b[2] = Math.round(127.5 - 127.5 * Math.sin(a));
  b[3] = 128;
  b[4] = 128;
  b[5] = Math.round((i / 200) * 255); // L2 sweep 0→1
  if (i % 40 < 20) b[8] |= 0x20; // cross pulses
  entries.push({ t: i, hex: Buffer.from(b).toString('hex') });
}
writeFileSync(new URL('./stick-sweep.hidlog', import.meta.url), serializeHidlog(entries));
```

- [ ] **Step 2: Failing tests**

`hidlog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { entryBytes, parseHidlog, serializeHidlog } from '../../src/replay/hidlog.js';

describe('hidlog', () => {
  it('round-trips', () => {
    const e = [
      { t: 0, hex: '01'.padEnd(128, '0') },
      { t: 1, hex: 'ff'.repeat(64) },
    ];
    expect(parseHidlog(serializeHidlog(e))).toEqual(e);
  });
  it('skips comments and blank lines', () => {
    expect(parseHidlog('# hi\n\n{"t":3,"hex":"00"}\n')).toEqual([{ t: 3, hex: '00' }]);
  });
  it('entryBytes decodes hex', () => {
    expect([...entryBytes({ t: 0, hex: '0a0b' })]).toEqual([10, 11]);
  });
  it('rejects malformed lines', () => {
    expect(() => parseHidlog('{"t":"x"}')).toThrow();
  });
});
```

`integration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { entryBytes, parseHidlog } from '../../src/replay/hidlog.js';
import { parseDualSenseUsb } from '../../src/codec/parse-input.js';
import { createPipelineState, processReport } from '../../src/pipeline.js';

const log = parseHidlog(
  readFileSync(new URL('../fixtures/stick-sweep.hidlog', import.meta.url), 'utf8'),
);

describe('replay: stick-sweep', () => {
  it('has 201 frames', () => expect(log.length).toBe(201));
  it('left stick traces a near-unit circle after default shaping', () => {
    const p = defaultProfile('p', 'p');
    const s = createPipelineState();
    const mags = log.map((e) => {
      const o = processReport(parseDualSenseUsb(entryBytes(e)), p, s, e.t);
      return Math.hypot(o.xinput.lx, o.xinput.ly);
    });
    for (const m of mags) expect(m).toBeGreaterThan(0.97);
  });
  it('left trigger ramps monotonically to 1', () => {
    const p = defaultProfile('p', 'p');
    const s = createPipelineState();
    let last = -1;
    for (const e of log) {
      const v = processReport(parseDualSenseUsb(entryBytes(e)), p, s, e.t).xinput.lt;
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(last).toBe(1);
  });
  it('cross pulses map to A pulses', () => {
    const p = defaultProfile('p', 'p');
    const s = createPipelineState();
    const a = log.map(
      (e) => processReport(parseDualSenseUsb(entryBytes(e)), p, s, e.t).xinput.buttons.A,
    );
    expect(a[0]).toBe(true);
    expect(a[25]).toBe(false);
    expect(a[45]).toBe(true);
  });
});
```

- [ ] **Step 3: Implement hidlog.ts**

```ts
export interface HidlogEntry {
  t: number;
  hex: string;
}

export function parseHidlog(text: string): HidlogEntry[] {
  const out: HidlogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const j: unknown = JSON.parse(s);
    if (typeof j !== 'object' || j === null) throw new Error('E_HIDLOG_LINE');
    const { t, hex } = j as { t?: unknown; hex?: unknown };
    if (typeof t !== 'number' || typeof hex !== 'string' || !/^([0-9a-f]{2})*$/i.test(hex))
      throw new Error('E_HIDLOG_LINE');
    out.push({ t, hex: hex.toLowerCase() });
  }
  return out;
}

export function serializeHidlog(entries: readonly HidlogEntry[]): string {
  return entries.map((e) => JSON.stringify({ t: e.t, hex: e.hex })).join('\n') + '\n';
}

export function entryBytes(e: HidlogEntry): Uint8Array {
  const out = new Uint8Array(e.hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(e.hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
```

Add `export * from './replay/hidlog.js';` to `index.ts`. Generate fixture: `npx -y tsx packages/engine/test/fixtures/make-fixtures.ts`.

- [ ] **Step 4: Run** `npm run check` → pass. **Step 5: Commit** `feat(engine): hidlog replay format with stick-sweep fixture and integration tests`

---

### Task 10: Electron app scaffold (electron-vite, main/preload/renderer, logger)

**Files:**

- Create: `apps/desktop/package.json`, `apps/desktop/electron.vite.config.ts`, `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.node.json`, `apps/desktop/tsconfig.web.json`, `apps/desktop/index.html`
- Create: `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/logger.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/main.tsx`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/styles/tokens.css`, `apps/desktop/src/renderer/styles/global.css`
- Modify: root `package.json` (`typecheck` to include desktop tsconfigs)

**Interfaces:**

- Produces: `npm run dev` opens a frameless 1280×800 window rendering “DualForge”; `logger` (pino) writing to `%APPDATA%\DualForge\logs\app.log`; preload exposes `window.dualforge` (filled in Task 12).

- [ ] **Step 1: apps/desktop/package.json**

```json
{
  "name": "@dualforge/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "rebuild": "electron-rebuild -f -w node-hid,vigemclient"
  },
  "dependencies": {
    "@dualforge/engine": "*",
    "@dualforge/shared": "*",
    "node-hid": "^3.4.0",
    "pino": "^9.7.0",
    "pino-roll": "^3.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "vigemclient": "^1.5.3",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^4.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.6.0",
    "electron": "^44.0.0",
    "electron-vite": "^4.0.0",
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 2: electron.vite.config.ts**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'engine-process': resolve(__dirname, 'src/main/engine-process.ts'),
        },
      },
    },
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
  },
});
```

(`engine-process.ts` is created in Task 11; until then create a one-line stub `export {};` so the build passes.)

- [ ] **Step 3: tsconfigs**

`tsconfig.json`: `{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }] }`

`tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "noEmit": true,
    "types": ["node", "electron-vite/node"],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["electron.vite.config.ts", "src/main/**/*", "src/preload/**/*"],
  "references": [{ "path": "../../packages/shared" }, { "path": "../../packages/engine" }]
}
```

`tsconfig.web.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "paths": { "@/*": ["./src/renderer/*"] }
  },
  "include": ["src/renderer/**/*", "src/preload/*.d.ts"],
  "references": [{ "path": "../../packages/shared" }]
}
```

Root `package.json` typecheck: `"typecheck": "tsc -b packages/shared packages/engine apps/desktop"`.

- [ ] **Step 4: index.html + renderer entry**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    />
    <title>DualForge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/renderer/App.tsx` (placeholder; replaced in Task 13):

```tsx
export default function App() {
  return (
    <div className="app">
      <h1>DualForge</h1>
    </div>
  );
}
```

`styles/tokens.css`:

```css
:root {
  --bg-a: #3a1f28;
  --bg-b: #0b0b14;
  --card: rgba(255, 255, 255, 0.06);
  --card-border: rgba(255, 255, 255, 0.1);
  --radius: 16px;
  --accent: #e2403f;
  --focus: #f08a3c;
  --link: #3b82f6;
  --text: #f5f5f7;
  --muted: #a0a0ab;
  --font: 'Poppins', 'Segoe UI', system-ui, sans-serif;
  --mono: 'Cascadia Mono', Consolas, monospace;
}
```

`styles/global.css`:

```css
* {
  box-sizing: border-box;
}
html,
body,
#root {
  height: 100%;
  margin: 0;
}
body {
  font-family: var(--font);
  color: var(--text);
  background: linear-gradient(135deg, var(--bg-a), var(--bg-b)) fixed;
  overflow: hidden;
  user-select: none;
}
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 5: logger.ts**

```ts
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';

const dir = join(app.getPath('appData'), 'DualForge', 'logs');
mkdirSync(dir, { recursive: true });

export const logger = pino(
  { level: 'info', base: { pid: process.pid } },
  pino.transport({
    target: 'pino-roll',
    options: {
      file: join(dir, 'app'),
      extension: '.log',
      frequency: 'daily',
      size: '10m',
      limit: { count: 14 },
      mkdir: true,
    },
  }),
);
export const LOG_DIR = dir;
```

- [ ] **Step 6: main/index.ts**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { logger } from './logger.js';

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0b0b14',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.on('ready-to-show', () => win?.show());
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win?.focus());

app.whenReady().then(() => {
  logger.info({ code: 'APP_START', version: app.getVersion() });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) =>
  logger.error({ code: 'E_UNCAUGHT', msg: err.message, stack: err.stack }),
);
```

`src/preload/index.ts` (stub): `export {};`

- [ ] **Step 7: Install, rebuild natives, run**

Run: `npm install` then `npm run rebuild -w @dualforge/desktop` then `npm run typecheck` then `npm run dev` (stop after the window appears).
Expected: frameless gradient window with “DualForge”; `%APPDATA%\DualForge\logs\app.log` contains `APP_START`.

- [ ] **Step 8: Commit** `feat(desktop): electron-vite scaffold with frameless window and pino logger`

---

### Task 11: Engine process — DeviceSource (node-hid), ViGEmSink, replay source, loop

**Files:**

- Create: `apps/desktop/src/main/device-source.ts`, `apps/desktop/src/main/replay-source.ts`, `apps/desktop/src/main/vigem-sink.ts`, `apps/desktop/src/main/engine-process.ts`
- Test: `apps/desktop/test/engine-loop.test.ts` (exercises the loop with the replay source and a fake sink)

**Interfaces:**

- Produces: `interface InputSource { start(onReport: (buf: Uint8Array, tMs: number) => void, onStatus: (connected: boolean) => void): void; write(report: Uint8Array): void; stop(): void }`; `createDeviceSource(): InputSource`; `createReplaySource(path: string, loop = true): InputSource`; `interface PadSink { ready: boolean; connect(): Promise<void>; update(x: XInputState): void; onRumble(cb: (large: number, small: number) => void): void; disconnect(): void }`; `createViGEmSink(): PadSink`; `createEngineLoop(deps)` in `engine-loop.ts` (pure orchestration; engine-process.ts wires real deps + `process.parentPort`).

- [ ] **Step 1: device-source.ts**

```ts
import { HIDAsync, devicesAsync } from 'node-hid';
import { DUALSENSE_PID, DUALSENSE_VID, USB_INPUT_REPORT_ID } from '@dualforge/engine';
import type { InputSource } from './engine-loop.js';

const POLL_MS = 1000;

export function createDeviceSource(): InputSource {
  let dev: HIDAsync | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let errors = 0;

  async function tryOpen(
    onReport: (b: Uint8Array, t: number) => void,
    onStatus: (c: boolean) => void,
  ) {
    if (dev || stopped) return;
    const list = await devicesAsync();
    const info = list.find(
      (d) =>
        d.vendorId === DUALSENSE_VID &&
        d.productId === DUALSENSE_PID &&
        d.usagePage === 1 &&
        d.usage === 5 &&
        d.path,
    );
    if (!info?.path) return;
    try {
      const d = await HIDAsync.open(info.path);
      dev = d;
      errors = 0;
      d.on('data', (buf: Buffer) => {
        if (buf[0] !== USB_INPUT_REPORT_ID) return; // Bluetooth (0x31) unsupported in v1
        onReport(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), performance.now());
      });
      d.on('error', (e: Error) => {
        errors++;
        process.stderr.write(`E_HID_READ ${e.message}\n`);
        void d.close().catch(() => undefined);
        dev = null;
        onStatus(false);
      });
      onStatus(true);
    } catch (e) {
      process.stderr.write(`E_HID_OPEN ${(e as Error).message}\n`);
    }
  }

  return {
    start(onReport, onStatus) {
      stopped = false;
      void tryOpen(onReport, onStatus);
      timer = setInterval(() => void tryOpen(onReport, onStatus), POLL_MS);
    },
    write(report) {
      if (dev) void dev.write(Buffer.from(report)).catch(() => undefined);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (dev) {
        void dev.close();
        dev = null;
      }
    },
  };
}
```

- [ ] **Step 2: replay-source.ts**

```ts
import { readFileSync } from 'node:fs';
import { entryBytes, parseHidlog } from '@dualforge/engine';
import type { InputSource } from './engine-loop.js';

export function createReplaySource(path: string, loop = true): InputSource {
  const log = parseHidlog(readFileSync(path, 'utf8'));
  let timer: NodeJS.Timeout | null = null;
  return {
    start(onReport, onStatus) {
      if (log.length === 0) {
        onStatus(false);
        return;
      }
      let i = 0;
      const t0 = performance.now();
      onStatus(true);
      timer = setInterval(() => {
        const e = log[i]!;
        onReport(entryBytes(e), t0 + e.t);
        i++;
        if (i >= log.length) {
          if (loop) i = 0;
          else {
            if (timer) clearInterval(timer);
            onStatus(false);
          }
        }
      }, 1);
    },
    write() {
      /* no device */
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
```

- [ ] **Step 3: vigem-sink.ts**

```ts
import { createRequire } from 'node:module';
import type { XInputState } from '@dualforge/shared';
import type { PadSink } from './engine-loop.js';

const require = createRequire(import.meta.url);

export function createViGEmSink(): PadSink {
  let client: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  let pad: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  let rumbleCb: ((l: number, s: number) => void) | null = null;
  const sink: PadSink = {
    ready: false,
    async connect() {
      const ViGEmClient = require('vigemclient');
      client = new ViGEmClient();
      const err = client.connect();
      if (err) throw new Error(`E_VIGEM_INIT ${err.message ?? err}`);
      pad = client.createX360Controller();
      pad.updateMode = 'manual';
      const e2 = pad.connect();
      if (e2) throw new Error(`E_VIGEM_TARGET ${e2.message ?? e2}`);
      pad.on('vibration', (d: { largeMotor: number; smallMotor: number }) =>
        rumbleCb?.(d.largeMotor / 255, d.smallMotor / 255),
      );
      sink.ready = true;
    },
    update(x: XInputState) {
      if (!pad) return;
      const B = pad.button,
        A = pad.axis;
      B.A.setValue(x.buttons.A);
      B.B.setValue(x.buttons.B);
      B.X.setValue(x.buttons.X);
      B.Y.setValue(x.buttons.Y);
      B.LEFT_SHOULDER.setValue(x.buttons.LB);
      B.RIGHT_SHOULDER.setValue(x.buttons.RB);
      B.LEFT_THUMB.setValue(x.buttons.LS);
      B.RIGHT_THUMB.setValue(x.buttons.RS);
      B.BACK.setValue(x.buttons.BACK);
      B.START.setValue(x.buttons.START);
      B.GUIDE.setValue(x.buttons.GUIDE);
      A.dpadHorz.setValue(x.buttons.DPAD_RIGHT ? 1 : x.buttons.DPAD_LEFT ? -1 : 0);
      A.dpadVert.setValue(x.buttons.DPAD_UP ? 1 : x.buttons.DPAD_DOWN ? -1 : 0);
      A.leftX.setValue(x.lx);
      A.leftY.setValue(x.ly);
      A.rightX.setValue(x.rx);
      A.rightY.setValue(x.ry);
      A.leftTrigger.setValue(x.lt);
      A.rightTrigger.setValue(x.rt);
      pad.update();
    },
    onRumble(cb) {
      rumbleCb = cb;
    },
    disconnect() {
      try {
        pad?.disconnect();
      } catch {
        /* ignore */
      }
      pad = null;
      client = null;
      sink.ready = false;
    },
  };
  return sink;
}
```

- [ ] **Step 4: Failing test for the loop** — `apps/desktop/test/engine-loop.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { defaultProfile, type XInputState } from '@dualforge/shared';
import { createEngineLoop, type InputSource, type PadSink } from '../src/main/engine-loop.js';
import { createReplaySource } from '../src/main/replay-source.js';

const FIX = new URL(
  '../../../packages/engine/test/fixtures/stick-sweep.hidlog',
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function fakeSink(): PadSink & { frames: XInputState[] } {
  const frames: XInputState[] = [];
  return {
    ready: true,
    frames,
    async connect() {},
    update(x) {
      frames.push(structuredClone(x));
    },
    onRumble() {},
    disconnect() {},
  };
}

describe('engine loop', () => {
  it('feeds replay frames through pipeline into the sink and emits snapshots', async () => {
    vi.useFakeTimers();
    const sink = fakeSink();
    const events: unknown[] = [];
    const loop = createEngineLoop({
      source: createReplaySource(FIX, false),
      sink,
      emit: (e) => events.push(e),
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(sink.frames.length).toBeGreaterThan(150);
    expect(sink.frames.some((f) => f.buttons.A)).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === 'snapshot')).toBe(true);
    loop.stop();
    vi.useRealTimers();
  });
  it('sends an output report when feedback changes', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    const src: InputSource = {
      start(_r, s) {
        s(true);
      },
      write(r) {
        writes.push(r);
      },
      stop() {},
    };
    const loop = createEngineLoop({
      source: src,
      sink: fakeSink(),
      emit: () => {},
      now: () => performance.now(),
    });
    loop.setProfile(defaultProfile('p', 'p'));
    await loop.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0]![0]).toBe(0x02);
    loop.stop();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 5: engine-loop.ts**

```ts
import {
  buildOutputReport,
  createPipelineState,
  parseDualSenseUsb,
  processReport,
  type Feedback,
} from '@dualforge/engine';
import {
  type EngineEvent,
  type Profile,
  type RawState,
  type XInputState,
  emptyButtons,
} from '@dualforge/shared';

export interface InputSource {
  start(
    onReport: (buf: Uint8Array, tMs: number) => void,
    onStatus: (connected: boolean) => void,
  ): void;
  write(report: Uint8Array): void;
  stop(): void;
}
export interface PadSink {
  ready: boolean;
  connect(): Promise<void>;
  update(x: XInputState): void;
  onRumble(cb: (large: number, small: number) => void): void;
  disconnect(): void;
}
export interface LoopDeps {
  source: InputSource;
  sink: PadSink;
  emit: (e: EngineEvent) => void;
  now: () => number;
}

const SNAPSHOT_MS = 1000 / 60;
const KEEPALIVE_MS = 250;

export function createEngineLoop(d: LoopDeps) {
  let profile: Profile | null = null;
  let state = createPipelineState();
  let connected = false;
  const t0 = d.now();
  let lastSnap = 0,
    lastOutWrite = 0,
    lastOutHex = '';
  let reports = 0,
    hzWindowStart = t0,
    reportHz = 0;
  const latencies: number[] = [];
  let rumble = { large: 0, small: 0 };
  let lastRaw: RawState | null = null,
    lastOut: XInputState | null = null;

  function feedback(): Feedback {
    const p = profile!;
    return {
      rumbleLeft: rumble.large * (p.vibration.left / 100),
      rumbleRight: rumble.small * (p.vibration.right / 100),
      lightbar: { r: p.lights.r, g: p.lights.g, b: p.lights.b },
      brightness: p.lights.brightness as 0 | 1 | 2,
      playerLeds: p.lights.playerLeds,
      micLed: 0,
    };
  }
  function maybeWriteOutput(now: number, force = false) {
    if (!profile || !connected) return;
    const rep = buildOutputReport(feedback());
    const hex = Buffer.from(rep).toString('hex');
    if (force || hex !== lastOutHex || now - lastOutWrite >= KEEPALIVE_MS) {
      d.source.write(rep);
      lastOutHex = hex;
      lastOutWrite = now;
    }
  }
  function onReport(buf: Uint8Array, t: number) {
    if (!profile) return;
    const start = d.now();
    let raw: RawState;
    try {
      raw = parseDualSenseUsb(buf);
    } catch (e) {
      d.emit({ type: 'error', code: 'E_REPORT_PARSE', msg: (e as Error).message });
      return;
    }
    const out = processReport(raw, profile, state, t - t0);
    if (d.sink.ready) d.sink.update(out.xinput);
    lastRaw = raw;
    lastOut = out.xinput;
    latencies.push(d.now() - start);
    if (latencies.length > 1000) latencies.shift();
    reports++;
    const now = d.now();
    if (now - hzWindowStart >= 1000) {
      reportHz = reports / ((now - hzWindowStart) / 1000);
      reports = 0;
      hzWindowStart = now;
    }
    maybeWriteOutput(now);
    if (now - lastSnap >= SNAPSHOT_MS) {
      lastSnap = now;
      emitSnapshot(now);
    }
  }
  function emitSnapshot(now: number) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const raw = lastRaw,
      out = lastOut;
    d.emit({
      type: 'snapshot',
      snapshot: {
        t: now - t0,
        connected,
        vigemReady: d.sink.ready,
        reportHz,
        pipelineP99Ms: p99,
        battery: raw?.battery ?? { percent: 0, state: 'unknown' },
        raw: raw
          ? {
              lx: raw.lx,
              ly: raw.ly,
              rx: raw.rx,
              ry: raw.ry,
              l2: raw.l2,
              r2: raw.r2,
              buttons: raw.buttons,
              gyro: raw.gyro,
            }
          : {
              lx: 0,
              ly: 0,
              rx: 0,
              ry: 0,
              l2: 0,
              r2: 0,
              buttons: emptyButtons(),
              gyro: { x: 0, y: 0, z: 0 },
            },
        out: out
          ? {
              lx: out.lx,
              ly: out.ly,
              rx: out.rx,
              ry: out.ry,
              lt: out.lt,
              rt: out.rt,
              buttons: out.buttons,
            }
          : { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
      },
    });
  }
  let idle: NodeJS.Timeout | null = null;

  return {
    setProfile(p: Profile) {
      profile = p;
      state = createPipelineState();
      maybeWriteOutput(d.now(), true);
    },
    async start() {
      try {
        await d.sink.connect();
      } catch (e) {
        d.emit({ type: 'error', code: 'E_VIGEM_INIT', msg: (e as Error).message });
      }
      d.sink.onRumble((large, small) => {
        rumble = { large, small };
        maybeWriteOutput(d.now());
      });
      d.source.start(onReport, (c) => {
        connected = c;
        d.emit({ type: 'status', connected, vigemReady: d.sink.ready });
        if (c) maybeWriteOutput(d.now(), true);
      });
      idle = setInterval(() => {
        const now = d.now();
        if (now - lastSnap >= SNAPSHOT_MS) {
          lastSnap = now;
          emitSnapshot(now);
        }
        maybeWriteOutput(now);
      }, 100);
    },
    stop() {
      if (idle) clearInterval(idle);
      d.source.stop();
      d.sink.disconnect();
    },
    swapSource(src: InputSource) {
      d.source.stop();
      d.source = src;
      d.source.start(onReport, (c) => {
        connected = c;
        d.emit({ type: 'status', connected, vigemReady: d.sink.ready });
      });
    },
  };
}
```

- [ ] **Step 6: engine-process.ts (utilityProcess entry)**

```ts
import { EngineCommandSchema, type EngineEvent } from '@dualforge/shared';
import { createEngineLoop } from './engine-loop.js';
import { createDeviceSource } from './device-source.js';
import { createReplaySource } from './replay-source.js';
import { createViGEmSink } from './vigem-sink.js';

const port = process.parentPort;
const emit = (e: EngineEvent) => port.postMessage(e);

const loop = createEngineLoop({
  source: createDeviceSource(),
  sink: createViGEmSink(),
  emit,
  now: () => performance.now(),
});

port.on('message', (m) => {
  const parsed = EngineCommandSchema.safeParse(m.data);
  if (!parsed.success) {
    emit({ type: 'error', code: 'E_IPC_COMMAND', msg: parsed.error.message });
    return;
  }
  const c = parsed.data;
  switch (c.type) {
    case 'setProfile':
      loop.setProfile(c.profile);
      break;
    case 'replay':
      loop.swapSource(createReplaySource(c.path, true));
      break;
    case 'useDevice':
      loop.swapSource(createDeviceSource());
      break;
    case 'shutdown':
      loop.stop();
      process.exit(0);
  }
});
void loop.start();
process.on('uncaughtException', (e) => {
  emit({ type: 'error', code: 'E_ENGINE_UNCAUGHT', msg: e.message });
  process.exit(1);
});
```

Add a `vitest.config.ts` to `apps/desktop` with `test: { environment: 'node', include: ['test/**/*.test.ts'] }`.

- [ ] **Step 7: Run** `npm run check` → loop tests pass. **Step 8: Commit** `feat(desktop): engine utility process with node-hid source, ViGEm sink, replay source`

---

### Task 12: EngineHost in main + typed preload bridge

**Files:**

- Create: `apps/desktop/src/main/engine-host.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/preload/api.d.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**

- Produces: `createEngineHost(opts: { onEvent(e: EngineEvent): void; log: Logger })` with `start()`, `send(cmd: EngineCommand)`, `stop()`; restarts on crash with backoff (max 5 per 60 s then emits `E_ENGINE_RESTART_LIMIT`). Preload API `window.dualforge`: `onEngineEvent(cb) → unsubscribe`, `setProfile(profile)`, `replay(path)`, `useDevice()`, `window: { minimize(), toggleMaximize(), close() }`, `getProfile(): Promise<Profile>`.
- Main holds a single in-memory profile (defaultProfile) for this plan; persistence arrives in Plan 3.

- [ ] **Step 1: engine-host.ts**

```ts
import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { EngineEventSchema, type EngineCommand, type EngineEvent } from '@dualforge/shared';
import type { Logger } from 'pino';

export function createEngineHost(opts: { onEvent: (e: EngineEvent) => void; log: Logger }) {
  let child: UtilityProcess | null = null;
  let restarts: number[] = [];
  let stopping = false;
  let lastProfileCmd: EngineCommand | null = null;

  function spawn() {
    child = utilityProcess.fork(join(__dirname, 'engine-process.js'), [], {
      serviceName: 'dualforge-engine',
      stdio: 'pipe',
    });
    child.stderr?.on('data', (d: Buffer) =>
      opts.log.warn({ code: 'ENGINE_STDERR', msg: d.toString().trim() }),
    );
    child.on('message', (m: unknown) => {
      const p = EngineEventSchema.safeParse(m);
      if (p.success) {
        if (p.data.type === 'error') opts.log.error({ code: p.data.code, msg: p.data.msg });
        opts.onEvent(p.data);
      } else opts.log.warn({ code: 'E_IPC_EVENT', msg: p.error.message });
    });
    child.on('exit', (code) => {
      opts.log.warn({ code: 'ENGINE_EXIT', exitCode: code });
      child = null;
      if (stopping) return;
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 60_000);
      if (restarts.length >= 5) {
        opts.onEvent({
          type: 'error',
          code: 'E_ENGINE_RESTART_LIMIT',
          msg: 'engine crashed 5× in 60 s',
        });
        return;
      }
      restarts.push(now);
      setTimeout(() => {
        spawn();
        if (lastProfileCmd) child?.postMessage(lastProfileCmd);
      }, 500 * restarts.length);
    });
  }

  return {
    start() {
      stopping = false;
      spawn();
    },
    send(cmd: EngineCommand) {
      if (cmd.type === 'setProfile') lastProfileCmd = cmd;
      child?.postMessage(cmd);
    },
    stop() {
      stopping = true;
      child?.postMessage({ type: 'shutdown' } satisfies EngineCommand);
      setTimeout(() => child?.kill(), 500);
    },
  };
}
```

- [ ] **Step 2: Wire into main/index.ts** (add to the file from Task 10)

```ts
import { ipcMain } from 'electron';
import { defaultProfile, ProfileSchema, type Profile } from '@dualforge/shared';
import { createEngineHost } from './engine-host.js';

let profile: Profile = defaultProfile('p1', 'Profile 1');
const engine = createEngineHost({
  log: logger,
  onEvent: (e) => win?.webContents.send('engine:event', e),
});

ipcMain.handle('profile:get', () => profile);
ipcMain.handle('profile:set', (_e, p: unknown) => {
  const parsed = ProfileSchema.safeParse(p);
  if (!parsed.success) throw new Error('E_PROFILE_SCHEMA');
  profile = parsed.data;
  engine.send({ type: 'setProfile', profile });
  return true;
});
ipcMain.handle('engine:replay', (_e, path: string) => engine.send({ type: 'replay', path }));
ipcMain.handle('engine:useDevice', () => engine.send({ type: 'useDevice' }));
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:toggleMaximize', () =>
  win?.isMaximized() ? win.unmaximize() : win?.maximize(),
);
ipcMain.on('window:close', () => win?.close());

// inside app.whenReady().then(...): after createWindow()
engine.start();
engine.send({ type: 'setProfile', profile });
// add:
app.on('before-quit', () => engine.stop());
```

- [ ] **Step 3: preload/index.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { EngineEvent, Profile } from '@dualforge/shared';

const api = {
  onEngineEvent(cb: (e: EngineEvent) => void): () => void {
    const h = (_: unknown, e: EngineEvent) => cb(e);
    ipcRenderer.on('engine:event', h);
    return () => ipcRenderer.removeListener('engine:event', h);
  },
  getProfile: (): Promise<Profile> => ipcRenderer.invoke('profile:get'),
  setProfile: (p: Profile): Promise<boolean> => ipcRenderer.invoke('profile:set', p),
  replay: (path: string): Promise<void> => ipcRenderer.invoke('engine:replay', path),
  useDevice: (): Promise<void> => ipcRenderer.invoke('engine:useDevice'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
  },
};
contextBridge.exposeInMainWorld('dualforge', api);
export type DualforgeApi = typeof api;
```

`preload/api.d.ts`:

```ts
import type { DualforgeApi } from './index';
declare global {
  interface Window {
    dualforge: DualforgeApi;
  }
}
export {};
```

- [ ] **Step 4: Run** `npm run typecheck` and `npm run dev`; in DevTools console run `await window.dualforge.getProfile()` → returns the default profile. Logs show `ENGINE_STDERR E_VIGEM_INIT …` if ViGEmBus is not installed (expected until the driver is installed — do not install without user go-ahead).

- [ ] **Step 5: Commit** `feat(desktop): engine host with crash restart and typed preload bridge`

---

### Task 13: Renderer shell — Header, TabStrip, Footer, Card, store

**Files:**

- Create: `apps/desktop/src/renderer/store.ts`, `components/Shell.tsx`, `components/Header.tsx`, `components/TabStrip.tsx`, `components/Footer.tsx`, `components/Card.tsx`, `styles/shell.css`
- Modify: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**

- Produces: `useStore()` with `{ snapshot: EngineSnapshot | null; page: Page; setPage; profile: Profile | null; loadProfile(); }`; `type Page = 'home' | 'inputTest'` (later plans extend); `<Shell>` renders Header (wordmark, TabStrip, right icon buttons incl. window controls), page body, Footer legend.

- [ ] **Step 1: store.ts**

```ts
import { create } from 'zustand';
import type { EngineSnapshot, Profile } from '@dualforge/shared';

export type Page = 'home' | 'inputTest';

interface State {
  snapshot: EngineSnapshot | null;
  lastError: { code: string; msg: string } | null;
  page: Page;
  profile: Profile | null;
  setPage(p: Page): void;
  loadProfile(): Promise<void>;
  subscribe(): () => void;
}

export const useStore = create<State>((set) => ({
  snapshot: null,
  lastError: null,
  page: 'home',
  profile: null,
  setPage: (page) => set({ page }),
  loadProfile: async () => set({ profile: await window.dualforge.getProfile() }),
  subscribe: () =>
    window.dualforge.onEngineEvent((e) => {
      if (e.type === 'snapshot') set({ snapshot: e.snapshot });
      else if (e.type === 'error') set({ lastError: { code: e.code, msg: e.msg } });
    }),
}));
```

- [ ] **Step 2: Components**

`Card.tsx`:

```tsx
import type { PropsWithChildren } from 'react';
export function Card({
  title,
  children,
  className = '',
}: PropsWithChildren<{ title?: string; className?: string }>) {
  return (
    <section className={`card ${className}`}>
      {title && <h3 className="card-title">{title}</h3>}
      {children}
    </section>
  );
}
```

`TabStrip.tsx`:

```tsx
import { useStore, type Page } from '../store';
const TABS: { id: Page; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'inputTest', label: 'Input Test' },
];
export function TabStrip() {
  const { page, setPage } = useStore();
  return (
    <nav className="tabstrip">
      <span className="pill">LB</span>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab ${page === t.id ? 'active' : ''}`}
          onClick={() => setPage(t.id)}
        >
          {t.label}
        </button>
      ))}
      <span className="pill">RB</span>
    </nav>
  );
}
```

`Header.tsx`:

```tsx
import { TabStrip } from './TabStrip';
export function Header() {
  const w = window.dualforge.window;
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-word">DUAL</span>
        <span className="brand-tag">FORGE</span>
      </div>
      <TabStrip />
      <div className="header-right">
        <button className="icon-btn" title="Minimize" onClick={w.minimize}>
          –
        </button>
        <button className="icon-btn" title="Maximize" onClick={w.toggleMaximize}>
          ▢
        </button>
        <button className="icon-btn close" title="Close" onClick={w.close}>
          ✕
        </button>
      </div>
    </header>
  );
}
```

`Footer.tsx`:

```tsx
export function Footer() {
  return (
    <footer className="footer">
      <span>✚ Direction Control</span>
      <span>Ⓐ Confirm</span>
      <span>Ⓑ Back</span>
    </footer>
  );
}
```

`Shell.tsx`:

```tsx
import { useEffect, type PropsWithChildren } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { useStore } from '../store';
export function Shell({ children }: PropsWithChildren) {
  const { subscribe, loadProfile } = useStore();
  useEffect(() => {
    void loadProfile();
    return subscribe();
  }, [subscribe, loadProfile]);
  return (
    <div className="app">
      <Header />
      <main className="body">{children}</main>
      <Footer />
    </div>
  );
}
```

`App.tsx`:

```tsx
import { Shell } from './components/Shell';
import { useStore } from './store';
import { Home } from './pages/Home';
import { InputTest } from './pages/InputTest';
import './styles/shell.css';
export default function App() {
  const page = useStore((s) => s.page);
  return <Shell>{page === 'home' ? <Home /> : <InputTest />}</Shell>;
}
```

- [ ] **Step 3: shell.css**

```css
.header {
  height: 100px;
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  align-items: center;
  padding: 0 24px;
  -webkit-app-region: drag;
}
.header button {
  -webkit-app-region: no-drag;
}
.brand {
  font-weight: 700;
  letter-spacing: 2px;
  font-size: 20px;
}
.brand-tag {
  color: var(--accent);
  margin-left: 6px;
  font-size: 12px;
  vertical-align: top;
}
.tabstrip {
  display: flex;
  justify-content: center;
  gap: 8px;
  align-items: center;
}
.pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  color: var(--muted);
}
.tab {
  background: transparent;
  border: 0;
  color: var(--muted);
  font: inherit;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab.active {
  background: var(--card);
  color: var(--text);
  border-bottom-color: var(--focus);
}
.tab:focus-visible,
.icon-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.header-right {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.icon-btn {
  width: 36px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  background: var(--card);
  color: var(--text);
  cursor: pointer;
}
.icon-btn.close:hover {
  background: var(--accent);
}
.body {
  flex: 1;
  padding: 0 24px 16px;
  overflow: auto;
}
.footer {
  height: 56px;
  display: flex;
  gap: 28px;
  justify-content: center;
  align-items: center;
  color: var(--muted);
  font-size: 13px;
}
.card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 20px;
}
.card-title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
}
```

- [ ] **Step 4: Create temporary `pages/Home.tsx` and `pages/InputTest.tsx`** each exporting a component returning `<Card title="…">coming</Card>` so the build compiles; Task 14 replaces them. Run `npm run dev` → header, tabs switch, window controls work. **Step 5: Commit** `feat(renderer): GameSir-style shell with header tabs, footer legend, zustand store`

---

### Task 14: Home and Input Test pages with live widgets and DualSense art

**Files:**

- Create: `components/StickCircle.tsx`, `components/TriggerBar.tsx`, `art/DualSenseTop.tsx`, `pages/Home.tsx`, `pages/InputTest.tsx`, `styles/pages.css`
- Test: `apps/desktop/test/renderer/StickCircle.test.tsx` (Vitest + jsdom + @testing-library/react)

**Interfaces:**

- Consumes: `useStore().snapshot`.
- Produces: `<StickCircle raw={{x,y}} out={{x,y}} label />` (SVG 160×160: unit circle, deadzone ring not needed yet, raw dot grey, processed dot accent, numeric X/Y mono readout); `<TriggerBar label value />`; `<DualSenseTop pressed={Record<string,boolean>} lightbar={{r,g,b}} />` flat SVG top view that highlights pressed buttons and tints the lightbar.

- [ ] **Step 1: Failing test** (add dev deps `jsdom`, `@testing-library/react`; `vitest.config.ts` in apps/desktop gets `environmentMatchGlobs: [['test/renderer/**', 'jsdom']]`)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StickCircle } from '../../src/renderer/components/StickCircle';

describe('StickCircle', () => {
  it('renders numeric readouts for processed values', () => {
    render(<StickCircle label="Left" raw={{ x: 0.1, y: 0.2 }} out={{ x: 0.5, y: -0.25 }} />);
    expect(screen.getByText('X 0.500')).toBeTruthy();
    expect(screen.getByText('Y -0.250')).toBeTruthy();
  });
  it('places processed dot at scaled position', () => {
    const { container } = render(
      <StickCircle label="L" raw={{ x: 0, y: 0 }} out={{ x: 1, y: 0 }} />,
    );
    const dot = container.querySelector('circle.dot-out')!;
    expect(dot.getAttribute('cx')).toBe('150'); // 80 + 1*70
    expect(dot.getAttribute('cy')).toBe('80');
  });
});
```

- [ ] **Step 2: StickCircle.tsx**

```tsx
const R = 70,
  C = 80;
export function StickCircle({
  label,
  raw,
  out,
}: {
  label: string;
  raw: { x: number; y: number };
  out: { x: number; y: number };
}) {
  const px = (v: number) => C + v * R,
    py = (v: number) => C - v * R;
  return (
    <div className="stick-circle">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--card-border)" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="var(--card-border)" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="var(--card-border)" />
        <circle className="dot-raw" cx={px(raw.x)} cy={py(raw.y)} r="4" fill="var(--muted)" />
        <circle className="dot-out" cx={px(out.x)} cy={py(out.y)} r="6" fill="var(--accent)" />
      </svg>
      <div className="stick-label">{label}</div>
      <div className="mono">X {out.x.toFixed(3)}</div>
      <div className="mono">Y {out.y.toFixed(3)}</div>
    </div>
  );
}
```

`TriggerBar.tsx`:

```tsx
export function TriggerBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="trigger-bar">
      <span>{label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="mono">{value.toFixed(2)}</span>
    </div>
  );
}
```

- [ ] **Step 3: DualSenseTop.tsx** — flat top-view SVG. Body outline as a single path; buttons as `<circle>`/`<rect>` with `className={pressed[x] ? 'btn on' : 'btn'}`; lightbar as two rounded rects beside the touchpad filled with `rgb(r,g,b)`.

```tsx
type P = Record<string, boolean>;
export function DualSenseTop({
  pressed,
  lightbar,
}: {
  pressed: P;
  lightbar: { r: number; g: number; b: number };
}) {
  const on = (k: string) => (pressed[k] ? 'btn on' : 'btn');
  const lb = `rgb(${lightbar.r},${lightbar.g},${lightbar.b})`;
  return (
    <svg className="ds-art" viewBox="0 0 640 420" width="100%">
      <path
        d="M120 60 h400 a60 60 0 0 1 60 60 v40 l40 180 a40 40 0 0 1 -70 20 l-70 -110 h-320 l-70 110 a40 40 0 0 1 -70 -20 l40 -180 v-40 a60 60 0 0 1 60 -60z"
        fill="rgba(255,255,255,0.08)"
        stroke="var(--card-border)"
        strokeWidth="2"
      />
      {/* touchpad + lightbar */}
      <rect
        x="220"
        y="80"
        width="200"
        height="90"
        rx="18"
        fill="rgba(255,255,255,0.06)"
        className={on('touchpad')}
      />
      <rect x="208" y="80" width="8" height="90" rx="4" fill={lb} />
      <rect x="424" y="80" width="8" height="90" rx="4" fill={lb} />
      {/* shoulders */}
      <rect x="130" y="30" width="110" height="22" rx="8" className={on('l1')} />
      <rect x="400" y="30" width="110" height="22" rx="8" className={on('r1')} />
      <rect x="140" y="8" width="90" height="18" rx="8" className={on('l2')} />
      <rect x="410" y="8" width="90" height="18" rx="8" className={on('r2')} />
      {/* dpad */}
      <rect x="140" y="108" width="24" height="24" rx="4" className={on('dpadUp')} />
      <rect x="140" y="156" width="24" height="24" rx="4" className={on('dpadDown')} />
      <rect x="116" y="132" width="24" height="24" rx="4" className={on('dpadLeft')} />
      <rect x="164" y="132" width="24" height="24" rx="4" className={on('dpadRight')} />
      {/* face */}
      <circle cx="488" cy="112" r="14" className={on('triangle')} />
      <circle cx="488" cy="172" r="14" className={on('cross')} />
      <circle cx="458" cy="142" r="14" className={on('square')} />
      <circle cx="518" cy="142" r="14" className={on('circle')} />
      {/* system */}
      <rect x="196" y="86" width="12" height="26" rx="4" className={on('create')} />
      <rect x="432" y="86" width="12" height="26" rx="4" className={on('options')} />
      <circle cx="320" cy="214" r="12" className={on('ps')} />
      <rect x="300" y="240" width="40" height="8" rx="4" className={on('mic')} />
      {/* sticks */}
      <circle cx="232" cy="230" r="34" className={on('l3')} />
      <circle cx="408" cy="230" r="34" className={on('r3')} />
    </svg>
  );
}
```

`pages.css` additions:

```css
.ds-art .btn {
  fill: rgba(255, 255, 255, 0.12);
  stroke: var(--card-border);
}
.ds-art .btn.on {
  fill: var(--accent);
}
.home {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 20px;
  height: 100%;
  align-items: start;
}
.status-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.chip {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--card-border);
}
.chip.ok {
  border-color: #22c55e;
  color: #22c55e;
}
.chip.bad {
  border-color: var(--accent);
  color: var(--accent);
}
.input-test {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.stick-row {
  display: flex;
  gap: 24px;
  justify-content: center;
}
.stick-circle {
  text-align: center;
}
.stick-label {
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}
.mono {
  font-family: var(--mono);
  font-size: 12px;
}
.trigger-bar {
  display: grid;
  grid-template-columns: 40px 1fr 48px;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}
.track {
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--accent);
}
.btn-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.btn-grid .cell {
  padding: 8px;
  text-align: center;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  font-size: 12px;
}
.btn-grid .cell.on {
  background: var(--accent);
  border-color: var(--accent);
}
```

- [ ] **Step 4: Home.tsx**

```tsx
import { Card } from '../components/Card';
import { DualSenseTop } from '../art/DualSenseTop';
import { useStore } from '../store';

export function Home() {
  const s = useStore((st) => st.snapshot);
  const p = useStore((st) => st.profile);
  const connected = s?.connected ?? false;
  return (
    <div className="home">
      <Card>
        <DualSenseTop
          pressed={s?.raw.buttons ?? {}}
          lightbar={p?.lights ?? { r: 0, g: 80, b: 255 }}
        />
        <h2 style={{ textAlign: 'center', margin: '8px 0 4px' }}>DualSense</h2>
        <p style={{ textAlign: 'center', color: 'var(--muted)', margin: 0 }}>
          {connected
            ? `Connected · USB · Battery ${s?.battery.percent ?? 0}% ${s?.battery.state === 'charging' ? '⚡' : ''}`
            : 'Select controller — plug in a DualSense over USB'}
        </p>
      </Card>
      <Card title="Status">
        <div className="status-row">
          <span className={`chip ${connected ? 'ok' : 'bad'}`}>
            Controller {connected ? 'detected' : 'not found'}
          </span>
          <span className={`chip ${s?.vigemReady ? 'ok' : 'bad'}`}>
            ViGEm {s?.vigemReady ? 'ready' : 'unavailable'}
          </span>
          <span className="chip">Report rate {Math.round(s?.reportHz ?? 0)} Hz</span>
          <span className="chip">Pipeline p99 {(s?.pipelineP99Ms ?? 0).toFixed(2)} ms</span>
        </div>
        {!s?.vigemReady && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Install the ViGEmBus driver to enable the virtual Xbox controller. Lights, triggers and
            live view still work without it.
          </p>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: InputTest.tsx**

```tsx
import { DS_BUTTONS } from '@dualforge/shared';
import { Card } from '../components/Card';
import { StickCircle } from '../components/StickCircle';
import { TriggerBar } from '../components/TriggerBar';
import { useStore } from '../store';

export function InputTest() {
  const s = useStore((st) => st.snapshot);
  const raw = s?.raw ?? {
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    l2: 0,
    r2: 0,
    buttons: {} as Record<string, boolean>,
    gyro: { x: 0, y: 0, z: 0 },
  };
  const out = s?.out ?? {
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    lt: 0,
    rt: 0,
    buttons: {} as Record<string, boolean>,
  };
  return (
    <div className="input-test">
      <Card title="Sticks (grey = raw, red = processed)">
        <div className="stick-row">
          <StickCircle label="Left" raw={{ x: raw.lx, y: raw.ly }} out={{ x: out.lx, y: out.ly }} />
          <StickCircle
            label="Right"
            raw={{ x: raw.rx, y: raw.ry }}
            out={{ x: out.rx, y: out.ry }}
          />
        </div>
      </Card>
      <Card title="Triggers">
        <TriggerBar label="L2 raw" value={raw.l2} />
        <TriggerBar label="LT out" value={out.lt} />
        <TriggerBar label="R2 raw" value={raw.r2} />
        <TriggerBar label="RT out" value={out.rt} />
        <div className="mono" style={{ marginTop: 12 }}>
          Gyro {raw.gyro.x} / {raw.gyro.y} / {raw.gyro.z}
        </div>
      </Card>
      <Card title="Buttons" className="span2">
        <div className="btn-grid">
          {DS_BUTTONS.map((b) => (
            <div key={b} className={`cell ${raw.buttons[b] ? 'on' : ''}`}>
              {b}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Virtual Xbox output" className="span2">
        <div className="btn-grid">
          {Object.entries(out.buttons).map(([b, v]) => (
            <div key={b} className={`cell ${v ? 'on' : ''}`}>
              {b}
            </div>
          ))}
        </div>
        <div className="mono" style={{ marginTop: 8 }}>
          Report rate {Math.round(s?.reportHz ?? 0)} Hz · p99 {(s?.pipelineP99Ms ?? 0).toFixed(2)}{' '}
          ms
        </div>
      </Card>
    </div>
  );
}
```

Add `.span2 { grid-column: 1 / -1; }` to `pages.css` and import `./styles/pages.css` in `App.tsx`.

- [ ] **Step 6: Verify without hardware** — `npm run dev`, then in DevTools: `await window.dualforge.replay('F:/DualForge/packages/engine/test/fixtures/stick-sweep.hidlog')`. Expected: Home shows “Connected”, DualSense art pulses cross, Input Test shows the left stick circling and L2 ramping. `npm run check` passes.

- [ ] **Step 7: Verify with hardware (when the user plugs in a DualSense)** — `await window.dualforge.useDevice()`; move sticks/press buttons → widgets follow; Report rate ≈ 1000 Hz. If ViGEmBus is installed (user's call), open Windows “Set up USB game controllers” → an Xbox 360 controller appears and follows input.

- [ ] **Step 8: Commit** `feat(renderer): Home and Input Test pages with live stick/trigger widgets and DualSense art`

---

### Task 15: Playwright Electron smoke test + `npm run check` includes it

**Files:**

- Create: `apps/desktop/e2e/smoke.spec.ts`, `apps/desktop/playwright.config.ts`
- Modify: root `package.json` scripts (`test:ui`, `check` runs `test:ui` after unit tests when `CI` is unset)

- [ ] **Step 1: Config + test**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 60_000, retries: 0 });
```

`e2e/smoke.spec.ts`:

```ts
import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('app launches, pages render, replay drives widgets', async () => {
  const app = await electron.launch({ args: [resolve(__dirname, '../out/main/index.js')] });
  const page = await app.firstWindow();
  await expect(page.getByText('DUAL')).toBeVisible();
  await expect(page.getByText(/Select controller|Connected/)).toBeVisible();
  await page.getByRole('button', { name: 'Input Test' }).click();
  await expect(page.getByText('Virtual Xbox output')).toBeVisible();
  await page.evaluate(
    (p) => window.dualforge.replay(p),
    resolve(__dirname, '../../../packages/engine/test/fixtures/stick-sweep.hidlog'),
  );
  await expect
    .poll(async () => page.locator('.cell.on').count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  await app.close();
});
```

- [ ] **Step 2: Scripts** — desktop: `"test:ui": "electron-vite build && playwright test"`; root: `"test:ui": "npm run test:ui -w @dualforge/desktop"`, `"check": "npm run typecheck && npm run lint && npm run test && npm run test:ui"`. Add `@playwright/test` dev dep.

- [ ] **Step 3: Run** `npm run check` → all green. **Step 4: Commit** `test(desktop): Playwright Electron smoke test with replay-driven widgets`

---

## Self-review

**Spec coverage (Plan 1 scope = Milestones 1–2):** §3.1 window/single-instance/EngineHost restart ✔ (T10, T12); ProfileStore persistence, DriverManager, GameWatcher, Health, Updater → Plans 3–4 (spec §3.1 remainder). §3.2 pipeline stages shaping/curve/filter-basic/triggers/mappings ✔ (T5–T8); gyro, macros, advanced filter, trigger effects → Plan 2/3. Output report rumble/lightbar/player LEDs ✔ (T4, T11), keepalive 250 ms ✔. 60 Hz snapshot ✔. Replay mode ✔ (T9, T11). §3.3 zod IPC ✔ (T2, T12). §4.1 tokens ✔ (T10). §4.3 pages 1 and 12 ✔ (T14); remaining pages later plans. §6 device unplug reconnect ✔ (device-source poll), HID error reopen ✔, ViGEm unavailable degrade ✔, engine crash backoff ✔, stable error codes ✔. §8 `npm run check`, replay fixtures, Playwright smoke ✔ (T1, T9, T15); coverage threshold → Plan 4.

**Placeholder scan:** none. **Type consistency:** `InputSource`/`PadSink` defined in `engine-loop.ts` and imported by sources/sink ✔; `OutputFrame`, `processReport`, `createPipelineState` names consistent across T8/T11 ✔; `EngineEvent`/`EngineCommand` consistent across T2/T11/T12/T13 ✔.
