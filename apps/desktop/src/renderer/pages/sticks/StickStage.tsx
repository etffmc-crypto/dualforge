import type { StickConfig } from '@dualforge/shared';
import { DualSenseTop } from '../../art/DualSenseTop';
import { StickLive } from '../../components/controls/StickLive';
import { LiveCurve, presetPreview, previewPoints } from '../../components/LiveCurve';
import { useStore, type Side } from '../../store';

const mag = (x: number, y: number) => Math.min(1, Math.hypot(x, y));

/** Right-hand render area for the Sticks page: curve square, live stick view and the controller. */
export function StickStage({ side, cfg }: { side: Side; cfg: StickConfig }) {
  const s = useStore((st) => st.snapshot);
  const lights = useStore((st) => st.profile?.lights);
  const L = side === 'left';
  const raw = s ? (L ? { x: s.raw.lx, y: s.raw.ly } : { x: s.raw.rx, y: s.raw.ry }) : { x: 0, y: 0 };
  const out = s ? (L ? { x: s.out.lx, y: s.out.ly } : { x: s.out.rx, y: s.out.ry }) : { x: 0, y: 0 };
  const name = L ? 'Left stick' : 'Right stick';
  const points = cfg.curve.kind === 'custom' ? previewPoints(cfg.curve.points) : presetPreview(cfg.curve.preset);
  return (
    <div className="stage">
      <div className="stage-top">
        <LiveCurve points={points} input={mag(raw.x, raw.y)} output={mag(out.x, out.y)} caption={`${name} response`} />
        <StickLive raw={raw} out={out} deadzone={cfg.deadzone} size={148} label={`${name} · grey raw, red output`} />
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
