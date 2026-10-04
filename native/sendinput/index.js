'use strict';
const path = require('node:path');
// electron-rebuild stores ABI-specific builds in bin/<platform>-<arch>-<abi>/; plain node-gyp builds land in build/Release.
const candidates = [
  path.join(__dirname, 'bin', `${process.platform}-${process.arch}-${process.versions.modules}`, 'sendinput.node'),
  path.join(__dirname, 'build', 'Release', 'sendinput.node'),
];
let lastErr;
for (const c of candidates) {
  try { module.exports = require(c); lastErr = undefined; break; } catch (e) { lastErr = e; }
}
if (lastErr) throw lastErr;
