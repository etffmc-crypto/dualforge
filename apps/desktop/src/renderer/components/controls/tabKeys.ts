import type { KeyboardEvent } from 'react';

/**
 * Arrow/Home/End handling for a `role="tablist"` (automatic activation, like Segmented). Pair it with
 * `tabIndex={active ? 0 : -1}` on each tab so only the active one is in the Tab order.
 * `select(i)` activates the tab at index i; the focus follows to that tab.
 */
export function onTabKeyDown(
  e: KeyboardEvent<HTMLElement>,
  count: number,
  current: number,
  select: (i: number) => void,
): void {
  if (count < 1) return;
  const n =
    e.key === 'ArrowRight'
      ? (current + 1) % count
      : e.key === 'ArrowLeft'
        ? (current - 1 + count) % count
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? count - 1
            : -1;
  if (n < 0) return;
  e.preventDefault();
  select(n);
  const tabs = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs[n]?.focus();
}
