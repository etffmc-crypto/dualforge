import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 11 12 4l8.5 7" />
    <path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5" />
  </Svg>
);

/** Two stick columns: a cap on a stem, side by side. */
export const SticksIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="7" height="4" rx="2" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="7" height="4" rx="2" fill="currentColor" stroke="none" />
    <path d="M6.5 8v8M17.5 8v8" />
    <path d="M3.5 18.5h6M14.5 18.5h6" />
  </Svg>
);

/** Two trigger blades, the right one taller. */
export const TriggersIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M5 20V9.5C5 7 6.6 5.5 9 5.5h1V20Z" opacity=".75" />
    <path d="M12 20V6.5C12 4 13.8 2.5 16.5 2.5H19V20Z" />
  </Svg>
);

export const MotionIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" />
    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
  </Svg>
);

export const VibrationsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M7.5 8h9c2 0 3 1.2 3.4 3l.9 4.6c.3 1.6-1.4 2.6-2.6 1.5L16.5 15h-9l-1.7 2.1c-1.2 1.1-2.9.1-2.6-1.5l.9-4.6C4.5 9.2 5.5 8 7.5 8Z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M2 6.5c.6-.9 1.4-1.6 2.3-2M22 6.5c-.6-.9-1.4-1.6-2.3-2" />
  </Svg>
);

export const LightsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 17.5h6M10 20.5h4" />
    <path d="M12 6.5a5 5 0 0 0-3 9h6a5 5 0 0 0-3-9Z" fill="currentColor" stroke="none" />
    <path d="M12 1.5v2M4.6 4.6 6 6M19.4 4.6 18 6M2 11.5h2M20 11.5h2" />
  </Svg>
);

export const FlaskIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 3h7M10 3v6L4.8 18.2A1.9 1.9 0 0 0 6.5 21h11a1.9 1.9 0 0 0 1.7-2.8L14 9V3" />
    <path d="M7 15h10" />
  </Svg>
);

export const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4 3.5v4h4" />
  </Svg>
);

export const DpadIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9Z" />
  </Svg>
);

/** 2×2 tiles: the Overview dashboard. */
export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" fill="currentColor" stroke="none" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" fill="currentColor" stroke="none" />
  </Svg>
);

/** Four face buttons in a diamond. */
export const ButtonsIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <circle cx="12" cy="5.5" r="3" />
    <circle cx="5.5" cy="12" r="3" />
    <circle cx="18.5" cy="12" r="3" />
    <circle cx="12" cy="18.5" r="3" />
  </Svg>
);

/** Turbo: a button with repeat strokes fanning out (rapid fire). */
export const TurboIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="12" r="4.5" />
    <path d="M16 8.5h4.5M17 12h4.5M16 15.5h4.5" />
  </Svg>
);

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    <circle cx="12" cy="12" r="6.6" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
  </Svg>
);

/** A sequence of timed bars: the Macros page. */
export const MacrosIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18.5h18" />
    <rect x="3.5" y="11" width="4" height="5" rx="1" fill="currentColor" stroke="none" />
    <rect x="10" y="6" width="4" height="10" rx="1" fill="currentColor" stroke="none" />
    <rect x="16.5" y="9" width="4" height="7" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);

/** Stacked slot cards: the Profiles page. */
export const ProfilesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="8" width="13" height="12" rx="2" />
    <path d="M7.5 5h11A2 2 0 0 1 20.5 7v9.5" />
    <path d="M7 12h6M7 15.5h4" />
  </Svg>
);

/** A heart with a pulse trace through it: the Health page. */
export const HeartPulseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.5s-7.8-4.6-8.9-10.1C2.4 6.9 4.6 4 7.7 4c1.9 0 3.3 1 4.3 2.6C13 5 14.4 4 16.3 4c3.1 0 5.3 2.9 4.6 6.4-1.1 5.5-8.9 10.1-8.9 10.1Z" />
    <path d="M3.5 12.5h4.2l1.6-3 2.6 5.5 1.8-3.6 1.2 1.1h5.6" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5" />
  </Svg>
);
