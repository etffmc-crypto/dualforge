// Generates build/icon.png (256x256 Empire violet rounded square, white "D") and build/icon.ico.
// Run: node apps/desktop/scripts/make-icon.mjs
import { PNG } from 'pngjs';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const S = 256;
const VIOLET = [0x73, 0x52, 0xf0]; // Empire violet-solid, the app's accent
const TOP = [0x84, 0x66, 0xf5]; // a touch lighter at the top edge, like the cards' chrome highlight
const png = new PNG({ width: S, height: S });

// Rounded square: 8 px inset, 56 px corner radius (Windows-style squircle proportion).
const INSET = 8;
const RAD = 56;
const sdRoundRect = (x, y) => {
  const half = (S - 2 * INSET) / 2;
  const cx = S / 2 - 0.5;
  const qx = Math.abs(x - cx) - (half - RAD);
  const qy = Math.abs(y - cx) - (half - RAD);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - RAD;
};
// "D": a 100 x 128 letter with an even 30 px stroke, centred on 128 x 128: a straight back and a semicircular bowl.
const inD = (x, y) => {
  const dy = Math.abs(y - 128);
  const outer =
    (x >= 78 && x <= 114 && dy <= 64) || (x > 114 && Math.hypot(x - 114, y - 128) <= 64);
  const counter =
    (x >= 108 && x <= 114 && dy <= 34) || (x > 114 && Math.hypot(x - 114, y - 128) <= 34);
  return outer && !counter;
};
// 4x supersampling for smooth edges on both the square and the letter.
const SS = 4;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let cover = 0;
    let white = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS - 0.5;
        const py = y + (sy + 0.5) / SS - 0.5;
        if (sdRoundRect(px, py) <= 0) {
          cover++;
          if (inD(px, py)) white++;
        }
      }
    const a = cover / (SS * SS);
    const w = cover ? white / cover : 0;
    const t = Math.max(0, 1 - (y - INSET) / 48); // highlight fades out over the top 48 px
    const base = VIOLET.map((v, k) => v + (TOP[k] - v) * t);
    const i = (y * S + x) * 4;
    png.data[i] = Math.round(base[0] + (255 - base[0]) * w);
    png.data[i + 1] = Math.round(base[1] + (255 - base[1]) * w);
    png.data[i + 2] = Math.round(base[2] + (255 - base[2]) * w);
    png.data[i + 3] = Math.round(a * 255);
  }
}
const out = resolve(import.meta.dirname, '../build');
mkdirSync(out, { recursive: true });
const buf = PNG.sync.write(png);
writeFileSync(resolve(out, 'icon.png'), buf);
writeFileSync(resolve(out, 'icon.ico'), await pngToIco(buf));
console.log('wrote icon.png, icon.ico');
