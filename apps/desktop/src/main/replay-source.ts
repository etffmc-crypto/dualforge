import { readFileSync } from 'node:fs';
import { entryBytes, parseHidlog } from '@dualforge/engine';
import type { InputSource } from './engine-loop.js';

export function createReplaySource(path: string, loop = true): InputSource {
  const log = parseHidlog(readFileSync(path, 'utf8'));
  let timer: NodeJS.Timeout | null = null;
  return {
    kind: 'replay',
    start(onReport, onStatus) {
      if (log.length === 0) {
        onStatus(false);
        return;
      }
      // Release each report at its recorded time (relative to the first entry).
      // A looped replay shifts every pass by one pass length, so the timestamps
      // handed to the engine keep increasing instead of jumping back to 0.
      const first = log[0]!.t;
      const span = Math.max(1, log[log.length - 1]!.t - first + 1);
      let i = 0;
      let pass = 0;
      const t0 = performance.now();
      onStatus(true);
      timer = setInterval(() => {
        const elapsed = performance.now() - t0;
        while (i < log.length) {
          const e = log[i]!;
          const at = pass * span + (e.t - first);
          if (at > elapsed) return;
          onReport(entryBytes(e), t0 + at);
          i++;
        }
        if (loop) {
          i = 0;
          pass++;
        } else {
          if (timer) clearInterval(timer);
          onStatus(false);
        }
      }, 1);
    },
    async write() {
      /* no device */
    },
    async stop() {
      if (timer) clearInterval(timer);
    },
  };
}
