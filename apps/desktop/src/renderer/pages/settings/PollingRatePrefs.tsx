import { useEffect, useState } from 'react';
import type { PollingRateHz, PollingRateState } from '@dualforge/shared';
import { Segmented } from '../../components/controls/Segmented';
import { PanelSection } from '../../components/SettingsLayout';
import { useStore } from '../../store';

const RATES: { value: `${PollingRateHz}`; label: string }[] = [
  { value: '8000', label: '8000 Hz' },
  { value: '4000', label: '4000 Hz' },
  { value: '2000', label: '2000 Hz' },
  { value: '1000', label: '1000 Hz' },
];
/** Re-read while the pad is absent or the query failed, so plugging the pad in shows the section without a page reload. */
const REFRESH_MS = 5000;

export const POLLING_CODES: Record<string, string> = {
  E_POLLING_ELEVATION_DECLINED:
    'Administrator rights are needed to change the rate. Try again and accept the prompt.',
  E_POLLING_APPLY:
    'The new rate did not take. Unplug the controller, plug it back in and check the rate shown here.',
  E_POLLING_UNAVAILABLE: 'The polling rate cannot be changed on this controller.',
  E_POLLING_QUERY: 'The controller could not be checked. Try again in a moment.',
  E_POLLING_BUSY: 'A change is still in progress. Wait for the controller to reconnect.',
};

/**
 * Settings > Controller > Polling rate. Shown only for a pad that carries the hidusbf filter (the 8 kHz mod) and
 * runs above 1 kHz; a stock DualSense never sees it. Picking a rate stores it and restarts the USB device (one UAC
 * prompt), so the pad drops for a few seconds; the measured rate under the picker proves the change took.
 */
export function PollingRatePrefs() {
  const measured = useStore((s) => s.snapshot?.reportHz ?? 0);
  const [state, setState] = useState<PollingRateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const polling = window.dualforge.polling;
    if (!polling) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      polling.get().then(
        (s) => {
          if (!alive) return;
          setState(s);
          if (!s.available && (s.reason === 'no-device' || s.reason === 'query-failed'))
            timer = setTimeout(load, REFRESH_MS);
        },
        () => undefined,
      );
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!state?.available) return null;
  const pick = (v: `${PollingRateHz}`) => {
    const hz = Number(v) as PollingRateHz;
    if (busy || hz === state.rateHz) return;
    setBusy(true);
    setError(null);
    window.dualforge.polling.set(hz).then(
      (r) => {
        setState(r.state);
        if (!r.ok) setError(POLLING_CODES[r.code ?? ''] ?? `The change failed (${r.code ?? ''}).`);
        setBusy(false);
      },
      (err: unknown) => {
        setError(`The change failed (${String(err)}).`);
        setBusy(false);
      },
    );
  };
  const current = state.rateHz ? (`${state.rateHz}` as `${PollingRateHz}`) : '8000';
  return (
    <PanelSection title="Polling rate">
      <p className="psec-hint">
        How often Windows asks the controller for input. Your pad has the high-rate USB filter, so
        it can run above the standard 1000 Hz. Changing it needs administrator rights (one prompt)
        and reconnects the controller for a few seconds.
      </p>
      <div aria-busy={busy}>
        <Segmented
          label="Polling rate"
          options={RATES.map((r) => ({ ...r, disabled: busy }))}
          value={current}
          onChange={pick}
        />
      </div>
      <p className="psec-hint" role="status" aria-live="polite">
        {busy
          ? 'Applying… the controller reconnects in a few seconds.'
          : `Measured now: ${Math.round(measured)} Hz.`}
      </p>
      {error && (
        <p className="psec-hint" role="alert">
          {error}
        </p>
      )}
    </PanelSection>
  );
}
