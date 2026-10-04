// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type EngineSnapshot } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { Lights } from '../../src/renderer/pages/Lights';

function snap(lt = 0, rt = 0): EngineSnapshot {
  return {
    t: 0, connected: true, vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 80, state: 'discharging' },
    raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro: { x: 0, y: 0, z: 0 } },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt, rt, buttons: {} },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('dualforge', { profiles: { set: vi.fn(async () => true) } });
  const p = defaultProfile('p1', 'Profile 1');
  p.lights = { ...p.lights, mode: 'static', playerLeds: 0b00100, micLed: 0 };
  useStore.setState({ profile: p, snapshot: snap(), lastError: null, page: 'lights' });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const lights = () => useStore.getState().profile!.lights;
const group = (name: string) => within(screen.getByRole('radiogroup', { name }));

describe('Lights page', () => {
  it('Lightbar: animation, colour, brightness and speed edit the profile', () => {
    render(<Lights />);
    expect((screen.getByRole('slider', { name: 'Animation speed' }) as HTMLInputElement).disabled).toBe(true); // static: no speed
    fireEvent.click(group('Light animation').getByRole('radio', { name: 'Breathing' }));
    expect(lights().mode).toBe('breathing');
    fireEvent.change(screen.getByRole('slider', { name: 'Animation speed' }), { target: { value: '75' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Light color' }), { target: { value: '120' } });
    fireEvent.click(group('Light brightness').getByRole('radio', { name: 'Low' }));
    expect(lights()).toMatchObject({ mode: 'breathing', speed: 75, r: 0, g: 255, b: 0, brightness: 2 });
    fireEvent.click(group('Light brightness').getByRole('radio', { name: 'High' }));
    expect(lights().brightness).toBe(0);
    fireEvent.click(group('Light animation').getByRole('radio', { name: 'Rainbow' }));
    expect(lights().mode).toBe('rainbow');
  });

  it('Player LEDs: five switches edit the bitmask, left LED = bit 0', () => {
    render(<Lights />);
    fireEvent.click(screen.getByRole('tab', { name: 'Player LEDs' }));
    const led = (n: number) => screen.getByRole('switch', { name: `Player LED ${n}` });
    expect(led(3).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(led(1));
    fireEvent.click(led(5));
    expect(lights().playerLeds).toBe(0b10101);
    fireEvent.click(led(3));
    expect(lights().playerLeds).toBe(0b10001);
  });

  it('Mic: Off / On / Pulse set micLed 0 / 1 / 2', () => {
    render(<Lights />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mic' }));
    fireEvent.click(group('Mic LED').getByRole('radio', { name: 'Pulse' }));
    expect(lights().micLed).toBe(2);
    fireEvent.click(group('Mic LED').getByRole('radio', { name: 'On' }));
    expect(lights().micLed).toBe(1);
  });

  it('RT / LT on the pad step through the sub-tabs', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    render(<Lights />);
    act(() => { useStore.setState({ snapshot: snap(0, 1) }); });
    expect(screen.getByRole('tab', { name: 'Player LEDs' }).getAttribute('aria-selected')).toBe('true');
    act(() => { useStore.setState({ snapshot: snap(0, 0) }); });
    act(() => { useStore.setState({ snapshot: snap(0, 1) }); });
    expect(screen.getByRole('tab', { name: 'Mic' }).getAttribute('aria-selected')).toBe('true');
    act(() => { useStore.setState({ snapshot: snap(1, 0) }); });
    expect(screen.getByRole('tab', { name: 'Player LEDs' }).getAttribute('aria-selected')).toBe('true');
  });

  it('the pad preview shows the LED bitmask and a dark lightbar when Off', () => {
    const { container } = render(<Lights />);
    expect(container.querySelector('[data-led="2"]')!.getAttribute('class')).toBe('led on');
    expect(container.querySelector('[data-led="0"]')!.getAttribute('class')).toBe('led');
    fireEvent.click(group('Light animation').getByRole('radio', { name: 'Off' }));
    expect(container.querySelector('[data-lightbar]')!.getAttribute('fill')).toBe('rgb(0,0,0)');
  });
});
