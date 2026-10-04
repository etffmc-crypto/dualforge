// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type EngineSnapshot } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { InputTest } from '../../src/renderer/pages/InputTest';
import { Home } from '../../src/renderer/pages/Home';

type Touch = EngineSnapshot['raw']['touch'];
function snap(source: EngineSnapshot['source'], gyro = { x: 0, y: 0, z: 0 }, touch: Touch = []): EngineSnapshot {
  return {
    t: 0, connected: true, source, vigemReady: true, reportHz: 250, pipelineP99Ms: 0, battery: { percent: 60, state: 'discharging' },
    raw: { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: {}, gyro, touch },
    out: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
  };
}
const useDevice = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('dualforge', { useDevice });
  useStore.setState({ profile: defaultProfile('p1', 'Profile 1'), snapshot: snap('device'), lastError: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Input Test extras', () => {
  it('shows an amber REPLAY badge only while a recording is replayed, with a way back to the controller', () => {
    const { rerender } = render(<InputTest />);
    expect(screen.queryByText('REPLAY')).toBeNull();
    useStore.setState({ snapshot: snap('replay') });
    rerender(<InputTest />);
    expect(screen.getByText('REPLAY').className).toMatch(/\bit-replay\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Use the controller' }));
    expect(useDevice).toHaveBeenCalledTimes(1);
  });

  it('draws yaw / pitch / roll bars in °/s from the raw gyro (16.384 LSB per °/s, ±500 range)', () => {
    useStore.setState({ snapshot: snap('device', { x: -819.2, y: 1638.4, z: 16384 }) });
    render(<InputTest />);
    const bar = (name: string) => screen.getByRole('meter', { name });
    expect(bar('Yaw').getAttribute('aria-valuenow')).toBe('100');
    expect(bar('Pitch').getAttribute('aria-valuenow')).toBe('-50');
    expect(bar('Roll').getAttribute('aria-valuenow')).toBe('500');   // 1000 °/s is clamped to the scale
    expect(screen.getByText('+100 °/s')).toBeTruthy();
    expect(screen.getByText('−50 °/s')).toBeTruthy();
    const fill = (name: string) => (bar(name).querySelector('.it-gyro-fill') as HTMLElement).style;
    expect([fill('Yaw').left, fill('Yaw').width]).toEqual(['50%', '10%']);
    expect([fill('Pitch').left, fill('Pitch').width]).toEqual(['45%', '5%']);
  });

  it('places a dot for each finger on the touchpad and none for lifted fingers', () => {
    useStore.setState({ snapshot: snap('device', undefined, [{ active: true, id: 3, x: 960, y: 270 }, { active: false, id: 4, x: 100, y: 100 }]) });
    const { container } = render(<InputTest />);
    const dots = container.querySelectorAll<HTMLElement>('.it-finger');
    expect(dots).toHaveLength(1);
    expect([dots[0]!.style.left, dots[0]!.style.top]).toEqual(['50%', '25%']);
    expect(screen.getByText('1 finger')).toBeTruthy();
  });

  it('a blank report (both slots id 0 at the corner) counts once, not as two fingers', () => {
    useStore.setState({ snapshot: snap('replay', undefined, [{ active: true, id: 0, x: 0, y: 0 }, { active: true, id: 0, x: 0, y: 0 }]) });
    const { container } = render(<InputTest />);
    expect(container.querySelectorAll('.it-finger')).toHaveLength(1);
    expect(screen.getByText('1 finger')).toBeTruthy();
  });

  it('Home says Replay instead of USB while replaying', () => {
    const { rerender } = render(<Home />);
    expect(screen.getByText(/Connected · USB/)).toBeTruthy();
    useStore.setState({ snapshot: snap('replay') });
    rerender(<Home />);
    expect(screen.getByText(/Connected · Replay/)).toBeTruthy();
  });
});
