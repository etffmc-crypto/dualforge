import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { EngineEventSchema, type EngineCommand, type EngineEvent } from '@dualforge/shared';
import type { Logger } from 'pino';

export function createEngineHost(opts: { onEvent: (e: EngineEvent) => void; log: Logger }) {
  let child: UtilityProcess | null = null;
  let restarts: number[] = [];
  let stopping = false;
  // Replayed to a respawned engine so it resumes with the current profile, settings and focus state.
  const last: { setProfile?: EngineCommand; setSettings?: EngineCommand; uiFocused?: EngineCommand } = {};
  let restartTimer: NodeJS.Timeout | null = null;
  let killTimer: NodeJS.Timeout | null = null;

  function spawn() {
    const thisChild = utilityProcess.fork(join(__dirname, 'engine-process.js'), [], { serviceName: 'dualforge-engine', stdio: 'pipe' });
    child = thisChild;
    child.stderr?.on('data', (d: Buffer) => opts.log.warn({ code: 'ENGINE_STDERR', msg: d.toString().trim() }));
    child.on('message', (m: unknown) => {
      const p = EngineEventSchema.safeParse(m);
      if (p.success) {
        if (p.data.type === 'error') opts.log.error({ code: p.data.code, msg: p.data.msg });
        else if (p.data.type === 'status') opts.log.info({ code: 'ENGINE_STATUS', connected: p.data.connected, vigemReady: p.data.vigemReady });
        opts.onEvent(p.data);
      }
      else opts.log.warn({ code: 'E_IPC_EVENT', msg: p.error.message });
    });
    child.on('exit', (code) => {
      if (child !== thisChild) return;
      opts.log.warn({ code: 'ENGINE_EXIT', exitCode: code });
      child = null;
      opts.onEvent({ type: 'status', connected: false, vigemReady: false });
      if (stopping) return;
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 60_000);
      restarts.push(now);
      if (restarts.length >= 5) {   // the 5th crash within 60 s trips the limit
        const msg = 'engine crashed 5× in 60 s';
        opts.log.error({ code: 'E_ENGINE_RESTART_LIMIT', msg });
        opts.onEvent({ type: 'error', code: 'E_ENGINE_RESTART_LIMIT', msg });
        return;
      }
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (stopping) return;
        spawn();
        for (const c of [last.setSettings, last.uiFocused, last.setProfile]) if (c) child?.postMessage(c);
      }, 500 * restarts.length);
    });
  }

  return {
    start() {
      stopping = false;
      if (killTimer) { clearTimeout(killTimer); killTimer = null; }
      spawn();
    },
    send(cmd: EngineCommand) {
      if (cmd.type === 'setProfile' || cmd.type === 'setSettings' || cmd.type === 'uiFocused') last[cmd.type] = cmd;
      child?.postMessage(cmd);
    },
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
