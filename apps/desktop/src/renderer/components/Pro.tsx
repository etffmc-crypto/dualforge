import { fillCopy, LICENSE_COPY, PRO_FEATURES, type ProFeature } from '@dualforge/shared';
import { useStore } from '../store';
import '../styles/pro.css';

/**
 * True when Pro gates apply: a provider is configured (enforced) and this PC is on Free. A dormant build, or a renderer
 * that has not heard from main yet, is never locked. Main enforces the same rule on its own; this only shows it.
 */
export const useProLocked = (): boolean =>
  useStore((s) => !!s.license && s.license.enforced && s.license.tier !== 'pro');

/** The DF-023 **Pro** tag on a gated control. */
export function ProTag() {
  return <span className="pro-tag">{LICENSE_COPY.gateTag}</span>;
}

/** "{Feature} is part of DualForge Pro." with a Get Pro link to the Plan card. */
export function ProLine({ feature, className = '' }: { feature: ProFeature; className?: string }) {
  const goPlan = useStore((s) => s.goPlan);
  return (
    <p className={`pro-line ${className}`} role="note">
      <ProTag />
      <span>{fillCopy(LICENSE_COPY.gateLine, { feature: PRO_FEATURES[feature] })}</span>
      <button data-nav type="button" className="pro-link" onClick={goPlan}>
        {LICENSE_COPY.getPro}
      </button>
    </p>
  );
}
