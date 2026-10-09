// Builds the "Rocket League" profile (pad-side transparent: Raw square stick, tiny deadzone, linear, no smoothing,
// digital triggers, gyro off, orange lightbar) and prints its DUALFORGE: share code for Profiles → Import.
// Usage: npx tsx scripts/build-rocket-league-profile.mjs [out.txt]   (rationale: docs/profiles/rocket-league.md)
import { writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { ProfileSchema, defaultProfile } from '../packages/shared/src/profile.ts';
import { encodeShareCode } from '../packages/engine/src/share-code.ts';

const base = defaultProfile('p2', 'Rocket League');
const stick = (prev) => ({
  ...prev,
  deadzone: { center: 0.02, anti: 0, outer: 0.02 }, // kill drift only; Rocket League's own deadzone (0.05) does the rest
  circular: false, // Raw: keep the native square so diagonals reach 1.0 and the in-game Cross/Square shape works as designed
  invertX: false,
  invertY: false,
  curve: { kind: 'preset', preset: 'linear' },
  filter: { ...prev.filter, enabled: false, mode: 'basic', strength: 0 },
});
const trigger = (prev) => ({
  ...prev,
  deadzone: { initial: 0.02, max: 0.98 },
  hairTrigger: { mode: 'off' },
  curve: 'linear',
  effect: { mode: 'off' },
  digital: true, // mouse-click triggers: throttle/reverse are full-on, which is how Rocket League is played anyway
});
const profile = ProfileSchema.parse({
  ...base,
  sticks: { left: stick(base.sticks.left), right: stick(base.sticks.right) },
  triggers: { left: trigger(base.triggers.left), right: trigger(base.triggers.right) },
  gyro: { ...base.gyro, output: 'off', activate: 'always', activateButton: null },
  lights: { ...base.lights, r: 255, g: 110, b: 0, mode: 'static' }, // Rocket League orange
  // Paddles: the old pad's paddles were wired left=Circle / right=Cross, the new pad's are mirrored
  // (left=Cross / right=Circle). Swapping Cross<->Circle makes each new paddle send what the old one did.
  // The face buttons share the wire, so physical Cross now sends B and Circle sends A (unavoidable).
  mappings: {
    ...base.mappings,
    cross: { ...base.mappings.cross, targets: [{ type: 'xbutton', button: 'B' }] },
    circle: { ...base.mappings.circle, targets: [{ type: 'xbutton', button: 'A' }] },
  },
});
const code = encodeShareCode(profile, (buf) => deflateRawSync(buf));
const out = process.argv[2];
if (out) writeFileSync(out, code + '\n');
console.log(`${profile.name}: ${code.length} chars${out ? ` → ${out}` : ''}`);
if (!out) console.log(code);
