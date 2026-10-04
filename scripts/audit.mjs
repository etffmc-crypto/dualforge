// Blocking: npm audit (prod deps, high+). Non-blocking: npm outdated (printed only).
import { spawnSync } from 'node:child_process';

const run = (args) => spawnSync('npm', args, { stdio: 'inherit', shell: true });

const audit = run(['audit', '--omit=dev', '--audit-level=high']);
console.log('\n--- npm outdated (informational, never fails) ---');
run(['outdated']);
if (audit.status !== 0) {
  console.error('\nnpm audit found high/critical vulnerabilities in production dependencies.');
  process.exit(audit.status ?? 1);
}
