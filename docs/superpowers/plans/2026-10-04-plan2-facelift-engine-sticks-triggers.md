# DualForge Plan 2 — Face-lift, Control Library, Engine Foundations, Sticks & Triggers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DualForge look like GameSir Connect, give the engine the foundations later pages need (compiled profiles, spec stage order, trigger effects, advanced filter, calibration, grace release), and ship the Sticks and Triggers pages fully wired to the live pipeline.

**Architecture:** Profile edits flow renderer → debounced `setProfile` → main → engine `compileProfile()` (LUTs, presorted curves) with pipeline state preserved. New UI is a small control library (sliders, segmented, toggle, curve editor) composed into pages. Visual work is specified against `docs/reference/gamesir-connect/ss1.png`, `ss2.png`, `ss4.png`, `ss5.png`.

**Tech Stack:** as Plan 1 (Electron 44, React 19, Zustand, zod, Vitest, Playwright). UI tasks additionally load the `frontend-design` skill.

**Spec:** `docs/superpowers/specs/2026-10-03-dualforge-design.md` (§3.2 pipeline, §4 UI, §6 errors). Plan 1 reviewer's deferred items referenced inline.

## Global Constraints

- All of Plan 1's Global Constraints still apply (pure stages, renderer isolation, zod at IPC boundaries, `E_` error codes, commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, no driver installs without an explicit yes in chat).
- Visual tokens (measured from the GameSir screenshots; replace Plan 1's gradient): body background `#0d0b10` with a radial maroon glow `radial-gradient(900px 600px at 12% 8%, #4a1f2c 0%, rgba(74,31,44,0) 60%)`; header bar `#171318` with 1px bottom border `rgba(255,255,255,0.06)`; card fill `rgba(255,255,255,0.045)` with 1px border `rgba(255,255,255,0.07)`, radius 16px; accent `#e2403f`; accent-hover `#ee5756`; focus/active-outline `#f08a3c`; link `#3b82f6`; text `#f2f0f3`; muted `#a39fa8`; slider track `rgba(255,255,255,0.12)`; slider fill `#e2403f`; slider handle 14px `#e2403f` with 3px dark ring `#1a1216`; toggle off `#3a3540`, on `#e2403f`; segmented button inactive `rgba(255,255,255,0.06)`, active `#e2403f`; sub-tab underline 2px `#e2403f`; footer A badge `#8fd14f`, B badge `#e2403f`; font Poppins 400/500/600 (bundle `Poppins-Regular/Medium/SemiBold.woff2` under `apps/desktop/src/renderer/fonts/`, OFL licensed, via `@font-face` — allowed by CSP `'self'`).
- Layout (1280×800 reference): header 100px; settings panel 440px wide, 16px margin, full body height, scrollable; controller render area fills the rest, render max-width 900px centered vertically; footer 56px.
- Debounce for live edits: 100 ms; every edit must be visible on the Input Test page / virtual pad without any "apply" button.
- Profile schema remains `schemaVersion: 1`; new fields get zod `.default()` so Plan 1 profiles still parse.

---

## File structure (created/modified by this plan)

```
vitest.config.ts                          root projects config (replaces vitest.workspace.ts)
packages/shared/src/profile.ts            schema extensions + refinements
packages/engine/src/compile.ts            compileProfile(), CompiledProfile, LUT_SIZE
packages/engine/src/stages/stick-curve.ts evaluateLut()
packages/engine/src/stages/stick-filter.ts advanced speed→strength curve
packages/engine/src/stages/calibration.ts computeCalibration(samples)
packages/engine/src/codec/trigger-effect.ts encodeTriggerEffect()
packages/engine/src/codec/build-output.ts trigger effect bytes + flags
packages/engine/src/pipeline.ts           spec stage order; takes CompiledProfile
apps/desktop/src/main/engine-loop.ts      compile on setProfile, keep state, grace release, perf
apps/desktop/src/renderer/styles/tokens.css, global.css, shell.css, controls.css, pages.css
apps/desktop/src/renderer/fonts/Poppins-*.woff2
apps/desktop/src/renderer/components/icons.tsx            inline SVG icon set
apps/desktop/src/renderer/components/controls/{RangeSlider,DualRangeSlider,Segmented,Toggle,SectionLabel,SubTabs,CurvePreview,CurveEditor,StickLive}.tsx
apps/desktop/src/renderer/art/DualSenseTop.tsx            detailed illustration
apps/desktop/src/renderer/store.ts                        updateProfile() with debounce
apps/desktop/src/renderer/pages/{Sticks,Triggers}.tsx
apps/desktop/src/renderer/components/CalibrationWizard.tsx
apps/desktop/src/renderer/components/{Header,TabStrip,Footer}.tsx  face-lift
apps/desktop/e2e/{smoke,pages}.spec.ts
```

---

### Task 1: Housekeeping from Plan 1 review (vitest projects, typecheck tests, hidlog hex length, dt clamp)

**Files:**
- Create: `vitest.config.ts` (root); Delete: `vitest.workspace.ts`
- Modify: `packages/shared/tsconfig.json`, `packages/engine/tsconfig.json` (include `test`), `packages/engine/src/replay/hidlog.ts`, `packages/engine/src/stages/stick-filter.ts`, `packages/engine/src/pipeline.ts`
- Test: `packages/engine/test/replay/hidlog.test.ts`

- [ ] **Step 1: Root vitest config**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
});
```
Delete `vitest.workspace.ts`. Run `npx vitest run` → no deprecation notice.

- [ ] **Step 2: Typecheck tests** — in both package tsconfigs set `"include": ["src", "test"]` and `"rootDir": "."`; keep `outDir: dist` (tests emit into `dist/test`, harmless; or add `"noEmit": true` only for the test files via a `tsconfig.test.json` — simplest: keep emit, add `dist/` to `.gitignore` already). Run `npm run typecheck`; fix any type errors surfaced in tests.

- [ ] **Step 3: hidlog hex length** — failing test:
```ts
it('rejects entries that are not 64 bytes', () => {
  expect(() => parseHidlog('{"t":0,"hex":"0102"}')).toThrow(/^E_HIDLOG_LINE: line 1$/);
});
```
Implement: after the regex check, `if (hex.length !== 128) throw new Error(\`E_HIDLOG_LINE: line ${lineNo}\`)`. Update the existing round-trip test to use 128-char hex (it already does for entry 1; fix entry 0 if needed).

- [ ] **Step 4: dt clamp** — export `const MIN_DT_MS = 0.01` from `stick-filter.ts`, use it in both `pipeline.ts` and `stick-filter.ts`.

- [ ] **Step 5: Run `npm run check`** → green. **Commit** `chore: vitest projects, typecheck tests, hidlog length check, shared dt clamp`

---

### Task 2: Profile schema extensions (filter advanced, trigger effects, refinements)

**Files:**
- Modify: `packages/shared/src/profile.ts`
- Test: `packages/shared/test/profile.test.ts`

**Interfaces:**
- Produces: `StickFilterSchema = { enabled, mode: 'basic'|'advanced', strength 0..100, curve: [speed 0..1, strength 0..100][5] }`; `TriggerEffectSchema` (below); `TriggerConfig.effect`; `MAX_CURVE_POINTS = 8`; refinements: `deadzone.center < 1 - deadzone.outer`, trigger `initial < max`, custom curve points non-decreasing in x.

- [ ] **Step 1: Failing tests**

```ts
it('fills new fields with defaults for a Plan 1 profile', () => {
  const p = defaultProfile('p', 'p') as unknown as Record<string, unknown>;
  const sticks = (p.sticks as { left: { filter: unknown } }).left;
  sticks.filter = { enabled: false, strength: 0 };        // old shape
  const triggers = (p.triggers as { left: Record<string, unknown> }).left;
  delete triggers.effect;
  const r = ProfileSchema.safeParse(p);
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.sticks.left.filter.mode).toBe('basic');
    expect(r.data.sticks.left.filter.curve).toHaveLength(5);
    expect(r.data.triggers.left.effect).toEqual({ mode: 'off' });
  }
});
it('rejects center deadzone overlapping outer', () => {
  const p = defaultProfile('p', 'p'); p.sticks.left.deadzone = { center: 0.6, anti: 0, outer: 0.5 };
  expect(ProfileSchema.safeParse(p).success).toBe(false);
});
it('rejects trigger initial >= max', () => {
  const p = defaultProfile('p', 'p'); p.triggers.right.deadzone = { initial: 0.9, max: 0.9 };
  expect(ProfileSchema.safeParse(p).success).toBe(false);
});
it('rejects non-monotone custom curve x', () => {
  const p = defaultProfile('p', 'p');
  p.sticks.left.curve = { kind: 'custom', points: [[0.2,0.1],[0.1,0.2],[0.3,0.3],[0.4,0.4],[0.5,0.5],[0.6,0.6],[0.8,0.8],[1,1]] };
  expect(ProfileSchema.safeParse(p).success).toBe(false);
});
it('accepts each trigger effect mode', () => {
  const p = defaultProfile('p', 'p');
  for (const e of [{ mode: 'resistance', start: 2, force: 6 }, { mode: 'section', start: 2, end: 6, force: 8 }, { mode: 'vibration', frequency: 20, force: 5 }] as const) {
    p.triggers.left.effect = e; expect(ProfileSchema.safeParse(p).success).toBe(true);
  }
});
```

- [ ] **Step 2: Implement**

```ts
const pct = z.number().min(0).max(100);
export const StickFilterSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['basic', 'advanced']).default('basic'),
  strength: pct,
  curve: z.array(z.tuple([unit, pct])).length(5).default([[0, 0], [0.1, 0], [0.25, 0], [0.5, 0], [1, 0]]),
});

export const TriggerEffectSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('off') }),
  z.object({ mode: z.literal('resistance'), start: z.number().int().min(0).max(9), force: z.number().int().min(0).max(8) }),
  z.object({ mode: z.literal('section'), start: z.number().int().min(0).max(9), end: z.number().int().min(0).max(9), force: z.number().int().min(0).max(8) }),
  z.object({ mode: z.literal('vibration'), frequency: z.number().int().min(1).max(255), force: z.number().int().min(0).max(8) }),
]);
export type TriggerEffect = z.infer<typeof TriggerEffectSchema>;

// in TriggerConfigSchema add:
//   effect: TriggerEffectSchema.default({ mode: 'off' }),
// and wrap it: .refine((t) => t.deadzone.initial < t.deadzone.max, { message: 'trigger initial must be < max' })

// StickConfigSchema: .refine((s) => s.deadzone.center < 1 - s.deadzone.outer, { message: 'center deadzone overlaps outer' })
//   .refine((s) => s.curve.kind === 'preset' || s.curve.points.every((p, i, a) => i === 0 || p[0] >= a[i - 1]![0]), { message: 'curve x must be non-decreasing' })
```
Update `defaultStick()` → `filter: { enabled: false, mode: 'basic', strength: 0, curve: [[0,0],[0.1,0],[0.25,0],[0.5,0],[1,0]] }` and `defaultTrigger()` → add `effect: { mode: 'off' }`. Note: `z.object().refine()` returns `ZodEffects`; keep the exported *input* types via `z.input<>` where the renderer builds objects. Export `type StickConfigInput = z.input<typeof StickConfigSchema>`.

- [ ] **Step 3: Run `npm run check`** (engine tests may need `filter.mode`/`curve` in hand-built configs — they use `defaultProfile`, so should pass). **Commit** `feat(shared): advanced filter, trigger effects, cross-field profile refinements`

---

### Task 3: Compiled profile, LUT curves, spec stage order

**Files:**
- Create: `packages/engine/src/compile.ts`
- Modify: `packages/engine/src/stages/stick-curve.ts` (add `buildCurveLut`, `evaluateLut`), `packages/engine/src/stages/triggers.ts` (take a LUT), `packages/engine/src/pipeline.ts` (take `CompiledProfile`, spec order), `packages/engine/src/index.ts`
- Test: `packages/engine/test/compile.test.ts`, update `pipeline.test.ts`, `replay/integration.test.ts`, `stages/triggers.test.ts`

**Interfaces:**
- Produces: `LUT_SIZE = 1024`; `buildCurveLut(points: CurvePoint[]): Float32Array` (length LUT_SIZE+1, index = round(input*LUT_SIZE)); `evaluateLut(lut, v): number` (linear interp between entries); `interface CompiledStick { cfg: StickConfig; lut: Float32Array }`, `interface CompiledTrigger { cfg: TriggerConfig; lut: Float32Array }`, `interface CompiledProfile { profile: Profile; left: CompiledStick; right: CompiledStick; lt: CompiledTrigger; rt: CompiledTrigger }`; `compileProfile(p: Profile): CompiledProfile`; `processReport(raw, compiled: CompiledProfile, state, nowMs)`; `applyTrigger(v, cfg, lut, state)`.
- Stage order in `processReport` (spec §3.2): sticks (shape → curve → filter) → triggers → **mappings last**; mapping writes buttons onto the same `xinput` object after axes are set (so Plan 3 button→axis targets can override).

- [ ] **Step 1: Failing tests** (`compile.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@dualforge/shared';
import { compileProfile, LUT_SIZE } from '../src/compile.js';
import { evaluateCurve, evaluateLut, presetPoints } from '../src/stages/stick-curve.js';

describe('compileProfile', () => {
  it('builds LUTs matching evaluateCurve within 1/255 for every preset', () => {
    for (const preset of ['linear', 'aggressive', 'precise', 'scurve'] as const) {
      const p = defaultProfile('p', 'p'); p.sticks.left.curve = { kind: 'preset', preset };
      const c = compileProfile(p);
      expect(c.left.lut.length).toBe(LUT_SIZE + 1);
      for (let i = 0; i <= 100; i++) {
        const v = i / 100;
        expect(Math.abs(evaluateLut(c.left.lut, v) - evaluateCurve(presetPoints(preset), v))).toBeLessThan(1 / 255);
      }
    }
  });
  it('custom curve LUT holds past the last point', () => {
    const p = defaultProfile('p', 'p');
    p.sticks.right.curve = { kind: 'custom', points: [[0.1,0.1],[0.2,0.2],[0.3,0.3],[0.4,0.4],[0.5,0.9],[0.5,0.9],[0.5,0.9],[0.5,0.9]] };
    expect(evaluateLut(compileProfile(p).right.lut, 0.95)).toBeCloseTo(0.9, 3);
  });
  it('trigger LUT follows trigger curve preset', () => {
    const p = defaultProfile('p', 'p'); p.triggers.left.curve = 'precise';
    expect(evaluateLut(compileProfile(p).lt.lut, 0.5)).toBeLessThan(0.5);
  });
});
```
Pipeline test additions (`pipeline.test.ts`): change all `processReport(raw, p, …)` to `processReport(raw, compileProfile(p), …)`; add:
```ts
it('runs mappings after axes so a later axis target can override (order guard)', () => {
  // With default mappings nothing overrides; assert axes survive mapping stage.
  const p = compileProfile(defaultProfile('p', 'p'));
  const o = processReport(parseDualSenseUsb(report((b) => { b[1] = 255; b[9] = 0x01; })), p, createPipelineState(), 0);
  expect(o.xinput.lx).toBeCloseTo(1, 2); expect(o.xinput.buttons.LB).toBe(true);
});
```
Update `integration.test.ts` and `triggers.test.ts` (`applyTrigger(v, cfg, buildCurveLut(presetPoints(cfg.curve)), state)`).

- [ ] **Step 2: Implement**

`stick-curve.ts` additions:
```ts
export const LUT_SIZE = 1024;
export function buildCurveLut(points: readonly CurvePoint[]): Float32Array {
  const lut = new Float32Array(LUT_SIZE + 1);
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i <= LUT_SIZE; i++) lut[i] = evaluateCurve(sorted, i / LUT_SIZE);
  return lut;
}
export function evaluateLut(lut: Float32Array, v: number): number {
  const x = Math.max(0, Math.min(1, v)) * LUT_SIZE;
  const i = Math.floor(x); const f = x - i;
  const a = lut[i] ?? 0; const b = lut[Math.min(LUT_SIZE, i + 1)] ?? a;
  return a + (b - a) * f;
}
export function applyStickLut(x: number, y: number, lut: Float32Array): { x: number; y: number } {
  const mag = Math.hypot(x, y); if (mag === 0) return { x: 0, y: 0 };
  const out = evaluateLut(lut, Math.min(1, mag));
  return { x: (x / mag) * out, y: (y / mag) * out };
}
```
`compile.ts`:
```ts
import type { Profile, StickConfig, TriggerConfig } from '@dualforge/shared';
import { buildCurveLut, presetPoints, LUT_SIZE } from './stages/stick-curve.js';
export { LUT_SIZE };
export interface CompiledStick { cfg: StickConfig; lut: Float32Array }
export interface CompiledTrigger { cfg: TriggerConfig; lut: Float32Array }
export interface CompiledProfile { profile: Profile; left: CompiledStick; right: CompiledStick; lt: CompiledTrigger; rt: CompiledTrigger }
const stick = (cfg: StickConfig): CompiledStick => ({ cfg, lut: buildCurveLut(cfg.curve.kind === 'preset' ? presetPoints(cfg.curve.preset) : cfg.curve.points) });
const trig = (cfg: TriggerConfig): CompiledTrigger => ({ cfg, lut: buildCurveLut(presetPoints(cfg.curve)) });
export function compileProfile(profile: Profile): CompiledProfile {
  return { profile, left: stick(profile.sticks.left), right: stick(profile.sticks.right), lt: trig(profile.triggers.left), rt: trig(profile.triggers.right) };
}
```
`triggers.ts`: signature `applyTrigger(v, cfg, lut, s)`; replace `evaluateCurve(presetPoints(cfg.curve), t)` with `evaluateLut(lut, t)`.
`pipeline.ts`:
```ts
export function processReport(raw: RawState, cp: CompiledProfile, s: PipelineState, nowMs: number): OutputFrame {
  const dt = s.lastMs < 0 ? 1 : Math.max(MIN_DT_MS, nowMs - s.lastMs); s.lastMs = nowMs;
  const L = cp.left, R = cp.right;
  let l = applyStickShaping(raw.lx, raw.ly, L.cfg); l = applyStickLut(l.x, l.y, L.lut); l = applyStickFilter(l.x, l.y, L.cfg.filter, s.filterL, dt);
  let r = applyStickShaping(raw.rx, raw.ry, R.cfg); r = applyStickLut(r.x, r.y, R.lut); r = applyStickFilter(r.x, r.y, R.cfg.filter, s.filterR, dt);
  const lt = applyTrigger(raw.l2, cp.lt.cfg, cp.lt.lut, s.trigL);
  const rt = applyTrigger(raw.r2, cp.rt.cfg, cp.rt.lut, s.trigR);
  const frame = applyMappings(raw, cp.profile, s.mapping, nowMs);   // last: may override axes in Plan 3
  frame.xinput.lx = l.x; frame.xinput.ly = l.y; frame.xinput.rx = r.x; frame.xinput.ry = r.y;
  frame.xinput.lt = lt; frame.xinput.rt = rt;
  return frame;
}
```
(Plan 3 will have `applyMappings` accept a pre-filled `xinput`; for now assigning after is equivalent and keeps the order guard test honest — add a one-line comment.)
Export `compile.js` from `index.ts`.

- [ ] **Step 3: `npm run check`** → green (desktop engine-loop will fail to compile until Task 6 — do Task 6's `compileProfile` call now as a minimal edit: in `engine-loop.ts` keep a `compiled` variable set in `setProfile` and pass it to `processReport`). **Commit** `feat(engine): compiled profiles with curve LUTs and spec stage order`

---

### Task 4: Advanced stick filter (speed→strength) and calibration helper

**Files:**
- Modify: `packages/engine/src/stages/stick-filter.ts`
- Create: `packages/engine/src/stages/calibration.ts`
- Test: `packages/engine/test/stages/stick-filter.test.ts`, `packages/engine/test/stages/calibration.test.ts`

**Interfaces:**
- `applyStickFilter(x, y, cfg: StickConfig['filter'], s: FilterState, dtMs)` — in `advanced` mode the effective strength is `interpolate(cfg.curve, speed)` where `speed = hypot(dx,dy)/dt * 1000` normalized so 1.0 = full deflection per 100 ms (i.e. `speedNorm = min(1, hypot(x - s.x, y - s.y) / dtMs * 100)`).
- `computeCalibration(samples: {x,y}[]): { cx, cy, radius }` — center = mean of the first `centerCount` samples flagged by the caller via a separate call: expose two helpers: `computeCenter(samples)` (mean) and `computeRadius(samples, center)` (95th percentile of magnitudes from center, clamped 0.5..1.5).

- [ ] **Step 1: Failing tests**

stick-filter additions:
```ts
it('advanced mode uses curve strength by speed: slow moves heavily smoothed, fast moves pass', () => {
  const cfg = { enabled: true, mode: 'advanced' as const, strength: 0, curve: [[0, 100], [0.1, 100], [0.25, 0], [0.5, 0], [1, 0]] as [number, number][] };
  const slow = createFilterState(); applyStickFilter(0, 0, cfg, slow, 1);
  const vSlow = applyStickFilter(0.01, 0, cfg, slow, 1).x;          // speed 0.01/1ms*100=1.0 → hmm fast; use dt=100
  const s2 = createFilterState(); applyStickFilter(0, 0, cfg, s2, 100);
  const vSlow2 = applyStickFilter(0.01, 0, cfg, s2, 100).x;         // speedNorm 0.01 → strength 100 → heavy smoothing
  const s3 = createFilterState(); applyStickFilter(0, 0, cfg, s3, 100);
  const vFast = applyStickFilter(1, 0, cfg, s3, 100).x;             // speedNorm 1 → strength 0 → pass-through
  expect(vSlow2).toBeLessThan(0.01); expect(vFast).toBe(1); void vSlow;
});
```
(Clean that test up: keep `vSlow2`/`vFast` only.)
calibration:
```ts
import { describe, expect, it } from 'vitest';
import { computeCenter, computeRadius } from '../../src/stages/calibration.js';
describe('calibration', () => {
  it('center is the mean', () => expect(computeCenter([{ x: 0.1, y: -0.1 }, { x: 0.3, y: 0.1 }])).toEqual({ cx: 0.2, cy: 0 }));
  it('radius is the 95th percentile magnitude from center, clamped', () => {
    const pts = Array.from({ length: 100 }, (_, i) => { const a = (i / 100) * Math.PI * 2; return { x: 0.9 * Math.cos(a), y: 0.9 * Math.sin(a) }; });
    pts.push({ x: 2, y: 2 }); // outlier
    expect(computeRadius(pts, { cx: 0, cy: 0 })).toBeCloseTo(0.9, 2);
    expect(computeRadius([{ x: 0.1, y: 0 }], { cx: 0, cy: 0 })).toBe(0.5);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// stick-filter.ts
export const MIN_DT_MS = 0.01;
function curveStrength(curve: readonly [number, number][], speed: number): number {
  const pts = [...curve].sort((a, b) => a[0] - b[0]);
  let [px, py] = pts[0] ?? [0, 0];
  if (speed <= px) return py;
  for (const [x, y] of pts) { if (speed <= x) return x === px ? y : py + ((speed - px) / (x - px)) * (y - py); px = x; py = y; }
  return py;
}
export function applyStickFilter(x, y, cfg, s, dtMs) {
  if (!cfg.enabled) { s.x = x; s.y = y; s.init = true; return { x, y }; }
  if (!s.init) { s.x = x; s.y = y; s.init = true; return { x, y }; }
  const dt = Math.max(MIN_DT_MS, dtMs);
  let strength = cfg.strength;
  if (cfg.mode === 'advanced') { const speedNorm = Math.min(1, (Math.hypot(x - s.x, y - s.y) / dt) * 100); strength = curveStrength(cfg.curve, speedNorm); }
  if (strength <= 0) { s.x = x; s.y = y; return { x, y }; }
  const tau = (strength / 100) * MAX_TAU_MS; const alpha = 1 - Math.exp(-dt / tau);
  s.x += alpha * (x - s.x); s.y += alpha * (y - s.y); return { x: s.x, y: s.y };
}
// calibration.ts
export function computeCenter(samples: readonly { x: number; y: number }[]): { cx: number; cy: number } {
  if (samples.length === 0) return { cx: 0, cy: 0 };
  const sx = samples.reduce((a, p) => a + p.x, 0), sy = samples.reduce((a, p) => a + p.y, 0);
  return { cx: sx / samples.length, cy: sy / samples.length };
}
export function computeRadius(samples: readonly { x: number; y: number }[], c: { cx: number; cy: number }): number {
  if (samples.length === 0) return 1;
  const m = samples.map((p) => Math.hypot(p.x - c.cx, p.y - c.cy)).sort((a, b) => a - b);
  const r = m[Math.min(m.length - 1, Math.floor(m.length * 0.95))] ?? 1;
  return Math.max(0.5, Math.min(1.5, r));
}
```
Export from `index.ts`. Note: with curve y=100 at low speed, the existing basic-mode tests remain valid (mode 'basic' ignores curve).

- [ ] **Step 3: `npm run check`** → green. **Commit** `feat(engine): speed-adaptive stick filter and calibration helpers`

---

### Task 5: Adaptive trigger effects in the output report

**Files:**
- Create: `packages/engine/src/codec/trigger-effect.ts`
- Modify: `packages/engine/src/codec/build-output.ts` (`Feedback.triggers`), `packages/engine/src/index.ts`
- Test: `packages/engine/test/codec/trigger-effect.test.ts`, `build-output.test.ts`

**Interfaces:**
- `encodeTriggerEffect(e: TriggerEffect): Uint8Array` (11 bytes: mode + 10 params). Modes (DualSense simple effects): off → `0x05` all zero; resistance → mode `0x01`, p0 = start (0–9), p1 = force (0–8); section → mode `0x02`, p0 = start, p1 = end, p2 = force; vibration → mode `0x06`, p0 = frequency, p1 = force, p2 = 0.
- `Feedback.triggers: { left: TriggerEffect; right: TriggerEffect }` (optional; default off). Output: right block at bytes 11..21, left at 22..32; set flag0 bits `0x04` (right) and `0x08` (left) when the respective effect is not `off` **or** when clearing a previously set effect (always set both bits — simpler and matches DS4Windows behavior).

- [ ] **Step 1: Failing tests**
```ts
describe('encodeTriggerEffect', () => {
  it('off', () => expect([...encodeTriggerEffect({ mode: 'off' })]).toEqual([0x05, 0,0,0,0,0,0,0,0,0,0]));
  it('resistance', () => expect([...encodeTriggerEffect({ mode: 'resistance', start: 3, force: 7 })].slice(0, 3)).toEqual([0x01, 3, 7]));
  it('section', () => expect([...encodeTriggerEffect({ mode: 'section', start: 2, end: 6, force: 8 })].slice(0, 4)).toEqual([0x02, 2, 6, 8]));
  it('vibration', () => expect([...encodeTriggerEffect({ mode: 'vibration', frequency: 30, force: 4 })].slice(0, 3)).toEqual([0x06, 30, 4]));
});
// build-output.test.ts additions
it('writes trigger effects into right (11..21) and left (22..32) blocks and sets flag0 bits', () => {
  const r = buildOutputReport({ ...fb, triggers: { left: { mode: 'resistance', start: 1, force: 2 }, right: { mode: 'section', start: 3, end: 4, force: 5 } } });
  expect([r[11], r[12], r[13], r[14]]).toEqual([0x02, 3, 4, 5]);
  expect([r[22], r[23], r[24]]).toEqual([0x01, 1, 2]);
  expect(r[1] & 0x0c).toBe(0x0c);
});
it('defaults triggers to off', () => { const r = buildOutputReport(fb); expect(r[11]).toBe(0x05); expect(r[22]).toBe(0x05); });
```
- [ ] **Step 2: Implement** per the interface; `Feedback.triggers?: {...}`; in `buildOutputReport`: `r[1] |= 0x0c; r.set(encodeTriggerEffect(t.right), 11); r.set(encodeTriggerEffect(t.left), 22);`.
- [ ] **Step 3: `npm run check`** → green. **Commit** `feat(engine): DualSense adaptive trigger effects in output report`

---

### Task 6: Engine loop — compile on setProfile with state preserved, 2 s grace release, perf pass, trigger effects wired

**Files:**
- Modify: `apps/desktop/src/main/engine-loop.ts`
- Test: `apps/desktop/test/engine-loop.test.ts`

**Interfaces:**
- `setProfile(p)` → `compiled = compileProfile(p)`; does **not** reset `state` (only `lastMs` untouched); forces one output write (lights/triggers may have changed).
- `feedback()` includes `triggers: { left: profile.triggers.left.effect, right: profile.triggers.right.effect }`.
- Grace release: on `onStatus(false)` start `graceTimer = setTimeout(() => { sink.disconnect(); }, 2000)`; on `onStatus(true)` clear it and, if `!sink.ready`, `await sink.connect()` (errors → `E_VIGEM_INIT` emitted once). Export `GRACE_MS = 2000`.
- Perf: latencies in a `Float64Array(1024)` ring with index; p99 computed from a copy only at snapshot time (60 Hz is fine) — remove `shift()`; output change detection compares bytes against `lastOut: Uint8Array` with a loop (no hex string); `emptyButtons()`/`emptyXInput()` replaced in the hot path by reusing one `XInputState` object inside `applyMappings`? — No: keep allocation there (Plan 3 refactor); only the loop-level changes above.

- [ ] **Step 1: Failing tests**
```ts
it('setProfile preserves filter state (no jump)', async () => { /* start with filter enabled strength 100 via profile A; feed a step to 1.0 for 20 reports; call setProfile(B same but lights changed); feed one more report; assert out.lx continues from previous smoothed value (>0.5) rather than restarting (<0.1) */ });
it('releases the virtual pad 2 s after disconnect and reconnects on re-plug', async () => { /* fake sink with connect/disconnect spies; onStatus(false); advance 1999 → not disconnected; advance 1 → disconnected; onStatus(true) → connect called */ });
it('includes trigger effects in the output report', async () => { /* profile with lt effect resistance start 1 force 2 → next write bytes 22..24 = 0x01,1,2 */ });
it('output change detection does not write when nothing changed before keepalive', …) // existing keepalive test still holds
```
Write these fully (the fake source/sink pattern from Plan 1 tests), run → fail.

- [ ] **Step 2: Implement** per interface. Keep `neutralize()` from Plan 1 but make it NOT reset pipeline state on `setProfile` (only on disconnect/swap).
- [ ] **Step 3: `npm run check`** → green (Playwright included). **Commit** `feat(desktop): compiled profiles with preserved state, 2 s grace release, trigger effects, hot-path allocations`

---

### Task 7: Face-lift — tokens, fonts, header with icon tab strip, footer badges

**Load the `frontend-design` skill before starting.** Open `docs/reference/gamesir-connect/ss1.png`, `ss2.png`, `ss4.png`, `ss5.png` and match them.

**Files:**
- Modify: `styles/tokens.css`, `styles/global.css`, `styles/shell.css`, `components/Header.tsx`, `components/TabStrip.tsx`, `components/Footer.tsx`
- Create: `components/icons.tsx`, `fonts/Poppins-{Regular,Medium,SemiBold}.woff2` (download from Google Fonts' GitHub `google/fonts` repo, OFL; commit the files and the `OFL.txt`)
- Test: `apps/desktop/e2e/smoke.spec.ts` additions (computed-style assertions)

**Requirements (from the screenshots):**
- Header: 100px, background `#171318`, bottom border. Left: a 44px round logo badge (accent circle with a white "D" glyph) + wordmark "DUALFORGE" (600, 18px, letter-spacing 1px) with a small accent-filled tag "CONFIG" (10px, uppercase) under/next to it like "CONNECT".
- Center tab strip: `LB` pill, then tabs **Home · Sticks · Triggers · Motion · Vibrations · Lights · Input Test** each as an icon (24px inline SVG from `icons.tsx`: home, sticks (two columns), triggers (two bars), motion (cube), vibrations (gamepad with waves), lights (bulb), inputTest (flask)) over a 13px label; the active tab has a lighter panel background `rgba(255,255,255,0.06)` spanning the tab and a 3px `#e2403f`... **no — orange** `#f08a3c` underline bar 40px wide centered at the bottom; then `RB` pill. Tabs for pages that don't exist yet (Motion, Vibrations, Lights) render a "Coming in Plan 3" card.
- Right icon buttons (32×32, rounded 8px, `rgba(255,255,255,0.06)`): Reset (↺ icon, disabled tooltip "Plan 3"), Input Test (flask → navigates), Home (house), then window controls (– ▢ ✕) as plain 46×32 hit areas like Windows.
- Footer: 56px, dark; "✚ Direction Control" with a 4-way glyph, "A Confirm" with a green circular badge containing "A", "B Back" with a red badge; right side: version text `V0.1.0` (from `package.json` via `import.meta.env` or a constant) in muted 12px.
- Body background per Global Constraints (radial glow, not a linear gradient).
- Keyboard: `focus-visible` outline `#f08a3c` on all interactive elements. Tabs have `role="tab"`, `aria-selected`; pills `aria-hidden`.

- [ ] **Step 1: e2e assertions (failing first)** in `smoke.spec.ts`:
```ts
test('face-lift tokens applied', async () => {
  const app = await electron.launch({ args: [resolve(import.meta.dirname, '../out/main/index.js')] });
  const page = await app.firstWindow();
  const header = page.locator('header.header');
  expect(await header.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 19, 24)');
  expect(await header.evaluate((e) => getComputedStyle(e).height)).toBe('100px');
  const active = page.locator('[role="tab"][aria-selected="true"]');
  await expect(active).toHaveCount(1);
  expect(await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Poppins/);
  await expect(page.locator('.footer .badge-a')).toHaveText('A');
  await app.close();
});
```
- [ ] **Step 2: Implement** per requirements. Keep `Shell.tsx` structure; move version into a `VERSION` export in `shared/src/index.ts` (bump `SHARED_VERSION` naming: add `export const APP_VERSION = '0.1.0'`).
- [ ] **Step 3: Visual check:** run `npm run dev`, take a screenshot via Playwright (`page.screenshot({ path: '.superpowers/screens/shell.png' })` in a throwaway script or the e2e with `--update-snapshots` disabled) and compare side by side with `ss4.png`. Iterate until header, tab strip, footer and background read as the same design language. Describe the differences you accepted in the report.
- [ ] **Step 4: `npm run check`** → green. **Commit** `feat(renderer): GameSir-style face-lift — tokens, Poppins, icon tab strip, footer badges`

---

### Task 8: Detailed DualSense illustration with live lightbar glow

**Load the `frontend-design` skill.** Reference: GameSir renders a flat, grey, top-down pad with the RGB strip glowing in live color (ss1/ss2). We draw a DualSense.

**Files:**
- Modify: `art/DualSenseTop.tsx`, `styles/pages.css`
- Test: `apps/desktop/test/renderer/DualSenseTop.test.tsx`

**Requirements:**
- SVG viewBox `0 0 1000 640`, built from layered paths: body (grips, central section) in `#6b6770` with a darker inner panel `#4a4650`; touchpad `#3a3640` rounded rect; **lightbar** = two thin vertical bars flanking the touchpad plus a soft `feGaussianBlur` glow (`<filter>`) tinted by `lightbar` prop; face buttons with PlayStation glyph colors when pressed (△ green `#2fbf71`, ○ red `#ff5a5a`, ✕ blue `#4a90ff`, □ pink `#ff6fb0`) and grey `#8a8690` outlines when not; D-pad cross; two stick wells with a stick cap that **translates by (lx*18, -ly*18)** using new optional props `sticks?: { lx, ly, rx, ry }`; L1/R1 bumpers; L2/R2 triggers behind the top edge; Create/Options slots; PS button; mic button; player LEDs row (5 dots under the touchpad, lit per `playerLeds` bitmask prop).
- Pressed state = fill accent with 0.9 opacity; keep `className="btn on"` contract for tests.
- Max rendered width 900px; keep aspect ratio.

- [ ] **Step 1: Failing test**
```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DualSenseTop } from '../../src/renderer/art/DualSenseTop';
describe('DualSenseTop', () => {
  it('highlights pressed buttons and tints the lightbar', () => {
    const { container } = render(<DualSenseTop pressed={{ cross: true }} lightbar={{ r: 1, g: 2, b: 3 }} playerLeds={0b00100} />);
    expect(container.querySelector('[data-btn="cross"]')!.classList.contains('on')).toBe(true);
    expect(container.querySelector('[data-btn="circle"]')!.classList.contains('on')).toBe(false);
    expect(container.querySelector('[data-lightbar]')!.getAttribute('fill')).toBe('rgb(1,2,3)');
    expect(container.querySelectorAll('[data-led].on').length).toBe(1);
  });
  it('moves stick caps with stick values', () => {
    const { container } = render(<DualSenseTop pressed={{}} lightbar={{ r: 0, g: 0, b: 0 }} sticks={{ lx: 1, ly: 0, rx: 0, ry: 1 }} />);
    expect(container.querySelector('[data-stick="left"]')!.getAttribute('transform')).toBe('translate(18 0)');
    expect(container.querySelector('[data-stick="right"]')!.getAttribute('transform')).toBe('translate(0 -18)');
  });
});
```
- [ ] **Step 2: Implement**; Home passes `sticks` from `snapshot.raw` and `playerLeds` from profile.
- [ ] **Step 3: Visual check** as in Task 7 against ss4 (Home). **`npm run check`** → green. **Commit** `feat(renderer): detailed DualSense illustration with live lightbar, sticks and LEDs`

---

### Task 9: Control library

**Load the `frontend-design` skill.** Match the GameSir controls in ss1/ss5: red track fill from left, 14px red handle with dark ring, dual-handle slider with "Initial / Max" captions above the ends, segmented buttons (pill-ish 8px radius, active solid red), iOS toggle (red when on), section label with 3px red bar, sub-tabs "LT · Left · Right · RT" with underline, square curve preview with diagonal.

**Files:**
- Create: `components/controls/RangeSlider.tsx`, `DualRangeSlider.tsx`, `Segmented.tsx`, `Toggle.tsx`, `SectionLabel.tsx`, `SubTabs.tsx`, `CurvePreview.tsx`, `CurveEditor.tsx`, `StickLive.tsx`, `styles/controls.css`
- Test: `apps/desktop/test/renderer/controls.test.tsx`

**Interfaces (props):**
- `RangeSlider { value: number; min?: 0; max?: 1; step?: number; onChange(v): void; format?(v): string; label?: string }` — renders `<input type="range">` styled + numeric readout.
- `DualRangeSlider { lo: number; hi: number; min?: 0; max?: 1; minGap?: 0.01; onChange(lo, hi): void; captions?: [string, string] }` — two overlapped range inputs; enforces `lo + minGap <= hi`.
- `Segmented<T extends string> { options: { value: T; label: string }[]; value: T; onChange(v: T): void }` — `role="radiogroup"`, buttons `role="radio"` `aria-checked`.
- `Toggle { checked: boolean; onChange(v): void; label?: string }` — `role="switch"`.
- `SectionLabel { children }`.
- `SubTabs<T> { tabs: { value: T; label: string }[]; value: T; onChange(v: T): void; pills?: [string, string] }` (pills e.g. `['LT','RT']`).
- `CurvePreview { points: [number, number][]; size?: 120 }` — square with grid and polyline.
- `CurveEditor { points: [number, number][]; onChange(points): void; size?: 280 }` — 8 draggable handles (pointer events, clamp 0..1, x non-decreasing enforced by clamping between neighbors), numeric inputs for each point (0–100 integers), dashed linear reference. Dispatches `onChange` on every move (page debounces).
- `StickLive { raw: {x,y}; out: {x,y}; deadzone: { center; outer }; size?: 160 }` — Plan 1's StickCircle plus deadzone rings (inner circle at `center*R`, outer ring at `(1-outer)*R`). Replace usages of `StickCircle` and delete it.

- [ ] **Step 1: Failing tests** (jsdom + testing-library):
```tsx
it('DualRangeSlider enforces min gap', () => { /* render with lo .5 hi .6 minGap .2; fire change on lo input to .55 → onChange called with (0.4, 0.6) */ });
it('Segmented sets aria-checked and calls onChange', …);
it('Toggle has role switch and toggles', …);
it('CurveEditor clamps dragged point x between neighbours', () => { /* simulate pointerdown on handle 3, pointermove to x beyond handle 4 → onChange points[3][0] === points[4][0] */ });
it('StickLive draws deadzone rings at scaled radii', () => { /* center .1 outer .2 → inner r = 7, outer r = 56 (R=70) */ });
```
Write them concretely against your implementations' DOM (use `data-testid`s).
- [ ] **Step 2: Implement** all controls + `controls.css`. Keep each component under ~120 lines; `CurveEditor` may reach ~180.
- [ ] **Step 3: `npm run check`** → green. **Commit** `feat(renderer): control library (sliders, segmented, toggle, sub-tabs, curve editor, live stick)`

---

### Task 10: Store — profile editing with debounced live apply

**Files:**
- Modify: `apps/desktop/src/renderer/store.ts`
- Test: `apps/desktop/test/renderer/store.test.ts`

**Interfaces:**
- `updateProfile(mutate: (draft: Profile) => void): void` — structured-clones the current profile, applies `mutate`, validates with `ProfileSchema.safeParse`; on failure sets `lastError = { code: 'E_PROFILE_INVALID', msg }` and does not apply; on success sets `profile` immediately (UI responsive) and schedules `window.dualforge.setProfile(profile)` with a 100 ms trailing debounce (`DEBOUNCE_MS` exported). `flushProfile()` sends immediately (used by the calibration wizard's final step).
- `subTab: Record<'sticks'|'triggers', 'left'|'right'>` with `setSubTab(page, side)`.

- [ ] **Step 1: Failing tests** with `vi.useFakeTimers()` and a stubbed `window.dualforge` (`vi.stubGlobal`): two rapid `updateProfile` calls → `setProfile` called once after 100 ms with the latest profile; invalid mutation → not applied, `lastError.code === 'E_PROFILE_INVALID'`; `flushProfile()` sends immediately.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(renderer): debounced live profile editing in store`

---

### Task 11: Sticks page

**Load the `frontend-design` skill.** Layout per ss1: left settings panel (440px) + right render area showing the DualSense with a `StickLive` widget for the selected side and a `CurvePreview` top-left like GameSir's square.

**Files:**
- Create: `pages/Sticks.tsx`; Modify: `App.tsx` routing, `TabStrip.tsx` page list, `pages.css`
- Test: `apps/desktop/e2e/pages.spec.ts` (new), `apps/desktop/test/renderer/Sticks.test.tsx`

**Requirements (panel, top to bottom):**
1. `SubTabs` `LT · Left · Right · RT` → `subTab.sticks` (LT/RT pills are decorative gamepad hints; LT/RT keys switch when the window is focused — implement via a `useGamepadNav` hook stub that listens to `snapshot.out.lt/rt` edge > 0.5 while `document.hasFocus()`; keep it tiny).
2. `SectionLabel` "Deadzone" → `DualRangeSlider` captions `Initial`/`Max` mapped to `deadzone.center` (lo) and `1 - deadzone.outer` (hi).
3. "Anti-Deadzone" → `RangeSlider` 0..0.5 → `deadzone.anti`.
4. "Curve Adjustment" → `Segmented` presets `Linear · Aggressive · Precise · S-Curve · Custom`; when Custom: `CurveEditor` bound to `curve.points` (switching to Custom seeds points from the previous preset via `presetPoints` from `@dualforge/engine` — allowed import: engine is pure; add `@dualforge/engine` to renderer deps and verify no node imports leak via a `test/renderer/engine-import.test.ts` that imports the renderer bundle entry... simpler: import only `presetPoints` from `@dualforge/engine/curve` by adding a subpath export `./curve` → `src/stages/stick-curve.ts`).
5. "Stick Trajectory" → `Segmented` `Raw · Circle` → `circular`.
6. "Invert X" / "Invert Y" toggles.
7. "Center Offset" → two small `RangeSlider`s −0.1..0.1 step 0.005 for `calibration.cx/cy` + a `Calibrate…` button opening the wizard (Task 12).
8. "Smoothing (RC)" → `Toggle` enabled; `Segmented` `Basic · Advanced`; Basic: `RangeSlider` 0..100 strength; Advanced: a 5-point `CurveEditor` variant with x = speed, y = strength (reuse `CurveEditor` with `yMax=100` prop and `pointCount=5`; add those props in Task 9 if not present — update that component and its tests here).
All edits go through `updateProfile`.

- [ ] **Step 1: Failing unit test** (`Sticks.test.tsx`): render with a stubbed store/profile; change the Anti-Deadzone slider → `updateProfile` mutates `sticks.left.deadzone.anti`; switch sub-tab to Right → edits target `sticks.right`.
- [ ] **Step 2: Failing e2e** (`pages.spec.ts`): open Sticks; set Anti-Deadzone to 0.3 via the range input (`fill`/`evaluate` setting value + dispatching `input`); wait 200 ms; `await page.evaluate(() => window.dualforge.getProfile())` → `sticks.left.deadzone.anti === 0.3`.
- [ ] **Step 3: Implement.** **Step 4: Visual check** vs ss1 panel styling. **Step 5: `npm run check`.** **Commit** `feat(renderer): Sticks page with deadzones, curves, trajectory, invert, offset, smoothing`

---

### Task 12: Calibration wizard

**Files:**
- Create: `components/CalibrationWizard.tsx`, `styles/modal.css`
- Test: `apps/desktop/test/renderer/CalibrationWizard.test.tsx`

**Requirements:** modal with blurred backdrop (`backdrop-filter: blur(8px)`), 3 steps with a stepper header: (1) **Center** — "Release the stick and keep still" → samples `snapshot.raw` for 2 s (120 frames) → `computeCenter`; (2) **Outer** — "Rotate the stick slowly around its full edge twice" → samples until the user clicks Next (min 200 samples) → `computeRadius`; (3) **Verify** — shows `StickLive` with the proposed calibration applied client-side (`applyStickShaping` from `@dualforge/engine/shape` subpath export) and Apply / Cancel. Apply → `updateProfile` sets `calibration`, then `flushProfile()`. Cancel restores nothing (no changes were applied). Escape closes. Uses `role="dialog"` `aria-modal`.

- [ ] **Step 1: Failing test:** render wizard with a fake snapshot stream (drive the store's `snapshot` with `act()` 130 times at center offset (0.1, −0.05)); after step 1 the proposed center ≈ (0.1, −0.05); feed 250 circle samples radius 0.8 → step 2 proposes radius ≈ 0.8; click Apply → `updateProfile` called with those values and `flushProfile` called.
- [ ] **Step 2: Implement.** **Step 3: `npm run check`.** **Commit** `feat(renderer): stick calibration wizard`

---

### Task 13: Triggers page

**Load the `frontend-design` skill.** Layout per ss2 Triggers card and ss1 panel style.

**Files:**
- Create: `pages/Triggers.tsx`; Modify: routing, `pages.css`
- Test: `apps/desktop/test/renderer/Triggers.test.tsx`, `e2e/pages.spec.ts` additions

**Requirements (panel):**
1. `SubTabs` `LT · Left · Right · RT` → `subTab.triggers`.
2. "Deadzone" → `DualRangeSlider` `Initial`/`Max` → `deadzone.initial/max`.
3. "Hair Trigger Mode" → `Segmented` `Off · Adaptive · Fixed`; Adaptive shows `RangeSlider` 1..100 integer → `hairTrigger.value`.
4. "Response Curve" → `Segmented` presets → `curve`.
5. "Adaptive Trigger Effect" → `Segmented` `Off · Resistance · Section · Vibration`; parameter sliders per mode (start 0–9, end 0–9, force 0–8, frequency 1–255) as integer `RangeSlider`s; changes apply live (the engine writes the output report on change — verify on hardware: the trigger should stiffen immediately).
6. Right area: DualSense render + two `TriggerBar`s (raw vs out) for the selected side, plus a `CurvePreview` of the trigger curve.

- [ ] **Step 1: Failing unit test:** switching Effect to Resistance and moving Force to 6 → `updateProfile` sets `triggers.left.effect = { mode:'resistance', start: <default 2>, force: 6 }`.
- [ ] **Step 2: Failing e2e:** set hair trigger to Fixed on Right; replay fixture; `getProfile()` reflects it, and the Input Test page's `RT out` reads `1.00` while L2 ramps (fixture only ramps L2 — so instead assert on Left: set Left hair trigger Fixed, then `LT out` shows `1.00` within 500 ms of replay start).
- [ ] **Step 3: Implement.** **Step 4: Hardware check** (a DualSense is attached): with the dev app running, select Resistance force 8 on Left and confirm in the report whether L2 physically stiffens; if not, debug the effect bytes against `docs` (Nielk1's TriggerEffectGenerator mode table) before declaring done. **Step 5: `npm run check`.** **Commit** `feat(renderer): Triggers page with deadzone, hair trigger, curve and adaptive effects`

---

### Task 14: Plan 1 renderer minors (selectors, a11y) and docs

**Files:**
- Modify: `components/Shell.tsx`, `TabStrip.tsx` (narrow zustand selectors), `README.md` (create: what DualForge is, `npm run dev`, `npm run check`, folder map, driver prerequisites with the "double input until HidHide" caveat)
- Test: existing e2e stays green.

- [ ] **Step 1:** replace `useStore()` calls with per-key selectors in Shell/TabStrip/Header/Footer. **Step 2:** write README. **Step 3:** `npm run check`. **Commit** `chore: narrow store selectors, README`

---

## Self-review

**Spec coverage (Plan 2 scope):** §3.2 compile/LUT/stage order ✔ T3; advanced filter ✔ T4; calibration ✔ T4/T12; trigger effects ✔ T5/T6/T13; §6 2 s grace ✔ T6; §4.1 tokens/fonts/nav ✔ T7; pad art ✔ T8; §4.3 pages 4 and 5 ✔ T11/T13; controls ✔ T9; live edit debounce ✔ T10. Gyro, lights animation, Motion/Vibrations/Lights/Overview pages, Buttons modal, Macros, Profiles persistence → Plan 3. Health/installer/HidHide/agent → Plan 4.

**Placeholder scan:** UI tasks specify requirements + tests rather than full JSX by design (judgment work under the frontend-design skill); every logic task has full code. No TBDs.

**Type consistency:** `processReport(raw, CompiledProfile, state, now)` used in T3/T6/tests; `applyTrigger(v, cfg, lut, state)` in T3/T6; `Feedback.triggers` in T5/T6; `updateProfile`/`flushProfile` in T10–T13; `StickLive` replaces `StickCircle` in T9 and is used in T11/T12.
