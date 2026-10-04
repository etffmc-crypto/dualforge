/** Small battery pill: green fill to the charge level, a bolt while charging. */
export function Battery({ percent, charging }: { percent: number; charging: boolean }) {
  return (
    <span className={`battery${charging ? ' charging' : ''}`} title={`Battery ${percent}%`}>
      <span className="battery-fill" style={{ width: `${Math.max(8, Math.min(100, percent))}%` }} />
      {charging && (
        <span className="battery-bolt" aria-hidden="true">
          ⚡
        </span>
      )}
    </span>
  );
}
