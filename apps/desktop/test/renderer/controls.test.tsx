// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RangeSlider } from '../../src/renderer/components/controls/RangeSlider';
import { DualRangeSlider } from '../../src/renderer/components/controls/DualRangeSlider';
import { Segmented } from '../../src/renderer/components/controls/Segmented';
import { Toggle } from '../../src/renderer/components/controls/Toggle';
import { SubTabs } from '../../src/renderer/components/controls/SubTabs';
import { CurvePreview } from '../../src/renderer/components/controls/CurvePreview';
import { CurveEditor } from '../../src/renderer/components/controls/CurveEditor';
import { StickLive } from '../../src/renderer/components/controls/StickLive';

afterEach(cleanup);

const linear8 = (): [number, number][] =>
  Array.from({ length: 8 }, (_, i) => [i / 7, i / 7] as [number, number]);

describe('RangeSlider', () => {
  it('shows a formatted readout and reports numeric changes', () => {
    const onChange = vi.fn();
    render(
      <RangeSlider
        value={0.25}
        onChange={onChange}
        format={(v) => `${Math.round(v * 100)}%`}
        label="Brightness"
      />,
    );
    expect(screen.getByText('25%')).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), {
      target: { value: '0.5' },
    });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });
});

describe('RangeSlider fill clamp', () => {
  it('clamps the fill when value is outside [min,max]', () => {
    render(<RangeSlider value={0.5} min={-0.1} max={0.1} onChange={() => {}} ariaLabel="Offset" />);
    const fill = (
      screen.getByRole('slider', { name: 'Offset' }) as HTMLInputElement
    ).style.getPropertyValue('--fill');
    expect(fill).toContain('* 1)');
  });
});

