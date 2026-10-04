// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings as S } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Settings } from '../../src/renderer/pages/Settings';
import { useThemeSync } from '../../src/renderer/components/Shell';

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
