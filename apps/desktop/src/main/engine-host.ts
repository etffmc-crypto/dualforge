import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { EngineEventSchema, type EngineCommand, type EngineEvent } from '@dualforge/shared';
import type { Logger } from 'pino';

export function createEngineHost(opts: { onEvent: (e: EngineEvent) => void; log: Logger }) {
  let child: UtilityProcess | null = null;
  let restarts: number[] = [];
  let stopping = false;
  let lastProfileCmd: EngineCommand | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let killTimer: NodeJS.Timeout | null = null;

  function spawn() {
    child = utilityProcess.fork(join(__dirname, 'engine-process.js'), [], { serviceName: 'dualforge-engine', stdio: 'pipe' });
    child.stderr?.on('data', (d: Buffer) => opts.log.warn({ code: 'ENGINE_STDERR', msg: d.toString().trim() }));
    child.on('message', (m: unknown) => {
      const p = EngineEventSchema.safeParse(m);
      if (p.success) { if (p.data.type === 'error') opts.log.error({ code: p.data.code, msg: p.data.msg }); opts.onEvent(p.data); }
      else opts.log.warn({ code: 'E_IPC_EVENT', msg: p.error.message });
    });
    child.on('exit', (code) => {
      opts.log.warn({ code: 'ENGINE_EXIT', exitCode: code });
      child = null;
      if (stopping) return;
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 60_000);
      if (restarts.length >= 5) { opts.onEvent({ type: 'error', code: 'E_ENGINE_RESTART_LIMIT', msg: 'engine crashed 5× in 60 s' }); return; }
      restarts.push(now);
      setTimeout(() => { spawn(); if (lastProfileCmd) child?.postMessage(lastProfileCmd); }, 500 * restarts.length);
    });
  }

  return {
    start() { stopping = false; spawn(); },
    send(cmd: EngineCommand) { if (cmd.type === 'setProfile') lastProfileCmd = cmd; child?.postMessage(cmd); },
    stop() {
      stopping = true;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      if (killTimer) clearTimeout(killTimer);
      const c = child;
      c?.postMessage({ type: 'shutdown' } satisfies EngineCommand);
      killTimer = setTimeout(() => { killTimer = null; c?.kill(); }, 500);
    },
  };
}
