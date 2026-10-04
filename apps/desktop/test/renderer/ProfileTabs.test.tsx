// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, defaultSettings } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { ProfileTabs } from '../../src/renderer/components/ProfileTabs';
import { Header } from '../../src/renderer/components/Header';

const names: Record<string, string> = {
  p1: 'Profile 1',
  p2: 'Profile 2',
  p3: 'Profile 3',
  p4: 'Profile 4',
};
const profilesApi = {
  set: vi.fn(async () => true),
  current: vi.fn(async () => ({ id: 'p1', source: 'manual' as const })),
  get: vi.fn(async (id: string) => defaultProfile(id, names[id]!)),
  list: vi.fn(async () =>
    Object.entries(names).map(([id, name], i) => ({ id, name, slot: i + 1 })),
  ),
  activate: vi.fn(async (id: string) => defaultProfile(id, names[id]!)),
  rename: vi.fn(async (id: string, name: string) => {
    names[id] = name;
  }),
  reset: vi.fn(async () => {}),
  onActive: vi.fn(() => () => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(names, { p1: 'Profile 1', p2: 'Profile 2', p3: 'Profile 3', p4: 'Profile 4' });
  vi.stubGlobal('dualforge', {
    profiles: profilesApi,
    settings: { get: vi.fn(async () => defaultSettings()), set: vi.fn() },
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
  });
  useStore.setState({
    profile: defaultProfile('p1', 'Profile 1'),
    activeProfileId: 'p1',
    settings: defaultSettings(),
    lastError: null,
    page: 'home',
    profiles: Object.entries(names).map(([id, name], i) => ({ id, name, slot: i + 1 })),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProfileTabs', () => {
  it('shows the four slots with the running one selected', () => {
    render(<ProfileTabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Profile 1',
      'Profile 2',
      'Profile 3',
      'Profile 4',
    ]);
    expect(screen.getByRole('tab', { name: 'Profile 1' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('clicking a slot activates it in the engine', async () => {
    render(<ProfileTabs />);
    fireEvent.click(screen.getByRole('tab', { name: 'Profile 3' }));
    expect(profilesApi.activate).toHaveBeenCalledWith('p3');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Profile 3' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('right-click renames inline; Enter commits, Escape cancels', async () => {
    render(<ProfileTabs />);
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Profile 2' }));
    const input = screen.getByRole('textbox', { name: 'Rename Profile 2' }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '  Racing  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(profilesApi.rename).toHaveBeenCalledWith('p2', 'Racing');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Racing' })).toBeTruthy());

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Profile 3' }));
    const again = screen.getByRole('textbox', { name: 'Rename Profile 3' });
    fireEvent.change(again, { target: { value: 'Nope' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(profilesApi.rename).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', { name: 'Profile 3' })).toBeTruthy();
  });

  it('the pencil on the selected slot renames too; a blank name is ignored', () => {
    render(<ProfileTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Profile 1' }));
    const input = screen.getByRole('textbox', { name: 'Rename Profile 1' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(profilesApi.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Header Reset', () => {
  it('asks first, then resets the running profile', async () => {
    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset profile' }));
    const dlg = screen.getByRole('dialog', { name: 'Reset Profile 1?' });
    expect(dlg).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(profilesApi.reset).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reset profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(profilesApi.reset).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the gear opens Settings', () => {
    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(useStore.getState().page).toBe('settings');
  });
});
