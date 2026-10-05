// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DS_BUTTONS,
  defaultProfile,
  defaultSettings,
  type EngineSnapshot,
  type Profile,
  type Settings as S,
} from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Turbo } from '../../src/renderer/pages/Turbo';
import { MappingModal } from '../../src/renderer/pages/buttons/MappingModal';
import { TurboPrefs } from '../../src/renderer/pages/settings/TurboPrefs';
import { mappingChips } from '../../src/renderer/pages/overview/format';
import { TABS } from '../../src/renderer/components/TabStrip';

function snap(turboActive = false): EngineSnapshot {
  return {
    t: 0,
    connected: true,
    source: 'device',
    vigemReady: true,
    reportHz: 250,
    pipelineP99Ms: 0,
    battery: { percent: 50, state: 'discharging' },
    raw: {
      lx: 0,
      ly: 0,
      rx: 0,
      ry: 0,
      l2: 0,
      r2: 0,
      buttons: {},
      gyro: { x: 0, y: 0, z: 0 },
      touch: [],
    },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
    turboActive,
    turboConfigured: turboActive,
  };
}

let stored: S;
beforeEach(() => {
  vi.useFakeTimers();
  stored = defaultSettings();
  vi.stubGlobal('dualforge', {
    profiles: { set: vi.fn(async () => true) },
    settings: {
      get: vi.fn(async () => stored),
      set: vi.fn(async (patch: Partial<S>) => (stored = { ...stored, ...patch })),
    },
  });
  useStore.setState({
    profile: defaultProfile('p1', 'Profile 1'),
    settings: defaultSettings(),
    snapshot: snap(),
    lastError: null,
    page: 'turbo',
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const turbo = (b: keyof Profile['mappings']) => useStore.getState().profile!.mappings[b]!.turbo;
const chip = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^Turbo ${label}:`) });
const dialog = () => within(screen.getByRole('dialog'));
const radio = (group: string, name: string) =>
  within(dialog().getByRole('radiogroup', { name: group })).getByRole('radio', { name });

describe('Turbo page', () => {
  it('is a tab right after Buttons', () => {
    const ids = TABS.map((t) => t.id);
    expect(ids.indexOf('turbo')).toBe(ids.indexOf('buttons') + 1);
  });
  it('shows one turbo chip per button; editing a chip sets mode, speed and continuous', () => {
    render(<Turbo />);
    expect(screen.getAllByRole('button', { name: /^Turbo .+: / })).toHaveLength(DS_BUTTONS.length);
    expect(chip('✕').getAttribute('aria-label')).toBe('Turbo ✕: Off');
    fireEvent.click(chip('✕'));
    expect(screen.getByRole('dialog', { name: 'Turbo ✕' })).toBeTruthy();
    fireEvent.click(radio('Turbo mode', 'Hold'));
    expect(turbo('cross')).toEqual({ mode: 'hold', hz: 12 });
    fireEvent.click(radio('Turbo speed', 'Fast 20'));
    expect(turbo('cross')).toEqual({ mode: 'hold', hz: 20 });
    fireEvent.click(radio('Turbo speed', 'Custom'));
    fireEvent.change(dialog().getByRole('slider', { name: 'Turbo speed (Hz)' }), {
      target: { value: '17' },
    });
    expect(turbo('cross')).toEqual({ mode: 'hold', hz: 17 });
    fireEvent.click(radio('Turbo mode', 'Toggle'));
    expect(turbo('cross')).toEqual({ mode: 'toggle', hz: 17 });
    fireEvent.click(dialog().getByRole('switch', { name: 'Continuous trigger' }));
    expect(useStore.getState().profile!.mappings.cross!.continuous).toBe(true);
    fireEvent.click(dialog().getByRole('button', { name: 'Done' }));
    expect(chip('✕').getAttribute('aria-label')).toBe('Turbo ✕: Toggle 17 Hz');
  });
  it('picking a speed while turbo is off switches it on in hold mode', () => {
    render(<Turbo />);
    fireEvent.click(chip('○'));
    fireEvent.click(radio('Turbo speed', 'Slow 8'));
    expect(turbo('circle')).toEqual({ mode: 'hold', hz: 8 });
    fireEvent.click(radio('Turbo mode', 'Off'));
    expect(turbo('circle')).toEqual({ mode: 'off', hz: 8 });
  });
  it('Clear all turbo turns every mapping off and is disabled when nothing is set', () => {
    act(() => {
      useStore.getState().updateProfile((p) => {
        p.mappings.cross!.turbo = { mode: 'hold', hz: 20 };
        p.mappings.r1!.turbo = { mode: 'toggle', hz: 8 };
      });
    });
    render(<Turbo />);
    const clear = screen.getByRole('button', { name: 'Clear all turbo' }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(turbo('cross').mode).toBe('off');
    expect(turbo('r1').mode).toBe('off');
    expect(clear.disabled).toBe(true);
  });
  it('the live indicator follows snapshot.turboActive', () => {
    render(<Turbo />);
    expect(screen.getByRole('status').textContent).toBe('Turbo idle');
    act(() => useStore.setState({ snapshot: snap(true) }));
    expect(screen.getByRole('status').textContent).toBe('Turbo active');
  });
  it('the help card names the mode button from settings, or says on-pad assignment is off', () => {
    render(<Turbo />);
    const help = screen.getByRole('note');
    expect(help.textContent).toContain('Hold Touchpad + press a button');
    expect(help.textContent).toContain('Slow → Medium → Fast → Off');
    expect(help.textContent).toContain('Double-tap Touchpad');
    act(() =>
      useStore.setState({
        settings: { ...defaultSettings(), turbo: { ...defaultSettings().turbo, modeButton: 'ps' } },
      }),
    );
    expect(help.textContent).toContain('Hold PS + press a button');
    act(() =>
      useStore.setState({
        settings: { ...defaultSettings(), turbo: { ...defaultSettings().turbo, modeButton: null } },
      }),
    );
    expect(screen.getByRole('note').textContent).toContain('On-pad assignment is off');
  });
});

describe('mapping modal parity', () => {
  it('the mapping modal edits turbo with the same controls, and the Turbo page shows the result', () => {
    const { unmount } = render(<MappingModal button="r1" onClose={() => {}} />);
    fireEvent.click(radio('Turbo mode', 'Toggle'));
    fireEvent.click(radio('Turbo speed', 'Fast 20'));
    expect(turbo('r1')).toEqual({ mode: 'toggle', hz: 20 });
    expect(document.querySelector('.turbo-value')!.textContent).toBe('Toggle 20 Hz');
    unmount();
    render(<Turbo />);
    expect(chip('R1').getAttribute('aria-label')).toBe('Turbo R1: Toggle 20 Hz');
    fireEvent.click(chip('R1'));
    expect(radio('Turbo mode', 'Toggle').getAttribute('aria-checked')).toBe('true');
    expect(radio('Turbo speed', 'Fast 20').getAttribute('aria-checked')).toBe('true');
  });
});

describe('Settings: turbo', () => {
  it('toggles and the mode button picker round-trip through updateSettings', async () => {
    render(<TurboPrefs />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Pulse the lightbar red' }));
    });
    expect(stored.turbo).toEqual({
      modeButton: 'touchpad',
      lightbarPulse: false,
      onPadAssign: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Assign turbo on the controller' }));
    });
    expect(stored.turbo.onPadAssign).toBe(false);
    // with on-pad assignment off there is no mode button to pick
    expect(
      (screen.getByRole('button', { name: 'Mode button: Touchpad' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Assign turbo on the controller' }));
    });
    expect(stored.turbo.onPadAssign).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mode button: Touchpad' }));
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'PS' }));
    });
    expect(stored.turbo.modeButton).toBe('ps');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mode button: PS' }));
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'None' }));
    });
    expect(stored.turbo.modeButton).toBeNull();
    expect(screen.getByRole('button', { name: 'Mode button: None' })).toBeTruthy();
  });
});

describe('turbo decisions', () => {
  it('a macro-only button has its turbo controls disabled with a hint, and counts as no turbo', () => {
    act(() => {
      useStore.getState().updateProfile((p) => {
        p.macros = [
          {
            id: 'm',
            name: 'Reload',
            steps: [{ target: { type: 'key', code: 'VK_R' }, holdMs: 10, delayMs: 0 }],
            loop: false,
          },
        ];
        p.mappings.square = {
          targets: [{ type: 'macro', macroId: 'm' }],
          turbo: { mode: 'hold', hz: 12 },
          continuous: false,
        };
      });
    });
    render(<Turbo />);
    expect(chip('□').getAttribute('aria-label')).toBe('Turbo □: Macro (no turbo)');
    expect(screen.getByText('No button has turbo')).toBeTruthy();
    fireEvent.click(chip('□'));
    expect(dialog().getByText(/Macros run on their own timing/)).toBeTruthy();
    const hold = radio('Turbo mode', 'Off');
    expect(hold.matches(':disabled')).toBe(true);
    fireEvent.click(hold);
    expect(turbo('square')).toEqual({ mode: 'hold', hz: 12 }); // unchanged
  });
  it('Settings warns when the mode button has an output of its own', () => {
    const at = (modeButton: S['turbo']['modeButton']) =>
      act(() =>
        useStore.setState({
          settings: { ...defaultSettings(), turbo: { ...defaultSettings().turbo, modeButton } },
        }),
      );
    render(<TurboPrefs />);
    const warn = () => screen.queryByText(/own output will be delayed or suppressed/);
    expect(warn()).toBeNull(); // touchpad sends nothing by default
    at('ps'); // mapped to Guide
    expect(warn()).toBeTruthy();
    at('cross');
    expect(warn()).toBeTruthy();
    at('mic'); // no output by default
    expect(warn()).toBeNull();
    act(() => {
      useStore.getState().updateProfile((p) => {
        p.mappings.l2!.targets = [{ type: 'none' }];
      });
    });
    at('l2'); // a shoulder button warns even when unmapped
    expect(warn()).toBeTruthy();
  });
});

describe('Overview chips', () => {
  it('show ⟳ Hz for mappings with turbo set, even with the stock output', () => {
    const p = defaultProfile('p', 'P');
    p.mappings.cross!.turbo = { mode: 'hold', hz: 12 };
    p.mappings.square = {
      targets: [{ type: 'key', code: 'VK_SPACE' }],
      turbo: { mode: 'toggle', hz: 20 },
      continuous: false,
    };
    expect(mappingChips(p).map((c) => c.text)).toEqual(['✕ ▸ A ⟳ 12 Hz', '□ ▸ Space ⟳ 20 Hz']);
  });
});
