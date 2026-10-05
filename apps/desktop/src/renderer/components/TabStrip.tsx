import type { ComponentType } from 'react';
import { useStore, type Page } from '../store';
import {
  ButtonsIcon,
  FlaskIcon,
  GridIcon,
  HomeIcon,
  LightsIcon,
  MacrosIcon,
  MotionIcon,
  SticksIcon,
  TriggersIcon,
  TurboIcon,
  VibrationsIcon,
} from './icons';

export const TABS: { id: Page; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'overview', label: 'Overview', Icon: GridIcon },
  { id: 'buttons', label: 'Buttons', Icon: ButtonsIcon },
  { id: 'turbo', label: 'Turbo', Icon: TurboIcon },
  { id: 'sticks', label: 'Sticks', Icon: SticksIcon },
  { id: 'triggers', label: 'Triggers', Icon: TriggersIcon },
  { id: 'motion', label: 'Motion', Icon: MotionIcon },
  { id: 'vibrations', label: 'Vibrations', Icon: VibrationsIcon },
  { id: 'lights', label: 'Lights', Icon: LightsIcon },
  { id: 'macros', label: 'Macros', Icon: MacrosIcon },
  { id: 'inputTest', label: 'Input Test', Icon: FlaskIcon },
];

export function TabStrip() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  return (
    <nav className="tabstrip" role="tablist" aria-label="Sections">
      <span className="pill" aria-hidden="true">
        L1
      </span>
      {TABS.map(({ id, label, Icon }) => (
        <button
          data-nav
          key={id}
          role="tab"
          aria-selected={page === id}
          className={`tab${page === id ? ' active' : ''}`}
          onClick={() => setPage(id)}
        >
          <Icon size={24} />
          <span className="tab-label">{label}</span>
        </button>
      ))}
      <span className="pill" aria-hidden="true">
        R1
      </span>
    </nav>
  );
}
