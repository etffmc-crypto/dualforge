import type { Macro } from '@dualforge/shared';
import { cycleMs } from './ops';

/** A one-line piano roll of the macro: a bar per held step, blank space for the waits, to scale. */
export function MacroTimeline({ steps, loop }: Pick<Macro, 'steps' | 'loop'>) {
  const total = Math.max(1, cycleMs({ steps }));
  let t = 0;
  return (
    <svg
      className={`mtl${loop ? ' loops' : ''}`}
      viewBox="0 0 1000 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line className="mtl-axis" x1="0" x2="1000" y1="12" y2="12" />
      {steps.map((s, i) => {
        const x = (t / total) * 1000;
        const w = Math.max(4, (s.holdMs / total) * 1000);
        t += s.holdMs + s.delayMs;
        return (
          <rect
            key={i}
            className={`mtl-step t-${s.target.type}`}
            x={x}
            y="4"
            width={w}
            height="16"
            rx="3"
          />
        );
      })}
    </svg>
  );
}
