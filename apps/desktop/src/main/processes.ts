import { execFile } from 'node:child_process';
import { MAX_EXE_LENGTH } from '@dualforge/shared';

/**
 * Windows and common background programs nobody would bind a profile to. Kept short on purpose: the picker has a
 * search box, so a stray helper process in the list costs nothing.
 */
const DENY = new Set([
  'system idle process', 'system', 'registry', 'secure system', 'memory compression',
  'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'lsaiso.exe', 'svchost.exe',
  'fontdrvhost.exe', 'dwm.exe', 'explorer.exe', 'sihost.exe', 'taskhostw.exe', 'runtimebroker.exe', 'ctfmon.exe',
  'conhost.exe', 'dllhost.exe', 'audiodg.exe', 'spoolsv.exe', 'wudfhost.exe', 'wmiprvse.exe', 'msmpeng.exe', 'nissrv.exe',
  'securityhealthservice.exe', 'securityhealthsystray.exe', 'smartscreen.exe', 'sgrmbroker.exe', 'searchhost.exe',
  'searchindexer.exe', 'searchprotocolhost.exe', 'searchfilterhost.exe', 'startmenuexperiencehost.exe',
  'shellexperiencehost.exe', 'textinputhost.exe', 'applicationframehost.exe', 'systemsettings.exe',
  'backgroundtaskhost.exe', 'useroobebroker.exe', 'lockapp.exe', 'widgets.exe', 'widgetservice.exe',
  'phoneexperiencehost.exe', 'crossdeviceresume.exe', 'tasklist.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe',
  'openconsole.exe', 'windowsterminal.exe', 'electron.exe', 'node.exe',
]);

/**
 * `tasklist /fo csv /nh` lines (`"name","pid","session name",…`) → lowercased exe basenames, deduped and sorted.
 * Processes in the non-interactive "Services" session are skipped: games always run in the user's session.
 */
export function parseTasklist(csv: string, alsoIgnore: readonly string[] = []): string[] {
  const ignore = new Set(alsoIgnore.map((n) => n.toLowerCase()));
  const names = new Set<string>();
  for (const line of csv.split(/\r?\n/)) {
    const m = /^"([^"]+)"(?:,"[^"]*","([^"]*)")?/.exec(line);
    const name = m?.[1]?.trim().toLowerCase();
    if (m?.[2] === 'Services') continue;
    if (!name || !name.endsWith('.exe') || name.length > MAX_EXE_LENGTH || DENY.has(name) || ignore.has(name)) continue;
    names.add(name);
  }
  return [...names].sort();
}

export type ExecText = (file: string, args: string[]) => Promise<string>;

const execText: ExecText = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

/** Lists running programs for the auto-switch "Pick running game" dialog. `alsoIgnore` holds DualForge's own exe. */
export function createProcessLister(exec: ExecText = execText, alsoIgnore: readonly string[] = []) {
  return async (): Promise<string[]> => parseTasklist(await exec('tasklist', ['/fo', 'csv', '/nh']), alsoIgnore);
}
