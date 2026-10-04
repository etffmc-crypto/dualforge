import { Card } from '../components/Card';
import { DualSenseTop } from '../art/DualSenseTop';
import { useStore } from '../store';

export function Home() {
  const s = useStore((st) => st.snapshot);
  const p = useStore((st) => st.profile);
  const lastError = useStore((st) => st.lastError);
  const connected = s?.connected ?? false;
  return (
    <div className="home">
      <Card>
        <DualSenseTop pressed={s?.raw.buttons ?? {}} lightbar={p?.lights ?? { r: 0, g: 80, b: 255 }} />
        <h2 style={{ textAlign: 'center', margin: '8px 0 4px' }}>DualSense</h2>
        <p style={{ textAlign: 'center', color: 'var(--muted)', margin: 0 }}>
          {connected ? `Connected · USB · Battery ${s?.battery.percent ?? 0}% ${s?.battery.state === 'charging' ? '⚡' : ''}` : 'Select controller — plug in a DualSense over USB'}
        </p>
      </Card>
      <Card title="Status">
        <div className="status-row">
          <span className={`chip ${connected ? 'ok' : 'bad'}`}>Controller {connected ? 'detected' : 'not found'}</span>
          <span className={`chip ${s?.vigemReady ? 'ok' : 'bad'}`}>ViGEm {s?.vigemReady ? 'ready' : 'unavailable'}</span>
          <span className="chip">Report rate {Math.round(s?.reportHz ?? 0)} Hz</span>
          <span className="chip">Pipeline p99 {(s?.pipelineP99Ms ?? 0).toFixed(2)} ms</span>
          {lastError && <span className="chip bad">{lastError.code}</span>}
        </div>
        {!s?.vigemReady && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Install the ViGEmBus driver to enable the virtual Xbox controller. Lights, triggers and live view still work without it.</p>}
      </Card>
    </div>
  );
}
