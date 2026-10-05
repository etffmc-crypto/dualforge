import {
  VK_NAMES,
  X_BUTTONS,
  defaultProfile,
  turboOff,
  type DsButton,
  type Macro,
  type Mapping,
  type Target,
  type XButton,
} from '@dualforge/shared';

export type VkName = (typeof VK_NAMES)[number];
export const MAX_TARGETS = 3;
export const TURBO_STEPS = [0, 5, 10, 15, 20, 25, 30] as const;

export const X_LABELS: Record<XButton, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LS: 'LS',
  RS: 'RS',
  BACK: 'Back',
  START: 'Start',
  GUIDE: 'Guide',
  DPAD_UP: 'D-pad ↑',
  DPAD_DOWN: 'D-pad ↓',
  DPAD_LEFT: 'D-pad ←',
  DPAD_RIGHT: 'D-pad →',
};
export const MOUSE_LABELS = { left: 'Mouse L', right: 'Mouse R', middle: 'Mouse M' } as const;

const SPECIAL: Record<string, string> = {
  VK_BACK: 'Back',
  VK_TAB: 'Tab',
  VK_RETURN: 'Enter',
  VK_PAUSE: 'Pause',
  VK_CAPITAL: 'Caps',
  VK_ESCAPE: 'Esc',
  VK_SPACE: 'Space',
  VK_PRIOR: 'PgUp',
  VK_NEXT: 'PgDn',
  VK_END: 'End',
  VK_HOME: 'Home',
  VK_LEFT: '←',
  VK_UP: '↑',
  VK_RIGHT: '→',
  VK_DOWN: '↓',
  VK_SNAPSHOT: 'PrtSc',
  VK_INSERT: 'Ins',
  VK_DELETE: 'Del',
  VK_LWIN: 'L Win',
  VK_RWIN: 'R Win',
  VK_APPS: 'Menu',
  VK_MULTIPLY: 'Num *',
  VK_ADD: 'Num +',
  VK_SUBTRACT: 'Num -',
  VK_DECIMAL: 'Num .',
  VK_DIVIDE: 'Num /',
  VK_NUMLOCK: 'Num Lock',
  VK_SCROLL: 'ScrLk',
  VK_SHIFT: 'Shift',
  VK_CONTROL: 'Ctrl',
  VK_MENU: 'Alt',
  VK_LSHIFT: 'L Shift',
  VK_RSHIFT: 'R Shift',
  VK_LCONTROL: 'L Ctrl',
  VK_RCONTROL: 'R Ctrl',
  VK_LMENU: 'L Alt',
  VK_RMENU: 'R Alt',
  VK_VOLUME_MUTE: 'Mute',
  VK_VOLUME_DOWN: 'Vol-',
  VK_VOLUME_UP: 'Vol+',
  VK_MEDIA_NEXT_TRACK: 'Next track',
  VK_MEDIA_PREV_TRACK: 'Prev track',
  VK_MEDIA_STOP: 'Stop',
  VK_MEDIA_PLAY_PAUSE: 'Play/Pause',
  VK_OEM_1: ';',
  VK_OEM_PLUS: '=',
  VK_OEM_COMMA: ',',
  VK_OEM_MINUS: '-',
  VK_OEM_PERIOD: '.',
  VK_OEM_2: '/',
  VK_OEM_3: '`',
  VK_OEM_4: '[',
  VK_OEM_5: '\\',
  VK_OEM_6: ']',
  VK_OEM_7: "'",
};

/** Short, unique label per virtual key: `VK_SPACE` → `Space`, `VK_NUMPAD7` → `Num 7`, `VK_F5` → `F5`. */
export const KEY_LABELS: Record<string, string> = Object.fromEntries(
  VK_NAMES.map((code) => {
    const k = code.slice(3);
    return [code, SPECIAL[code] ?? (k.startsWith('NUMPAD') ? `Num ${k.slice(6)}` : k)];
  }),
);

