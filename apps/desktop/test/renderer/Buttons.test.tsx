// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DS_BUTTONS,
  VK_NAMES,
  defaultProfile,
  type EngineSnapshot,
  type Profile,
} from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Buttons } from '../../src/renderer/pages/Buttons';
import { MappingModal } from '../../src/renderer/pages/buttons/MappingModal';
import {
  KEY_LABELS,
  pickTarget,
  summarize,
  summaryLine,
} from '../../src/renderer/pages/buttons/targets';
import { MAIN_ROWS, NAV_ROWS, NUMPAD, OFF_BOARD } from '../../src/renderer/pages/buttons/keyboard';

function stubProfile(): Profile {
  const p = defaultProfile('p1', 'Profile 1');
  p.macros = [
    {
      id: 'm1',
      name: 'Reload',
      steps: [{ target: { type: 'xbutton', button: 'X' }, holdMs: 50, delayMs: 0 }],
      loop: false,
    },
  ];
  return p;
}
function snap(buttons: Record<string, boolean> = {}): EngineSnapshot {
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
      buttons,
      gyro: { x: 0, y: 0, z: 0 },
      touch: [],
    },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) } });
  useStore.setState({ profile: stubProfile(), snapshot: snap(), lastError: null, page: 'buttons' });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pill = (label: string) =>
  screen.getByRole('button', {
    name: new RegExp(`^Map ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`),
  });
const mapping = (b: keyof Profile['mappings']) => useStore.getState().profile!.mappings[b]!;
const dialog = () => within(screen.getByRole('dialog'));
const tab = (name: string) => fireEvent.click(dialog().getByRole('tab', { name }));

