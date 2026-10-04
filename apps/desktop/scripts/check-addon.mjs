// Fails `npm run dist` early when the Electron-ABI native addon has not been built,
// or was built against a different Electron than electron-builder.yml targets.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Compare the `.abi` marker text written by write-addon-marker.mjs with the Electron version
 * expected by electron-builder.yml. Returns { ok, reason }.
 */
export function compareMarker(markerText, expectedVersion) {
  if (markerText == null || String(markerText).trim() === '') {
    return { ok: false, reason: 'ABI marker missing or empty' };
  }
  const m = /^electron=(\S+)\s+abi=(\S+)\s*$/.exec(String(markerText).trim());
  if (!m) return { ok: false, reason: `ABI marker malformed: ${String(markerText).trim()}` };
  if (m[1] !== expectedVersion) {
    return {
      ok: false,
      reason: `addon built for electron ${m[1]} but electron-builder.yml expects ${expectedVersion}`,
    };
  }
  return { ok: true, reason: `electron=${m[1]} abi=${m[2]}` };
}

function main() {
  const dir = resolve(import.meta.dirname, '../../../native/sendinput/build/Release');
  const addon = resolve(dir, 'sendinput.node');
  if (!existsSync(addon) || statSync(addon).size === 0) {
    console.error(`Missing native addon: ${addon}\nRun: npm run rebuild -w @dualforge/desktop`);
    process.exit(1);
  }
  const yml = readFileSync(resolve(import.meta.dirname, '../electron-builder.yml'), 'utf8');
  const expected = /^electronVersion:\s*(\S+)/m.exec(yml)?.[1];
  if (!expected) {
    console.error('electronVersion not found in electron-builder.yml');
    process.exit(1);
  }
  const markerPath = resolve(dir, '.abi');
  const marker = existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : null;
  const res = compareMarker(marker, expected);
  if (!res.ok) {
    console.error(`${res.reason}\nRun: npm run rebuild -w @dualforge/desktop`);
    process.exit(1);
  }
  console.log(`native addon present: ${addon} (${res.reason})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
