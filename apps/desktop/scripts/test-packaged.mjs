// Runs the packaged-app smoke (needs `npm run dist` first). Sets the guard env var portably.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['playwright', 'test', 'e2e/packaged.spec.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DUALFORGE_PACKAGED_E2E: '1' },
});
process.exit(r.status ?? 1);
