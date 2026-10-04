import { EngineCommandSchema, type EngineEvent } from '@dualforge/shared';
import { createEngineLoop } from './engine-loop.js';
import { createDeviceSource } from './device-source.js';
import { createReplaySource } from './replay-source.js';
import { createViGEmSink } from './vigem-sink.js';

const port = process.parentPort;
const emit = (e: EngineEvent) => port.postMessage(e);

const loop = createEngineLoop({ source: createDeviceSource(), sink: createViGEmSink(), emit, now: () => performance.now() });

port.on('message', (m) => {
  const parsed = EngineCommandSchema.safeParse(m.data);
  if (!parsed.success) { emit({ type: 'error', code: 'E_IPC_COMMAND', msg: parsed.error.message }); return; }
  const c = parsed.data;
  switch (c.type) {
    case 'setProfile': loop.setProfile(c.profile); break;
    case 'replay': loop.swapSource(createReplaySource(c.path, true)); break;
    case 'useDevice': loop.swapSource(createDeviceSource()); break;
    case 'shutdown': loop.stop(); process.exit(0);
  }
});
void loop.start();
process.on('uncaughtException', (e) => { emit({ type: 'error', code: 'E_ENGINE_UNCAUGHT', msg: e.message }); process.exit(1); });
