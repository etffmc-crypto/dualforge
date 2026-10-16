// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultProfile,
  defaultSettings,
  LICENSE_COPY,
  type LicenseView,
  type Profile,
} from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Settings } from '../../src/renderer/pages/Settings';
import { Profiles } from '../../src/renderer/pages/Profiles';
import { Triggers } from '../../src/renderer/pages/Triggers';
import { Turbo } from '../../src/renderer/pages/Turbo';
import { Macros } from '../../src/renderer/pages/Macros';
import { ProfileTabs } from '../../src/renderer/components/ProfileTabs';
import { Footer } from '../../src/renderer/components/Footer';
import { MappingModal } from '../../src/renderer/pages/buttons/MappingModal';
import { OutputRows } from '../../src/renderer/pages/motion/MotionRows';

const view = (over: Partial<LicenseView> = {}): LicenseView => ({
  enforced: true,
  tier: 'free',
  source: 'none',
  status: '',
  variant: '',
  expiresAt: '',
  lastCheck: '',
  keyHint: '',
  message: '',
  prices: LICENSE_COPY.pricesLine,
  checkoutUrl: true,
  portalUrl: false,
  founderName: '',
  hasLicense: false,
  ...over,
});
const PRO_MONTHLY = view({
  tier: 'pro',
  source: 'key',
  status: 'active',
  variant: 'monthly',
  lastCheck: '2026-10-16T19:07:00Z',
  keyHint: 'THLY',
  hasLicense: true,
});

const licenseApi = {
  get: vi.fn(async () => view()),
  activate: vi.fn(async (_t: string) => PRO_MONTHLY),
  check: vi.fn(async () => PRO_MONTHLY),
  remove: vi.fn(async () => view()),
  openCheckout: vi.fn(async () => true),
  openPortal: vi.fn(async () => true),
  onChanged: vi.fn(() => () => undefined),
};
const profilesApi = {
  set: vi.fn(async () => true),
  activate: vi.fn(async (id: string) => defaultProfile(id, id)),
  shareCode: vi.fn(async () => 'DUALFORGE:abc'),
  list: vi.fn(async () => []),
  current: vi.fn(async () => ({ id: 'p1', source: 'manual' as const })),
  get: vi.fn(async (id: string) => defaultProfile(id, id)),
  onActive: vi.fn(() => () => undefined),
};

