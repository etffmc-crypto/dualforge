import {
  DS_BUTTONS,
  TURBO_PRESETS,
  type Profile,
  type RawState,
  type Target,
  type Turbo,
  type TurboEdit,
  type TurboSettings,
  type XInputState,
} from '@dualforge/shared';

export interface KeyEvent {
  code: string;
  down: boolean;
}
export type MouseButton = 'left' | 'right' | 'middle';
export interface MouseEvent {
  button: MouseButton;
  down: boolean;
}
export interface OutputFrame {
  xinput: XInputState;
  keys: KeyEvent[];
  mouse: MouseEvent[];
  mouseMove: { dx: number; dy: number };
  /** Macro ids whose triggering button was pressed this frame (rising edge). */
  macroStarts: string[];

  /** On-pad turbo combo: mapping changes to persist (the loop applies them to the live profile and reports them to main). */
  turboEdits: TurboEdit[];
  /** Some turbo button is firing right now (held in hold mode, or latched in toggle mode). */
  turboActive: boolean;
}

/** A mode-button press released sooner than this without a combo is a tap (passed through as a short press). */
export const TURBO_TAP_MS = 250;
/** Two taps whose releases are at most this far apart clear all turbo. */
export const TURBO_DOUBLE_TAP_MS = 400;
/** How long a passed-through tap holds the mode button's own outputs (long enough for a game to poll it). */
export const TURBO_TAP_PULSE_MS = 50;

interface ModeButtonState {
  down: boolean;
  /** ms when the current press began. */
  at: number;
  /** A combo happened during the current press: its release is swallowed and it never passes through. */
  combo: boolean;
  /** The tap passthrough pulse lasts until this time. */
  tapUntil: number;
  /** Release time of the last single tap (double-tap detection). */
  lastTap: number;
}

export interface MappingState {
  turboStart: Partial<Record<string, number>>; // DsButton → ms when the (effective) hold began
  /** DsButton → effectively pressed last frame (rising-edge detection for macros and toggle latches). */
  prevPressed: Partial<Record<string, boolean>>;
  /** DsButton → physically held last frame (combo edge detection). */
  prevRaw: Partial<Record<string, boolean>>;
  /** DsButton → ms the toggle-mode latch was set (phase origin); absent = not latched. */
  latched: Partial<Record<string, number>>;
  /** Buttons pressed as part of a combo: their outputs stay off until they are released. */
  comboHeld: Set<string>;
  mode: ModeButtonState;
  keysDown: Set<string>;
  mouseDown: Set<MouseButton>;
  wantKeys: Set<string>;
  wantMouse: Set<MouseButton>;
}
export const createMappingState = (): MappingState => ({
  turboStart: {},
  prevPressed: {},
  prevRaw: {},
  latched: {},
  comboHeld: new Set(),
  mode: { down: false, at: 0, combo: false, tapUntil: -Infinity, lastTap: -Infinity },
  keysDown: new Set(),
  mouseDown: new Set(),
  wantKeys: new Set(),
  wantMouse: new Set(),
});

const PRESET_STEPS = [TURBO_PRESETS.slow, TURBO_PRESETS.medium, TURBO_PRESETS.fast] as const;

/** On-pad cycle: off → slow → medium → fast → off. A custom hold speed steps to the next faster preset; toggle goes off. */
export function nextTurbo(t: Turbo): Turbo {
  if (t.mode === 'off') return { mode: 'hold', hz: TURBO_PRESETS.slow };
  const faster = t.mode === 'hold' ? PRESET_STEPS.find((hz) => hz > t.hz) : undefined;
  return faster === undefined ? { mode: 'off', hz: t.hz } : { mode: 'hold', hz: faster };
}

/** `profile` with the edits applied (pure; mappings that are absent are skipped; the same object when nothing changes). */
export function applyTurboEdits(profile: Profile, edits: readonly TurboEdit[]): Profile {
  if (edits.length === 0) return profile;
  const mappings = { ...profile.mappings };
  for (const e of edits) {
    const m = mappings[e.button];
    if (m) mappings[e.button] = { ...m, turbo: { ...e.turbo } };
  }
  return { ...profile, mappings };
}

/**
 * Called when the profile changes: a button whose turbo mode changed loses its toggle latch and hold phase; a speed-only
 * change keeps them (live edits do not stop an auto-fire).
 */
export function reconcileTurbo(s: MappingState, prev: Profile, next: Profile): void {
  for (const b of DS_BUTTONS) {
    if (prev.mappings[b]?.turbo.mode === next.mappings[b]?.turbo.mode) continue;
    delete s.latched[b];
    delete s.turboStart[b];
  }
}

/** Updates the mode-button state machine; returns edits from a double tap. */
function trackModeButton(
  held: boolean,
  s: MappingState,
  profile: Profile,
  nowMs: number,
): TurboEdit[] {
  const ms = s.mode;
  if (held && !ms.down) {
    ms.down = true;
    ms.at = nowMs;
    ms.combo = false;
  } else if (!held && ms.down) {
    ms.down = false;
    if (!ms.combo && nowMs - ms.at < TURBO_TAP_MS) {
      if (nowMs - ms.lastTap <= TURBO_DOUBLE_TAP_MS) {
        ms.lastTap = -Infinity; // the second tap is swallowed; a third starts over
        const edits: TurboEdit[] = [];
        for (const b of DS_BUTTONS) {
          const t = profile.mappings[b]?.turbo;
          if (t && t.mode !== 'off') edits.push({ button: b, turbo: { mode: 'off', hz: t.hz } });
        }
        return edits;
      }
      ms.lastTap = nowMs;
      ms.tapUntil = nowMs + TURBO_TAP_PULSE_MS;
    }
  }
  return [];
}

