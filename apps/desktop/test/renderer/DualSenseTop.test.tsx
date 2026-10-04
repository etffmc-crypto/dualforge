// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DualSenseTop } from '../../src/renderer/art/DualSenseTop';

describe('DualSenseTop', () => {
  it('highlights pressed buttons and tints the lightbar', () => {
    const { container } = render(<DualSenseTop pressed={{ cross: true }} lightbar={{ r: 1, g: 2, b: 3 }} playerLeds={0b00100} />);
    expect(container.querySelector('[data-btn="cross"]')!.classList.contains('on')).toBe(true);
    expect(container.querySelector('[data-btn="circle"]')!.classList.contains('on')).toBe(false);
    expect(container.querySelector('[data-lightbar]')!.getAttribute('fill')).toBe('rgb(1,2,3)');
    expect(container.querySelectorAll('[data-led].on').length).toBe(1);
  });
  it('moves stick caps with stick values', () => {
    const { container } = render(<DualSenseTop pressed={{}} lightbar={{ r: 0, g: 0, b: 0 }} sticks={{ lx: 1, ly: 0, rx: 0, ry: 1 }} />);
    expect(container.querySelector('[data-stick="left"]')!.getAttribute('transform')).toBe('translate(18 0)');
    expect(container.querySelector('[data-stick="right"]')!.getAttribute('transform')).toBe('translate(0 -18)');
  });
  it('renders every DualSense button with the btn contract', () => {
    const { container } = render(<DualSenseTop pressed={{ l2: true }} lightbar={{ r: 0, g: 0, b: 0 }} />);
    for (const b of ['triangle', 'circle', 'cross', 'square', 'l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight', 'create', 'options', 'ps', 'mic', 'touchpad']) {
      expect(container.querySelector(`[data-btn="${b}"]`), b).not.toBeNull();
    }
    expect(container.querySelector('[data-btn="l2"]')!.getAttribute('class')).toBe('btn on');
  });
});
