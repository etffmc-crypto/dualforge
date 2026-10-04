// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, defaultSettings } from '@dualforge/shared';
import { useStore } from '../../src/renderer/store';
import { ErrorBoundary } from '../../src/renderer/components/ErrorBoundary';

// the Home page blows up during render, as a broken selector would
vi.mock('../../src/renderer/pages/Home', () => ({
  Home: () => { throw Object.assign(new Error('selector exploded'), { code: 'E_TEST_CRASH' }); },
}));
const { default: App } = await import('../../src/renderer/App');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});   // React logs caught render errors
  vi.stubGlobal('dualforge', {
    profiles: {
      current: vi.fn(async () => ({ id: 'p1', source: 'manual' })), get: vi.fn(async (id: string) => defaultProfile(id, 'Profile 1')),
      list: vi.fn(async () => []), onActive: vi.fn(() => () => {}), set: vi.fn(async () => true),
    },
    settings: { get: vi.fn(async () => defaultSettings()) },
    onEngineEvent: vi.fn(() => () => {}),
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
  });
  useStore.setState({ page: 'home', snapshot: null, lastError: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('top-level error boundary', () => {
  it('a render crash anywhere in the app shows the restart card with the code and message instead of a blank window', () => {
    render(<App />);
    const card = screen.getByRole('alert');
    expect(card.textContent).toContain('Something went wrong — restart');
    expect(card.textContent).toContain('E_TEST_CRASH');
    expect(card.textContent).toContain('selector exploded');
  });

  it('Reload reloads the window', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    function Bomb(): never { throw new TypeError('x is undefined'); }
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('TypeError');   // no code: the error's name stands in
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders its children untouched when nothing throws', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