function withPro(): Profile {
  const p = defaultProfile('p1', 'Profile 1');
  p.mappings.cross = {
    targets: [{ type: 'key', code: 'VK_SPACE' }],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  p.triggers.left.digital = false;
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('dualforge', {
    license: licenseApi,
    profiles: profilesApi,
    settings: { get: vi.fn(async () => defaultSettings()), set: vi.fn() },
    system: { processes: vi.fn(async () => []), openDataDir: vi.fn() },
  });
  useStore.setState({
    license: view(),
    profile: withPro(),
    activeProfileId: 'p1',
    settings: {
      ...defaultSettings(),
      autoSwitch: [{ exe: 'game.exe', profileId: 'p2' }],
    },
    profiles: [],
    lastError: null,
    page: 'settings',
    planFocus: 0,
    subTab: { sticks: 'left', triggers: 'left' },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Plan card', () => {
  it('is not shown in a dormant build or before main answers', () => {
    useStore.setState({ license: view({ enforced: false }) });
    const { unmount } = render(<Settings />);
    expect(screen.queryByText('Plan')).toBeNull();
    unmount();
    useStore.setState({ license: null });
    render(<Settings />);
    expect(screen.queryByText(LICENSE_COPY.keyLabel)).toBeNull();
  });
  it('on Free shows the DF-023 lines, the paused note, Get Pro and the key box', () => {
    render(<Settings />);
    expect(screen.getByLabelText('Plan: Free')).toBeTruthy();
    expect(screen.getByText(LICENSE_COPY.freeLine)).toBeTruthy();
    expect(screen.getByText(LICENSE_COPY.pricesLine)).toBeTruthy();
    expect(screen.getByText(LICENSE_COPY.paused)).toBeTruthy();
    expect(screen.getByText(LICENSE_COPY.keyHint)).toBeTruthy();
    expect(screen.queryByRole('button', { name: LICENSE_COPY.remove })).toBeNull();
    fireEvent.click(
      within(document.getElementById('plan')!).getByRole('button', { name: LICENSE_COPY.getPro }),
    );
    expect(licenseApi.openCheckout).toHaveBeenCalled();
  });
  it('hides Get Pro when the build has no checkout link', () => {
    useStore.setState({ license: view({ checkoutUrl: false }) });
    render(<Settings />);
    expect(
      within(document.getElementById('plan')!).queryByRole('button', { name: LICENSE_COPY.getPro }),
    ).toBeNull();
  });
  it('Activate sends the key and shows Pro with the plan line', async () => {
    render(<Settings />);
    fireEvent.change(screen.getByLabelText(LICENSE_COPY.keyLabel), {
      target: { value: 'FAKE-MONTHLY' },
    });
    fireEvent.click(screen.getByRole('button', { name: LICENSE_COPY.activate }));
    await waitFor(() => expect(screen.getByLabelText('Plan: Pro')).toBeTruthy());
    expect(licenseApi.activate).toHaveBeenCalledWith('FAKE-MONTHLY');
    expect(screen.getByText(LICENSE_COPY.proLine)).toBeTruthy();
    expect(
      screen.getByText('Pro (monthly). Manage or cancel it in your Lemon Squeezy billing portal.'),
    ).toBeTruthy();
    expect(screen.getByText(/^Last checked October 16, 2026/)).toBeTruthy();
    expect(screen.getByRole('button', { name: LICENSE_COPY.check })).toBeTruthy();
    expect(screen.getByText(LICENSE_COPY.removeHint)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\{date\}|\{n\}|\{plan\}/);
  });
  it('"billing portal" is a link when the portal URL is baked in', () => {
    useStore.setState({ license: { ...PRO_MONTHLY, portalUrl: true } });
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'billing portal' }));
    expect(licenseApi.openPortal).toHaveBeenCalled();
  });
  it('a founder key shows its own badge and the lifetime line; no Check now', () => {
    useStore.setState({
      license: view({
        tier: 'pro',
        source: 'founder',
        variant: 'founder-lifetime',
        founderName: 'Ryda',
        hasLicense: true,
      }),
    });
    render(<Settings />);
    expect(screen.getByLabelText('Plan: Pro (founder key)')).toBeTruthy();
    expect(screen.getByText(LICENSE_COPY.proLifetime)).toBeTruthy();
    expect(screen.queryByRole('button', { name: LICENSE_COPY.check })).toBeNull();
    expect(screen.getByRole('button', { name: LICENSE_COPY.remove })).toBeTruthy();
  });
  it('Check now and Remove license call main and show the answer', async () => {
    useStore.setState({ license: PRO_MONTHLY });
    licenseApi.check.mockResolvedValueOnce(
      view({
        source: 'key',
        status: 'expired',
        hasLicense: true,
        keyHint: 'THLY',
        message: LICENSE_COPY.lapsedExpired,
      }),
    );
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: LICENSE_COPY.check }));
    await waitFor(() => expect(screen.getByText(LICENSE_COPY.lapsedExpired)).toBeTruthy());
    // the answer renders a tick before the buttons re-enable (busy clears in finally): wait for that, as a user would
    const remove = screen.getByRole('button', { name: LICENSE_COPY.remove }) as HTMLButtonElement;
    await waitFor(() => expect(remove.disabled).toBe(false));
    fireEvent.click(remove);
    await waitFor(() => expect(licenseApi.remove).toHaveBeenCalled());
  });
});

