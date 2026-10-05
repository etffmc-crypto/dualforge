import { useEffect } from 'react';
import type { DsButton, EngineSnapshot } from '@dualforge/shared';
import { navSuspended, useStore } from '../store';
import { TABS } from '../components/TabStrip';
import { closeTopModal, topModalPanel } from '../components/Modal';

/** A held D-pad direction moves focus once at once, then every NAV_REPEAT_MS. */
export const NAV_REPEAT_MS = 150;
/** L2 / R2 count as pressed past this pull (analog pads; this one reports them as digital buttons too). */
const PRESSED = 0.5;

export type NavDir = 'up' | 'down' | 'left' | 'right';
const DPAD: Record<NavDir, 'dpadUp' | 'dpadDown' | 'dpadLeft' | 'dpadRight'> = {
  up: 'dpadUp',
  down: 'dpadDown',
  left: 'dpadLeft',
  right: 'dpadRight',
};
const DIRS = Object.keys(DPAD) as NavDir[];

/** Attribute the fallback focus ring hangs on (styled like :focus-visible) for programmatic focus. */
export const NAV_FOCUS_ATTR = 'data-nav-focus';

function usable(el: HTMLElement): boolean {
  // :disabled also covers controls inside a <fieldset disabled>, which have no `disabled` of their own
  if (el.matches(':disabled') || el.closest('[inert], [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0; // display:none (and unmounted layout) has no box
}

/** The `data-nav` controls the pad can reach: those of the innermost open dialog, else the whole window. */
export function navCandidates(): HTMLElement[] {
  const root: ParentNode = topModalPanel() ?? document;
  return [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter(usable);
}

/**
 * Nearest candidate from `from` in direction `dir` (geometric): only boxes whose centre lies that way count; those
 * overlapping `from` on the perpendicular axis win over the rest, then the smallest edge gap (perpendicular gap doubled).
 */
export function nearestInDirection(
  from: HTMLElement,
  items: HTMLElement[],
  dir: NavDir,
): HTMLElement | null {
  const r = from.getBoundingClientRect();
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  const rc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  let best: HTMLElement | null = null;
  let bestKey: [number, number] = [Infinity, Infinity];
  for (const el of items) {
    if (el === from) continue;
    const q = el.getBoundingClientRect();
    const qc = { x: q.left + q.width / 2, y: q.top + q.height / 2 };
    if ((vertical ? qc.y - rc.y : qc.x - rc.x) * sign <= 0.5) continue;
    const along = Math.max(
      0,
      vertical
        ? sign > 0
          ? q.top - r.bottom
          : r.top - q.bottom
        : sign > 0
          ? q.left - r.right
          : r.left - q.right,
    );
    const perpGap = vertical
      ? Math.max(0, q.left - r.right, r.left - q.right)
      : Math.max(0, q.top - r.bottom, r.top - q.bottom);
    const centreOff = vertical ? Math.abs(qc.x - rc.x) : Math.abs(qc.y - rc.y);
    const key: [number, number] = [perpGap > 0 ? 1 : 0, along + 2 * perpGap + 0.01 * centreOff];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = el;
      bestKey = key;
    }
  }
  return best;
}

/** Focuses `el` with a visible ring even though no key was pressed (the ring only if focus really landed there). */
export function navFocus(el: HTMLElement): void {
  for (const old of document.querySelectorAll(`[${NAV_FOCUS_ATTR}]`))
    old.removeAttribute(NAV_FOCUS_ATTR);
  el.focus({ focusVisible: true } as FocusOptions);
  if (document.activeElement !== el) return;
  el.setAttribute(NAV_FOCUS_ATTR, '');
  el.addEventListener('blur', () => el.removeAttribute(NAV_FOCUS_ATTR), { once: true });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Moves a range input by one step and lets React see it as a user drag. */
function nudgeRange(input: HTMLInputElement, d: 1 | -1): void {
  const step = Number(input.step) || 1;
  const min = input.min === '' ? 0 : Number(input.min),
    max = input.max === '' ? 100 : Number(input.max);
  const decimals = (String(input.step).split('.')[1] ?? '').length;
  const v = Math.min(max, Math.max(min, Number(input.value) + d * step));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
    input,
    v.toFixed(decimals),
  );
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const focusedNav = (): HTMLElement | null => {
  const a = document.activeElement;
  return a instanceof HTMLElement && a.hasAttribute('data-nav') ? a : null;
};

/** D-pad: a focused slider takes left/right as value steps; otherwise focus moves to the nearest control that way. */
export function moveFocus(dir: NavDir): void {
  const cur = focusedNav();
  if (
    cur instanceof HTMLInputElement &&
    cur.type === 'range' &&
    (dir === 'left' || dir === 'right')
  ) {
    nudgeRange(cur, dir === 'right' ? 1 : -1);
    return;
  }
  const items = navCandidates();
  if (items.length === 0) return;
  const from = cur && items.includes(cur) ? cur : null;
  // nothing focused yet: start on the selected header tab (or the dialog's first control)
  const next = from
    ? nearestInDirection(from, items, dir)
    : (items.find(
        (el) => el.getAttribute('role') === 'tab' && el.getAttribute('aria-selected') === 'true',
      ) ?? items[0]!);
  if (next) navFocus(next);
}

/** Steps the first sub-tab strip under `root` (outside any dialog when `root` is the document) by `d`, clamped. */
function stepSubTabs(root: ParentNode, d: 1 | -1): void {
  const list = [...root.querySelectorAll<HTMLElement>('[data-subtabs]')].find(
    (l) => root !== document || !l.closest('[role="dialog"]'),
  );
  if (!list) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const next = tabs[Math.max(0, Math.min(tabs.length - 1, i + d))];
  if (next && i !== tabs.indexOf(next)) next.click();
}

/**
 * The raw DualSense buttons navigation reads, one bit each (the pressed state of a snapshot is a number, not a fresh
 * Set). Raw, not the virtual pad: a profile's remaps, turbo or macros never change what the UI sees.
 */
const NAV_KEYS = [
  'cross',
  'circle',
  'l1',
  'r1',
  'l2',
  'r2',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
] as const satisfies readonly DsButton[];
type NavKey = (typeof NAV_KEYS)[number];
const BIT = Object.fromEntries(NAV_KEYS.map((k, i) => [k, 1 << i])) as Record<NavKey, number>;

function pressedMask(s: EngineSnapshot): number {
  let m = 0;
  for (const k of NAV_KEYS) if (s.raw.buttons[k]) m |= BIT[k];
  if (s.raw.l2 > PRESSED) m |= BIT.l2;
  if (s.raw.r2 > PRESSED) m |= BIT.r2;
  return m;
}

/**
 * Global pad navigation (mounted once, in Shell), driven by the raw controller state in each snapshot and only while
 * the window has focus and nothing has suspended it: L1/R1 cycle the header pages (the dialog's sub-tabs while one is
 * open), L2/R2 step the page's sub-tabs, the D-pad moves focus between `data-nav` controls (repeating while held), cross
 * clicks the focused control, circle closes the top dialog or goes back to Overview. Everything but the D-pad acts on the
 * rising edge.
 *
 * The first usable snapshot (at start, and again after the window regains focus, a suspension ends or replayed input
 * stops being ignored) is a baseline only: buttons already held then are not presses. Replayed input (`source:
 * 'replay'`) is ignored unless the app was launched with DUALFORGE_NAV_REPLAY=1 (`window.dualforge.flags.navReplay`).
 */
export function useGamepadNav(): void {
  useEffect(() => {
    const allowReplay = window.dualforge?.flags?.navReplay === true;
    let prev = 0;
    let armed = false; // false until a baseline snapshot has been taken
    let held: NavDir | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stopRepeat = () => {
      held = null;
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const listening = () => document.hasFocus() && !navSuspended();
    const repeat = (dir: NavDir) => {
      timer = setTimeout(() => {
        if (held !== dir) return;
        if (!listening()) {
          stopRepeat();
          return;
        }
        moveFocus(dir);
        repeat(dir);
      }, NAV_REPEAT_MS);
    };

    const onSnap = (s: EngineSnapshot | null) => {
      if (!s || (s.source === 'replay' && !allowReplay) || !listening()) {
        armed = false;
        stopRepeat();
        return;
      }
      const now = pressedMask(s);
      const was = prev;
      prev = now;
      if (!armed) {
        armed = true;
        return;
      }
      // the on-pad turbo combo (mode button + a button) is for the engine, not the UI: while the mode button is held
      // every frame is a baseline, so neither the combo press nor its later release counts
      const turbo = useStore.getState().settings?.turbo;
      if (turbo?.onPadAssign && turbo.modeButton && s.raw.buttons[turbo.modeButton]) {
        stopRepeat();
        return;
      }
      const rising = (k: NavKey) => (now & BIT[k]) !== 0 && (was & BIT[k]) === 0;

      if (held && (now & BIT[DPAD[held]]) === 0) stopRepeat();
      const dir = DIRS.find((d) => rising(DPAD[d]));
      if (dir) {
        stopRepeat();
        held = dir;
        moveFocus(dir);
        repeat(dir);
      }

      if (rising('cross')) {
        const el = focusedNav();
        if (el && usable(el) && !(el instanceof HTMLInputElement && el.type === 'range'))
          el.click();
      }
      if (rising('circle')) {
        if (!closeTopModal()) useStore.getState().setPage('overview');
        return;
      }

      const modal = topModalPanel();
      if (modal) {
        if (rising('l1')) stepSubTabs(modal, -1);
        else if (rising('r1')) stepSubTabs(modal, 1);
        return;
      }
      if (rising('l1') || rising('r1')) {
        const { page, setPage } = useStore.getState();
        const i = TABS.findIndex((t) => t.id === page);
        const n = TABS.length;
        const next = rising('r1') ? (i + 1) % n : i <= 0 ? n - 1 : i - 1;
        setPage(TABS[next]!.id);
      }
      if (rising('l2')) stepSubTabs(document, -1);
      else if (rising('r2')) stepSubTabs(document, 1);
    };

    const off = useStore.subscribe((st, before) => {
      if (st.snapshot !== before.snapshot) onSnap(st.snapshot);
    });
    return () => {
      off();
      stopRepeat();
    };
  }, []);
}
