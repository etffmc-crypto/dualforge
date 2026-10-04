// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, defaultSettings, type Settings } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Profiles } from '../../src/renderer/pages/Profiles';
import { Header } from '../../src/renderer/components/Header';

const names: Record<string, string> = {};
const summaries = () => Object.entries(names).map(([id, name], i) => ({ id, name, slot: i + 1 }));
let stored: Settings;
const CODE = 'DUALFORGE:abc123';

const profilesApi = {
  set: vi.fn(async () => true),
  current: vi.fn(async () => ({ id: 'p1', source: 'manual' as const })),
  get: vi.fn(async (id: string) => defaultProfile(id, names[id]!)),
  list: vi.fn(async () => summaries()),
  activate: vi.fn(async (id: string) => defaultProfile(id, names[id]!)),
  rename: vi.fn(async (id: string, name: string) => { names[id] = name; }),
  duplicate: vi.fn(async (from: string, to: string) => { names[to] = `${names[from]} copy`; return defaultProfile(to, names[to]!); }),
  reset: vi.fn(async () => {}),
  export: vi.fn(async (): Promise<string | null> => 'C:\\Users\\me\\Profile 1.dualforge.json'),
  import: vi.fn(async (): Promise<unknown> => null),
  shareCode: vi.fn(async () => CODE),
  importShareCode: vi.fn(async (code: string, to: string) => {
    if (!code.startsWith('DUALFORGE:')) throw new Error("Error invoking remote method 'profiles:importShareCode': Error: E_SHARE_CODE");
    names[to] = 'Shared'; return defaultProfile(to, 'Shared');
  }),
  onActive: vi.fn(() => () => {}),
};
const settingsApi = {
  get: vi.fn(async () => stored),
  set: vi.fn(async (patch: Partial<Settings>) => { stored = { ...stored, ...patch }; return stored; }),
};
const processes = vi.fn(async () => ['cs2.exe', 'discord.exe', 'eldenring.exe']);
const writeText = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(names)) delete names[k];
  Object.assign(names, { p1: 'Profile 1', p2: 'Profile 2', p3: 'Profile 3', p4: 'Profile 4' });
  stored = defaultSettings();
  vi.stubGlobal('dualforge', {
    profiles: profilesApi, settings: settingsApi, system: { processes, openDataDir: vi.fn() },
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
  });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  useStore.setState({
    profile: defaultProfile('p1', 'Profile 1'), activeProfileId: 'p1', settings: defaultSettings(), lastError: null, page: 'profiles',
    profiles: summaries(),
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const slot = (n: number) => within(screen.getByRole('article', { name: `Slot ${n}` }));

describe('Profiles page: slot cards', () => {
  it('shows four slots; the running one is marked Active and cannot be activated again', async () => {
    render(<Profiles />);
    for (const n of [1, 2, 3, 4]) expect(slot(n).getByText(`Profile ${n}`)).toBeTruthy();
    expect(slot(1).getByText('Active')).toBeTruthy();
    expect(slot(2).queryByText('Active')).toBeNull();
    expect((slot(1).getByRole('button', { name: 'Activate' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(slot(3).getByRole('button', { name: 'Activate' }));
    expect(profilesApi.activate).toHaveBeenCalledWith('p3');
    await waitFor(() => expect(slot(3).getByText('Active')).toBeTruthy());
  });

  it('Rename edits the name in place; Escape cancels', async () => {
    render(<Profiles />);
    fireEvent.click(slot(2).getByRole('button', { name: 'Rename' }));
    const input = slot(2).getByRole('textbox', { name: 'Name of slot 2' });
    fireEvent.change(input, { target: { value: '  Racing ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(profilesApi.rename).toHaveBeenCalledWith('p2', 'Racing');
    await waitFor(() => expect(slot(2).getByText('Racing')).toBeTruthy());
    fireEvent.click(slot(3).getByRole('button', { name: 'Rename' }));
    fireEvent.keyDown(slot(3).getByRole('textbox', { name: 'Name of slot 3' }), { key: 'Escape' });
    expect(profilesApi.rename).toHaveBeenCalledTimes(1);
  });

  it('Duplicate to… copies into the slot picked in the dialog', async () => {
    render(<Profiles />);
    fireEvent.click(slot(1).getByRole('button', { name: 'Duplicate to…' }));
    const dlg = within(screen.getByRole('dialog', { name: 'Duplicate Profile 1' }));
    expect(dlg.queryByRole('radio', { name: 'Profile 1' })).toBeNull();   // not onto itself
    fireEvent.click(dlg.getByRole('radio', { name: 'Profile 4' }));
    expect(dlg.getByText(/Profile 4 is replaced/)).toBeTruthy();
    fireEvent.click(dlg.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(profilesApi.duplicate).toHaveBeenCalledWith('p1', 'p4'));
    await waitFor(() => expect(slot(4).getByText('Profile 1 copy')).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reset asks first, then resets that slot only', async () => {
    render(<Profiles />);
    fireEvent.click(slot(2).getByRole('button', { name: 'Reset' }));
    const dlg = within(screen.getByRole('dialog', { name: 'Reset Profile 2?' }));
    fireEvent.click(dlg.getByRole('button', { name: 'Cancel' }));
    expect(profilesApi.reset).not.toHaveBeenCalled();
    fireEvent.click(slot(2).getByRole('button', { name: 'Reset' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(profilesApi.reset).toHaveBeenCalledWith('p2'));
  });

  it('Export and Import use the slot id and report the outcome', async () => {
    render(<Profiles />);
    fireEvent.click(slot(1).getByRole('button', { name: 'Export' }));
    expect(profilesApi.export).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Exported Profile 1 to C:\\Users\\me\\Profile 1\.dualforge\.json/));
    profilesApi.import.mockResolvedValueOnce(defaultProfile('p3', 'From file'));
    names.p3 = 'From file';
    fireEvent.click(slot(3).getByRole('button', { name: 'Import' }));
    expect(profilesApi.import).toHaveBeenCalledWith('p3');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Imported From file into slot 3/));
  });

  it('editing the running profile is flushed before it is duplicated, so the copy has the latest edit', async () => {
    render(<Profiles />);
    act(() => { useStore.getState().updateProfile((d) => { d.sticks.left.deadzone.anti = 0.3; }); });
    fireEvent.click(slot(1).getByRole('button', { name: 'Duplicate to…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(profilesApi.duplicate).toHaveBeenCalled());
    expect(profilesApi.set.mock.invocationCallOrder[0]!).toBeLessThan(profilesApi.duplicate.mock.invocationCallOrder[0]!);
  });

  it('the header Profiles button opens this page', () => {
    useStore.setState({ page: 'home' });
    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Profiles' }));
    expect(useStore.getState().page).toBe('profiles');
  });
});

describe('Profiles page: share codes', () => {
  it('shows the running profile code and copies it', async () => {
    render(<Profiles />);
    const box = screen.getByRole('textbox', { name: 'Share code for Profile 1' }) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe(CODE));
    expect(box.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith(CODE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
  });

  it('imports a pasted code into the chosen slot', async () => {
    render(<Profiles />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste a share code' }), { target: { value: `  ${CODE}\n` } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Import into' })).getByRole('radio', { name: 'Profile 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import code' }));
    await waitFor(() => expect(profilesApi.importShareCode).toHaveBeenCalledWith(CODE, 'p3'));
    await waitFor(() => expect(slot(3).getByText('Shared')).toBeTruthy());
    expect(screen.getByText('Imported into slot 3 as Shared.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Paste a share code' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('a bad code shows an inline error and changes nothing', async () => {
    render(<Profiles />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste a share code' }), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import code' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not a DualForge share code/));
    expect(names.p2).toBe('Profile 2');
  });
});

describe('Profiles page: auto-switch', () => {
  const exeBox = () => screen.getByRole('textbox', { name: 'Game executable' }) as HTMLInputElement;
  const pickProfile = (name: string) => fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Profile for this game' })).getByRole('radio', { name }));

  it('adds a lowercased rule, rejects invalid names and duplicates, and removes rules', async () => {
    render(<Profiles />);
    expect(screen.getByText(/No games yet/)).toBeTruthy();
    fireEvent.change(exeBox(), { target: { value: '  EldenRing.EXE ' } });
    pickProfile('Profile 2');
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(settingsApi.set).toHaveBeenCalledWith({ autoSwitch: [{ exe: 'eldenring.exe', profileId: 'p2' }] });
    await waitFor(() => expect(screen.getByRole('row', { name: /eldenring\.exe/ })).toBeTruthy());
    expect(exeBox().value).toBe('');

    fireEvent.change(exeBox(), { target: { value: 'notepad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByRole('alert').textContent).toMatch(/must end in \.exe/);
    fireEvent.change(exeBox(), { target: { value: 'ELDENRING.exe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByRole('alert').textContent).toMatch(/already has a rule/);
    fireEvent.change(exeBox(), { target: { value: `${'a'.repeat(61)}.exe` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByRole('alert').textContent).toMatch(/64 characters/);
    expect(settingsApi.set).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove rule for eldenring.exe' }));
    expect(settingsApi.set).toHaveBeenLastCalledWith({ autoSwitch: [] });
    await waitFor(() => expect(screen.getByText(/No games yet/)).toBeTruthy());
  });

  it('Pick running game lists processes, filters them and fills the field', async () => {
    useStore.setState({ settings: { ...defaultSettings(), autoSwitch: [{ exe: 'cs2.exe', profileId: 'p4' }] } });
    render(<Profiles />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick running game' }));
    const dlg = within(screen.getByRole('dialog', { name: 'Pick a running game' }));
    await waitFor(() => expect(dlg.getByRole('button', { name: /discord\.exe/ })).toBeTruthy());
    expect(processes).toHaveBeenCalledTimes(1);
    expect((dlg.getByRole('button', { name: /cs2\.exe/ }) as HTMLButtonElement).disabled).toBe(true);   // already has a rule
    fireEvent.change(dlg.getByRole('searchbox', { name: 'Search running programs' }), { target: { value: 'ELDEN' } });
    expect(dlg.queryByRole('button', { name: /discord\.exe/ })).toBeNull();
    fireEvent.click(dlg.getByRole('button', { name: /eldenring\.exe/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(exeBox().value).toBe('eldenring.exe');
  });

  it('a failed process listing says so inside the dialog', async () => {
    processes.mockRejectedValueOnce(new Error('E_PROCESSES'));
    render(<Profiles />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick running game' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toMatch(/Couldn't read the running programs/));
  });

  it('stops at 32 rules', () => {
    const rules = Array.from({ length: 32 }, (_, i) => ({ exe: `g${i}.exe`, profileId: 'p2' as const }));
    useStore.setState({ settings: { ...defaultSettings(), autoSwitch: rules } });
    render(<Profiles />);
    expect((screen.getByRole('button', { name: 'Add rule' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/32 rules is the limit/)).toBeTruthy();
  });
});

describe('Profiles page: before settings load', () => {
  it('renders the auto-switch card with settings still null (no selector update loop)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    useStore.setState({ settings: null });
    render(<Profiles />);
    expect(screen.getByText('No games yet. Add one below.')).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
