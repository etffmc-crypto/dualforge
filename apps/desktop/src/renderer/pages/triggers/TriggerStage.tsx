import type { TriggerConfig } from '@dualforge/shared';
import { DualSenseTop } from '../../art/DualSenseTop';
import { LiveCurve, presetPreview } from '../../components/LiveCurve';
import { TriggerBar } from '../../components/TriggerBar';
import { useStore, type Side } from '../../store';

/** Right-hand render area for the Triggers page: curve square, raw vs output bars, and the controller. */
export function TriggerStage({ side, cfg }: { side: Side; cfg: TriggerConfig }) {
  const s = useStore((st) => st.snapshot);
  const lights = useStore((st) => st.profile?.lights);
  const L = side === 'left';
  const raw = s ? (L ? s.raw.l2 : s.raw.r2) : 0;
  const out = s ? (L ? s.out.lt : s.out.rt) : 0;
  return (
    <div className="stage">
      <div className="stage-top">
        <LiveCurve points={presetPreview(cfg.curve)} input={raw} output={out} caption={`${L ? 'L2' : 'R2'} response`} />
        <div className="stage-bars">
          <TriggerBar label={L ? 'L2 raw' : 'R2 raw'} value={raw} />
          <TriggerBar label={L ? 'LT out' : 'RT out'} value={out} />
          <div className="stage-caption">Pull {L ? 'L2' : 'R2'} to see the output after deadzone, hair trigger and curve.</div>
        </div>
      </div>
      <div className="stage-pad">
        <DualSenseTop
          pressed={s?.raw.buttons ?? {}} lightbar={lights ?? { r: 0, g: 80, b: 255 }}
          sticks={s ? { lx: s.raw.lx, ly: s.raw.ly, rx: s.raw.rx, ry: s.raw.ry } : undefined} playerLeds={lights?.playerLeds ?? 0}
        />
      </div>
    </div>
  );
}
