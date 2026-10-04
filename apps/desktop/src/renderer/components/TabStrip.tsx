import type { ComponentType } from 'react';
import { useStore, type Page } from '../store';
import { FlaskIcon, HomeIcon, LightsIcon, MotionIcon, SticksIcon, TriggersIcon, VibrationsIcon } from './icons';

export const TABS: { id: Page; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'sticks', label: 'Sticks', Icon: SticksIcon },
  { id: 'triggers', label: 'Triggers', Icon: TriggersIcon },
  { id: 'motion', label: 'Motion', Icon: MotionIcon },
  { id: 'vibrations', label: 'Vibrations', Icon: VibrationsIcon },
  { id: 'lights', label: 'Lights', Icon: LightsIcon },
  { id: 'inputTest', label: 'Input Test', Icon: FlaskIcon },
];

export function TabStrip() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  return (
    <nav className="tabstrip" role="tablist" aria-label="Sections">
      <span className="pill" aria-hidden="true">LB</span>
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} role="tab" aria-selected={page === id} className={`tab${page === id ? ' active' : ''}`} onClick={() => setPage(id)}>
          <Icon size={24} />
          <span className="tab-label">{label}</span>
        </button>
      ))}
      <span className="pill" aria-hidden="true">RB</span>
    </nav>
  );
}
