// One-off: apply the researched Warzone aim profile to slot p1, preserving mappings/macros/lights.
// Usage: npx tsx scripts/apply-warzone-profile.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProfileSchema } from '../packages/shared/src/profile.ts';

const file = join(process.env.APPDATA, 'DualForge', 'profiles', 'p1.json');
const original = JSON.parse(readFileSync(file, 'utf8'));
copyFileSync(file, file.replace(/\.json$/, `.backup-${Date.now()}.json`));

const stick = (prev) => ({
  ...prev,
  calibration: prev.calibration, // keep the user's calibration
  deadzone: { center: 0.03, anti: 0, outer: 0.02 }, // TMR sticks: just enough to kill drift; let Warzone own the rest
  circular: true, // Circle trajectory: consistent magnitude on diagonals
  invertX: false,
  invertY: false,
  curve: { kind: 'preset', preset: 'linear' }, // Warzone applies its own (Dynamic) curve — don't stack
  filter: {
    enabled: false,
    mode: 'basic',
    strength: 0,
    curve: [
      [0, 0],
      [0.1, 0],
      [0.25, 0],
      [0.5, 0],
      [1, 0],
    ],
  }, // no smoothing, no RC/negative smoothing
});
const trigger = (prev) => ({
  ...prev,
  deadzone: { initial: 0.02, max: 0.98 },
  hairTrigger: { mode: 'off' },
  curve: 'linear',
  effect: { mode: 'off' },
  digital: true, // Demon Workshop mouse-click triggers
});

const next = {
  ...original,
  name: 'Warzone Aim',
  sticks: { left: stick(original.sticks.left), right: stick(original.sticks.right) },
  triggers: { left: trigger(original.triggers.left), right: trigger(original.triggers.right) },
  gyro: { ...original.gyro, output: 'off', activate: 'always', activateButton: null },
};

const parsed = ProfileSchema.safeParse(next);
if (!parsed.success) {
  console.error(parsed.error.format());
  process.exit(1);
}
writeFileSync(file, JSON.stringify(parsed.data, null, 2) + '\n');
console.log('wrote', file, '→', parsed.data.name);
