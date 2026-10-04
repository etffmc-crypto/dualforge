import type { HealthResult } from '@dualforge/shared';

export interface HealthInput {
  vigem: { serviceState: 'running' | 'stopped' | 'missing' | 'unknown'; busDevicePresent: boolean };
  /** `whitelisted` is null when the CLI call failed (unknown). */
  hidhide: {
    installed: boolean;
    cliPath: string | null;
    whitelisted: boolean | null;
    deviceHidden: boolean;
  };
  /** `highestSeenHz` is the best report rate observed this session (kept by the service). */
  device: {
    present: boolean;
    reportHz: number;
    highestSeenHz: number;
    source: 'device' | 'replay';
  };
  engine: { alive: boolean; restartsLastHour: number; p99Ms: number; lastErrorCodes: string[] };
  profiles: { slot: string; status: 'ok' | 'quarantined' | 'default' }[];
  disk: { logBytes: number; logFiles: number };
  app: { version: string; updateAvailable: boolean | null };
  inject: {
    available: boolean;
    foregroundElevated: boolean | null;
    ownElevated: boolean | null;
    foregroundSeen?: { name: string; ageS: number } | null;
  };
}

export const MIN_REPORT_HZ = 800;
export const REPORT_DROP_RATIO = 0.5;
export const P99_WARN_MS = 2;
export const LOG_WARN_BYTES = 200 * 1024 * 1024;
export const RESTART_LIMIT_PER_HOUR = 5;

const ok = (id: string, title: string, detail: string): HealthResult => ({
  id,
  status: 'ok',
  title,
  detail,
});

