// Records which Electron the native addon was rebuilt for (read by check-addon.mjs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const version = JSON.parse(
  readFileSync(resolve(require.resolve('electron/package.json')), 'utf8'),
).version;
let abi = 'unknown';
try {
  abi = require('node-abi').getAbi(version, 'electron');
} catch {
  /* node-abi is only a convenience; the version is what the guard compares */
}
const dir = resolve(import.meta.dirname, '../../../native/sendinput/build/Release');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, '.abi'), `electron=${version} abi=${abi}\n`);
console.log(`wrote addon marker electron=${version} abi=${abi}`);
