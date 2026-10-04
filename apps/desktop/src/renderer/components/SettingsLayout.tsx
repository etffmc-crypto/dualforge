import type { PropsWithChildren, ReactNode } from 'react';
import { SubTabs } from './controls/SubTabs';
import { SectionLabel } from './controls/SectionLabel';
import { useStore, type Side, type SubTabPage } from '../store';

/** GameSir-style settings page: 440px scrollable panel on the left, live render stage on the right. */
export function SettingsLayout({ label, panel, stage }: { label: string; panel: ReactNode; stage: ReactNode }) {
  return (
    <div className="settings">
      <aside className="settings-panel" aria-label={label}>{panel}</aside>
      <div className="settings-stage">{stage}</div>
    </div>
  );
}

/** One titled group of controls inside the settings panel. */
export function PanelSection({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="psec">
      <SectionLabel>{title}</SectionLabel>
      <div className="psec-body">{children}</div>
    </section>
  );
}

const SIDES: { value: Side; label: string }[] = [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }];

/** `LT · Left · Right · RT` side switcher bound to `subTab[page]`; LT/RT on the pad switch it too (global gamepad nav). */
export function SideTabs({ page }: { page: SubTabPage }) {
  const side = useStore((s) => s.subTab[page]);
  const setSubTab = useStore((s) => s.setSubTab);
  return <SubTabs tabs={SIDES} value={side} onChange={(v) => setSubTab(page, v)} pills={['LT', 'RT']} />;
}
