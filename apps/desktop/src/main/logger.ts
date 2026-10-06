import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { logDirFor, resolveDataDir } from './data-dir.js';

const dir = logDirFor(resolveDataDir(app.getPath('appData')));
mkdirSync(dir, { recursive: true });

export const logger = pino(
  { level: 'info', base: { pid: process.pid } },
  pino.transport({
    target: 'pino-roll',
    options: {
      file: join(dir, 'app'),
      extension: '.log',
      frequency: 'daily',
      size: '10m',
      limit: { count: 14 },
      mkdir: true,
    },
  }),
);
export const LOG_DIR = dir;
