import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Workspace packages ship TypeScript sources, so they must be bundled, not externalized.
const bundled = ['@dualforge/engine', '@dualforge/shared'];
// Single source of truth for the version shown in the footer.
const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
  version: string;
};
// The optional update check only makes sense once electron-builder.yml publishes to a real GitHub owner; while it
// still names the `dualforge` placeholder the Settings switch and `updates:check` stay hidden/disabled.
const publishOwner = /^\s*owner:\s*['"]?([^'"\s#]+)/m.exec(
  readFileSync(resolve(__dirname, 'electron-builder.yml'), 'utf8'),
)?.[1];
const updatesEnabled = !!publishOwner && publishOwner !== 'dualforge';
const updatesDefine = { __UPDATES_ENABLED__: JSON.stringify(updatesEnabled) };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    define: updatesDefine,
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'engine-process': resolve(__dirname, 'src/main/engine-process.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    // Sandboxed preload scripts must be CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } },
  },
  renderer: {
    root: __dirname,
    build: { rollupOptions: { input: resolve(__dirname, 'index.html') } },
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(rootPkg.version), ...updatesDefine },
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
  },
});