/** Pure: turns gathered facts into the list the Health page shows. No I/O, no clocks. */
export function runChecks(i: HealthInput): HealthResult[] {
  const out: HealthResult[] = [];

  // ViGEmBus
  const v = i.vigem;
  if (v.serviceState === 'missing')
    out.push({
      id: 'vigem',
      status: 'error',
      title: 'ViGEmBus driver missing',
      detail:
        'DualForge needs the ViGEmBus driver to present a virtual Xbox 360 controller to games.',
      repair: 'installViGEm',
    });
  else if (v.serviceState === 'stopped')
    out.push({
      id: 'vigem',
      status: 'error',
      title: 'ViGEmBus service stopped',
      detail:
        'The ViGEmBus service is installed but not running. Restart the PC or repair the driver.',
      repair: 'installViGEm',
    });
  else if (v.serviceState === 'unknown')
    out.push({
      id: 'vigem',
      status: 'warn',
      title: 'ViGEmBus state unknown',
      detail: 'The driver state could not be queried (see the log for E_HEALTH_* codes).',
    });
  else if (!v.busDevicePresent)
    out.push({
      id: 'vigem',
      status: 'warn',
      title: 'ViGEmBus device not found',
      detail:
        'The service is running but the "Nefarius Virtual Gamepad Emulation Bus" device is not present in Device Manager.',
      repair: 'installViGEm',
    });
  else
    out.push(
      ok('vigem', 'ViGEmBus ready', 'The virtual controller driver is installed and running.'),
    );

  // HidHide
  const h = i.hidhide;
  if (!h.installed)
    out.push({
      id: 'hidhide',
      status: 'warn',
      title: 'HidHide not installed',
      detail:
        'Optional, but without it games also see the physical DualSense next to the virtual Xbox pad and may double-count input.',
      repair: 'installHidHide',
    });
  else if (h.whitelisted === null)
    out.push({
      id: 'hidhide',
      status: 'warn',
      title: 'HidHide state unknown',
      detail:
        'HidHide is installed but its application list could not be read (see the log for health error codes).',
    });
  else if (!h.whitelisted)
    out.push({
      id: 'hidhide',
      status: 'warn',
      title: 'DualForge is not allowed through HidHide',
      detail:
        'HidHide is installed but DualForge is not on its application list, so it cannot read the hidden pad.',
      repair: 'enableHidHide',
    });
  else if (!h.deviceHidden)
    out.push({
      id: 'hidhide',
      status: 'warn',
      title: 'DualSense not hidden from games',
      detail: 'HidHide is installed but the DualSense is not hidden, so games can see both pads.',
      repair: 'enableHidHide',
    });
  else
    out.push(
      ok(
        'hidhide',
        'HidHide active',
        'The DualSense is hidden from games; only the virtual pad is visible.',
      ),
    );

  // Device
  const d = i.device;
  if (d.source === 'replay')
    out.push(
      ok('device', 'Replaying a recording', 'Input comes from a .hidlog, not a controller.'),
    );
  else if (!d.present)
    out.push({
      id: 'device',
      status: 'warn',
      title: 'No DualSense connected',
      detail:
        'Connect the controller over USB. Another program holding it exclusively also causes this.',
    });
  else out.push(ok('device', 'DualSense connected', 'The controller is sending input.'));

  // Report rate (only meaningful for a live pad)
  if (d.source === 'device' && d.present) {
    const low = d.reportHz < MIN_REPORT_HZ;
    const dropped = d.highestSeenHz > 0 && d.reportHz < REPORT_DROP_RATIO * d.highestSeenHz;
    if (low || dropped) {
      out.push({
        id: 'reportRate',
        status: 'warn',
        title: 'Report rate is low',
        detail: `The pad is reporting ${Math.round(d.reportHz)} Hz (best this session ${Math.round(d.highestSeenHz)} Hz). A healthy DualSense on this setup runs at 8 kHz (a standard pad at 1 kHz); try another USB port or cable, and avoid hubs.`,
      });
    } else out.push(ok('reportRate', 'Report rate healthy', `${Math.round(d.reportHz)} Hz.`));
  }

  // Engine
  const e = i.engine;
  const limitTripped =
    e.lastErrorCodes.includes('E_ENGINE_RESTART_LIMIT') ||
    e.restartsLastHour >= RESTART_LIMIT_PER_HOUR;
  if (!e.alive)
    out.push({
      id: 'engine',
      status: 'error',
      title: 'Engine not running',
      detail: 'The input engine process is not running, so nothing is being translated.',
      repair: 'restartEngine',
    });
  else if (limitTripped)
    out.push({
      id: 'engine',
      status: 'error',
      title: 'Engine keeps crashing',
      detail: `The engine restarted ${e.restartsLastHour} times in the last hour and hit its restart limit.`,
      repair: 'restartEngine',
    });
  else if (e.restartsLastHour > 0)
    out.push({
      id: 'engine',
      status: 'warn',
      title: 'Engine restarted recently',
      detail: `The engine restarted ${e.restartsLastHour} time(s) in the last hour.`,
      repair: 'restartEngine',
    });
  else out.push(ok('engine', 'Engine running', 'No restarts in the last hour.'));

  if (e.p99Ms > P99_WARN_MS)
    out.push({
      id: 'latency',
      status: 'warn',
      title: 'Pipeline latency is high',
      detail: `99th-percentile processing time is ${e.p99Ms.toFixed(2)} ms (limit ${P99_WARN_MS} ms). Close CPU-heavy programs.`,
    });
  else
    out.push(ok('latency', 'Pipeline latency good', `99th percentile ${e.p99Ms.toFixed(2)} ms.`));

  // Profiles
  const bad = i.profiles.filter((p) => p.status === 'quarantined');
  for (const p of bad)
    out.push({
      id: `profile.${p.slot}`,
      status: 'warn',
      title: `Profile ${p.slot} was corrupt`,
      detail:
        'The file failed validation and was moved aside to profiles/corrupt; defaults are in use. Reset the slot to clear this.',
      repair: 'resetProfile',
      repairArg: p.slot,
    });
  if (bad.length === 0) out.push(ok('profiles', 'Profiles healthy', 'All profile slots loaded.'));

  // Logs
  if (i.disk.logBytes > LOG_WARN_BYTES)
    out.push({
      id: 'logs',
      status: 'warn',
      title: 'Logs are large',
      detail: `${(i.disk.logBytes / 1048576).toFixed(0)} MB in ${i.disk.logFiles} files.`,
      repair: 'clearLogs',
    });
  else
    out.push(
      ok(
        'logs',
        'Logs small',
        `${(i.disk.logBytes / 1048576).toFixed(1)} MB in ${i.disk.logFiles} files.`,
      ),
    );

  // Key and mouse injection
  const fs = i.inject.foregroundSeen;
  const seen = fs ? ` (last seen: ${fs.name}, ${fs.ageS}s ago)` : '';
  if (!i.inject.available)
    out.push({
      id: 'inject',
      status: 'warn',
      title: 'Keyboard and mouse output unavailable',
      detail:
        'The native input addon did not load (E_INJECT_LOAD). Key/mouse mappings and per-game profiles are disabled.',
    });
  else if (i.inject.foregroundElevated === true && i.inject.ownElevated !== true)
    out.push({
      id: 'inject',
      status: 'warn',
      title: 'Foreground program is elevated',
      detail: `Keys and mouse can't be injected into an elevated (administrator) game${seen}. Run DualForge as administrator or the game without it.`,
    });
  else
    out.push(ok('inject', 'Keyboard and mouse output ready', 'The native input addon is loaded.'));

  // App
  if (i.app.updateAvailable === true)
    out.push({
      id: 'app',
      status: 'warn',
      title: 'Update available',
      detail: `A newer version than ${i.app.version} is available.`,
    });
  else out.push(ok('app', `DualForge ${i.app.version}`, 'Up to date, or update checks are off.'));

  return out;
}
