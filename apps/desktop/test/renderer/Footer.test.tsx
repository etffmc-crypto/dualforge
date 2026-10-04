// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/renderer/store';
import { Footer, ERROR_CHIP_MS } from '../../src/renderer/components/Footer';

const raise = (code: string, msg = 'boom') =>
  act(() => {
    useStore.setState({ lastError: { code, msg } });
  });
const chip = () => screen.queryByRole('alert');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('__APP_VERSION__', '0.2.0');
  useStore.setState({ lastError: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Footer', () => {
  it('shows the PlayStation legend: ✕ Confirm, ○ Back', () => {
    render(<Footer />);
    expect(document.querySelector('.badge-a')!.textContent).toBe('✕');
    expect(document.querySelector('.badge-b')!.textContent).toBe('○');
    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('lastError shows a chip with the code and a short message; Dismiss clears it', () => {
    render(<Footer />);
    expect(chip()).toBeNull();
    raise('E_PROFILE_SEND', "Error invoking remote method 'profiles:set': Error: E_PROFILE_SCHEMA");
    expect(chip()!.textContent).toContain('E_PROFILE_SEND');
    expect(chip()!.textContent).toContain('Changes not saved — check Health');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(chip()).toBeNull();
    expect(useStore.getState().lastError).toBeNull();
  });

  it('transient errors clear themselves after 6 s; profile errors stay until dismissed', () => {
    render(<Footer />);
    for (const code of ['E_RUMBLE_TEST', 'E_MACRO_TEST', 'E_CLIPBOARD']) {
      raise(code);
      expect(chip()!.textContent).toContain(code);
      act(() => {
        vi.advanceTimersByTime(ERROR_CHIP_MS - 1);
      });
      expect(chip()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(chip()).toBeNull();
    }
    expect(ERROR_CHIP_MS).toBe(6000);
    for (const code of ['E_PROFILE_SEND', 'E_PROFILE_INVALID']) {
      raise(code);
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(chip()!.textContent).toContain(code);
    }
  });

  it('a newer error restarts the clock and is not cleared by the older one’s timer', () => {
    render(<Footer />);
    raise('E_RUMBLE_TEST');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    raise('E_PROFILE_INVALID', 'trigger deadzone: initial must be below max');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(chip()!.textContent).toContain('E_PROFILE_INVALID');
    expect(chip()!.textContent).toContain('trigger deadzone: initial must be below max');
  });

  it('clearError() empties lastError', () => {
    raise('E_X');
    act(() => useStore.getState().clearError());
    expect(useStore.getState().lastError).toBeNull();
  });
});
