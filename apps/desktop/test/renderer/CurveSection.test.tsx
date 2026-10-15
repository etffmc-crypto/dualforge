// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { presetPoints } from '@dualforge/engine/curve';
import type { StickConfig } from '@dualforge/shared';
import { CurveSection } from '../../src/renderer/pages/sticks/CurveSection';

afterEach(cleanup);

type Curve = StickConfig['curve'];
let latest: Curve;

/** Holds only the curve, which is all CurveSection reads or writes. */
function Harness({
  side = 'left' as 'left' | 'right',
  start,
}: {
  side?: 'left' | 'right';
  start: Curve;
}) {
  const [curve, setCurve] = useState<Curve>(start);
  latest = curve;
  const cfg = { curve } as StickConfig;
  const edit = (fn: (c: StickConfig) => void) => {
    const draft = { curve } as StickConfig;
    fn(draft);
    setCurve(draft.curve);
  };
  return <CurveSection side={side} cfg={cfg} edit={edit} />;
}

const pick = (label: string) => fireEvent.click(screen.getByRole('radio', { name: label }));

describe('CurveSection custom-curve stash', () => {
  it('restores edited custom points when returning to Custom from the preset it left to', () => {
    render(<Harness start={{ kind: 'preset', preset: 'linear' }} />);
    pick('Custom');
    expect(latest.kind).toBe('custom');
    fireEvent.keyDown(screen.getByTestId('handle-2'), { key: 'ArrowUp' });
    const edited = (latest as Extract<Curve, { kind: 'custom' }>).points;
    expect(edited).not.toEqual(presetPoints('linear'));

    pick('Linear');
    expect(latest).toEqual({ kind: 'preset', preset: 'linear' });
    pick('Custom');
    expect((latest as Extract<Curve, { kind: 'custom' }>).points).toEqual(edited);
  });

  it('reseeds from the new preset when Custom was left towards a different preset', () => {
    render(<Harness start={{ kind: 'preset', preset: 'linear' }} />);
    pick('Custom');
    fireEvent.keyDown(screen.getByTestId('handle-2'), { key: 'ArrowUp' });
    pick('Aggressive');
    pick('Linear');
    pick('Custom');
    expect((latest as Extract<Curve, { kind: 'custom' }>).points).toEqual(presetPoints('linear'));
  });
});
