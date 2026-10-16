// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../../src/renderer/store';
import { SubTabs, subPanelId, subTabId } from '../../src/renderer/components/controls/SubTabs';
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

describe('SubTabs aria wiring', () => {
  const tabs = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('points only the selected sub-tab at the panel when idPrefix is given', () => {
    render(<SubTabs tabs={tabs} value="b" onChange={() => {}} idPrefix="px" />);
    expect(document.getElementById(subTabId('px', 'a'))!.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(subTabId('px', 'b'))!.getAttribute('aria-controls')).toBe(
      subPanelId('px'),
    );
  });

  it('adds no ids without idPrefix', () => {
    render(<SubTabs tabs={tabs} value="a" onChange={() => {}} />);
    for (const t of screen.getAllByRole('tab')) {
      expect(t.hasAttribute('id')).toBe(false);
      expect(t.hasAttribute('aria-controls')).toBe(false);
    }
  });
});
