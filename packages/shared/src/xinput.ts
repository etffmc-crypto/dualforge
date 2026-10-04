export const X_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LS',
  'RS',
  'BACK',
  'START',
  'GUIDE',
  'DPAD_UP',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'DPAD_RIGHT',
] as const;
export type XButton = (typeof X_BUTTONS)[number];

/** Virtual Xbox 360 state. Sticks -1..1 (+Y up), triggers 0..1. */
export interface XInputState {
  buttons: Record<XButton, boolean>;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
}

export function emptyXInput(): XInputState {
  return {
    buttons: Object.fromEntries(X_BUTTONS.map((b) => [b, false])) as Record<XButton, boolean>,
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
    lt: 0,
    rt: 0,
  };
}
