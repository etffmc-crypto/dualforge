// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthResult, HealthState } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Health } from '../../src/renderer/pages/Health';
import { Header } from '../../src/renderer/components/Header';
import { Home } from '../../src/renderer/pages/Home';
import { useAppFeeds } from '../../src/renderer/components/Shell';
import {
  formatInstallerSize,
  healthSummary,
  parseLogLine,
} from '../../src/renderer/pages/health/summary';

type Status = {
  driver: 'vigem' | 'hidhide';
  state: string;
  pct?: number;
  code?: string;
  sha256?: string;
  url?: string;
};

const RESULTS: HealthResult[] = [
  {
    id: 'vigem',
    status: 'ok',
    title: 'ViGEmBus ready',
    detail: 'The virtual controller driver is installed and running.',
  },
  {
    id: 'hidhide',
    status: 'warn',
    title: 'HidHide not installed',
    detail: 'Optional, but games see both pads.',
    repair: 'installHidHide',
  },
  {
    id: 'device',
    status: 'ok',
    title: 'DualSense connected',
    detail: 'The controller is sending input.',
  },
  {
    id: 'engine',
    status: 'warn',
    title: 'Engine restarted recently',
    detail: 'The engine restarted 1 time(s).',
    repair: 'restartEngine',
  },
  {
    id: 'profile.p2',
    status: 'warn',
    title: 'Profile p2 was corrupt',
    detail: 'Moved aside.',
    repair: 'resetProfile',
    repairArg: 'p2',
  },
];
const SHA = 'ab'.repeat(32);
const logLine = (level: number, code: string, msg: string) =>
  JSON.stringify({ level, time: Date.UTC(2026, 9, 4, 8, 0, 0), pid: 1, code, msg });

