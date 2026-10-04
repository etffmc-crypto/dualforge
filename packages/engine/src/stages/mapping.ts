import { DS_BUTTONS, type Profile, type RawState, type Target, type XInputState } from '@dualforge/shared';

export interface KeyEvent { code: string; down: boolean }
export type MouseButton = 'left' | 'right' | 'middle';
export interface MouseEvent { button: MouseButton; down: boolean }
export interface OutputFrame {
  xinput: XInputState;
  keys: KeyEvent[];
  mouse: MouseEvent[];
  mouseMove: { dx: number; dy: number };
  /** Macro ids whose triggering button was pressed this frame (rising edge). */
  macroStarts: string[];
}

export interface MappingState {
  turboStart: Partial<Record<string, number>>;   // DsButton → ms when hold began
  prevPressed: Partial<Record<string, boolean>>; // DsButton → held last frame (rising-edge detection)
  keysDown: Set<string>;
  mouseDown: Set<MouseButton>;
  wantKeys: Set<string>;
  wantMouse: Set<MouseButton>;
}
export const createMappingState = (): MappingState => ({
  turboStart: {}, prevPressed: {},
  keysDown: new Set(), mouseDown: new Set(), wantKeys: new Set(), wantMouse: new Set(),
});

/**
 * Applies button mappings INTO the passed (already axis/trigger-filled) xinput.
 * Wanted keys/mouse buttons are collected in `s.wantKeys` / `s.wantMouse`; the pipeline runs macros and then diffTransitions
 * so macro-driven keys also produce events (frame.keys/mouse are empty until then).
 */
export function applyMappings(raw: RawState, profile: Profile, s: MappingState, nowMs: number, xinput: XInputState): OutputFrame {
  const frame: OutputFrame = { xinput, keys: [], mouse: [], mouseMove: { dx: 0, dy: 0 }, macroStarts: [] };
  s.wantKeys.clear();
  s.wantMouse.clear();

  for (const b of DS_BUTTONS) {
    const m = profile.mappings[b];
    if (!m) continue;
    const held = raw.buttons[b];
    const was = s.prevPressed[b] === true;
    s.prevPressed[b] = held;
    if (!held) { delete s.turboStart[b]; continue; }

    if (!was) for (const t of m.targets) if (t.type === 'macro') frame.macroStarts.push(t.macroId);

    let active = true;
    if (m.turboHz > 0) {
      const start = s.turboStart[b] ?? (s.turboStart[b] = nowMs);
      const period = 1000 / m.turboHz;
      active = ((nowMs - start) % period) < period / 2;
    }
    if (!active) continue;

    for (const t of m.targets) activate(t, xinput, s.wantKeys, s.wantMouse);
  }

  return frame;
}

/** Emits key/mouse down/up events for the change between the wanted sets and what is currently down, then records the wanted sets as down. */
export function diffTransitions(
  wantKeys: Set<string>, wantMouse: Set<MouseButton>, s: MappingState, out: Pick<OutputFrame, 'keys' | 'mouse'>,
): void {
  for (const k of wantKeys) if (!s.keysDown.has(k)) out.keys.push({ code: k, down: true });
  for (const k of s.keysDown) if (!wantKeys.has(k)) out.keys.push({ code: k, down: false });
  for (const k of wantMouse) if (!s.mouseDown.has(k)) out.mouse.push({ button: k, down: true });
  for (const k of s.mouseDown) if (!wantMouse.has(k)) out.mouse.push({ button: k, down: false });
  if (wantKeys !== s.keysDown) { s.keysDown.clear(); for (const k of wantKeys) s.keysDown.add(k); }
  if (wantMouse !== s.mouseDown) { s.mouseDown.clear(); for (const k of wantMouse) s.mouseDown.add(k); }
}

export function activate(t: Target, x: XInputState, keys: Set<string>, mouse: Set<MouseButton>): void {
  switch (t.type) {
    case 'xbutton': x.buttons[t.button] = true; break;
    case 'key': keys.add(t.code); break;
    case 'mouse': mouse.add(t.button); break;
    case 'xtrigger': if (t.trigger === 'lt') x.lt = 1; else x.rt = 1; break;
    case 'macro': case 'none': break; // macro start is edge-driven (macroStarts); the scheduler applies step targets
  }
}
