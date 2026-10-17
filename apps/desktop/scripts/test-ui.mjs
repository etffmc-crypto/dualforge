// Builds and runs the UI e2e suite against a dormant (no Pro provider) build. A filled F:\DualForge\.env.licensing would
// otherwise bake the real store in and Pro-gate the pages the suite drives. Sets the env var portably.
import { spawnSync } from 'node:child_process';
const env = { ...process.env, DUALFORGE_LS_IGNORE_FILE: '1' };
for (const k of Object.keys(env))
  if (k.startsWith('DUALFORGE_LS_') && k !== 'DUALFORGE_LS_IGNORE_FILE') delete env[k];
for (const cmd of ['electron-vite build', 'playwright test']) {
  const r = spawnSync(`npx ${cmd}`, { stdio: 'inherit', shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
