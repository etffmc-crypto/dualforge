import { DS_BUTTONS, emptyXInput, type Profile, type RawState, type Target, type XInputState } from '@dualforge/shared';

export interface KeyEvent { code: string; down: boolean }
export interface MouseEvent { button: 'left' | 'right' | 'middle'; down: boolean }
export interface OutputFrame { xinput: XInputState; keys: KeyEvent[]; mouse: MouseEvent[] }

export interface MappingState {
  turboStart: Partial<Record<string, number>>;   // DsButton → ms when hold began
  keysDown: Set<string>;
  mouseDown: Set<MouseEvent['button']>;
}
export const createMappingState = (): MappingState => ({ turboStart: {}, keysDown: new Set(), mouseDown: new Set() });

export function applyMappings(raw: RawState, profile: Profile, s: MappingState, nowMs: number): OutputFrame {
  const xinput = emptyXInput();
  const wantKeys = new Set<string>();
  const wantMouse = new Set<MouseEvent['button']>();

  for (const b of DS_BUTTONS) {
    const m = profile.mappings[b];
    if (!m) continue;
    const held = raw.buttons[b];
    if (!held) { delete s.turboStart[b]; continue; }

    let active = true;
    if (m.turboHz > 0) {
      const start = s.turboStart[b] ?? (s.turboStart[b] = nowMs);
      const period = 1000 / m.turboHz;
      active = ((nowMs - start) % period) < period / 2;
    }
    if (!active) continue;

    for (const t of m.targets) activate(t, xinput, wantKeys, wantMouse);
  }

  const keys: KeyEvent[] = [];
  for (const k of wantKeys) if (!s.keysDown.has(k)) keys.push({ code: k, down: true });
  for (const k of s.keysDown) if (!wantKeys.has(k)) keys.push({ code: k, down: false });
  s.keysDown = wantKeys;

  const mouse: MouseEvent[] = [];
  for (const k of wantMouse) if (!s.mouseDown.has(k)) mouse.push({ button: k, down: true });
  for (const k of s.mouseDown) if (!wantMouse.has(k)) mouse.push({ button: k, down: false });
  s.mouseDown = wantMouse;

  return { xinput, keys, mouse };
}

function activate(t: Target, x: XInputState, keys: Set<string>, mouse: Set<MouseEvent['button']>): void {
  switch (t.type) {
    case 'xbutton': x.buttons[t.button] = true; break;
    case 'key': keys.add(t.code); break;
    case 'mouse': mouse.add(t.button); break;
    case 'macro': case 'none': break; // macros: Plan 3
  }
}
