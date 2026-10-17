import { createElement } from 'react';
import { isFreeSlot, PROFILE_IDS } from '@dualforge/shared';
import { ProTag } from '../../components/Pro';
import { useStore } from '../../store';

export interface Slot {
  id: (typeof PROFILE_IDS)[number];
  n: number;
  name: string;
}

/** The four slots in order with their current names (falling back to "Profile N" until the list loads). */
export function useSlots(): Slot[] {
  const profiles = useStore((s) => s.profiles);
  return PROFILE_IDS.map((id, i) => ({
    id,
    n: i + 1,
    name: profiles.find((p) => p.id === id)?.name ?? `Profile ${i + 1}`,
  }));
}

/** The slot the engine is running right now. */
export const useActiveId = () =>
  useStore((s) => s.activeProfileId ?? s.settings?.activeProfile ?? null);

/** Slot choices; with `locked` (Pro gates on Free) slots 3 and 4 are disabled and carry the Pro tag. */
export const slotOptions = (slots: Slot[], locked = false) =>
  slots.map((s) =>
    locked && !isFreeSlot(s.id)
      ? { value: s.id, label: s.name, disabled: true, tag: createElement(ProTag) }
      : { value: s.id, label: s.name },
  );

/** Main rejects with "Error invoking remote method 'x': Error: E_CODE"; this pulls out the E_CODE (or the raw text). */
export function errorCode(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : err);
  return /\bE_[A-Z_]+\b/.exec(msg)?.[0] ?? msg;
}

export const reportError = (code: string) => (err: unknown) =>
  useStore.setState({ lastError: { code, msg: String(err) } });

/**
 * Sends any edit of the running profile still waiting for its debounce, so a slot operation that reads it in main
 * (duplicate from it, export it, share it) sees the latest values. IPC calls are handled in order.
 */
export const flushEdits = () => useStore.getState().flushPending();
