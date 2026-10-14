// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../../src/renderer/store';
import { PAGE_PANEL_ID, TABS, TabStrip, tabId } from '../../src/renderer/components/TabStrip';

afterEach(cleanup);

describe('TabStrip aria wiring', () => {
  it('gives every tab a stable id and points only the selected tab at the page panel', () => {
    useStore.setState({ page: 'sticks' });
    render(<TabStrip />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(TABS.length);
    for (const t of TABS) expect(document.getElementById(tabId(t.id))).not.toBeNull();
    const controlling = tabs.filter((t) => t.getAttribute('aria-controls') !== null);
    expect(controlling).toHaveLength(1);
    expect(controlling[0]!.id).toBe(tabId('sticks'));
    expect(controlling[0]!.getAttribute('aria-controls')).toBe(PAGE_PANEL_ID);
  });

  it('moves aria-controls with the selection', () => {
    useStore.setState({ page: 'turbo' });
    render(<TabStrip />);
    expect(document.getElementById(tabId('turbo'))!.getAttribute('aria-controls')).toBe(
      PAGE_PANEL_ID,
    );
    expect(document.getElementById(tabId('sticks'))!.hasAttribute('aria-controls')).toBe(false);
  });
});
