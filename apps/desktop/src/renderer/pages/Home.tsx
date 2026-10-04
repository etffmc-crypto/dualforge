import { DualSenseTop } from '../art/DualSenseTop';
import { useStore } from '../store';

function Battery({ percent, charging }: { percent: number; charging: boolean }) {
  return (
    <span className={`battery${charging ? ' charging' : ''}`} title={`Battery ${percent}%`}>
      <span className="battery-fill" style={{ width: `${Math.max(8, Math.min(100, percent))}%` }} />
      {charging && <span className="battery-bolt" aria-hidden="true">⚡</span>}
    </span>
  );
}

export function Home() {
  const s = useStore((st) => st.snapshot);
  const p = useStore((st) => st.profile);
  const lastError = useStore((st) => st.lastError);
  const connected = s?.connected ?? false;
  return (
    <div className="home">
      <div className="home-stage">
        <DualSenseTop
          pressed={s?.raw.buttons ?? {}}
          lightbar={p?.lights ?? { r: 0, g: 80, b: 255 }}
          sticks={s ? { lx: s.raw.lx, ly: s.raw.ly, rx: s.raw.rx, ry: s.raw.ry } : undefined}
          playerLeds={p?.lights.playerLeds ?? 0}
        />
      </div>
      <h2 className="home-name">
        DUALSENSE {connected && s && <Battery percent={s.battery.percent} charging={s.battery.state === 'charging'} />}
      </h2>
      <p className="home-status">
        {connected ? `Connected · USB · Battery ${s?.battery.percent ?? 0}%` : 'Select controller — plug in a DualSense over USB'}
      </p>
      <div className="status-row">
        <span className={`chip ${connected ? 'ok' : 'bad'}`}>Controller {connected ? 'detected' : 'not found'}</span>
        <span className={`chip ${s?.vigemReady ? 'ok' : 'bad'}`}>ViGEm {s?.vigemReady ? 'ready' : 'unavailable'}</span>
        <span className="chip">Report rate {Math.round(s?.reportHz ?? 0)} Hz</span>
        <span className="chip">Pipeline p99 {(s?.pipelineP99Ms ?? 0).toFixed(2)} ms</span>
        {lastError && <span className="chip bad" title={lastError.msg}>{lastError.code}</span>}
      </div>
      {!s?.vigemReady && (
        <p className="home-hint">Install the ViGEmBus driver to enable the virtual Xbox controller. Lights, triggers and live view still work without it.</p>
      )}
    </div>
  );
}
