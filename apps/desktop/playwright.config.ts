import { defineConfig } from '@playwright/test';
// One worker: the app holds a single-instance lock, so two Electron launches at once would make the second quit.
export default defineConfig({ testDir: './e2e', timeout: 60_000, retries: 0, workers: 1 });
