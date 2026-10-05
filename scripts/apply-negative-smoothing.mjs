// One-off: enable negative smoothing (RC-filter jitter) on the RIGHT stick of slot p1.
// Usage: npx tsx scripts/apply-negative-smoothing.mjs [strength]   (default -40; range -100..-1)
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProfileSchema } from '../packages/shared/src/profile.ts';

const strength = Number(process.argv[2] ?? -40);
if (!(strength <= -1 && strength >= -100)) throw new Error('strength must be -100..-1');

const file = join(process.env.APPDATA, 'DualForge', 'profiles', 'p1.json');
const original = JSON.parse(readFileSync(file, 'utf8'));
copyFileSync(file, file.replace(/\.json$/, `.backup-${Date.now()}.json`));

const next = {
  ...original,
  sticks: {
    left: {
      ...original.sticks.left,
      filter: { ...original.sticks.left.filter, enabled: false, mode: 'basic', strength: 0 },
    },
    right: {
      ...original.sticks.right,
      deadzone: {
        ...original.sticks.right.deadzone,
        center: Math.max(original.sticks.right.deadzone.center, 0.03),
      },
      filter: { ...original.sticks.right.filter, enabled: true, mode: 'basic', strength },
    },
  },
};

const parsed = ProfileSchema.safeParse(next);
if (!parsed.success) {
  console.error(parsed.error.format());
  process.exit(1);
}
writeFileSync(file, JSON.stringify(parsed.data, null, 2) + '\n');
console.log(`wrote ${file}: right stick negative smoothing ${strength}, left stick off`);
