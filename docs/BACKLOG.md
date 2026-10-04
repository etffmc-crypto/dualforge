# DualForge backlog (deferred review findings)

Carried from the Plan 1 and Plan 2 review ledgers. Triage into Plan 3/4 tasks.

## From Plan 2 (2026-10-04)
- Tasks 1-6 minor (deferred): buildOutputReport allocates per report (cache until feedback changes); triggers.test.ts repeated buildCurveLut; trigger-effect tests slice prefixes only; section.start<end not enforced in schema.
- Deferred minors (re-review): vigem-sink pad object orphaned if p.connect() fails (add try/catch disconnect+null); redundant status event after failed connect.
- Tasks 7-9 minor (deferred): points.slice(0,pointCount) truncation; no memo on 60 Hz path (DualSenseTop re-renders per tick); tabs lack roving tabindex/arrow nav/aria-controls; Toggle/Segmented/RangeSlider without label lack accessible name; test gaps (drag stop, keyboard nudge, document.fonts.check); hover/transition hard-coded colours.
- Deferred minor: DraftNumber doesn't refresh draft text when parent points change mid-edit (stale until blur). Carry into Task 11 dispatch (preset switch must reset drafts).
- Tasks 10-13 minor (deferred): RangeSlider pct unclamped (fill overflow when value outside range); stash-restore path untested; no focus trap in wizard; gamepad nav threshold on `out` may not fire under heavy curves; wizard step 3 lacks Back; lastError not surfaced on pages; per-frame setState in wizard.
- Deferred minors (final review): phantom virtual pad at launch; E_VIGEM_TARGET folded into E_VIGEM_INIT; trigger effect modes narrowed vs spec (Trigger/Weapon/Custom → Plan 3); vibration hint wording; anti-deadzone-before-curve (spec-level, revisit Plan 3); StickLive rings ignore calibration; wizard step 2 lacks live dot; .ttf vs .woff2; gamepad nav not built yet; lastError sticky; regression-test gaps (calibration+invert pipeline, stop clears effects — now added, filter dt=1 — now added, disconnect during in-flight connect).
- USER HANDS-ON CHECKS pending (user will run after merge): L2 stiffens with Resistance; calibration wizard → full-right X ≈ 1.0.

## From Plan 1 (2026-10-03/04)
- vitest workspace deprecation (done in Plan 2); tests not typechecked (done); parser button-bit coverage all-at-once; buildOutputReport doesn't mask micLed/brightness at runtime; prettier not enforced in check; dense formatting > printWidth; MouseEvent export shadows DOM name; hidlog hex length (done); E_VIGEM_TARGET folded into E_VIGEM_INIT; sink.update unwrapped; looped replay unpaced/t backwards; second-instance (done); replay mode not restored after engine restart; profile:set error not logged; a11y gaps; smoke test satisfiable by real pad; renderer bundle 772 kB; setProfile state reset (done in Plan 2); stage order (done in Plan 2); 2 s grace (done in Plan 2).
