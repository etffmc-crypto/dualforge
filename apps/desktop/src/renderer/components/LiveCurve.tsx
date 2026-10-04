import { CURVE_PRESETS } from '@dualforge/shared';
import { presetPoints } from '@dualforge/engine/curve';
import { CurvePreview } from './controls/CurvePreview';

export type CurvePreset = (typeof CURVE_PRESETS)[number];
export const PRESET_LABELS: Record<CurvePreset, string> = { linear: 'Linear', aggressive: 'Aggressive', precise: 'Precise', scurve: 'S-Curve' };
export const PRESET_OPTIONS = CURVE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }));

/** Preset (or custom) points with the origin prepended, ready for a preview polyline. */
export const previewPoints = (pts: readonly (readonly [number, number])[]): [number, number][] => [[0, 0], ...pts.map(([x, y]) => [x, y] as [number, number])];
export const presetPreview = (p: CurvePreset) => previewPoints(presetPoints(p));

const SIZE = 128;

/** Square response-curve thumbnail (GameSir's top-left square) with a live marker at (input, output). */
export function LiveCurve({ points, input, output, caption }: { points: [number, number][]; input: number; output: number; caption: string }) {
  return (
    <figure className="live-curve">
      <div className="live-curve-plot" style={{ width: SIZE, height: SIZE }}>
        <CurvePreview points={points} size={SIZE} />
        <span className="live-curve-dot" style={{ left: `${input * 100}%`, bottom: `${output * 100}%` }} />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
