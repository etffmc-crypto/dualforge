import { readFileSync } from 'node:fs';
import { entryBytes, parseHidlog } from '@dualforge/engine';
import type { InputSource } from './engine-loop.js';

export function createReplaySource(path: string, loop = true): InputSource {
  const log = parseHidlog(readFileSync(path, 'utf8'));
  let timer: NodeJS.Timeout | null = null;
  return {
    start(onReport, onStatus) {
      if (log.length === 0) { onStatus(false); return; }
      let i = 0; const t0 = performance.now();
      onStatus(true);
      timer = setInterval(() => {
        const e = log[i]!;
        onReport(entryBytes(e), t0 + e.t);
        i++;
        if (i >= log.length) { if (loop) i = 0; else { if (timer) clearInterval(timer); onStatus(false); } }
      }, 1);
    },
    async write() { /* no device */ },
    async stop() { if (timer) clearInterval(timer); },
  };
}
