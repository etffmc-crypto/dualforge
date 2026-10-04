// Generates tray.png (16 px) and tray@2x.png (32 px): the accent-red rounded badge with a white "D".
// Run: node apps/desktop/resources/make-tray-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCENT = [0xe2, 0x40, 0x3f];
const WHITE = [0xff, 0xff, 0xff];
// 8 x 10 glyph on a 16-pixel grid, drawn at (4, 3)
const D = [
  'XXXXX...',
  'XX..XX..',
  'XX...XX.',
  'XX...XX.',
  'XX...XX.',
  'XX...XX.',
  'XX...XX.',
  'XX...XX.',
  'XX..XX..',
  'XXXXX...',
];

function pixel(x, y) {
  const corner = (x === 0 || x === 15) && (y === 0 || y === 15);
  if (corner) return null;
  const gx = x - 4,
    gy = y - 3;
  if (gy >= 0 && gy < D.length && gx >= 0 && gx < 8 && D[gy][gx] === 'X') return WHITE;
  return ACCENT;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const k = size / 16;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = pixel(Math.floor(x / k), Math.floor(y / k));
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (p) {
        raw[o] = p[0];
        raw[o + 1] = p[1];
        raw[o + 2] = p[2];
        raw[o + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'tray.png'), png(16));
writeFileSync(join(dir, 'tray@2x.png'), png(32));
console.log('wrote tray.png and tray@2x.png');
