import { describe, expect, it } from 'vitest';
import { encodeTriggerEffect } from '../../src/codec/trigger-effect.js';

describe('encodeTriggerEffect', () => {
  it('off', () =>
    expect([...encodeTriggerEffect({ mode: 'off' })]).toEqual([
      0x05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]));
  it('resistance', () =>
    expect(
      [...encodeTriggerEffect({ mode: 'resistance', start: 3, force: 7 })].slice(0, 3),
    ).toEqual([0x01, 3, 7]));
  it('section', () =>
    expect(
      [...encodeTriggerEffect({ mode: 'section', start: 2, end: 6, force: 8 })].slice(0, 4),
    ).toEqual([0x02, 2, 6, 8]));
  it('vibration', () =>
    expect(
      [...encodeTriggerEffect({ mode: 'vibration', frequency: 30, force: 4 })].slice(0, 3),
    ).toEqual([0x06, 30, 4]));
});
