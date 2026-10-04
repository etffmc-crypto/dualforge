import type { Battery, Profile } from '@dualforge/shared';

export interface LightbarFrame {
  r: number;
  g: number;
  b: number;
  brightness: 0 | 1 | 2;
  playerLeds: number;
  micLed: 0 | 1 | 2;
  /** True when the colour changes with time (caller must keep re-sending). */
  animated: boolean;
}

const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

function hsvToRgb(h: number): [number, number, number] {
  const i = Math.floor(h * 6) % 6,
    f = h * 6 - Math.floor(h * 6);
  const q = 1 - f;
  const [r, g, b] = [
    [1, f, 0],
    [q, 1, 0],
    [0, 1, f],
    [0, q, 1],
    [f, 0, 1],
    [1, 0, q],
  ][i]!;
  return [byte(r! * 255), byte(g! * 255), byte(b! * 255)];
}

export function computeLightbar(
  cfg: Profile['lights'],
  tMs: number,
  battery: Battery,
): LightbarFrame {
  const base = {
    brightness: cfg.brightness as 0 | 1 | 2,
    playerLeds: cfg.playerLeds,
    micLed: cfg.micLed as 0 | 1 | 2,
  };
  switch (cfg.mode) {
    case 'off':
      return { ...base, r: 0, g: 0, b: 0, animated: false };
    case 'static':
      return { ...base, r: cfg.r, g: cfg.g, b: cfg.b, animated: false };
    case 'breathing': {
      const period = 4000 - 35 * cfg.speed;
      const k = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin((2 * Math.PI * tMs) / period));
      return {
        ...base,
        r: byte(cfg.r * k),
        g: byte(cfg.g * k),
        b: byte(cfg.b * k),
        animated: true,
      };
    }
    case 'rainbow': {
      const period = 6000 - 55 * cfg.speed;
      const [r, g, b] = hsvToRgb((((tMs / period) % 1) + 1) % 1);
      return { ...base, r, g, b, animated: true };
    }
    case 'battery': {
      const p = battery.percent;
      const [r, g, b] = p >= 60 ? [0, 255, 0] : p >= 20 ? [255, 140, 0] : [255, 0, 0];
      const charging = battery.state === 'charging';
      const lit = !charging || Math.floor(tMs / 500) % 2 === 0;
      return { ...base, r: lit ? r! : 0, g: lit ? g! : 0, b: lit ? b! : 0, animated: charging };
    }
  }
}
