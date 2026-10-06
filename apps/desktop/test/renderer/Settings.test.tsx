// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type HealthState, type Settings as S } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Settings } from '../../src/renderer/pages/Settings';
import { useThemeSync } from '../../src/renderer/components/Shell';
import { bootTheme, THEME_KEY } from '../../src/renderer/theme';

let stored: S;
const settingsApi = {
  get: vi.fn(async () => stored),
  set: vi.fn(async (patch: Partial<S>) => {
    stored = { ...stored, ...patch };
    return stored;
  }),
};
const openDataDir = vi.fn(async () => '');
type ActionResult = { ok: boolean; version?: string; code?: string };
type ProgressCb = (p: { percent: number; transferred: number; total: number }) => void;
let progressCb: ProgressCb | null = null;
const updatesApi = {
  check: vi.fn(async (): Promise<{ available: boolean; version?: string; code?: string }> => ({
    available: false,
  })),
  download: vi.fn(async (): Promise<ActionResult> => ({ ok: true, version: '0.2.0' })),
  install: vi.fn(async (): Promise<ActionResult> => ({ ok: true, version: '0.2.0' })),
  onProgress: vi.fn((cb: ProgressCb) => {
    progressCb = cb;
    return () => {
      progressCb = null;
    };
  }),
};
let healthState: HealthState = {
  results: [{ id: 'hidhide', status: 'ok', title: 'HidHide active', detail: '' }],
  ranAt: 0,
};
const healthApi = { get: vi.fn(async () => healthState), onChanged: vi.fn(() => () => undefined) };

