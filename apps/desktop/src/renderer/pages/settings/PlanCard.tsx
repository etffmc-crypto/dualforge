import { useEffect, useRef, useState } from 'react';
import { fillCopy, LICENSE_COPY, proSettingsIn, type LicenseView } from '@dualforge/shared';
import { PanelSection } from '../../components/SettingsLayout';
import { useStore } from '../../store';
import '../../styles/pro.css';

const C = LICENSE_COPY;
const dateText = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
};
const dateTimeText = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
};

const PORTAL = 'billing portal';

/** The subscription line; "billing portal" is a link when the build has the portal URL, plain text otherwise. */
function SubscriptionLine({ plan, portal }: { plan: string; portal: boolean }) {
  const text = fillCopy(C.proSubscription, { plan });
  const at = text.indexOf(PORTAL);
  if (!portal || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <button
        data-nav
        type="button"
        className="pro-link"
        onClick={() => void window.dualforge.license.openPortal().catch(() => undefined)}
      >
        {PORTAL}
      </button>
      {text.slice(at + PORTAL.length)}
    </>
  );
}

/** The line under "Pro is active": the subscription's plan, lifetime, or a founder key's end date. */
function ProDetail({ v }: { v: LicenseView }) {
  if (v.source === 'founder')
    return (
      <>{v.expiresAt ? fillCopy(C.founderEnds, { date: dateText(v.expiresAt) }) : C.proLifetime}</>
    );
  if (v.variant === 'monthly' || v.variant === 'yearly')
    return <SubscriptionLine plan={v.variant} portal={v.portalUrl} />;
  if (v.variant === 'lifetime' || v.variant === 'founder-lifetime') return <>{C.proLifetime}</>;
  return null;
}
const hasDetail = (v: LicenseView) => v.source === 'founder' || v.variant !== '';

/** Settings > Plan (only when a provider is configured): badge, DF-023 lines, the key box and the license actions. */
export function PlanCard() {
  const view = useStore((s) => s.license);
  const setLicense = useStore((s) => s.setLicense);
  const planFocus = useStore((s) => s.planFocus);
  const held = useStore((s) => (s.profile ? proSettingsIn(s.profile).length > 0 : false));
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (planFocus === 0) return;
    ref.current?.scrollIntoView?.({ block: 'start' });
    input.current?.focus();
  }, [planFocus]);
  if (!view?.enforced) return null;
  const lic = window.dualforge.license;
  const run = (fn: () => Promise<LicenseView>, after?: () => void) => {
    setBusy(true);
    fn()
      .then((v) => {
        setLicense(v);
        after?.();
      })
      .catch((err: unknown) =>
        useStore.setState({ lastError: { code: 'E_LICENSE_IPC', msg: String(err) } }),
      )
      .finally(() => setBusy(false));
  };
  const pro = view.tier === 'pro';
  const badge = !pro ? C.badgeFree : view.source === 'founder' ? C.badgeFounder : C.badgePro;
  return (
    <div ref={ref} id="plan" className="plan">
      <PanelSection title={C.title}>
        <div className="plan-head">
          <span className={`plan-badge${pro ? ' pro' : ''}`} aria-label={`Plan: ${badge}`}>
            {badge}
          </span>
          {pro && view.founderName && <span className="psec-hint">{view.founderName}</span>}
        </div>
        {pro ? (
          <>
            <p className="psec-hint">{C.proLine}</p>
            {hasDetail(view) && (
              <p className="psec-hint">
                <ProDetail v={view} />
              </p>
            )}
          </>
        ) : (
          <>
            <p className="psec-hint">{C.freeLine}</p>
            <p className="psec-hint">{view.prices}</p>
            {held && <p className="pro-paused">{C.paused}</p>}
          </>
        )}
        {pro && view.source === 'key' && view.lastCheck && (
          <p className="psec-hint">
            {fillCopy(C.lastCheck, { date: dateTimeText(view.lastCheck) })}
          </p>
        )}
        {view.message && (
          <p className="plan-msg" role="status" aria-live="polite">
            {view.message}
          </p>
        )}
        {!pro && view.checkoutUrl && (
          <div className="plan-actions">
            <button
              data-nav
              type="button"
              className="panel-btn primary"
              onClick={() => void lic.openCheckout().catch(() => undefined)}
            >
              {C.getPro}
            </button>
          </div>
        )}
        <label className="plan-key-label" htmlFor="plan-key">
          {C.keyLabel}
        </label>
        <div className="plan-key">
          <input
            data-nav
            ref={input}
            id="plan-key"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={4096}
            value={key}
            placeholder={view.source === 'key' && view.keyHint ? `…${view.keyHint}` : ''}
            aria-describedby="plan-key-hint"
            onChange={(e) => setKey(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && key.trim() && !busy)
                run(
                  () => lic.activate(key),
                  () => setKey(''),
                );
            }}
          />
          <button
            data-nav
            type="button"
            className="panel-btn"
            disabled={busy || !key.trim()}
            onClick={() =>
              run(
                () => lic.activate(key),
                () => setKey(''),
              )
            }
          >
            {C.activate}
          </button>
        </div>
        <p className="psec-hint" id="plan-key-hint">
          {C.keyHint}
        </p>
        {view.hasLicense && (
          <>
            <div className="plan-actions">
              {view.source !== 'founder' && view.keyHint && (
                <button
                  data-nav
                  type="button"
                  className="panel-btn"
                  disabled={busy}
                  onClick={() => run(() => lic.check())}
                >
                  {C.check}
                </button>
              )}
              <button
                data-nav
                type="button"
                className="panel-btn"
                disabled={busy}
                onClick={() => run(() => lic.remove())}
              >
                {C.remove}
              </button>
            </div>
            <p className="psec-hint">{C.removeHint}</p>
          </>
        )}
      </PanelSection>
    </div>
  );
}
