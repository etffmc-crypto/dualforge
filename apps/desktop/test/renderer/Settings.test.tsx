// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings as S } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Settings } from '../../src/renderer/pages/Settings';
import { useThemeSync } from '../../src/renderer/components/Shell';
import { bootTheme, THEME_KEY } from '../../src/renderer/theme';

let stored: S;
const settingsApi = {
  get: vi.fn(async () => stored),
  set: vi.fn(async (patch: Partial<S>) => { stored = { ...stored, ...patch }; return stored; }),
};
const openDataDir = vi.fn(async () => '');

function ThemeProbe() { useThemeSync(); return null; }

beforeEach(() => {
  vi.clearAllMocks();
  stored = defaultSettings();
  vi.stubGlobal('dualforge', { settings: settingsApi, system: { openDataDir } });
  useStore.setState({ settings: defaultSettings(), lastError: null });
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
    await waitFor(() => expect(stored).toMatchObject({ startWithWindows: true, startMinimized: true, updates: true }));
  });

  it('HidHide is shown but disabled until Plan 4', () => {
    render(<Settings />);
    const hid = sw('Hide the DualSense from games');
    expect(hid.disabled).toBe(true);
    expect(hid.closest('[title]')?.getAttribute('title')).toMatch(/Plan 4/);
    fireEvent.click(hid);
    expect(settingsApi.set).not.toHaveBeenCalled();
  });

  it('switching to Light saves the theme and re-themes the document', async () => {
    render(<><Settings /><ThemeProbe /></>);
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(settingsApi.set).toHaveBeenCalledWith({ theme: 'light' });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('startup and update switches say they are not active yet', () => {
    render(<Settings />);
    expect(screen.getAllByText('Not active yet — coming in Plan 4.')).toHaveLength(3);
    for (const name of ['Start with Windows', 'Start minimized', 'Check for updates']) {
      expect(sw(name).getAttribute('aria-describedby')!.split(' ')).toHaveLength(2);
    }
  });

  it('remembers the theme for the next boot and applies it before React mounts', async () => {
    render(<><Settings /><ThemeProbe /></>);
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
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
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
