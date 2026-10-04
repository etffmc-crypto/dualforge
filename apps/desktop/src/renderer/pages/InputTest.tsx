import { DS_BUTTONS } from '@dualforge/shared';
import { Card } from '../components/Card';
import { StickLive } from '../components/controls/StickLive';
import { TriggerBar } from '../components/TriggerBar';
import { useStore } from '../store';

export function InputTest() {
  const s = useStore((st) => st.snapshot);
  const p = useStore((st) => st.profile);
  const dz = (side: 'left' | 'right') => p?.sticks[side].deadzone ?? { center: 0, outer: 0 };
  const raw = s?.raw ?? { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {} as Record<string, boolean>, gyro: { x: 0, y: 0, z: 0 } };
  const out = s?.out ?? { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} as Record<string, boolean> };
  return (
    <div className="input-test">
      <Card title="Sticks (grey = raw, red = processed)">
        <div className="stick-row">
          <StickLive label="Left" raw={{ x: raw.lx, y: raw.ly }} out={{ x: out.lx, y: out.ly }} deadzone={dz('left')} />
          <StickLive label="Right" raw={{ x: raw.rx, y: raw.ry }} out={{ x: out.rx, y: out.ry }} deadzone={dz('right')} />
        </div>
      </Card>
      <Card title="Triggers">
        <TriggerBar label="L2 raw" value={raw.l2} /><TriggerBar label="LT out" value={out.lt} />
        <TriggerBar label="R2 raw" value={raw.r2} /><TriggerBar label="RT out" value={out.rt} />
        <div className="mono" style={{ marginTop: 12 }}>Gyro {raw.gyro.x} / {raw.gyro.y} / {raw.gyro.z}</div>
      </Card>
      <Card title="Buttons" className="span2">
        <div className="btn-grid">
          {DS_BUTTONS.map((b) => <div key={b} className={`cell ${raw.buttons[b] ? 'on' : ''}`}>{b}</div>)}
        </div>
      </Card>
      <Card title="Virtual Xbox output" className="span2">
        <div className="btn-grid">
          {Object.entries(out.buttons).map(([b, v]) => <div key={b} className={`cell ${v ? 'on' : ''}`}>{b}</div>)}
        </div>
        <div className="mono" style={{ marginTop: 8 }}>Report rate {Math.round(s?.reportHz ?? 0)} Hz · p99 {(s?.pipelineP99Ms ?? 0).toFixed(2)} ms</div>
      </Card>
    </div>
  );
}
