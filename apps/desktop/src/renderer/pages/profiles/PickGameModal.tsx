import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/Modal';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; names: string[] };

/** Lists the programs running right now (from main's `system:processes`) so a game's exe can be picked instead of typed. */
export function PickGameModal({ taken, onPick, onClose }: { taken: ReadonlySet<string>; onPick(exe: string): void; onClose(): void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  // after the Modal has moved focus onto its panel, put it in the search box
  useEffect(() => { const r = requestAnimationFrame(() => search.current?.focus()); return () => cancelAnimationFrame(r); }, []);
  useEffect(() => {
    let live = true;
    window.dualforge.system.processes().then(
      (names) => { if (live) setLoad({ state: 'ready', names }); },
      () => { if (live) setLoad({ state: 'error' }); },
    );
    return () => { live = false; };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = load.state === 'ready' ? load.names.filter((n) => n.includes(q)) : [];
  return (
    <Modal open title="Pick a running game" onClose={onClose} width={460} className="pick-game">
      <p className="modal-text">Start the game first, then pick its program here. Windows and background programs are left out.</p>
      <input
        type="search" className="pf-input pick-search" aria-label="Search running programs" placeholder="Search…" value={query}
        ref={search} spellCheck={false} onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <div className="pick-list">
        {load.state === 'loading' && <p className="pick-empty">Reading running programs…</p>}
        {load.state === 'error' && <p className="pick-empty pf-err" role="alert">Couldn't read the running programs. Type the exe name instead.</p>}
        {load.state === 'ready' && shown.length === 0 && <p className="pick-empty">{q ? `Nothing running matches “${query.trim()}”.` : 'No programs found.'}</p>}
        {shown.map((n) => {
          const has = taken.has(n);
          return (
            <button key={n} type="button" className="pick-item" disabled={has} onClick={() => onPick(n)}>
              <span className="pick-exe">{n}</span>
              {has && <span className="pick-tag">has a rule</span>}
            </button>
          );
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="panel-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
