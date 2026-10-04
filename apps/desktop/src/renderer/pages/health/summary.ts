import type { HealthResult, HealthStatus, RepairId } from '@dualforge/shared';

export interface HealthSummary { worst: HealthStatus; errors: number; warnings: number; headline: string }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Banner / header-lamp summary: the worst status wins the colour; errors are "problems". */
export function healthSummary(results: readonly HealthResult[]): HealthSummary {
  const errors = results.filter((r) => r.status === 'error').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  if (results.length === 0) return { worst: 'warn', errors, warnings, headline: 'Checks did not run' };
  if (errors) return { worst: 'error', errors, warnings, headline: plural(errors, 'problem') + (warnings ? `, ${plural(warnings, 'warning')}` : '') };
  if (warnings) return { worst: 'warn', errors, warnings, headline: plural(warnings, 'warning') };
  return { worst: 'ok', errors, warnings, headline: 'All good' };
}

const RANK: Record<HealthStatus, number> = { error: 0, warn: 1, ok: 2 };
/** Problems first, then warnings, then the rest; order within a status is kept. */
export const bySeverity = (results: readonly HealthResult[]): HealthResult[] =>
  results.map((r, i) => ({ r, i })).sort((a, b) => RANK[a.r.status] - RANK[b.r.status] || a.i - b.i).map((x) => x.r);

export const REPAIR_LABELS: Record<RepairId, string> = {
  installViGEm: 'Install ViGEmBus', installHidHide: 'Install HidHide', enableHidHide: 'Enable HidHide', restartEngine: 'Restart engine',
  resetProfile: 'Reset profile…', clearLogs: 'Clear logs', openLogs: 'Open logs folder', exportBundle: 'Export diagnostics bundle',
};

export type DriverId = 'vigem' | 'hidhide';
export const DRIVER_FOR_REPAIR: Partial<Record<RepairId, DriverId>> = { installViGEm: 'vigem', installHidHide: 'hidhide' };
export const DRIVERS: Record<DriverId, { name: string; repo: string; what: string }> = {
  vigem: { name: 'ViGEmBus', repo: 'nefarius/ViGEmBus', what: 'the virtual Xbox controller driver' },
  hidhide: { name: 'HidHide', repo: 'nefarius/HidHide', what: 'the driver that hides the DualSense from games' },
};

export type LogLevel = 'all' | 'warn' | 'error';
export interface LogRow { key: number; level: number | null; time: string; label: string; code: string; text: string }

const LEVEL_NAMES: Record<number, string> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };
const SKIP = new Set(['level', 'time', 'pid', 'hostname', 'code', 'msg']);

/** One pino JSON line → a display row; anything unparseable is shown raw with no level. */
export function parseLogLine(line: string, key: number): LogRow {
  let o: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(line);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    o = v as Record<string, unknown>;
  } catch { return { key, level: null, time: '', label: '', code: '', text: line }; }
  const level = typeof o.level === 'number' ? o.level : null;
  const time = typeof o.time === 'number' ? new Date(o.time).toLocaleTimeString([], { hour12: false }) : '';
  const extra = Object.entries(o).filter(([k]) => !SKIP.has(k)).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  const text = [typeof o.msg === 'string' ? o.msg : '', ...extra].filter(Boolean).join(' ');
  return { key, level, time, label: level === null ? '' : (LEVEL_NAMES[level] ?? String(level)), code: typeof o.code === 'string' ? o.code : '', text };
}

export const passesFilter = (row: LogRow, f: LogLevel): boolean =>
  f === 'all' || (row.level !== null && row.level >= (f === 'warn' ? 40 : 50));