let state: HealthState;
let statusCb: ((s: Status) => void) | null;
let navigateCb: ((p: string) => void) | null;
let healthChangedCb: ((s: HealthState) => void) | null;
const api = {
  health: {
    get: vi.fn(async () => state),
    run: vi.fn(async () => state),
    repair: vi.fn(async (_r: { id: string; arg?: string }) => ({ ok: true })),
    exportBundle: vi.fn(async () => ({
      path: 'C:\\x\\dualforge-diag.zip',
      files: 7,
      bytes: 2_500_000,
      skipped: [] as string[],
    })),
    onChanged: vi.fn((cb: (s: HealthState) => void) => {
      healthChangedCb = cb;
      return () => {
        healthChangedCb = null;
      };
    }),
  },
  drivers: {
    install: vi.fn((_d: 'vigem' | 'hidhide') => new Promise<Status>(() => undefined)),
    status: vi.fn(async () => ({
      vigem: { driver: 'vigem', state: 'idle' },
      hidhide: { driver: 'hidhide', state: 'idle' },
    })),
    onStatus: vi.fn((cb: (s: Status) => void) => {
      statusCb = cb;
      return () => {
        statusCb = null;
      };
    }),
    release: vi.fn(async (_d: 'vigem' | 'hidhide') => ({
      name: 'HidHide_1.5.exe',
      url: 'https://github.com/nefarius/HidHide/releases/download/v1/HidHide_1.5.exe',
      size: 4_404_224 as number | null,
    })),
  },
  logs: {
    tail: vi.fn(async (_n: number) => ({
      file: 'app.1.log',
      lines: [
        logLine(30, 'APP_START', 'started'),
        logLine(40, 'E_HEALTH_X', 'warned'),
        logLine(50, 'E_ENGINE_CRASH', 'boom'),
        'not json',
      ],
    })),
  },
  system: { openDataDir: vi.fn(async () => '') },
  app: {
    onNavigate: vi.fn((cb: (p: string) => void) => {
      navigateCb = cb;
      return () => {
        navigateCb = null;
      };
    }),
  },
  window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  state = { results: RESULTS, ranAt: Date.UTC(2026, 9, 4, 8, 30) };
  statusCb = null;
  navigateCb = null;
  healthChangedCb = null;
  vi.stubGlobal('dualforge', api);
  useStore.setState({
    health: null,
    navHolds: 0,
    page: 'health',
    lastError: null,
    profiles: [],
    profile: null,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const card = (title: string) => screen.getByRole('article', { name: title });

describe('Health page', () => {
  it('renders the checks from health.get, problems first, with a summary banner', async () => {
    render(<Health />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '3 warnings' })).toBeTruthy());
    expect(api.health.get).toHaveBeenCalled();
    const titles = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(titles).toEqual([
      'HidHide not installed',
      'Engine restarted recently',
      'Profile p2 was corrupt',
      'ViGEmBus ready',
      'DualSense connected',
    ]);
    expect(within(card('DualSense connected')).getByRole('img', { name: 'OK' })).toBeTruthy();
    expect(
      within(card('HidHide not installed')).getByRole('img', { name: 'Warning' }),
    ).toBeTruthy();
    expect(within(card('ViGEmBus ready')).queryByRole('button')).toBeNull();
    expect(
      within(card('HidHide not installed')).getByRole('button', { name: 'Install HidHide' }),
    ).toBeTruthy();
  });

  it('a health:changed push replaces the list (no extra request)', async () => {
    render(
      <>
        <Health />
        <FeedProbe />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    act(() =>
      healthChangedCb!({
        results: [
          {
            id: 'device',
            status: 'error',
            title: 'Engine not running',
            detail: 'x',
            repair: 'restartEngine',
          },
        ],
        ranAt: 1,
      }),
    );
    expect(screen.getByRole('heading', { name: '1 problem' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('Repair calls health.repair with the right id, only on a click', async () => {
    render(<Health />);
    await waitFor(() => expect(card('Engine restarted recently')).toBeTruthy());
    expect(api.health.repair).not.toHaveBeenCalled(); // never repairs on its own
    fireEvent.click(
      within(card('Engine restarted recently')).getByRole('button', { name: 'Restart engine' }),
    );
    await waitFor(() => expect(api.health.repair).toHaveBeenCalledWith({ id: 'restartEngine' }));
    expect(await within(card('Engine restarted recently')).findByText('Done.')).toBeTruthy();
  });

  it('a failed repair shows its code', async () => {
    api.health.repair.mockResolvedValueOnce({
      ok: false,
      code: 'E_HEALTH_REPAIR_FAILED',
      msg: 'nope',
    } as never);
    render(<Health />);
    await waitFor(() => expect(card('Engine restarted recently')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Restart engine' }));
    expect(await screen.findByText(/E_HEALTH_REPAIR_FAILED/)).toBeTruthy();
  });

  it('Reset profile… asks first, then repairs that slot', async () => {
    render(<Health />);
    await waitFor(() => expect(card('Profile p2 was corrupt')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reset profile…' }));
    const dlg = screen.getByRole('dialog', { name: 'Reset profile slot 2?' });
    expect(api.health.repair).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(api.health.repair).toHaveBeenCalledWith({ id: 'resetProfile', arg: 'p2' }),
    );
  });

  it('a driver install shows a consent card first; only Install calls drivers.install', async () => {
    render(<Health />);
    await waitFor(() => expect(card('HidHide not installed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Install HidHide' }));
    const consent = screen.getByRole('group', { name: 'Install HidHide?' });
    expect(consent.textContent).toContain('github.com/nefarius/HidHide/releases');
    await waitFor(() =>
      expect(within(consent).getByTestId('installer-size').textContent).toMatch(/^4\.2 MB, /),
    );
    expect(api.drivers.release).toHaveBeenCalledWith('hidhide');
    expect(consent.textContent).toMatch(/UAC/);
    expect(api.drivers.install).not.toHaveBeenCalled();
    fireEvent.click(within(consent).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Install HidHide?' })).toBeNull();
    expect(api.drivers.install).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Install HidHide' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Install HidHide?' })).getByRole('button', {
        name: 'Install',
      }),
    );
    expect(api.drivers.install).toHaveBeenCalledWith('hidhide');
    expect(api.drivers.install).toHaveBeenCalledTimes(1);
    expect(api.health.repair).not.toHaveBeenCalled();
  });

  it('the consent card says "size unknown" when the release lookup fails, and Install still works', async () => {
    api.drivers.release.mockRejectedValueOnce(new Error('E_DRIVER_FETCH'));
    render(<Health />);
    await waitFor(() => expect(card('HidHide not installed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Install HidHide' }));
    expect(screen.getByTestId('installer-size').textContent).toMatch(/^checking…/);
    await waitFor(() =>
      expect(screen.getByTestId('installer-size').textContent).toBe(
        'size unknown, you will see a Windows UAC prompt',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(api.drivers.install).toHaveBeenCalledWith('hidhide');
  });

  it('driver status drives the progress row, holds pad navigation, and re-checks 10 s after done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Health />);
    await waitFor(() => expect(card('HidHide not installed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Install HidHide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(statusCb).not.toBeNull());
    const c = card('HidHide not installed');

    act(() =>
      statusCb!({
        driver: 'hidhide',
        state: 'downloading',
        pct: 42,
        url: 'https://github.com/nefarius/HidHide/releases/download/v1/HidHide.exe',
      }),
    );
    expect(within(c).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
    expect(within(c).getByText(/Downloading HidHide… 42%/)).toBeTruthy();
    expect(useStore.getState().navHolds).toBe(1);
    expect(
      (within(c).queryByRole('button', { name: 'Install HidHide' }) as HTMLButtonElement | null)
        ?.disabled ?? true,
    ).toBe(true);

    act(() => statusCb!({ driver: 'vigem', state: 'downloading', pct: 99 })); // the other driver: ignored here
    expect(within(c).getByText(/42%/)).toBeTruthy();
    act(() => statusCb!({ driver: 'vigem', state: 'failed', code: 'E_DRIVER_FETCH' }));

    act(() => statusCb!({ driver: 'hidhide', state: 'verifying' }));
    expect(within(c).getByText(/Checking the signature/)).toBeTruthy();
    act(() => statusCb!({ driver: 'hidhide', state: 'launching', sha256: SHA }));
    expect(within(c).getByText(/Starting the installer/)).toBeTruthy();
    act(() => statusCb!({ driver: 'hidhide', state: 'done', sha256: SHA }));
    expect(within(c).getByText('Finish the installer window, then re-run checks.')).toBeTruthy();
    expect(within(c).getByText(SHA)).toBeTruthy();
    expect(useStore.getState().navHolds).toBe(0);

    expect(api.health.run).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(api.health.run).toHaveBeenCalledTimes(1);
  });

  it('a failed install shows the code and the hash, and can be retried through consent again', async () => {
    render(<Health />);
    await waitFor(() => expect(card('HidHide not installed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Install HidHide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(statusCb).not.toBeNull());
    act(() =>
      statusCb!({ driver: 'hidhide', state: 'failed', code: 'E_DRIVER_SIGNER', sha256: SHA }),
    );
    const c = card('HidHide not installed');
    expect(within(c).getByText(/E_DRIVER_SIGNER/)).toBeTruthy();
    expect(within(c).getByText(SHA)).toBeTruthy();
    expect(useStore.getState().navHolds).toBe(0);
    fireEvent.click(within(c).getByRole('button', { name: 'Install HidHide' }));
    expect(screen.getByRole('group', { name: 'Install HidHide?' })).toBeTruthy();
  });

  it('Run checks now, Export diagnostics bundle and Open data folder call through', async () => {
    render(<Health />);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    fireEvent.click(screen.getByRole('button', { name: 'Run checks now' }));
    await waitFor(() => expect(api.health.run).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Export diagnostics bundle' }));
    expect(await screen.findByText(/dualforge-diag\.zip/)).toBeTruthy();
    expect(screen.getByText(/attach it to a GitHub issue.*review it first/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open data folder' }));
    expect(api.system.openDataDir).toHaveBeenCalledTimes(1);
  });

  it('the log viewer shows the tail and filters by level', async () => {
    render(<Health />);
    const log = await screen.findByRole('region', { name: 'Recent log lines' });
    expect(log.getAttribute('aria-live')).toBe('off'); // a refresh is not announced
    expect(screen.queryByRole('log')).toBeNull();
    await waitFor(() => expect(within(log).getAllByRole('listitem')).toHaveLength(4));
    expect(api.logs.tail).toHaveBeenCalledWith(200);
    const group = screen.getByRole('radiogroup', { name: 'Log level' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Warnings' }));
    expect(
      within(log)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual([expect.stringContaining('E_HEALTH_X'), expect.stringContaining('E_ENGINE_CRASH')]);
    fireEvent.click(within(group).getByRole('radio', { name: 'Errors' }));
    expect(within(log).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.logs.tail).toHaveBeenCalledTimes(2));
  });
});

function FeedProbe() {
  useAppFeeds(0);
  return null;
}

describe('Health in the shell', () => {
  it('the header Health button shows the worst status and opens the page', async () => {
    useStore.setState({ page: 'home' });
    render(
      <>
        <Header />
        <FeedProbe />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('health-lamp').className).toContain('warn'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Health' }));
    expect(useStore.getState().page).toBe('health');
    act(() =>
      healthChangedCb!({
        results: [{ id: 'engine', status: 'error', title: 'x', detail: '' }],
        ranAt: 2,
      }),
    );
    expect(screen.getByTestId('health-lamp').className).toContain('error');
  });

  it('Home: "Unable to connect?" opens Health while no controller is connected', () => {
    useStore.setState({ page: 'home', snapshot: null });
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: 'Unable to connect?' }));
    expect(useStore.getState().page).toBe('health');
  });

  it('app.onNavigate opens whitelisted pages only', async () => {
    useStore.setState({ page: 'home' });
    render(<FeedProbe />);
    await waitFor(() => expect(navigateCb).not.toBeNull());
    act(() => navigateCb!('constructor'));
    act(() => navigateCb!('../evil'));
    expect(useStore.getState().page).toBe('home');
    act(() => navigateCb!('health'));
    expect(useStore.getState().page).toBe('health');
  });
});

describe('health summary helpers', () => {
  it('summarises by the worst status', () => {
    expect(healthSummary([]).headline).toBe('Checks did not run');
    expect(healthSummary([RESULTS[0]!]).headline).toBe('All good');
    expect(healthSummary([RESULTS[0]!, RESULTS[1]!])).toMatchObject({
      worst: 'warn',
      headline: '1 warning',
    });
    expect(
      healthSummary([...RESULTS, { id: 'e', status: 'error', title: '', detail: '' }]),
    ).toMatchObject({ worst: 'error', headline: '1 problem, 3 warnings' });
  });

  it('formats the installer size, falling back to "size unknown"', () => {
    expect(formatInstallerSize(4_404_224)).toBe('4.2 MB');
    expect(formatInstallerSize(3 * 1048576)).toBe('3.0 MB');
    expect(formatInstallerSize(12_000)).toBe('0.1 MB'); // never "0.0 MB"
    for (const bad of [null, undefined, 0, -5, Number.NaN, Infinity])
      expect(formatInstallerSize(bad)).toBe('size unknown');
  });

  it('parses pino lines and keeps unparseable ones raw', () => {
    expect(parseLogLine(logLine(50, 'E_X', 'boom'), 0)).toMatchObject({
      level: 50,
      label: 'ERROR',
      code: 'E_X',
      text: 'boom',
    });
    expect(parseLogLine('{"level":30,"msg":"m","driver":"hidhide"}', 1).text).toBe(
      'm driver=hidhide',
    );
    expect(parseLogLine('garbage', 2)).toMatchObject({ level: null, text: 'garbage' });
    expect(parseLogLine('[1]', 3)).toMatchObject({ level: null, text: '[1]' });
  });
});
