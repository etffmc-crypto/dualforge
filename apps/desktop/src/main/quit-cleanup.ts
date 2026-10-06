/**
 * The HidHide cloak-off that must finish before DualForge exits (so the DualSense is visible to games again), run at
 * most once per process: by `before-quit`, or earlier by "Install & restart" before the installer takes over. Capped
 * at `timeoutMs`; if it times out while this session cloaked the pad, E_HIDHIDE_CLOAK_STUCK is logged and the stuck
 * marker written so Health warns on the next start.
 */
export interface QuitCleanupDeps {
  /** HidHide's CLI is installed (no CLI: nothing to undo). */
  hasCli: () => boolean;
  /** Drains the HidHide queue and un-hides the pad (hidHideQueue.quitCleanup). */
  cloakOff: () => Promise<unknown> | null;
  cloakedThisSession: () => boolean;
  markStuck: (stuck: boolean) => void;
  log: { error(o: object): void };
  timeoutMs?: number;
}

export type QuitCleanupState = 'idle' | 'running' | 'done';

export function createQuitCleanup(d: QuitCleanupDeps) {
  let state: QuitCleanupState = 'idle';
  let promise: Promise<void> = Promise.resolve();

  /** Starts the cleanup (first call) or returns the one already running / finished. Never rejects. */
  function run(): Promise<void> {
    if (state !== 'idle') return promise;
    const cloakOff = d.hasCli() ? d.cloakOff() : null;
    if (!cloakOff) {
      state = 'done'; // no CLI, or nothing to undo
      return promise;
    }
    state = 'running';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((r) => {
      timer = setTimeout(() => r('timeout'), d.timeoutMs ?? 5000);
    });
    promise = Promise.race([cloakOff.then(() => 'done' as const), timeout])
      .then((how) => {
        if (how === 'timeout' && d.cloakedThisSession()) {
          d.log.error({ code: 'E_HIDHIDE_CLOAK_STUCK', msg: 'quit cloak-off timed out' });
          d.markStuck(true);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        state = 'done';
      });
    return promise;
  }

  return { run, state: (): QuitCleanupState => state };
}
export type QuitCleanup = ReturnType<typeof createQuitCleanup>;
