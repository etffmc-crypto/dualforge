import {
  DS_BUTTONS,
  type DsButton,
  type Macro,
  type Profile,
  type Target,
} from '@dualforge/shared';
import { defaultTarget, mappingOf } from '../buttons/targets';

export type MacroStep = Macro['steps'][number];
export const MAX_MACROS = 32;
export const MAX_STEPS = 64;
export const MAX_MS = 10_000;
export const NAME_MAX = 40;

export const newStep = (): MacroStep => ({
  target: { type: 'xbutton', button: 'A' },
  holdMs: 50,
  delayMs: 50,
});

/** A fresh id that no macro in the profile uses. */
export function newMacroId(existing: readonly Macro[]): string {
  const ids = new Set(existing.map((m) => m.id));
  let id: string;
  do id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  while (ids.has(id));
  return id;
}

/** Removes a macro and, in the same edit, every mapping target that would point at it (so the profile stays valid). */
export function removeMacro(d: Profile, id: string): void {
  d.macros = d.macros.filter((m) => m.id !== id);
  for (const b of DS_BUTTONS) {
    const m = d.mappings[b];
    if (!m) continue;
    const kept = m.targets.filter((t) => !(t.type === 'macro' && t.macroId === id));
    if (kept.length !== m.targets.length) m.targets = kept.length ? kept : [{ type: 'none' }];
  }
}

export function duplicateMacro(d: Profile, id: string): void {
  const src = d.macros.find((m) => m.id === id);
  if (!src || d.macros.length >= MAX_MACROS) return;
  const name = `${src.name} copy`.slice(0, NAME_MAX);
  d.macros.splice(d.macros.indexOf(src) + 1, 0, {
    ...structuredClone(src),
    id: newMacroId(d.macros),
    name,
  });
}

/** Inserts or replaces a macro by id. */
export function upsertMacro(d: Profile, m: Macro): void {
  const i = d.macros.findIndex((x) => x.id === m.id);
  if (i >= 0) d.macros[i] = m;
  else d.macros.push(m);
}

/** Buttons whose mapping runs this macro. */
export function assignedTo(p: Profile, id: string): DsButton[] {
  return DS_BUTTONS.filter((b) =>
    p.mappings[b]?.targets.some((t) => t.type === 'macro' && t.macroId === id),
  );
}

export const cycleMs = (m: Pick<Macro, 'steps'>) =>
  m.steps.reduce((t, s) => t + s.holdMs + s.delayMs, 0);

export interface Press {
  button: DsButton;
  start: number;
  end: number;
}
const clampMs = (v: number) => Math.min(MAX_MS, Math.max(0, Math.round(v)));

/** Recorded presses → macro steps: hold = press length, delay = gap to the next press (0 when they overlap, and for the last). */
export function pressesToSteps(
  presses: readonly Press[],
  targetFor: (b: DsButton) => Target,
): MacroStep[] {
  const sorted = [...presses].sort((a, b) => a.start - b.start).slice(0, MAX_STEPS);
  return sorted.map((p, i) => {
    const next = sorted[i + 1];
    return {
      target: targetFor(p.button),
      holdMs: clampMs(p.end - p.start),
      delayMs: next ? clampMs(next.start - p.end) : 0,
    };
  });
}

/** What a recorded press should output: the button's current first target, or its stock output if that is a macro / nothing. */
export function recordTarget(p: Profile, b: DsButton): Target {
  const t = mappingOf(p.mappings, b).targets[0];
  return t && t.type !== 'macro' && t.type !== 'none' ? t : defaultTarget(b);
}
