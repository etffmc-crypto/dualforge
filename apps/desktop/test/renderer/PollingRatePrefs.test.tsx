// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollingRateHz, PollingRateResult, PollingRateState } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { PollingRatePrefs } from '../../src/renderer/pages/settings/PollingRatePrefs';

let state: PollingRateState;
const pollingApi = {
  get: vi.fn(async () => state),
  set: vi.fn(async (hz: PollingRateHz): Promise<PollingRateResult> => {
    state = { ...state, rateHz: hz };
    return { ok: true, state };
  }),
};
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  state = { available: true, rateHz: 4000, measuredHz: 4007 };
  vi.stubGlobal('dualforge', { polling: pollingApi });
  useStore.setState({ snapshot: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PollingRatePrefs', () => {
  it('shows the stored rate and the measured rate for a filtered pad', async () => {
    useStore.setState({ snapshot: { reportHz: 4007 } as never });
    render(<PollingRatePrefs />);
    await waitFor(() =>
      expect(screen.getByRole('radiogroup', { name: 'Polling rate' })).toBeTruthy(),
    );
    expect(radio('4000 Hz').getAttribute('aria-checked')).toBe('true');
    expect(radio('8000 Hz').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('Measured now: 4007 Hz.');
  });

  it('the native rate (no stored value) shows as 8000 Hz', async () => {
    state = { available: true, rateHz: null, measuredHz: 8013 };
    render(<PollingRatePrefs />);
    await waitFor(() => expect(radio('8000 Hz').getAttribute('aria-checked')).toBe('true'));
  });

  it('renders nothing on a pad without the filter', async () => {
    state = { available: false, reason: 'no-filter', rateHz: null, measuredHz: 1000 };
    render(<PollingRatePrefs />);
    await waitFor(() => expect(pollingApi.get).toHaveBeenCalled());
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('picking a rate calls polling.set, disables the picker meanwhile and shows the new rate', async () => {
    let finish!: () => void;
    pollingApi.set.mockImplementationOnce(
      (hz: PollingRateHz) =>
        new Promise<PollingRateResult>((res) => {
          finish = () => res({ ok: true, state: (state = { ...state, rateHz: hz }) });
        }),
    );
    render(<PollingRatePrefs />);
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeTruthy());
    fireEvent.click(radio('2000 Hz'));
    expect(pollingApi.set).toHaveBeenCalledWith(2000);
    await waitFor(() => expect(radio('8000 Hz').disabled).toBe(true));
    expect(screen.getByRole('status').textContent).toMatch(/Applying/);
    finish();
    await waitFor(() => expect(radio('2000 Hz').getAttribute('aria-checked')).toBe('true'));
    expect(radio('8000 Hz').disabled).toBe(false);
  });

  it('a declined prompt keeps the old rate and explains', async () => {
    pollingApi.set.mockImplementationOnce(async () => ({
      ok: false,
      code: 'E_POLLING_ELEVATION_DECLINED',
      msg: 'declined',
      state,
    }));
    render(<PollingRatePrefs />);
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeTruthy());
    fireEvent.click(radio('1000 Hz'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Administrator/));
    expect(radio('4000 Hz').getAttribute('aria-checked')).toBe('true');
  });

  it('clicking the current rate does nothing', async () => {
    render(<PollingRatePrefs />);
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeTruthy());
    fireEvent.click(radio('4000 Hz'));
    expect(pollingApi.set).not.toHaveBeenCalled();
  });
});
