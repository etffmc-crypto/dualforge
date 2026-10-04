import type { Side } from '../../store';

const RINGS = [1, 2, 3];

/**
 * A motor drawn as a hub with up to three sound-wave rings (one per third of its strength); the rings pulse
 * while a test is playing. Left waves open to the left, right waves to the right, like the grips they sit in.
 */
export function MotorWaves({ side, strength, playing, muted }: { side: Side; strength: number; playing: boolean; muted: boolean }) {
  const dir = side === 'left' ? -1 : 1;
  const lit = strength === 0 ? 0 : Math.ceil((strength / 100) * RINGS.length);
  return (
    <figure className={`motor${playing ? ' playing' : ''}${muted ? ' muted' : ''}`} data-testid={`motor-${side}`}>
      <svg viewBox="-60 -40 120 80" width="156" height="104" aria-hidden="true">
        {RINGS.map((n) => {
          const r = 10 + n * 12;
          const x = Math.cos(Math.PI / 4) * r, y = Math.sin(Math.PI / 4) * r;
          const d = `M ${dir * x} ${-y} A ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${dir * x} ${y}`;
          return <path key={n} d={d} className={`motor-ring${n <= lit ? ' on' : ''}`} style={{ animationDelay: `${(n - 1) * 90}ms` }} />;
        })}
        <circle r="9" className="motor-hub" />
        <circle r="3" className="motor-axle" />
      </svg>
      <figcaption>
        <span className="motor-name">{side === 'left' ? 'Left · heavy' : 'Right · light'}</span>
        <span className="motor-value">{muted ? 'Off' : `${strength}%`}</span>
      </figcaption>
    </figure>
  );
}
