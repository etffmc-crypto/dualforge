// Generates build/icon.png (256x256 red circle, white "D") and build/icon.ico. Run: node apps/desktop/scripts/make-icon.mjs
import { PNG } from 'pngjs';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const S = 256;
const png = new PNG({ width: S, height: S });
const c = (S - 1) / 2;
const R = 120;
// "D" = vertical bar + half-ring on the right, in a 256 grid.
const inD = (x, y) => {
  const bar = x >= 84 && x <= 112 && y >= 66 && y <= 190;
  const dx = x - 106;
  const dy = y - 128;
  const d = Math.hypot(dx, dy);
  const bowl = x >= 106 && d <= 62 && d >= 34;
  const caps = x >= 106 && x <= 112 && ((y >= 66 && y <= 94) || (y >= 162 && y <= 190));
  const topbot = x >= 106 && ((y >= 66 && y <= 94) || (y >= 162 && y <= 190)) && x <= 128;
  return bar || bowl || caps || topbot;
};
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const dist = Math.hypot(x - c, y - c);
    const a = Math.max(0, Math.min(1, R + 0.5 - dist)); // antialiased edge
    const white = inD(x, y);
    png.data[i] = white ? 255 : 220;
    png.data[i + 1] = white ? 255 : 38;
    png.data[i + 2] = white ? 255 : 38;
    png.data[i + 3] = Math.round(a * 255);
  }
}
const out = resolve(import.meta.dirname, '../build');
mkdirSync(out, { recursive: true });
const buf = PNG.sync.write(png);
writeFileSync(resolve(out, 'icon.png'), buf);
writeFileSync(resolve(out, 'icon.ico'), await pngToIco(buf));
console.log('wrote icon.png, icon.ico');
