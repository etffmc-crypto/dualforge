import { EngineCommandSchema, type EngineEvent } from '@dualforge/shared';
import { createEngineLoop } from './engine-loop.js';
import { createDeviceSource } from './device-source.js';
import { createReplaySource } from './replay-source.js';
import { createViGEmSink } from './vigem-sink.js';
import { createInjector } from './injector.js';

const port = process.parentPort;
const emit = (e: EngineEvent) => port.postMessage(e);

const injector = createInjector((code, msg) => emit({ type: 'error', code, msg }));
const loop = createEngineLoop({ source: createDeviceSource(), sink: createViGEmSink(), emit, now: () => performance.now(), injector });

port.on('message', (m) => {
  const parsed = EngineCommandSchema.safeParse(m.data);
  if (!parsed.success) { emit({ type: 'error', code: 'E_IPC_COMMAND', msg: parsed.error.message }); return; }
  const c = parsed.data;
  switch (c.type) {
    case 'setProfile': loop.setProfile(c.profile); break;
    case 'setSettings': loop.setSettings(c.settings); break;
    case 'uiFocused': loop.setUiFocused(c.focused); break;
    case 'runMacro': loop.runMacro(c.id); break;
    case 'replay':
      void (async () => {
        try { await loop.swapSource(createReplaySource(c.path, true)); }
        catch (e) { emit({ type: 'error', code: 'E_REPLAY_OPEN', msg: (e as Error).message }); }
      })();
      break;
    case 'useDevice':
      void loop.swapSource(createDeviceSource()).catch((e: unknown) => emit({ type: 'error', code: 'E_ENGINE_SWAP', msg: (e as Error).message }));
      break;
    case 'shutdown': void (async () => { await loop.stop(); process.exit(0); })(); break;
  }
});
void loop.start();
process.on('uncaughtException', (e) => { try { loop.releaseAll(); } catch { /* best effort */ }
  emit({ type: 'error', code: 'E_ENGINE_UNCAUGHT', msg: e.message }); process.exit(1); });
