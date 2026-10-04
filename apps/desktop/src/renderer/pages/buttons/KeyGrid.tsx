import type { CSSProperties, ReactNode } from 'react';
import type { Target } from '@dualforge/shared';
import { MAIN_ROWS, NAV_ROWS, NUMPAD, type KeyRow } from './keyboard';
import { KEY_LABELS, type VkName } from './targets';

export interface KeyGridProps {
  /** VK names currently selected */
  selected: ReadonlySet<string>;
  /** when true, unselected keys are disabled (the 3-target limit is reached) */
  full: boolean;
  onPick(t: Target): void;
}

const I = (d: ReactNode) => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">{d}</svg>;
const speaker = <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />;
const ICONS: Record<string, ReactNode> = {
  voldown: I(<>{speaker}<path d="M15 12h5" stroke="currentColor" strokeWidth="1.8" /></>),
  volup: I(<>{speaker}<path d="M15 12h5M17.5 9.5v5" stroke="currentColor" strokeWidth="1.8" /></>),
  mute: I(<>{speaker}<path d="m15.5 9.5 4.5 5M20 9.5l-4.5 5" stroke="currentColor" strokeWidth="1.8" /></>),
  play: I(<path d="M4 6v12l8-6zM14 6h2.5v12H14zM18.5 6H21v12h-2.5z" />),
  stop: I(<rect x="6" y="6" width="12" height="12" rx="1.5" />),
  prev: I(<path d="M5 6h2.5v12H5zM20 6v12l-11-6z" />),
  next: I(<path d="M16.5 6H19v12h-2.5zM4 6v12l11-6z" />),
};

function Cap({ code, cap }: { code: string; cap?: string | undefined }) {
  if (cap?.startsWith('icon:')) return <>{ICONS[cap.slice(5)]}</>;
  const text = cap ?? KEY_LABELS[code] ?? code;
  const num = /^Num (\d)$/.exec(text);
  return num ? <span className="kc-num"><small>Num</small>{num[1]}</span> : <>{text}</>;
}

function Key({ code, cap, style, selected, full, onPick }: { code: string; cap?: string | undefined; style?: CSSProperties } & KeyGridProps) {
  const on = selected.has(code);
  return (
    <button data-nav
      type="button" className={`kc${on ? ' on' : ''}`} style={style} aria-label={KEY_LABELS[code]} title={KEY_LABELS[code]}
      aria-pressed={on} disabled={full && !on} onClick={() => onPick({ type: 'key', code: code as VkName })}
    >
      <Cap code={code} cap={cap} />
    </button>
  );
}

function Rows({ rows, ...p }: { rows: KeyRow[] } & KeyGridProps) {
  return (
    <>
      {rows.map((row, r) => (
        <div className="kb-row" key={r}>
          {row.map((c, i) => 'gap' in c
            ? <span key={`g${i}`} className="kc-gap" style={{ '--w': c.gap } as CSSProperties} />
            : <Key key={c.code} code={c.code} cap={c.cap} style={{ '--w': c.w ?? 1 } as CSSProperties} {...p} />)}
        </div>
      ))}
    </>
  );
}

/** Full on-screen keyboard: main block, navigation cluster with volume + arrows, numpad with media keys on top. */
export function KeyGrid(p: KeyGridProps) {
  return (
    <div className="kb" role="group" aria-label="Keyboard">
      <div className="kb-block kb-main"><Rows rows={MAIN_ROWS} {...p} /></div>
      <div className="kb-block kb-nav"><Rows rows={NAV_ROWS} {...p} /></div>
      <div className="kb-block kb-numpad">
        {NUMPAD.map((k) => (
          <Key key={k.code} code={k.code} cap={k.cap} {...p}
            style={{ gridRow: `${k.row} / span ${k.rows ?? 1}`, gridColumn: `${k.col} / span ${k.cols ?? 1}` }} />
        ))}
      </div>
    </div>
  );
}
