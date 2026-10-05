// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type EngineSnapshot, type Profile } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Overview, renderCounts } from '../../src/renderer/pages/Overview';
import {
  formatTarget,
  hueOf,
  mappingChips,
  rgbOfHue,
} from '../../src/renderer/pages/overview/format';

function stubProfile(): Profile {
  const p = defaultProfile('p1', 'Profile 1');
  p.lights = { ...p.lights, mode: 'breathing', brightness: 1 };
  p.triggers.left.digital = false;
  p.triggers.left.hairTrigger = { mode: 'adaptive', value: 40 };
  p.triggers.left.deadzone = { initial: 0.1, max: 0.9 };
  p.gyro = {
    ...p.gyro,
    output: 'mouse',
    activate: 'hold',
    activateButton: 'l1',
    sensitivityX: 1.5,
    sensitivityY: 2,
  };
  p.mappings.cross = {
    targets: [{ type: 'xbutton', button: 'B' }],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  p.mappings.square = {
    targets: [
      { type: 'key', code: 'VK_SPACE' },
      { type: 'mouse', button: 'left' },
    ],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  p.mappings.r2 = {
    targets: [{ type: 'xtrigger', trigger: 'lt' }],
    turbo: { mode: 'off', hz: 12 },
    continuous: false,
  };
  return p;
}

function snap(): EngineSnapshot {
  return {
    t: 0,
    connected: true,
    source: 'device',
    vigemReady: true,
    reportHz: 250,
    pipelineP99Ms: 0,
    battery: { percent: 72, state: 'charging' },
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
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) } });
  useStore.setState({
    profile: stubProfile(),
    snapshot: snap(),
    lastError: null,
    page: 'overview',
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const card = (name: string) => screen.getByRole('region', { name });

describe('Overview cards', () => {
  it('summarise the stubbed profile', () => {
    render(<Overview />);
    // Lights
    expect(
      within(card('Lights')).getByRole('radio', { name: 'Breathing' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      within(card('Lights')).getByRole('radio', { name: 'Medium' }).getAttribute('aria-checked'),
    ).toBe('true');
    // Motion
    const motion = within(card('Motion'));
    expect(motion.getByTestId('motion-mode').textContent).toBe('Aim');
    expect(motion.getByTestId('motion-output').textContent).toBe('Mouse');
    expect(motion.getByTestId('motion-activate').textContent).toBe('Hold L1');
    expect(motion.getByTestId('motion-sens').textContent).toBe('1.5× / 2×');
    // Triggers: analog left with its numbers, digital right with the badge
    const trig = within(card('Triggers'));
    expect(trig.getByTestId('trigger-left').textContent).toMatch(/Deadzone10–90%/);
    expect(trig.getByTestId('trigger-left').textContent).toMatch(/Hair triggerAdaptive 40%/);
    expect(within(trig.getByTestId('trigger-right')).getByText('Digital')).toBeTruthy();
    // Sticks: both sides, each with sliders and a curve thumbnail
    const sticks = within(card('Sticks'));
    expect(sticks.getByRole('slider', { name: 'Left stick anti-deadzone' })).toBeTruthy();
    expect(sticks.getByRole('slider', { name: 'Right stick anti-deadzone' })).toBeTruthy();
    expect(card('Sticks').querySelectorAll('.curve-preview')).toHaveLength(2);
    // Buttons: only the non-default mappings
    const rows = within(card('Buttons'))
      .getAllByRole('button', { name: /▸/ })
      .map((b) => b.textContent);
    expect(rows).toEqual(['✕ ▸ B', '□ ▸ Space + Mouse left', 'R2 ▸ LT (digital)']);
    // stage
    expect(screen.getByText('DUALSENSE')).toBeTruthy();
    expect(screen.getByTitle('Battery 72%')).toBeTruthy();
  });

  it('a mapping chip opens the Buttons page; the Motion chevron opens Motion', () => {
    render(<Overview />);
    fireEvent.click(screen.getByRole('button', { name: '✕ ▸ B' }));
    expect(useStore.getState().page).toBe('buttons');
    fireEvent.click(screen.getByRole('button', { name: 'Open Motion' }));
    expect(useStore.getState().page).toBe('motion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Triggers' }));
    expect(useStore.getState().page).toBe('triggers');
  });

  it('caps the Buttons list at 8 rows and says how many more', () => {
    const p = defaultProfile('p1', 'Profile 1');
    for (const b of [
      'cross',
      'circle',
      'square',
      'triangle',
      'l1',
      'r1',
      'l3',
      'r3',
      'create',
      'options',
    ] as const) {
      p.mappings[b] = {
        targets: [{ type: 'none' }],
        turbo: { mode: 'off', hz: 12 },
        continuous: false,
      };
    }
    useStore.setState({ profile: p });
    render(<Overview />);
    expect(within(card('Buttons')).getAllByRole('button', { name: /▸/ })).toHaveLength(8);
    expect(within(card('Buttons')).getByRole('button', { name: '+2 more' })).toBeTruthy();
  });

  it('with every button on its default the Buttons card invites a remap', () => {
    useStore.setState({ profile: defaultProfile('p1', 'Profile 1') });
    render(<Overview />);
    expect(
      within(card('Buttons')).getByText('Every button sends its standard Xbox input.'),
    ).toBeTruthy();
    fireEvent.click(within(card('Buttons')).getByRole('button', { name: 'Remap buttons' }));
    expect(useStore.getState().page).toBe('buttons');
  });

  it('Lights and Sticks controls edit the profile', () => {
    render(<Overview />);
    fireEvent.click(within(card('Lights')).getByRole('radio', { name: 'Rainbow' }));
    expect(useStore.getState().profile!.lights.mode).toBe('rainbow');
    fireEvent.change(within(card('Lights')).getByRole('slider', { name: 'Light color' }), {
      target: { value: '120' },
    });
    expect(useStore.getState().profile!.lights).toMatchObject({ r: 0, g: 255, b: 0 });
    fireEvent.click(within(card('Lights')).getByRole('radio', { name: 'Low' }));
    expect(useStore.getState().profile!.lights.brightness).toBe(2);
    fireEvent.change(
      within(card('Sticks')).getByRole('slider', { name: 'Left stick anti-deadzone' }),
      { target: { value: '0.2' } },
    );
    expect(useStore.getState().profile!.sticks.left.deadzone.anti).toBe(0.2);
    expect(useStore.getState().profile!.sticks.right.deadzone.anti).toBe(0);
  });

  it('a snapshot stream re-renders only the live pad, not the tiles', () => {
    render(<Overview />);
    const lights0 = renderCounts.lights,
      pad0 = renderCounts.livePad;
    for (let i = 0; i < 10; i++) {
      const s = snap();
      s.raw.lx = i / 10;
      s.raw.buttons = { cross: i % 2 === 0 };
      act(() => useStore.setState({ snapshot: s }));
    }
    expect(renderCounts.lights - lights0).toBe(0);
    expect(renderCounts.livePad - pad0).toBe(10);
    // an edit still reaches the tiles
    act(() =>
      useStore.getState().updateProfile((d) => {
        d.lights.mode = 'off';
      }),
    );
    expect(renderCounts.lights - lights0).toBe(1);
  });

  it('the live pad says Replay when the input is a replayed recording', () => {
    const s = snap();
    useStore.setState({ snapshot: { ...s, source: 'replay' } });
    render(<Overview />);
    expect(screen.getByText('Connected · Replay · Profile 1')).toBeTruthy();
    act(() => useStore.setState({ snapshot: s }));
    expect(screen.getByText('Connected · USB · Profile 1')).toBeTruthy();
  });

  it('renders nothing until the profile loads', () => {
    useStore.setState({ profile: null });
    const { container } = render(<Overview />);
    expect(container.textContent).toBe('');
  });
});

describe('overview format helpers', () => {
  it('formats targets', () => {
    const p = defaultProfile('p', 'P');
    expect(formatTarget({ type: 'xbutton', button: 'DPAD_UP' }, 'cross', p)).toBe('D-pad up');
    expect(formatTarget({ type: 'xbutton', button: 'START' }, 'cross', p)).toBe('Start');
    expect(formatTarget({ type: 'key', code: 'VK_F5' }, 'cross', p)).toBe('F5');
    expect(formatTarget({ type: 'none' }, 'cross', p)).toBe('Disabled');
    expect(formatTarget({ type: 'xtrigger', trigger: 'rt' }, 'cross', p)).toBe('RT (digital)');
    p.triggers.left.digital = false;
    expect(formatTarget({ type: 'xtrigger', trigger: 'rt' }, 'l2', p)).toBe('RT');
    p.macros = [
      {
        id: 'm1',
        name: 'Reload',
        steps: [{ target: { type: 'key', code: 'VK_R' }, holdMs: 10, delayMs: 0 }],
        loop: false,
      },
    ];
    expect(formatTarget({ type: 'macro', macroId: 'm1' }, 'cross', p)).toBe('Macro Reload');
  });

  it('lists only mappings that differ from the defaults, in button order', () => {
    const p = defaultProfile('p', 'P');
    expect(mappingChips(p)).toEqual([]);
    p.mappings.dpadUp = {
      targets: [{ type: 'key', code: 'VK_UP' }],
      turbo: { mode: 'off', hz: 12 },
      continuous: false,
    };
    p.mappings.cross = {
      targets: [{ type: 'xbutton', button: 'A' }],
      turbo: { mode: 'hold', hz: 10 },
      continuous: false,
    }; // same target, turbo only: listed for its turbo
    expect(mappingChips(p).map((c) => c.text)).toEqual(['✕ ▸ A ⟳ 10 Hz', 'D-Pad ↑ ▸ Up']);
  });

  it('converts between hue and rgb', () => {
    expect(rgbOfHue(0)).toEqual({ r: 255, g: 0, b: 0 });
    expect(rgbOfHue(240)).toEqual({ r: 0, g: 0, b: 255 });
    expect(hueOf({ r: 0, g: 80, b: 255 })).toBeCloseTo(221.2, 1);
    expect(hueOf({ r: 40, g: 40, b: 40 })).toBe(0);
  });
});
