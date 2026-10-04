export function TriggerBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="trigger-bar">
      <span>{label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="mono">{value.toFixed(2)}</span>
    </div>
  );
}