/**
 * Applies button mappings INTO the passed (already axis/trigger-filled) xinput.
 * Wanted keys/mouse buttons are collected in `s.wantKeys` / `s.wantMouse`; the pipeline runs macros and then diffTransitions
 * so macro-driven keys also produce events (frame.keys/mouse are empty until then).
 *
 * `turbo` enables the on-pad combo: while `modeButton` is held, pressing another button cycles its turbo (reported in
 * `frame.turboEdits`, never applied here). The mode button's own outputs are deferred: a tap (< TURBO_TAP_MS, no combo)
 * passes through as a TURBO_TAP_PULSE_MS press, a longer hold without a combo passes through from TURBO_TAP_MS on, and any
 * press that saw a combo is swallowed. Two taps within TURBO_DOUBLE_TAP_MS clear every turbo.
 */
export function applyMappings(
  raw: RawState,
  profile: Profile,
  s: MappingState,
  nowMs: number,
  xinput: XInputState,
  skip?: ReadonlySet<Target>,
  turbo?: TurboSettings,
): OutputFrame {
  const frame: OutputFrame = {
    xinput,
    keys: [],
    mouse: [],
    mouseMove: { dx: 0, dy: 0 },
    macroStarts: [],
    turboEdits: [],
    turboActive: false,
  };
  s.wantKeys.clear();
  s.wantMouse.clear();

  const mb = turbo?.onPadAssign ? turbo.modeButton : null;
  if (mb) frame.turboEdits.push(...trackModeButton(raw.buttons[mb], s, profile, nowMs));
  else s.mode.down = false;

  for (const b of DS_BUTTONS) {
    const rawHeld = raw.buttons[b];
    const rawWas = s.prevRaw[b] === true;
    s.prevRaw[b] = rawHeld;
    const m = profile.mappings[b];
    if (!rawHeld) s.comboHeld.delete(b);
    else if (!rawWas && mb && b !== mb && s.mode.down) {
      s.mode.combo = true;
      s.comboHeld.add(b);
      if (m) frame.turboEdits.push({ button: b, turbo: nextTurbo(m.turbo) });
    }
    if (!m) continue;

    let held = rawHeld && !s.comboHeld.has(b);
    if (b === mb)
      held =
        nowMs < s.mode.tapUntil || (rawHeld && !s.mode.combo && nowMs - s.mode.at >= TURBO_TAP_MS);
    const was = s.prevPressed[b] === true;
    s.prevPressed[b] = held;
    const edge = held && !was;
    if (edge) for (const t of m.targets) if (t.type === 'macro') frame.macroStarts.push(t.macroId);

    let active = held;
    if (m.turbo.mode === 'toggle') {
      if (edge) {
        if (s.latched[b] === undefined) s.latched[b] = nowMs;
        else delete s.latched[b];
      }
      const start = s.latched[b];
      active = start !== undefined && phaseOn(nowMs - start, m.turbo.hz);
      if (start !== undefined) frame.turboActive = true;
    } else {
      delete s.latched[b];
      if (!held) delete s.turboStart[b];
      else if (m.turbo.mode === 'hold') {
        const start = s.turboStart[b] ?? (s.turboStart[b] = nowMs);
        active = phaseOn(nowMs - start, m.turbo.hz);
        frame.turboActive = true;
      }
    }
    if (!active) continue;

    for (const t of m.targets) if (!skip?.has(t)) activate(t, xinput, s.wantKeys, s.wantMouse);
  }

  return frame;
}

/** 50 % duty square wave at `hz`, on for the first half of each period. */
const phaseOn = (elapsedMs: number, hz: number): boolean => {
  const period = 1000 / hz;
  return elapsedMs % period < period / 2;
};

/** Emits key/mouse down/up events for the change between the wanted sets and what is currently down, then records the wanted sets as down. */
export function diffTransitions(
  wantKeys: Set<string>,
  wantMouse: Set<MouseButton>,
  s: MappingState,
  out: Pick<OutputFrame, 'keys' | 'mouse'>,
): void {
  for (const k of wantKeys) if (!s.keysDown.has(k)) out.keys.push({ code: k, down: true });
  for (const k of s.keysDown) if (!wantKeys.has(k)) out.keys.push({ code: k, down: false });
  for (const k of wantMouse) if (!s.mouseDown.has(k)) out.mouse.push({ button: k, down: true });
  for (const k of s.mouseDown) if (!wantMouse.has(k)) out.mouse.push({ button: k, down: false });
  if (wantKeys !== s.keysDown) {
    s.keysDown.clear();
    for (const k of wantKeys) s.keysDown.add(k);
  }
  if (wantMouse !== s.mouseDown) {
    s.mouseDown.clear();
    for (const k of wantMouse) s.mouseDown.add(k);
  }
}

export function activate(
  t: Target,
  x: XInputState,
  keys: Set<string>,
  mouse: Set<MouseButton>,
): void {
  switch (t.type) {
    case 'xbutton':
      x.buttons[t.button] = true;
      break;
    case 'key':
      keys.add(t.code);
      break;
    case 'mouse':
      mouse.add(t.button);
      break;
    case 'xtrigger':
      if (t.trigger === 'lt') x.lt = 1;
      else x.rt = 1;
      break;
    case 'macro':
    case 'none':
      break; // macro start is edge-driven (macroStarts); the scheduler applies step targets
  }
}
