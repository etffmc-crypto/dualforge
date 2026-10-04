// Fails `npm run dist` early when the Electron-ABI native addon has not been built.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const addon = resolve(import.meta.dirname, '../../../native/sendinput/build/Release/sendinput.node');
if (!existsSync(addon) || statSync(addon).size === 0) {
  console.error(`Missing native addon: ${addon}\nRun: npm run rebuild -w @dualforge/desktop`);
  process.exit(1);
}
console.log(`native addon present: ${addon}`);