describe('RangeSlider bipolar (fillFrom)', () => {
  const bipolar = (value: number, onChange = vi.fn()) =>
    render(
      <RangeSlider
        value={value}
        min={-100}
        max={100}
        step={1}
        fillFrom={0}
        detent={3}
        ends={['Negative (jitter)', 'Smoothing']}
        onChange={onChange}
        ariaLabel="Strength"
      />,
    );
  const style = () => (screen.getByRole('slider', { name: 'Strength' }) as HTMLInputElement).style;
  it('fills from the centre towards a negative value', () => {
    bipolar(-40);
    expect(style().getPropertyValue('--fill-lo')).toContain('* 0.3)');
    expect(style().getPropertyValue('--fill')).toContain('* 0.5)');
  });
  it('fills from the centre towards a positive value', () => {
    bipolar(60);
    expect(style().getPropertyValue('--fill-lo')).toContain('* 0.5)');
    expect(style().getPropertyValue('--fill')).toContain('* 0.8)');
  });
  it('accepts negative values and snaps to the centre detent', () => {
    const onChange = vi.fn();
    bipolar(10, onChange);
    fireEvent.change(screen.getByRole('slider', { name: 'Strength' }), {
      target: { value: '-55' },
    });
    expect(onChange).toHaveBeenLastCalledWith(-55);
    fireEvent.change(screen.getByRole('slider', { name: 'Strength' }), {
      target: { value: '-2' },
    });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
  it('labels both ends and draws a centre tick', () => {
    const { container } = bipolar(0);
    expect(screen.getByText('Negative (jitter)')).toBeTruthy();
    expect(screen.getByText('Smoothing')).toBeTruthy();
    expect(container.querySelector('.rs-detent')).toBeTruthy();
  });
  it('without fillFrom keeps the left-anchored fill and no extras', () => {
    const { container } = render(
      <RangeSlider value={0.5} min={0} max={1} onChange={() => {}} ariaLabel="Plain" />,
    );
    const s = (screen.getByRole('slider', { name: 'Plain' }) as HTMLInputElement).style;
    expect(s.getPropertyValue('--fill-lo')).toBe('');
    expect(container.querySelector('.rs-detent')).toBeNull();
  });
});

describe('DualRangeSlider', () => {
  it('enforces min gap when the low handle is pushed into the high one', () => {
    const onChange = vi.fn();
    render(
      <DualRangeSlider
        lo={0.5}
        hi={0.6}
        minGap={0.2}
        onChange={onChange}
        captions={['Initial', 'Max']}
      />,
    );
    fireEvent.change(screen.getByTestId('drs-lo'), { target: { value: '0.55' } });
    expect(onChange).toHaveBeenCalledWith(0.4, 0.6);
    expect(screen.getByText('Initial')).toBeTruthy();
    expect(screen.getByText('Max')).toBeTruthy();
  });
  it('enforces min gap when the high handle is pulled into the low one', () => {
    const onChange = vi.fn();
    render(<DualRangeSlider lo={0.3} hi={0.9} minGap={0.1} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('drs-hi'), { target: { value: '0.2' } });
    expect(onChange).toHaveBeenCalledWith(0.3, 0.4);
  });
});

describe('Segmented', () => {
  it('sets aria-checked and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { value: 'off', label: 'Off' },
          { value: 'fixed', label: 'Fixed Mode' },
        ]}
        value="off"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Fixed Mode' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed Mode' }));
    expect(onChange).toHaveBeenCalledWith('fixed');
  });
  it('moves selection with arrow keys', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Toggle', () => {
  it('has role switch and toggles', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Invert X" />);
    const sw = screen.getByRole('switch', { name: 'Invert X' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('SubTabs', () => {
  it('marks the active tab and renders pills', () => {
    const onChange = vi.fn();
    render(
      <SubTabs
        tabs={[
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ]}
        value="left"
        onChange={onChange}
        pills={['LT', 'RT']}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Left' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('LT')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Right' }));
    expect(onChange).toHaveBeenCalledWith('right');
  });
});

describe('CurvePreview', () => {
  it('draws the curve as a polyline in a y-up square', () => {
    const { container } = render(
      <CurvePreview
        points={[
          [0, 0],
          [1, 1],
        ]}
        size={120}
      />,
    );
    expect(container.querySelector('polyline.curve')!.getAttribute('points')).toBe('0,120 120,0');
  });
});

describe('CurveEditor', () => {
  it('clamps dragged point x between neighbours', () => {
    const onChange = vi.fn();
    const points = linear8();
    render(<CurveEditor points={points} onChange={onChange} size={280} />);
    fireEvent.pointerDown(screen.getByTestId('handle-3'), {
      pointerId: 1,
      clientX: 120,
      clientY: 160,
    });
    fireEvent.pointerMove(screen.getByTestId('curve-svg'), {
      pointerId: 1,
      clientX: 280,
      clientY: 0,
    });
    const next = onChange.mock.calls.at(-1)![0] as [number, number][];
    expect(next[3]![0]).toBe(points[4]![0]);
    expect(next[3]![1]).toBe(1);
    expect(next[4]).toEqual(points[4]);
  });
  it('edits a point through its numeric input (0-100)', () => {
    const onChange = vi.fn();
    render(<CurveEditor points={linear8()} onChange={onChange} />);
    const input = screen.getByLabelText('Point 8 output');
    fireEvent.change(input, { target: { value: '80' } });
    expect(onChange).not.toHaveBeenCalled(); // draft only until commit
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[7]).toEqual([1, 0.8]);
  });
  it('keeps a draft while the input is cleared and commits a clamped value on blur', () => {
    const onChange = vi.fn();
    const points = linear8();
    render(<CurveEditor points={points} onChange={onChange} />);
    const input = screen.getByLabelText('Point 4 input') as HTMLInputElement; // handle-3
    const cxBefore = screen.getByTestId('handle-3').getAttribute('cx');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(screen.getByTestId('handle-3').getAttribute('cx')).toBe(cxBefore);
    fireEvent.blur(input); // empty draft is discarded, not committed as 0
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe(String(Math.round(points[3]![0] * 100)));
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.blur(input);
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[3]![0]).toBe(0.45);
    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.blur(input);
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[3]![0]).toBe(points[4]![0]); // clamped to right neighbour
  });
  it('supports yMax and pointCount for the 5-point speed curve', () => {
    const onChange = vi.fn();
    const pts: [number, number][] = [
      [0, 0],
      [0.1, 10],
      [0.25, 20],
      [0.5, 40],
      [1, 100],
    ];
    render(<CurveEditor points={pts} onChange={onChange} yMax={100} pointCount={5} />);
    expect(screen.getAllByTestId(/^handle-/)).toHaveLength(5);
    expect((screen.getByLabelText('Point 4 output') as HTMLInputElement).value).toBe('40');
    fireEvent.change(screen.getByLabelText('Point 4 output'), { target: { value: '55' } });
    fireEvent.blur(screen.getByLabelText('Point 4 output'));
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[3]).toEqual([0.5, 55]);
  });
  it('supports a negative yMin with a dashed zero line', () => {
    const onChange = vi.fn();
    const pts: [number, number][] = [
      [0, -50],
      [0.1, -20],
      [0.25, 0],
      [0.5, 40],
      [1, 100],
    ];
    render(
      <CurveEditor
        points={pts}
        onChange={onChange}
        size={224}
        yMin={-100}
        yMax={100}
        pointCount={5}
      />,
    );
    expect((screen.getByLabelText('Point 1 output') as HTMLInputElement).value).toBe('-50');
    expect(screen.getByTestId('handle-2').getAttribute('cy')).toBe('112'); // y = 0 sits mid-plot
    const zero = screen.getByTestId('ce-zero');
    expect([zero.getAttribute('y1'), zero.getAttribute('y2')]).toEqual(['112', '112']);
    fireEvent.change(screen.getByLabelText('Point 1 output'), { target: { value: '-80' } });
    fireEvent.blur(screen.getByLabelText('Point 1 output'));
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[0]).toEqual([0, -80]);
    fireEvent.keyDown(screen.getByTestId('handle-0'), { key: 'ArrowDown' });
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[0]).toEqual([0, -51]);
  });
  it('without yMin clamps y at 0 and draws no zero line', () => {
    const onChange = vi.fn();
    const pts: [number, number][] = [
      [0, 0],
      [0.1, 10],
      [0.25, 20],
      [0.5, 40],
      [1, 100],
    ];
    render(<CurveEditor points={pts} onChange={onChange} yMax={100} pointCount={5} />);
    expect(screen.queryByTestId('ce-zero')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('handle-0'), { key: 'ArrowDown' });
    expect((onChange.mock.calls.at(-1)![0] as [number, number][])[0]).toEqual([0, 0]);
  });
});

