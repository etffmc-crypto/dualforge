import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['packages/engine/src/**/*.ts'],
      thresholds: { lines: 85, branches: 80 },
    },
  },
});
