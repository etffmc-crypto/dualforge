import {
  BUTTON_LABELS,
  DS_BUTTONS,
  defaultProfile,
  type DsButton,
  type Profile,
  type Target,
} from '@dualforge/shared';

type Rgb = { r: number; g: number; b: number };

const XB_LABEL: Record<string, string> = {
  BACK: 'Back',
  START: 'Start',
  GUIDE: 'Guide',
  DPAD_UP: 'D-pad up',
  DPAD_DOWN: 'D-pad down',
  DPAD_LEFT: 'D-pad left',
  DPAD_RIGHT: 'D-pad right',
};
export const DS_LABEL: Record<DsButton, string> = {
  cross: 'Cross',
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  l1: 'L1',
  r1: 'R1',
  l2: 'L2',
  r2: 'R2',
  l3: 'L3',
  r3: 'R3',
  create: 'Create',
  options: 'Options',
  ps: 'PS',
  touchpad: 'Touchpad',
  mic: 'Mic',
  dpadUp: 'D-pad up',
  dpadDown: 'D-pad down',
  dpadLeft: 'D-pad left',
  dpadRight: 'D-pad right',
};

/** `VK_SPACE` → `Space`, `VK_F5` → `F5`, `VK_A` → `A`. */
function keyLabel(code: string): string {
  const k = code.replace(/^VK_/, '');
  return /^(F\d{1,2}|.)$/.test(k) ? k : k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** True when the analog travel of this trigger button reaches an xtrigger target (anything else is a full pull). */
function analogPull(source: DsButton, p: Profile): boolean {
  if (source === 'l2') return !p.triggers.left.digital;
  if (source === 'r2') return !p.triggers.right.digital;
  return false;
}

export function formatTarget(t: Target, source: DsButton, p: Profile): string {
  switch (t.type) {
    case 'none':
      return 'Disabled';
    case 'xbutton':
      return XB_LABEL[t.button] ?? t.button;
    case 'key':
      return keyLabel(t.code);
    case 'mouse':
      return `Mouse ${t.button}`;
    case 'macro':
      return `Macro ${p.macros.find((m) => m.id === t.macroId)?.name ?? '?'}`;
    case 'xtrigger':
      return `${t.trigger.toUpperCase()}${analogPull(source, p) ? '' : ' (digital)'}`;
  }
}

const DEFAULTS = defaultProfile('defaults', 'defaults').mappings;
const same = (a: Target[], b: Target[]) => JSON.stringify(a) === JSON.stringify(b);

/** Mappings whose targets differ from the stock pad or that have turbo set, in button order, as `✕ ▸ B ⟳ 12 Hz`. */
export function mappingChips(p: Profile): { button: DsButton; text: string }[] {
  return DS_BUTTONS.flatMap((b) => {
    const m = p.mappings[b];
    const d = DEFAULTS[b];
    if (!m || !d) return [];
    const turbo = m.turbo.mode !== 'off';
    if (!turbo && same(m.targets, d.targets)) return [];
    const out = m.targets.map((t) => formatTarget(t, b, p)).join(' + ');
    return [
      { button: b, text: `${BUTTON_LABELS[b]} ▸ ${out}${turbo ? ` ⟳ ${m.turbo.hz} Hz` : ''}` },
    ];
  });
}

/** Hue in degrees (0–360) of an RGB colour; greys report 0. */
export function hueOf({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Fully saturated, full value colour for a hue. */
export function rgbOfHue(h: number): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return { r: f(5), g: f(3), b: f(1) };
}