/** Short text for one target, as shown in pills and chips. */
export function targetText(t: Target, macros: readonly Macro[]): string {
  switch (t.type) {
    case 'none':
      return 'Off';
    case 'xbutton':
      return X_LABELS[t.button];
    case 'xtrigger':
      return t.trigger.toUpperCase();
    case 'key':
      return KEY_LABELS[t.code] ?? t.code;
    case 'mouse':
      return MOUSE_LABELS[t.button];
    case 'macro':
      return macros.find((m) => m.id === t.macroId)?.name ?? 'Macro';
  }
}

/** Stable identity for comparing / keying targets. */
export function targetKey(t: Target): string {
  switch (t.type) {
    case 'none':
      return 'none';
    case 'xbutton':
      return `x:${t.button}`;
    case 'xtrigger':
      return `t:${t.trigger}`;
    case 'key':
      return `k:${t.code}`;
    case 'mouse':
      return `m:${t.button}`;
    case 'macro':
      return `macro:${t.macroId}`;
  }
}

const DEFAULTS = defaultProfile('defaults', 'defaults').mappings;
export const defaultTarget = (b: DsButton): Target => DEFAULTS[b]!.targets[0]!;
/** A button's mapping; the schema allows a missing entry, which behaves as the stock output. */
export const mappingOf = (mappings: Partial<Record<DsButton, Mapping>>, b: DsButton): Mapping =>
  mappings[b] ?? { targets: [defaultTarget(b)], turbo: turboOff(), continuous: false };
export const isDefaultMapping = (b: DsButton, m: Mapping) =>
  m.turbo.mode === 'off' &&
  !m.continuous &&
  m.targets.length === 1 &&
  targetKey(m.targets[0]!) === targetKey(defaultTarget(b));

export interface MappingSummary {
  text: string;
  macro: boolean;
  more: number;
  turbo: boolean;
  continuous: boolean;
}
/** First target as text, plus the multi / turbo / continuous markers. */
export function summarize(m: Mapping, macros: readonly Macro[]): MappingSummary {
  const first = m.targets[0] ?? { type: 'none' as const };
  return {
    text: targetText(first, macros),
    macro: first.type === 'macro',
    more: m.targets.length - 1,
    turbo: m.turbo.mode !== 'off',
    continuous: m.continuous,
  };
}
/** The pill text in one string: `B`, `Space +1 ⟳ ∞`, `⟨macro⟩ Reload`. */
export function summaryLine(s: MappingSummary): string {
  return [
    s.macro ? `⟨macro⟩ ${s.text}` : s.text,
    s.more > 0 && `+${s.more}`,
    s.turbo && '⟳',
    s.continuous && '∞',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Picking a target: single mode replaces; multi mode toggles it in or out (up to MAX_TARGETS).
 * "No output" always replaces everything, and a real target replaces a lone "No output".
 */
export function pickTarget(current: readonly Target[], t: Target, multi: boolean): Target[] {
  if (!multi || t.type === 'none') return [t];
  const real = current.filter((c) => c.type !== 'none');
  const k = targetKey(t);
  if (real.some((c) => targetKey(c) === k)) {
    const rest = real.filter((c) => targetKey(c) !== k);
    return rest.length ? rest : [{ type: 'none' }];
  }
  return real.length >= MAX_TARGETS ? [...real] : [...real, t];
}

export const CONTROLLER_TARGETS: Target[] = [
  ...(['A', 'B', 'X', 'Y', 'LB', 'RB'] as const).map((button) => ({
    type: 'xbutton' as const,
    button,
  })),
  { type: 'xtrigger', trigger: 'lt' },
  { type: 'xtrigger', trigger: 'rt' },
  ...X_BUTTONS.filter((b) => !['A', 'B', 'X', 'Y', 'LB', 'RB'].includes(b)).map((button) => ({
    type: 'xbutton' as const,
    button,
  })),
];
