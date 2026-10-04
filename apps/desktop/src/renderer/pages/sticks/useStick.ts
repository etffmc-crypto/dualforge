import type { StickConfig } from '@dualforge/shared';
import { useStore, type Side } from '../../store';

export type StickEdit = (fn: (c: StickConfig) => void) => void;
export interface StickSectionProps { side: Side; cfg: StickConfig; edit: StickEdit }

/** Rounds away float noise such as 1 - 0.98 = 0.020000000000000018. */
export const tidy = (v: number) => Math.round(v * 1e6) / 1e6;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(3)}`;

/** The stick selected by the Sticks sub-tab, plus an editor that targets exactly that side. */
export function useStick(): { side: Side; cfg: StickConfig | null; edit: StickEdit } {
  const side = useStore((s) => s.subTab.sticks);
  const cfg = useStore((s) => s.profile?.sticks[side] ?? null);
  const updateProfile = useStore((s) => s.updateProfile);
  return { side, cfg, edit: (fn) => updateProfile((d) => fn(d.sticks[side])) };
}
