/** On-screen keyboard layout (ANSI, full size). Widths are in key units; `gap` entries are blank space. */
export type KeyCell = { code: string; w?: number; cap?: string } | { gap: number };
export type KeyRow = KeyCell[];

const keys = (codes: string[]): KeyCell[] => codes.map((code) => ({ code }));
const letters = (s: string) => keys([...s].map((c) => `VK_${c}`));
const fn = (from: number, to: number) =>
  keys(Array.from({ length: to - from + 1 }, (_, i) => `VK_F${from + i}`));

/** Main block: 15 units wide, 6 rows. */
export const MAIN_ROWS: KeyRow[] = [
  [
    { code: 'VK_ESCAPE' },
    { gap: 1 },
    ...fn(1, 4),
    { gap: 0.5 },
    ...fn(5, 8),
    { gap: 0.5 },
    ...fn(9, 12),
  ],
  [
    { code: 'VK_OEM_3' },
    ...letters('1234567890'),
    { code: 'VK_OEM_MINUS' },
    { code: 'VK_OEM_PLUS' },
    { code: 'VK_BACK', w: 2 },
  ],
  [
    { code: 'VK_TAB', w: 1.5 },
    ...letters('QWERTYUIOP'),
    { code: 'VK_OEM_4' },
    { code: 'VK_OEM_6' },
    { code: 'VK_OEM_5', w: 1.5 },
  ],
  [
    { code: 'VK_CAPITAL', w: 1.75 },
    ...letters('ASDFGHJKL'),
    { code: 'VK_OEM_1' },
    { code: 'VK_OEM_7' },
    { code: 'VK_RETURN', w: 2.25 },
  ],
  [
    { code: 'VK_LSHIFT', w: 2.25, cap: 'Shift' },
    ...letters('ZXCVBNM'),
    { code: 'VK_OEM_COMMA' },
    { code: 'VK_OEM_PERIOD' },
    { code: 'VK_OEM_2' },
    { code: 'VK_RSHIFT', w: 2.75, cap: 'Shift' },
  ],
  [
    { code: 'VK_LCONTROL', w: 1.25, cap: 'Ctrl' },
    { code: 'VK_LWIN', w: 1.25, cap: 'Win' },
    { code: 'VK_LMENU', w: 1.25, cap: 'Alt' },
    { code: 'VK_SPACE', w: 6.25 },
    { code: 'VK_RMENU', w: 1.25, cap: 'Alt' },
    { code: 'VK_RWIN', w: 1.25, cap: 'Win' },
    { code: 'VK_APPS', w: 1.25 },
    { code: 'VK_RCONTROL', w: 1.25, cap: 'Ctrl' },
  ],
];

/** Navigation cluster: 3 units wide, 6 rows (system keys, nav, volume, arrows). */
export const NAV_ROWS: KeyRow[] = [
  keys(['VK_SNAPSHOT', 'VK_SCROLL', 'VK_PAUSE']),
  keys(['VK_INSERT', 'VK_HOME', 'VK_PRIOR']),
  keys(['VK_DELETE', 'VK_END', 'VK_NEXT']),
  [
    { code: 'VK_VOLUME_DOWN', cap: 'icon:voldown' },
    { code: 'VK_VOLUME_MUTE', cap: 'icon:mute' },
    { code: 'VK_VOLUME_UP', cap: 'icon:volup' },
  ],
  [{ gap: 1 }, { code: 'VK_UP' }, { gap: 1 }],
  keys(['VK_LEFT', 'VK_DOWN', 'VK_RIGHT']),
];

/** Numpad + media: a 4 × 6 grid; `row`/`col` are 1-based, spans for + and 0. */
export interface PadKey {
  code: string;
  row: number;
  col: number;
  rows?: number;
  cols?: number;
  cap?: string;
}
export const NUMPAD: PadKey[] = [
  { code: 'VK_MEDIA_PLAY_PAUSE', row: 1, col: 1, cap: 'icon:play' },
  { code: 'VK_MEDIA_STOP', row: 1, col: 2, cap: 'icon:stop' },
  { code: 'VK_MEDIA_PREV_TRACK', row: 1, col: 3, cap: 'icon:prev' },
  { code: 'VK_MEDIA_NEXT_TRACK', row: 1, col: 4, cap: 'icon:next' },
  { code: 'VK_NUMLOCK', row: 2, col: 1, cap: 'Num Lock' },
  { code: 'VK_DIVIDE', row: 2, col: 2, cap: '/' },
  { code: 'VK_MULTIPLY', row: 2, col: 3, cap: '*' },
  { code: 'VK_SUBTRACT', row: 2, col: 4, cap: '-' },
  { code: 'VK_NUMPAD7', row: 3, col: 1 },
  { code: 'VK_NUMPAD8', row: 3, col: 2 },
  { code: 'VK_NUMPAD9', row: 3, col: 3 },
  { code: 'VK_ADD', row: 3, col: 4, rows: 2, cap: '+' },
  { code: 'VK_NUMPAD4', row: 4, col: 1 },
  { code: 'VK_NUMPAD5', row: 4, col: 2 },
  { code: 'VK_NUMPAD6', row: 4, col: 3 },
  { code: 'VK_NUMPAD1', row: 5, col: 1 },
  { code: 'VK_NUMPAD2', row: 5, col: 2 },
  { code: 'VK_NUMPAD3', row: 5, col: 3 },
  { code: 'VK_NUMPAD0', row: 6, col: 1, cols: 2 },
  { code: 'VK_DECIMAL', row: 6, col: 3, cap: '.' },
];

/** Generic modifiers have no key of their own on the board (the left/right keys stand in for them). */
export const OFF_BOARD = ['VK_SHIFT', 'VK_CONTROL', 'VK_MENU'];
