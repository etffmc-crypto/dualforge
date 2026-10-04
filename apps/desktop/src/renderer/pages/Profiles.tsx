import { useState } from 'react';
import { AutoSwitchCard } from './profiles/AutoSwitchCard';
import { ShareCard } from './profiles/ShareCard';
import { SlotCard } from './profiles/SlotCard';
import { useActiveId, useSlots } from './profiles/slots';
import '../styles/profiles.css';

/** Profile slots, share codes and per-game auto-switch rules. */
export function Profiles() {
  const slots = useSlots();
  const activeId = useActiveId();
  const [notice, setNotice] = useState('');
  return (
    <div className="profiles-page">
      <div className="pf-head">
        <h2 className="pf-title">Profiles</h2>
        <p className="pf-sub">
          Four slots on this PC. The active one drives your controller; every page edits it.
        </p>
      </div>
      <div className="slot-grid">
        {slots.map((s) => (
          <SlotCard
            key={s.id}
            slot={s}
            slots={slots}
            active={s.id === activeId}
            onNotice={setNotice}
          />
        ))}
      </div>
      <p className="pf-notice" role="status">
        {notice}
      </p>
      <div className="pf-row">
        <ShareCard slots={slots} />
        <AutoSwitchCard slots={slots} />
      </div>
    </div>
  );
}
