import { writeFileSync } from 'node:fs';
import { serializeHidlog, type HidlogEntry } from '../../src/replay/hidlog.js';

const entries: HidlogEntry[] = [];
for (let i = 0; i <= 200; i++) {
  const b = new Uint8Array(64); b[0] = 1; b[8] = 8; b[53] = 0x09;
  const a = (i / 200) * Math.PI * 2;                 // left stick full circle
  b[1] = Math.round(127.5 + 127.5 * Math.cos(a)); b[2] = Math.round(127.5 - 127.5 * Math.sin(a));
  b[3] = 128; b[4] = 128;
  b[5] = Math.round((i / 200) * 255);                // L2 sweep 0→1
  if (i % 40 < 20) b[8] |= 0x20;                     // cross pulses
  entries.push({ t: i, hex: Buffer.from(b).toString('hex') });
}
writeFileSync(new URL('./stick-sweep.hidlog', import.meta.url), serializeHidlog(entries));
