import { useEffect, useState } from 'react';
import { Segmented } from '../../components/controls/Segmented';
import { SectionLabel } from '../../components/controls/SectionLabel';
import { CopyIcon } from '../../components/icons';
import { useStore } from '../../store';
import { errorCode, flushEdits, slotOptions, useActiveId, type Slot } from './slots';

const MAX_CODE = 64 * 1024;

/** Share codes: copy the running profile's code; paste someone else's into a slot. */
export function ShareCard({ slots }: { slots: Slot[] }) {
  const activeId = useActiveId();
  const profile = useStore((s) => s.profile);
  const slotReplaced = useStore((s) => s.slotReplaced);
  const active = slots.find((s) => s.id === activeId) ?? slots[0]!;
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState('');
  const [target, setTarget] = useState<Slot['id']>(() => slots.find((s) => s.id !== activeId)!.id);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // the code is built in main from the saved profile, so send any pending edit first; refetch whenever the running profile changes
  useEffect(() => {
    if (!activeId) return;
    let live = true;
    flushEdits();
    window.dualforge.profiles.shareCode(activeId)
      .then((c) => { if (live) setCode(c); })
      .catch(() => { if (live) setCode(''); });
    return () => { live = false; };
  }, [activeId, profile]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => setCopied(true), (err: unknown) => useStore.setState({ lastError: { code: 'E_CLIPBOARD', msg: String(err) } }));
  };
  const importCode = async () => {
    const text = paste.trim();
    const slot = slots.find((s) => s.id === target)!;
    if (!text) { setResult({ ok: false, msg: 'Paste a code first. It starts with DUALFORGE:' }); return; }
    setBusy(true);
    try {
      const p = await window.dualforge.profiles.importShareCode(text, target);
      await slotReplaced(target);
      setPaste('');
      setResult({ ok: true, msg: `Imported into slot ${slot.n} as ${p.name}.` });
    } catch (err) {
      const bad = errorCode(err) === 'E_SHARE_CODE';
      setResult({ ok: false, msg: bad ? 'That is not a DualForge share code. Copy the whole code, from DUALFORGE: to the last character.' : `Import failed (${errorCode(err)}).` });
    } finally { setBusy(false); }
  };

  return (
    <section className="pf-card" aria-labelledby="pf-share">
      <h3 id="pf-share" className="pf-heading">Share code</h3>
      <div className="psec">
        <SectionLabel>Code for {active.name}</SectionLabel>
        <div className="psec-body">
          <textarea data-nav
            className="pf-code" readOnly rows={3} value={code} aria-label={`Share code for ${active.name}`}
            spellCheck={false} onFocus={(e) => e.currentTarget.select()}
          />
          <div className="pf-line">
            <span className="psec-hint">Anyone with DualForge can paste it to get this profile.</span>
            <button data-nav type="button" className="panel-btn with-icon" disabled={!code} onClick={copy}>
              <CopyIcon size={15} />{copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        </div>
      </div>
      <div className="psec">
        <SectionLabel>Import a code</SectionLabel>
        <div className="psec-body">
          <textarea data-nav
            className="pf-code" rows={3} value={paste} aria-label="Paste a share code" placeholder="DUALFORGE:…"
            spellCheck={false} maxLength={MAX_CODE} onChange={(e) => { setPaste(e.currentTarget.value); setResult(null); }}
          />
          <span className="pf-field-label" aria-hidden="true">Import into</span>
          <Segmented label="Import into" options={slotOptions(slots)} value={target} onChange={(v) => { setTarget(v); setResult(null); }} />
          <div className="pf-line">
            {result
              ? <span className={result.ok ? 'pf-ok' : 'pf-err'} role={result.ok ? undefined : 'alert'}>{result.msg}</span>
              : <span className="psec-hint">Everything in the chosen slot is replaced.</span>}
            <button data-nav type="button" className="panel-btn primary" disabled={busy} onClick={() => void importCode()}>Import code</button>
          </div>
        </div>
      </div>
    </section>
  );
}
