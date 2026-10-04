'use strict';
const path = require('node:path');
// Only build/Release is supported (electron-rebuild and node-gyp both write there). In a packaged app the .node file is
// asarUnpack'ed; electron redirects require() of it automatically, but resolve the unpacked path explicitly as a fallback.
const addon = path.join(__dirname, 'build', 'Release', 'sendinput.node');
const unpacked = addon.replace(/app\.asar([\/])/, 'app.asar.unpacked$1');
try {
  module.exports = require(addon);
} catch (e) {
  if (unpacked === addon) throw e;
  module.exports = require(unpacked);
}