describe('StickLive', () => {
  it('draws deadzone rings at scaled radii', () => {
    const { container } = render(
      <StickLive
        raw={{ x: 0, y: 0 }}
        out={{ x: 0, y: 0 }}
        deadzone={{ center: 0.1, outer: 0.2 }}
      />,
    );
    expect(container.querySelector('[data-testid="dz-inner"]')!.getAttribute('r')).toBe('7');
    expect(container.querySelector('[data-testid="dz-outer"]')!.getAttribute('r')).toBe('56');
  });
  it('places the processed dot at scaled position with numeric readouts', () => {
    const { container } = render(
      <StickLive
        label="Left"
        raw={{ x: 0, y: 0 }}
        out={{ x: 1, y: -0.25 }}
        deadzone={{ center: 0, outer: 0 }}
      />,
    );
    const dot = container.querySelector('circle.dot-out')!;
    expect(dot.getAttribute('cx')).toBe('150'); // 80 + 1*70
    expect(dot.getAttribute('cy')).toBe('97.5'); // 80 + 0.25*70
    expect(screen.getByText('X 1.000')).toBeTruthy();
    expect(screen.getByText('Y -0.250')).toBeTruthy();
  });
  it('with a calibration, draws the raw dot in calibrated space around the ring centre', () => {
    const cal = { cx: 0.1, cy: -0.05, radius: 0.9 };
    const { container } = render(
      <StickLive
        raw={{ x: 0.1, y: -0.05 }}
        out={{ x: 0, y: 0 }}
        deadzone={{ center: 0.1, outer: 0 }}
        calibration={cal}
      />,
    );
    const dot = () => container.querySelector('circle.dot-raw')!;
    expect([dot().getAttribute('cx'), dot().getAttribute('cy')]).toEqual(['80', '80']); // resting off-centre stick sits in the middle
    expect(container.querySelector('[data-testid="dz-inner"]')!.getAttribute('cx')).toBe('80');
    cleanup();
    const r = render(
      <StickLive
        raw={{ x: 0.1 + 0.45, y: -0.05 }}
        out={{ x: 0, y: 0 }}
        deadzone={{ center: 0, outer: 0 }}
        calibration={cal}
      />,
    );
    expect(r.container.querySelector('circle.dot-raw')!.getAttribute('cx')).toBe('115'); // (0.45 / 0.9) * 70 + 80
  });
  it('without a calibration the raw dot is drawn as reported', () => {
    const { container } = render(
      <StickLive raw={{ x: 0.5, y: 0 }} out={{ x: 0, y: 0 }} deadzone={{ center: 0, outer: 0 }} />,
    );
    expect(container.querySelector('circle.dot-raw')!.getAttribute('cx')).toBe('115');
  });
});
