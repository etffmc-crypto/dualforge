import { useId } from 'react';

type Pressed = Record<string, boolean>;
type Rgb = { r: number; g: number; b: number };
type Sticks = { lx: number; ly: number; rx: number; ry: number };
export interface DualSenseTopProps {
  pressed: Pressed;
  lightbar: Rgb;
  sticks?: Sticks | undefined;
  playerLeds?: number | undefined;
}

const BODY = '#6b6770',
  PANEL = '#4a4650',
  PAD = '#3a3640',
  WELL = '#36323b',
  CAP = '#57535c',
  LINE = '#8a8690';
const TRAVEL = 18;
const r2 = (v: number) => Math.round(v * 100) / 100;

const OUTLINE =
  'M150 150C150 118 178 100 228 100H352C378 100 392 90 420 90H580C608 90 622 100 648 100H772C822 100 850 118 850 150' +
  'C872 222 902 330 930 452C954 548 924 604 864 606C820 607 796 586 776 546L716 432C702 406 682 396 652 396H348' +
  'C318 396 298 406 284 432L224 546C204 586 180 607 136 606C76 604 46 548 70 452C98 330 128 222 150 150Z';
const INNER =
  'M300 196H700C738 196 758 214 764 244L776 330C781 368 756 388 720 388H280C244 388 219 368 224 330L236 244C242 214 262 196 300 196Z';
const TOUCHPAD =
  'M372 98H628Q636 98 636 106V214Q636 244 606 244H394Q364 244 364 214V106Q364 98 372 98Z';
// one d-pad arm pointing at the centre (225,215); the other three are rotations of it
const DPAD_ARM = 'M225 203L207 186V162Q207 156 213 156H237Q243 156 243 162V186Z';
const FACE: { k: string; x: number; y: number; glyph: string }[] = [
  { k: 'triangle', x: 775, y: 163, glyph: 'M775 151L787 171H763Z' },
  { k: 'circle', x: 829, y: 215, glyph: 'M829 203A12 12 0 1 1 828.9 203Z' },
  { k: 'cross', x: 775, y: 267, glyph: 'M765 257L785 277M785 257L765 277' },
  { k: 'square', x: 721, y: 215, glyph: 'M711 205H731V225H711Z' },
];
const DPAD: [string, number][] = [
  ['dpadUp', 0],
  ['dpadRight', 90],
  ['dpadDown', 180],
  ['dpadLeft', 270],
];

