import { DualSenseTop } from '../art/DualSenseTop';
import { useStore } from '../store';
import { Battery } from '../components/Battery';

export function Home() {
  const s = useStore((st) => st.snapshot);
  const p = useStore((st) => st.profile);
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
        {connected ? `Connected · ${s?.source === 'replay' ? 'Replay' : 'USB'} · Battery ${s?.battery.percent ?? 0}%` : 'Select controller — plug in a DualSense over USB'}
      </p>
      <div className="status-row">
        <span className={`chip ${connected ? 'ok' : 'bad'}`}>Controller {connected ? 'detected' : 'not found'}</span>
        <span className={`chip ${s?.vigemReady ? 'ok' : 'bad'}`}>ViGEm {s?.vigemReady ? 'ready' : 'unavailable'}</span>
        <span className="chip">Report rate {Math.round(s?.reportHz ?? 0)} Hz</span>
        <span className="chip">Pipeline p99 {(s?.pipelineP99Ms ?? 0).toFixed(2)} ms</span>
      </div>
      {!s?.vigemReady && (
        <p className="home-hint">Install the ViGEmBus driver to enable the virtual Xbox controller. Lights, triggers and live view still work without it.</p>
      )}
    </div>
  );
}