describe('Pro gates in the renderer', () => {
  it('trigger effects: the Pro line and disabled modes', () => {
    useStore.setState({ page: 'triggers' });
    render(<Triggers />);
    expect(screen.getByText('Adaptive trigger effects is part of DualForge Pro.')).toBeTruthy();
    const radio = within(
      screen.getByRole('radiogroup', { name: 'Adaptive trigger effect' }),
    ).getByRole('radio', { name: 'Resistance' }) as HTMLButtonElement;
    expect(radio.closest('fieldset')!.disabled).toBe(true);
  });
  it('Get Pro on a gate opens Settings at the Plan card', () => {
    useStore.setState({ page: 'triggers' });
    render(<Triggers />);
    fireEvent.click(screen.getByRole('button', { name: LICENSE_COPY.getPro }));
    expect(useStore.getState().page).toBe('settings');
    expect(useStore.getState().planFocus).toBe(1);
  });
  it('the mapping dialog shows the Pro line on the Keyboard tab and lists the saved key as paused', () => {
    render(<MappingModal button="cross" onClose={() => undefined} />);
    expect(screen.getByText('Keyboard and mouse mappings is part of DualForge Pro.')).toBeTruthy();
    expect(screen.getByText('Space (paused)')).toBeTruthy();
  });
  it('turbo, macros and gyro to the mouse are gated', () => {
    const { unmount } = render(<Turbo />);
    expect(screen.getByText('Turbo is part of DualForge Pro.')).toBeTruthy();
    unmount();
    const m = render(<Macros />);
    expect(screen.getByText('Macros is part of DualForge Pro.')).toBeTruthy();
    m.unmount();
    render(<OutputRows gyro={withPro().gyro} edit={() => undefined} />);
    const mouse = within(screen.getByRole('radiogroup', { name: 'Output' })).getByRole('radio', {
      name: /Mouse/,
    }) as HTMLButtonElement;
    expect(mouse.disabled).toBe(true);
    expect(mouse.textContent).toBe('MousePro');
  });
  it('a saved gyro-to-mouse on Free keeps the Output group reachable by keyboard', () => {
    const gyro = { ...withPro().gyro, output: 'mouse' as const };
    render(<OutputRows gyro={gyro} edit={() => undefined} />);
    const group = within(screen.getByRole('radiogroup', { name: 'Output' }));
    expect(group.getByRole('radio', { name: 'Right stick' }).tabIndex).toBe(0);
    expect(group.getByRole('radio', { name: /Mouse/ }).tabIndex).toBe(-1);
  });
  it('the Duplicate dialog offers only slots 1 and 2 on Free', async () => {
    const { DuplicateDialog } = await import('../../src/renderer/pages/profiles/SlotDialogs');
    const slots = (['p1', 'p2', 'p3', 'p4'] as const).map((id, i) => ({
      id,
      n: i + 1,
      name: `Profile ${i + 1}`,
    }));
    render(
      <DuplicateDialog
        slot={slots[0]!}
        slots={slots}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    );
    const group = within(screen.getByRole('radiogroup', { name: 'Copy into' }));
    expect(group.getByRole('radio', { name: /Profile 3/ }).matches(':disabled')).toBe(true);
    expect(group.getByRole('radio', { name: 'Profile 2' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
  it('profiles: slots 3 and 4 tagged and locked, share export off, auto-switch greyed', async () => {
    useStore.setState({ page: 'profiles' });
    render(<Profiles />);
    const slot3 = screen.getByRole('article', { name: 'Slot 3' });
    expect(within(slot3).getByText('Pro')).toBeTruthy();
    expect(
      (within(slot3).getByRole('button', { name: 'Activate' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        within(screen.getByRole('article', { name: 'Slot 2' })).getByRole('button', {
          name: 'Activate',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(screen.getByText('Share-code export is part of DualForge Pro.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Copy code' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(profilesApi.shareCode).not.toHaveBeenCalled();
    expect(screen.getByText('Per-game auto-switch is part of DualForge Pro.')).toBeTruthy();
    expect(screen.getByText('game.exe')).toBeTruthy(); // rules stay listed
    expect(screen.getByRole('button', { name: 'Add rule' }).matches(':disabled')).toBe(true);
  });
  it('the header slot tabs: a click on slot 3 opens the Plan card instead of switching', () => {
    useStore.setState({ page: 'overview' });
    render(<ProfileTabs />);
    const tab = screen.getAllByRole('tab')[2]!;
    expect(tab.textContent).toContain('Pro');
    fireEvent.click(tab);
    expect(profilesApi.activate).not.toHaveBeenCalled();
    expect(useStore.getState().page).toBe('settings');
  });
  it('on Pro (or dormant) nothing is gated', () => {
    for (const license of [PRO_MONTHLY, view({ enforced: false }), null]) {
      useStore.setState({ license, page: 'triggers' });
      const { unmount } = render(<Triggers />);
      expect(screen.queryByText(/is part of DualForge Pro/)).toBeNull();
      unmount();
    }
  });
});

describe('footer', () => {
  it('words E_LICENSE_PRO with the feature main named', () => {
    vi.stubGlobal('__APP_VERSION__', '0.3.7');
    render(<Footer />);
    act(() => {
      useStore.setState({
        lastError: {
          code: 'E_LICENSE_PRO',
          msg: "Error: Error invoking remote method 'profiles:set': Error: E_LICENSE_PRO: Profile slots 3 and 4",
        },
      });
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'Profile slots 3 and 4 is part of DualForge Pro.',
    );
  });
});
