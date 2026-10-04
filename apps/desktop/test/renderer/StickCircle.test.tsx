// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StickCircle } from '../../src/renderer/components/StickCircle';

describe('StickCircle', () => {
  it('renders numeric readouts for processed values', () => {
    render(<StickCircle label="Left" raw={{ x: 0.1, y: 0.2 }} out={{ x: 0.5, y: -0.25 }} />);
    expect(screen.getByText('X 0.500')).toBeTruthy();
    expect(screen.getByText('Y -0.250')).toBeTruthy();
  });
  it('places processed dot at scaled position', () => {
    const { container } = render(<StickCircle label="L" raw={{ x: 0, y: 0 }} out={{ x: 1, y: 0 }} />);
    const dot = container.querySelector('circle.dot-out')!;
    expect(dot.getAttribute('cx')).toBe('150');   // 80 + 1*70
    expect(dot.getAttribute('cy')).toBe('80');
  });
});
