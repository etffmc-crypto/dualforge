import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { EngineEventSchema, type EngineCommand, type EngineEvent } from '@dualforge/shared';
import type { Logger } from 'pino';

const LOG_ONCE = new Set(['E_INJECT_LOAD']);

export function createEngineHost(opts: { onEvent: (e: EngineEvent) => void; log: Logger }) {
  let child: UtilityProcess | null = null;
  let restarts: number[] = [];
  let stopping = false;
  // Replayed to a respawned engine so it resumes with the current profile, settings and focus state.
  const last: {
    setProfile?: EngineCommand;
    setSettings?: EngineCommand;
    uiFocused?: EngineCommand;
  } = {};
  let restartTimer: NodeJS.Timeout | null = null;
  let killTimer: NodeJS.Timeout | null = null;
  // Codes that describe a permanent condition (a missing addon): every respawned engine re-reports them, but the log gets one line per run.
  const loggedOnce = new Set<string>();
  // Unplanned exits over the last hour (Health reads this) and children we killed on purpose (restart()).
  let exits: number[] = [];
  const intentional = new WeakSet<object>();

  function respawn() {
    spawn();
    for (const c of [last.setSettings, last.uiFocused, last.setProfile])
      if (c) child?.postMessage(c);
  }

  function spawn() {
    const thisChild = utilityProcess.fork(join(__dirname, 'engine-process.js'), [], {
      serviceName: 'dualforge-engine',
      stdio: 'pipe',
    });
    child = thisChild;
    child.stderr?.on('data', (d: Buffer) =>
      opts.log.warn({ code: 'ENGINE_STDERR', msg: d.toString().trim() }),
    );
    child.on('message', (m: unknown) => {
      const p = EngineEventSchema.safeParse(m);
      if (p.success) {
        if (p.data.type === 'error') {
          if (!LOG_ONCE.has(p.data.code) || !loggedOnce.has(p.data.code))
            opts.log.error({ code: p.data.code, msg: p.data.msg });
          loggedOnce.add(p.data.code);
        } else if (p.data.type === 'status')
          opts.log.info({
            code: 'ENGINE_STATUS',
            connected: p.data.connected,
            vigemReady: p.data.vigemReady,
          });
        opts.onEvent(p.data);
      } else opts.log.warn({ code: 'E_IPC_EVENT', msg: p.error.message });
    });
    child.on('exit', (code) => {
      if (child !== thisChild) return;
      opts.log.warn({ code: 'ENGINE_EXIT', exitCode: code });
      child = null;
      opts.onEvent({ type: 'status', connected: false, vigemReady: false });
      if (stopping) return;
      if (intentional.has(thisChild)) {
        respawn();
        return;
      }
      const now = Date.now();
      exits = exits.filter((t) => now - t < 3_600_000);
      exits.push(now);
      restarts = restarts.filter((t) => now - t < 60_000);
      restarts.push(now);
      if (restarts.length >= 5) {
        // the 5th crash within 60 s trips the limit
        const msg = 'engine crashed 5× in 60 s';
        opts.log.error({ code: 'E_ENGINE_RESTART_LIMIT', msg });
        opts.onEvent({ type: 'error', code: 'E_ENGINE_RESTART_LIMIT', msg });
        return;
      }
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (stopping) return;
        respawn();
      }, 500 * restarts.length);
    });
  }

  return {
    start() {
      stopping = false;
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }
      spawn();
    },
    send(cmd: EngineCommand) {
      if (cmd.type === 'setProfile' || cmd.type === 'setSettings' || cmd.type === 'uiFocused')
        last[cmd.type] = cmd;
      child?.postMessage(cmd);
    },
    /** Health snapshot: is a child running, and how many unplanned exits in the last hour. */
    stats() {
      const now = Date.now();
      return {
        alive: child !== null,
        restartsLastHour: exits.filter((t) => now - t < 3_600_000).length,
      };
    },
    /** User-requested restart: clears the crash window (so the restart limit can be left) and respawns at once. */
    restart() {
      stopping = false;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }
      restarts = [];
      const old = child;
      if (old) {
        intentional.add(old);
        old.kill();
      } else respawn();
    },
    stop() {
      stopping = true;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (killTimer) clearTimeout(killTimer);
      const c = child;
      c?.postMessage({ type: 'shutdown' } satisfies EngineCommand);
      killTimer = setTimeout(() => {
        killTimer = null;
        c?.kill();
      }, 500);
    },
  };
}
