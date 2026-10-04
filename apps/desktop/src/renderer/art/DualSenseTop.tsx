type P = Record<string, boolean>;
export function DualSenseTop({ pressed, lightbar }: { pressed: P; lightbar: { r: number; g: number; b: number } }) {
  const on = (k: string) => (pressed[k] ? 'btn on' : 'btn');
  const lb = `rgb(${lightbar.r},${lightbar.g},${lightbar.b})`;
  return (
    <svg className="ds-art" viewBox="0 0 640 420" width="100%">
      <path d="M120 60 h400 a60 60 0 0 1 60 60 v40 l40 180 a40 40 0 0 1 -70 20 l-70 -110 h-320 l-70 110 a40 40 0 0 1 -70 -20 l40 -180 v-40 a60 60 0 0 1 60 -60z" fill="rgba(255,255,255,0.08)" stroke="var(--card-border)" strokeWidth="2" />
      {/* touchpad + lightbar */}
      <rect x="220" y="80" width="200" height="90" rx="18" fill="rgba(255,255,255,0.06)" className={on('touchpad')} />
      <rect x="208" y="80" width="8" height="90" rx="4" fill={lb} /><rect x="424" y="80" width="8" height="90" rx="4" fill={lb} />
      {/* shoulders */}
      <rect x="130" y="30" width="110" height="22" rx="8" className={on('l1')} /><rect x="400" y="30" width="110" height="22" rx="8" className={on('r1')} />
      <rect x="140" y="8" width="90" height="18" rx="8" className={on('l2')} /><rect x="410" y="8" width="90" height="18" rx="8" className={on('r2')} />
      {/* dpad */}
      <rect x="140" y="108" width="24" height="24" rx="4" className={on('dpadUp')} /><rect x="140" y="156" width="24" height="24" rx="4" className={on('dpadDown')} />
      <rect x="116" y="132" width="24" height="24" rx="4" className={on('dpadLeft')} /><rect x="164" y="132" width="24" height="24" rx="4" className={on('dpadRight')} />
      {/* face */}
      <circle cx="488" cy="112" r="14" className={on('triangle')} /><circle cx="488" cy="172" r="14" className={on('cross')} />
      <circle cx="458" cy="142" r="14" className={on('square')} /><circle cx="518" cy="142" r="14" className={on('circle')} />
      {/* system */}
      <rect x="196" y="86" width="12" height="26" rx="4" className={on('create')} /><rect x="432" y="86" width="12" height="26" rx="4" className={on('options')} />
      <circle cx="320" cy="214" r="12" className={on('ps')} /><rect x="300" y="240" width="40" height="8" rx="4" className={on('mic')} />
      {/* sticks */}
      <circle cx="232" cy="230" r="34" className={on('l3')} /><circle cx="408" cy="230" r="34" className={on('r3')} />
    </svg>
  );
}
