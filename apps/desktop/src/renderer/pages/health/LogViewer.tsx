import { useCallback, useEffect, useRef, useState } from 'react';
import { Segmented } from '../../components/controls/Segmented';
import { FolderIcon } from '../../components/icons';
import { parseLogLine, passesFilter, type LogLevel, type LogRow } from './summary';

export const LOG_LINES = 200;
const LEVELS: { value: LogLevel; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'warn', label: 'Warnings' }, { value: 'error', label: 'Errors' }];
const levelClass = (l: number | null) => (l === null ? '' : l >= 50 ? 'error' : l >= 40 ? 'warn' : 'info');

/** The last 200 lines of today's log, newest at the bottom, filterable by level. */
export function LogViewer({ onOpenLogs }: { onOpenLogs(): void }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LogLevel>('all');
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setError('');
    window.dualforge.logs.tail(LOG_LINES).then(
      (t) => { setFile(t.file); setRows(t.lines.map(parseLogLine)); },
      (err: unknown) => setError(`The log could not be read (${String(err)}).`),
    );
  }, []);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((r) => passesFilter(r, filter));
  useEffect(() => { const el = panel.current; if (el) el.scrollTop = el.scrollHeight; }, [rows, filter]);

  return (
    <section className="hl-card" aria-labelledby="hl-title">
      <div className="hl-head">
        <h3 id="hl-title" className="hl-title">Log</h3>
        {file && <span className="hl-file mono">{file}</span>}
        <div className="hl-tools">
          <Segmented<LogLevel> label="Log level" options={LEVELS} value={filter} onChange={setFilter} />
          <button data-nav type="button" className="panel-btn" onClick={load}>Refresh</button>
          <button data-nav type="button" className="panel-btn with-icon" onClick={onOpenLogs}><FolderIcon size={16} />Open logs folder</button>
        </div>
      </div>
      {error && <p className="hc-err hl-msg" role="alert">{error}</p>}
      {/* a region, not role=log: a refresh of 200 lines must not be read out (aria-live off) */}
      <div className="hl-lines" role="region" aria-label="Recent log lines" aria-live="off" ref={panel} tabIndex={0}>
        <ol className="hl-list">
          {shown.map((r) => (
            <li key={r.key} className={`hl-line ${levelClass(r.level)}`}>
              <span className="hl-time">{r.time}</span>
              <span className="hl-level">{r.label}</span>
              <span className="hl-text">{r.code && <b className="hl-code">{r.code}</b>}{r.code && ' '}{r.text}</span>
            </li>
          ))}
        </ol>
      </div>
      {rows && shown.length === 0 && (
        <p className="hl-msg">{rows.length === 0 ? (file ? 'Today’s log is empty.' : 'No log has been written yet.') : 'No lines at this level in the last 200.'}</p>
      )}
    </section>
  );
}
