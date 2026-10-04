export interface DualRangeSliderProps {
  lo: number;
  hi: number;
  min?: number;
  max?: number;
  step?: number;
  minGap?: number;
  onChange(lo: number, hi: number): void;
  captions?: [string, string];
  label?: string;
}

const tidy = (v: number) => Math.round(v * 1e6) / 1e6;

/** Two overlapped range inputs sharing one track; keeps `lo + minGap <= hi`. */
export function DualRangeSlider({ lo, hi, min = 0, max = 1, step = 0.01, minGap = 0.01, onChange, captions, label = 'Range' }: DualRangeSliderProps) {
  const span = max - min || 1;
  const pct = (v: number) => ((v - min) / span) * 100;
  const setLo = (v: number) => onChange(tidy(Math.max(min, Math.min(v, hi - minGap))), hi);
  const setHi = (v: number) => onChange(lo, tidy(Math.min(max, Math.max(v, lo + minGap))));
  return (
    <div className="drs">
      {captions && (
        <div className="drs-captions"><span>{captions[0]}</span><span>{captions[1]}</span></div>
      )}
      <div className="drs-rail">
        <div className="drs-track" />
        <div className="drs-fill" style={{ left: `calc(7px + (100% - 14px) * ${pct(lo) / 100})`, width: `calc((100% - 14px) * ${(pct(hi) - pct(lo)) / 100})` }} />
        <input
          type="range" className="slider drs-input" data-testid="drs-lo" min={min} max={max} step={step} value={lo}
          aria-label={`${label} ${captions?.[0] ?? 'low'}`} onChange={(e) => setLo(Number(e.currentTarget.value))}
        />
        <input
          type="range" className="slider drs-input" data-testid="drs-hi" min={min} max={max} step={step} value={hi}
          aria-label={`${label} ${captions?.[1] ?? 'high'}`} onChange={(e) => setHi(Number(e.currentTarget.value))}
        />
      </div>
    </div>
  );
}
