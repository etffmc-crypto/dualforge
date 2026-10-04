/** Windows virtual-key codes by name (the `key` mapping target uses these names, e.g. "VK_SPACE"). */
const entries: Array<[string, number]> = [
  ['VK_BACK', 0x08], ['VK_TAB', 0x09], ['VK_RETURN', 0x0d], ['VK_PAUSE', 0x13], ['VK_CAPITAL', 0x14],
  ['VK_ESCAPE', 0x1b], ['VK_SPACE', 0x20], ['VK_PRIOR', 0x21], ['VK_NEXT', 0x22], ['VK_END', 0x23], ['VK_HOME', 0x24],
  ['VK_LEFT', 0x25], ['VK_UP', 0x26], ['VK_RIGHT', 0x27], ['VK_DOWN', 0x28], ['VK_SNAPSHOT', 0x2c],
  ['VK_INSERT', 0x2d], ['VK_DELETE', 0x2e], ['VK_LWIN', 0x5b], ['VK_RWIN', 0x5c], ['VK_APPS', 0x5d],
  ['VK_MULTIPLY', 0x6a], ['VK_ADD', 0x6b], ['VK_SUBTRACT', 0x6d], ['VK_DECIMAL', 0x6e], ['VK_DIVIDE', 0x6f],
  ['VK_NUMLOCK', 0x90], ['VK_SCROLL', 0x91],
  ['VK_SHIFT', 0x10], ['VK_CONTROL', 0x11], ['VK_MENU', 0x12],
  ['VK_LSHIFT', 0xa0], ['VK_RSHIFT', 0xa1], ['VK_LCONTROL', 0xa2], ['VK_RCONTROL', 0xa3], ['VK_LMENU', 0xa4], ['VK_RMENU', 0xa5],
  ['VK_VOLUME_MUTE', 0xad], ['VK_VOLUME_DOWN', 0xae], ['VK_VOLUME_UP', 0xaf],
  ['VK_MEDIA_NEXT_TRACK', 0xb0], ['VK_MEDIA_PREV_TRACK', 0xb1], ['VK_MEDIA_STOP', 0xb2], ['VK_MEDIA_PLAY_PAUSE', 0xb3],
  ['VK_OEM_1', 0xba], ['VK_OEM_PLUS', 0xbb], ['VK_OEM_COMMA', 0xbc], ['VK_OEM_MINUS', 0xbd], ['VK_OEM_PERIOD', 0xbe],
  ['VK_OEM_2', 0xbf], ['VK_OEM_3', 0xc0], ['VK_OEM_4', 0xdb], ['VK_OEM_5', 0xdc], ['VK_OEM_6', 0xdd], ['VK_OEM_7', 0xde],
];
for (let i = 0; i < 26; i++) entries.push([`VK_${String.fromCharCode(65 + i)}`, 0x41 + i]);
for (let i = 0; i < 10; i++) entries.push([`VK_${i}`, 0x30 + i], [`VK_NUMPAD${i}`, 0x60 + i]);
for (let i = 1; i <= 12; i++) entries.push([`VK_F${i}`, 0x6f + i]);

export const VK: Record<string, number> = Object.fromEntries(entries);
/** All key names, sorted, for UI pickers. */
export const VK_NAMES: string[] = Object.keys(VK).sort();