export function DualSenseTop({ pressed, lightbar, sticks, playerLeds = 0 }: DualSenseTopProps) {
  const id = useId().replace(/:/g, '');
  const on = (k: string) => (pressed[k] ? 'btn on' : 'btn');
  const lb = `rgb(${lightbar.r},${lightbar.g},${lightbar.b})`;
  const s = sticks ?? { lx: 0, ly: 0, rx: 0, ry: 0 };
  return (
    <svg className="ds-art" viewBox="0 0 1000 640" role="img" aria-label="DualSense controller">
      <defs>
        <filter id={`${id}-glow`} x="-400%" y="-40%" width="900%" height="180%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id={`${id}-shadow`} x="-10%" y="-10%" width="120%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      {/* triggers + bumpers sit behind the top edge */}
      <rect
        x="196"
        y="38"
        width="138"
        height="72"
        rx="28"
        fill={PANEL}
        data-btn="l2"
        className={on('l2')}
      />
      <rect
        x="666"
        y="38"
        width="138"
        height="72"
        rx="28"
        fill={PANEL}
        data-btn="r2"
        className={on('r2')}
      />
      <rect
        x="180"
        y="78"
        width="168"
        height="34"
        rx="15"
        fill={LINE}
        data-btn="l1"
        className={on('l1')}
      />
      <rect
        x="652"
        y="78"
        width="168"
        height="34"
        rx="15"
        fill={LINE}
        data-btn="r1"
        className={on('r1')}
      />
      {/* body */}
      <path
        d={OUTLINE}
        fill="#000"
        opacity=".35"
        transform="translate(0 14)"
        filter={`url(#${id}-shadow)`}
      />
      <path d={OUTLINE} fill={BODY} />
      <path d={OUTLINE} fill="none" stroke="#fff" strokeOpacity=".07" strokeWidth="2" />
      <path d={INNER} fill={PANEL} />
      {/* lightbar: glow underlay + crisp bars flanking the touchpad */}
      <g data-lightbar="" fill={lb}>
        <g filter={`url(#${id}-glow)`}>
          <rect x="344" y="106" width="18" height="132" rx="9" />
          <rect x="638" y="106" width="18" height="132" rx="9" />
        </g>
        <rect x="350" y="110" width="6" height="124" rx="3" />
        <rect x="644" y="110" width="6" height="124" rx="3" />
      </g>
      <path d={TOUCHPAD} fill={PAD} data-btn="touchpad" className={on('touchpad')} />
      <path d="M380 106H620" stroke="#fff" strokeOpacity=".06" strokeWidth="2" />
      {/* player LEDs */}
      {[0, 1, 2, 3, 4].map((i) => {
        const lit = (playerLeds >> i) & 1;
        return (
          <circle
            key={i}
            cx={470 + i * 15}
            cy={258}
            r="3.5"
            data-led={i}
            className={lit ? 'led on' : 'led'}
            fill={lit ? '#fff' : '#2c2930'}
          />
        );
      })}
      {/* create / options */}
      <rect
        x="318"
        y="118"
        width="14"
        height="34"
        rx="7"
        fill={PANEL}
        stroke={LINE}
        strokeWidth="2"
        transform="rotate(-18 325 135)"
        data-btn="create"
        className={on('create')}
      />
      <rect
        x="668"
        y="118"
        width="14"
        height="34"
        rx="7"
        fill={PANEL}
        stroke={LINE}
        strokeWidth="2"
        transform="rotate(18 675 135)"
        data-btn="options"
        className={on('options')}
      />
      {/* d-pad */}
      <circle cx="225" cy="215" r="70" fill={PANEL} />
      {DPAD.map(([k, deg]) => (
        <path
          key={k}
          d={DPAD_ARM}
          transform={`rotate(${deg} 225 215)`}
          fill={BODY}
          stroke={LINE}
          strokeWidth="2"
          data-btn={k}
          className={on(k)}
        />
      ))}
      {/* face buttons */}
      <circle cx="775" cy="215" r="88" fill={PANEL} />
      {FACE.map((f) => (
        <g key={f.k} className="face" data-face={f.k}>
          <circle
            cx={f.x}
            cy={f.y}
            r="23"
            fill={BODY}
            stroke={LINE}
            strokeWidth="2"
            data-btn={f.k}
            className={on(f.k)}
          />
          <path
            d={f.glyph}
            fill="none"
            stroke={pressed[f.k] ? '#fff' : LINE}
            strokeWidth="3"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        </g>
      ))}
      {/* sticks */}
      {(
        [
          ['left', 370, s.lx, s.ly, 'l3'],
          ['right', 630, s.rx, s.ry, 'r3'],
        ] as const
      ).map(([side, cx, x, y, k]) => (
        <g key={side}>
          <circle cx={cx} cy="318" r="58" fill={WELL} />
          <circle
            cx={cx}
            cy="318"
            r="58"
            fill="none"
            stroke="#000"
            strokeOpacity=".25"
            strokeWidth="4"
          />
          <g data-stick={side} transform={`translate(${r2(x * TRAVEL)} ${r2(-y * TRAVEL)})`}>
            <circle cx={cx} cy="318" r="40" fill={CAP} data-btn={k} className={on(k)} />
            <circle
              cx={cx}
              cy="318"
              r="29"
              fill="none"
              stroke="#000"
              strokeOpacity=".22"
              strokeWidth="3"
              pointerEvents="none"
            />
            <circle
              cx={cx}
              cy="318"
              r="40"
              fill="none"
              stroke="#fff"
              strokeOpacity=".1"
              strokeWidth="2"
              pointerEvents="none"
            />
          </g>
        </g>
      ))}
      {/* PS + mic */}
      <circle
        cx="500"
        cy="318"
        r="20"
        fill={PAD}
        stroke={LINE}
        strokeWidth="2"
        data-btn="ps"
        className={on('ps')}
      />
      <circle
        cx="500"
        cy="318"
        r="9"
        fill="none"
        stroke={LINE}
        strokeWidth="2"
        pointerEvents="none"
      />
      <rect
        x="482"
        y="356"
        width="36"
        height="9"
        rx="4.5"
        fill={PAD}
        stroke={LINE}
        strokeWidth="1.5"
        data-btn="mic"
        className={on('mic')}
      />
    </svg>
  );
}