describe('Buttons page', () => {
  it('shows one pill per DualSense button with its current output', () => {
    render(<Buttons />);
    expect(screen.getAllByRole('button', { name: /^Map / })).toHaveLength(DS_BUTTONS.length);
    expect(pill('✕').textContent).toContain('A');
    expect(pill('L2').textContent).toContain('LT');
    expect(pill('D-Pad ↑').textContent).toContain('D-pad ↑');
    expect(pill('Touchpad').textContent).toContain('Off');
    expect(document.querySelectorAll('.lead-line')).toHaveLength(DS_BUTTONS.length);
  });

  it('maps cross to Space from the Keyboard tab', () => {
    render(<Buttons />);
    fireEvent.click(pill('✕'));
    expect(screen.getByRole('dialog', { name: 'Remap ✕' })).toBeTruthy();
    tab('Keyboard');
    fireEvent.click(dialog().getByRole('button', { name: 'Space' }));
    expect(mapping('cross').targets).toEqual([{ type: 'key', code: 'VK_SPACE' }]);
    expect(dialog().getByRole('button', { name: 'Space' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // single select replaces
    fireEvent.click(dialog().getByRole('button', { name: 'Num 7' }));
    expect(mapping('cross').targets).toEqual([{ type: 'key', code: 'VK_NUMPAD7' }]);
    fireEvent.click(dialog().getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill('✕').textContent).toContain('Num 7');
  });

  it('multi-map adds up to 3 targets, then disables the rest; chips remove them', () => {
    render(<Buttons />);
    fireEvent.click(pill('□'));
    fireEvent.click(dialog().getByRole('switch', { name: 'Map multiple buttons (up to 3)' }));
    fireEvent.click(dialog().getByRole('button', { name: 'B' }));
    tab('Mouse');
    fireEvent.click(dialog().getByRole('button', { name: 'Mouse L' }));
    expect(mapping('square').targets).toEqual([
      { type: 'xbutton', button: 'X' },
      { type: 'xbutton', button: 'B' },
      { type: 'mouse', button: 'left' },
    ]);
    expect((dialog().getByRole('button', { name: 'Mouse R' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    tab('Controller');
    expect((dialog().getByRole('button', { name: 'Y' }) as HTMLButtonElement).disabled).toBe(true);
    const chips = within(dialog().getByRole('list', { name: 'Selected outputs' }));
    expect(
      chips.getAllByRole('listitem').map((li) => li.textContent?.replace('×', '').trim()),
    ).toEqual(['X', 'B', 'Mouse L']);
    fireEvent.click(chips.getByRole('button', { name: 'Remove B' }));
    expect(mapping('square').targets).toEqual([
      { type: 'xbutton', button: 'X' },
      { type: 'mouse', button: 'left' },
    ]);
    expect((dialog().getByRole('button', { name: 'Y' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(dialog().getByRole('button', { name: 'Done' }));
    expect(pill('□').textContent).toContain('+1');
  });

  it('turbo and continuous persist across reopen; Clear resets to no output', () => {
    render(<Buttons />);
    fireEvent.click(pill('R1'));
    fireEvent.change(dialog().getByRole('slider', { name: 'Turbo' }), { target: { value: '15' } });
    fireEvent.click(dialog().getByRole('switch', { name: 'Continuous trigger' }));
    expect(mapping('r1')).toMatchObject({ turbo: { mode: 'hold', hz: 15 }, continuous: true });
    fireEvent.click(dialog().getByRole('button', { name: 'Close' }));
    expect(pill('R1').textContent).toMatch(/RB.*⟳.*∞/);
    fireEvent.click(pill('R1'));
    expect((dialog().getByRole('slider', { name: 'Turbo' }) as HTMLInputElement).value).toBe('15');
    expect(document.querySelector('.turbo-value')!.textContent).toBe('15 Hz');
    expect(
      dialog().getByRole('switch', { name: 'Continuous trigger' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(dialog().getByRole('button', { name: 'Clear' }));
    expect(mapping('r1')).toEqual({
      targets: [{ type: 'none' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    });
    expect(document.querySelector('.turbo-value')!.textContent).toBe('Off');
  });

  it('the Macro tab assigns a macro; the pill names it', () => {
    render(<Buttons />);
    fireEvent.click(pill('△'));
    tab('Macro');
    fireEvent.click(dialog().getByRole('button', { name: 'Reload' }));
    expect(mapping('triangle').targets).toEqual([{ type: 'macro', macroId: 'm1' }]);
    fireEvent.click(dialog().getByRole('button', { name: 'Done' }));
    expect(pill('△').getAttribute('aria-label')).toBe('Map △: ⟨macro⟩ Reload');
  });

  it('No output and the trigger outputs come from the Controller tab', () => {
    render(<Buttons />);
    fireEvent.click(pill('L1'));
    fireEvent.click(dialog().getByRole('button', { name: 'RT' }));
    expect(mapping('l1').targets).toEqual([{ type: 'xtrigger', trigger: 'rt' }]);
    fireEvent.click(dialog().getByRole('button', { name: 'No output' }));
    expect(mapping('l1').targets).toEqual([{ type: 'none' }]);
  });

  it('a held pad button lights its pill', () => {
    render(<Buttons />);
    expect(pill('✕').closest('.bpill')!.classList.contains('pressed')).toBe(false);
    act(() => useStore.setState({ snapshot: snap({ cross: true }) }));
    expect(pill('✕').closest('.bpill')!.classList.contains('pressed')).toBe(true);
  });

  it('renders nothing until the profile loads', () => {
    useStore.setState({ profile: null });
    const { container } = render(<Buttons />);
    expect(container.textContent).toBe('');
  });
});

describe('button target helpers', () => {
  it('every key name has a unique label and a key on the board (bar the generic modifiers)', () => {
    const labels = Object.values(KEY_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    const onBoard = new Set([
      ...[...MAIN_ROWS, ...NAV_ROWS].flat().flatMap((c) => ('code' in c ? [c.code] : [])),
      ...NUMPAD.map((k) => k.code),
    ]);
    expect([...VK_NAMES].filter((v) => !onBoard.has(v)).sort()).toEqual([...OFF_BOARD].sort());
    expect(KEY_LABELS.VK_PRIOR).toBe('PgUp');
    expect(KEY_LABELS.VK_VOLUME_UP).toBe('Vol+');
  });

  it('pickTarget: single replaces, multi toggles up to 3, No output replaces all', () => {
    const A = { type: 'xbutton', button: 'A' } as const,
      B = { type: 'xbutton', button: 'B' } as const;
    const sp = { type: 'key', code: 'VK_SPACE' } as const,
      ml = { type: 'mouse', button: 'left' } as const;
    expect(pickTarget([A], B, false)).toEqual([B]);
    expect(pickTarget([A], B, true)).toEqual([A, B]);
    expect(pickTarget([A, B, sp], ml, true)).toEqual([A, B, sp]);
    expect(pickTarget([A, B], A, true)).toEqual([B]);
    expect(pickTarget([A], A, true)).toEqual([{ type: 'none' }]);
    expect(pickTarget([{ type: 'none' }], B, true)).toEqual([B]);
    expect(pickTarget([A, B], { type: 'none' }, true)).toEqual([{ type: 'none' }]);
  });

  it('summaryLine marks multi, turbo and continuous', () => {
    const s = summarize(
      {
        targets: [
          { type: 'key', code: 'VK_SPACE' },
          { type: 'mouse', button: 'left' },
        ],
        turbo: { mode: 'hold', hz: 10 },
        continuous: true,
      },
      [],
    );
    expect(summaryLine(s)).toBe('Space +1 ⟳ ∞');
  });
});

describe('MappingModal on a sparse profile', () => {
  it('opens for a button absent from mappings, shows its default, and the first edit stores it', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = stubProfile();
    delete (p.mappings as Partial<Profile['mappings']>).square;
    useStore.setState({ profile: p });
    render(<MappingModal button="square" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Remap □' })).toBeTruthy();
    expect(dialog().getByRole('button', { name: 'X' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dialog().getByRole('button', { name: 'Y' }));
    expect(mapping('square').targets).toEqual([{ type: 'xbutton', button: 'Y' }]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