function ThemeProbe() {
  useThemeSync();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = defaultSettings();
  healthState = {
    results: [{ id: 'hidhide', status: 'ok', title: 'HidHide active', detail: '' }],
    ranAt: 0,
  };
  vi.stubGlobal('dualforge', {
    settings: settingsApi,
    system: { openDataDir },
    health: healthApi,
    updates: updatesApi,
  });
  vi.stubGlobal('__UPDATES_ENABLED__', true); // build-time define; a release with a real publish owner
  useStore.setState({ settings: defaultSettings(), lastError: null, hidHidePending: false });
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sw = (name: string) => screen.getByRole('switch', { name }) as HTMLButtonElement;

describe('Settings page', () => {
  it('a toggle round-trips through settings.set', async () => {
    render(<Settings />);
    expect(sw('This controller has rumble motors').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw('This controller has rumble motors'));
    expect(settingsApi.set).toHaveBeenCalledWith({ hasRumble: true });
    await waitFor(() => expect(useStore.getState().settings!.hasRumble).toBe(true));
    expect(stored.hasRumble).toBe(true);
    expect(sw('This controller has rumble motors').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(sw('Start with Windows'));
    fireEvent.click(sw('Start minimized'));
    fireEvent.click(sw('Check for updates'));
    await waitFor(() =>
      expect(stored).toMatchObject({ startWithWindows: true, startMinimized: true, updates: true }),
    );
  });

  it('the HidHide switch saves hidHide when the driver is installed', async () => {
    render(<Settings />);
    await waitFor(() => expect(healthApi.get).toHaveBeenCalled());
    const hid = sw('Hide the DualSense from games');
    expect(hid.disabled).toBe(false);
    fireEvent.click(hid);
    expect(settingsApi.set).toHaveBeenCalledWith({ hidHide: true });
    await waitFor(() => expect(stored.hidHide).toBe(true));
    expect(screen.getByText(/visible again/)).toBeTruthy();
  });

  it('the HidHide switch is disabled while its request is pending', async () => {
    let finish!: (s: S) => void;
    settingsApi.set.mockImplementationOnce(
      (patch: Partial<S>) =>
        new Promise<S>((res) => {
          finish = () => res((stored = { ...stored, ...patch }));
        }),
    );
    render(<Settings />);
    await waitFor(() => expect(healthApi.get).toHaveBeenCalled());
    fireEvent.click(sw('Hide the DualSense from games'));
    await waitFor(() => expect(sw('Hide the DualSense from games').disabled).toBe(true));
    expect(useStore.getState().hidHidePending).toBe(true);
    fireEvent.click(sw('Hide the DualSense from games'));
    expect(settingsApi.set).toHaveBeenCalledTimes(1); // a second click cannot queue another request
    await act(async () => finish(stored));
    await waitFor(() => expect(sw('Hide the DualSense from games').disabled).toBe(false));
    expect(useStore.getState().hidHidePending).toBe(false);
  });

  it('hides the update switch and Check now unless the build enables updates', () => {
    vi.stubGlobal('__UPDATES_ENABLED__', false);
    render(<Settings />);
    expect(screen.queryByRole('switch', { name: 'Check for updates' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
    expect(sw('Start with Windows')).toBeTruthy(); // the rest of the page is still there
  });

  it('HidHide stays disabled with an install hint while the driver is missing', async () => {
    healthState = {
      results: [
        {
          id: 'hidhide',
          status: 'warn',
          title: 'HidHide not installed',
          detail: '',
          repair: 'installHidHide',
        },
      ],
      ranAt: 0,
    };
    render(<Settings />);
    await waitFor(() =>
      expect(screen.getByText('Driver not installed — install from Health')).toBeTruthy(),
    );
    const hid = sw('Hide the DualSense from games');
    expect(hid.disabled).toBe(true);
    fireEvent.click(hid);
    expect(settingsApi.set).not.toHaveBeenCalled();
  });

  it('a failed enable (main rejects) reverts the switch and reports the code', async () => {
    settingsApi.set.mockRejectedValueOnce(new Error('E_HIDHIDE_NO_DEVICE'));
    render(<Settings />);
    fireEvent.click(sw('Hide the DualSense from games'));
    await waitFor(() => expect(useStore.getState().lastError?.msg).toMatch(/E_HIDHIDE_NO_DEVICE/));
    expect(sw('Hide the DualSense from games').getAttribute('aria-checked')).toBe('false');
  });

  it('switching to Light saves the theme and re-themes the document', async () => {
    render(
      <>
        <Settings />
        <ThemeProbe />
      </>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(settingsApi.set).toHaveBeenCalledWith({ theme: 'light' });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('the startup, tray and update switches are live: no "not active yet" notes, Close to tray defaults on', async () => {
    render(<Settings />);
    expect(screen.queryByText(/Not active yet/)).toBeNull();
    expect(sw('Close to tray').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw('Close to tray'));
    expect(settingsApi.set).toHaveBeenCalledWith({ closeToTray: false });
    await waitFor(() => expect(stored.closeToTray).toBe(false));
  });

  it('Check now shows what the updater found', async () => {
    updatesApi.check.mockResolvedValueOnce({ available: true, version: '0.2.0' });
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(screen.getByText('Version 0.2.0 is available.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(screen.getByText('You are on the latest version.')).toBeTruthy());
    updatesApi.check.mockResolvedValueOnce({ available: false, code: 'E_UPDATE_DEV' });
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(screen.getByText(/development build/)).toBeTruthy());
    updatesApi.check.mockResolvedValueOnce({ available: false, code: 'E_UPDATE_DISABLED' });
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(screen.getByText(/Turn on "Check for updates"/)).toBeTruthy());
  });

  it('Download then Install & restart are two separate clicks, with progress in between', async () => {
    let finish!: (r: ActionResult) => void;
    updatesApi.check.mockResolvedValueOnce({ available: true, version: '0.2.0' });
    updatesApi.download.mockImplementationOnce(() => new Promise((res) => (finish = res)));
    render(<Settings />);
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull(); // nothing offered before a check
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download 0.2.0' }));
    expect(updatesApi.download).toHaveBeenCalledTimes(1);
    expect(updatesApi.install).not.toHaveBeenCalled();
    act(() => progressCb?.({ percent: 37.4, transferred: 374, total: 1000 }));
    const bar = await screen.findByRole('progressbar', { name: 'Update download progress' });
    expect(bar.getAttribute('value')).toBe('37.4');
    expect(screen.getByText('Downloading… 37%')).toBeTruthy();
    await act(async () => finish({ ok: true, version: '0.2.0' }));
    expect(screen.getByText(/Version 0.2.0 is downloaded/)).toBeTruthy();
    expect(updatesApi.install).not.toHaveBeenCalled(); // never automatic
    fireEvent.click(screen.getByRole('button', { name: 'Install & restart' }));
    await waitFor(() => expect(updatesApi.install).toHaveBeenCalledTimes(1));
  });

  it('a failed download explains the code and offers Download again', async () => {
    updatesApi.check.mockResolvedValueOnce({ available: true, version: '0.2.0' });
    updatesApi.download.mockResolvedValueOnce({ ok: false, code: 'E_UPDATE_DOWNLOAD' });
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Download 0.2.0' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/The download failed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download 0.2.0' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install & restart' })).toBeNull();
  });

  it('remembers the theme for the next boot and applies it before React mounts', async () => {
    render(
      <>
        <Settings />
        <ThemeProbe />
      </>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => expect(localStorage.getItem(THEME_KEY)).toBe('light'));
    cleanup();
    delete document.documentElement.dataset.theme;
    bootTheme(); // what main.tsx runs before createRoot
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('keeps the booted theme until settings load, then reconciles to settings', () => {
    localStorage.setItem(THEME_KEY, 'light');
    bootTheme();
    useStore.setState({ settings: null });
    render(<ThemeProbe />);
    expect(document.documentElement.dataset.theme).toBe('light'); // no flash back to dark while loading
    act(() => useStore.setState({ settings: defaultSettings() })); // settings.json says dark
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('boots dark when storage is empty or throws', () => {
    bootTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    localStorage.setItem(THEME_KEY, 'light');
    bootTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
    spy.mockRestore();
  });

  it('Open data folder asks main to open it', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'Open data folder' }));
    expect(openDataDir).toHaveBeenCalledTimes(1);
  });

  it('renders nothing until settings load', () => {
    useStore.setState({ settings: null });
    const { container } = render(<Settings />);
    expect(container.textContent).toBe('');
  });
});
