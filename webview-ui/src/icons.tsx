/* ─────────────────────────────────────────────────────────────────────────────
 * icons.tsx — the stroked icon set used across every surface.
 *
 * Path data is lifted verbatim from the approved mock. There are no emoji in
 * this product: emoji render differently on every platform, sit off the
 * baseline of the text beside them, and cannot take the theme's colour.
 *
 * Every icon takes its colour from `currentColor` and its size from `size`
 * (default 13, the mock's inline button size).
 * ───────────────────────────────────────────────────────────────────────────── */

export interface IconProps {
  size?: number;
  /** Stroke weight. The mock uses 2 for controls, 1.8 for nav, 2.4 for accents. */
  width?: number;
  className?: string;
}

function svg(path: React.ReactNode, defaultStroke = 2) {
  return function Icon({ size = 13, width = defaultStroke, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        {path}
      </svg>
    );
  };
}

/* ── Identity ─────────────────────────────────────────────────────────── */
export const Shield = svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);
export const Globe = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
  </>,
  1.8,
);
export const Grid = svg(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>,
);
export const Key = svg(
  <>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9l-1.5 3" />
  </>,
  1.8,
);
export const Branch = svg(
  <>
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M6 15V9a9 9 0 0 1 9-9" />
  </>,
  1.8,
);
export const Braces = svg(
  <path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2" />,
  1.8,
);
export const Folder = svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, 1.8);
export const Sliders = svg(<path d="M4 6h16M4 12h16M4 18h10" />, 1.8);
export const File = svg(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </>,
);

/* ── Actions ──────────────────────────────────────────────────────────── */
export const Plus = svg(<path d="M12 5v14M5 12h14" />, 2.4);
export const Close = svg(<path d="M18 6 6 18M6 6l12 12" />);
export const Check = svg(<path d="M20 6 9 17l-5-5" />, 2.4);
export const Pencil = svg(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </>,
);
export const Trash = svg(<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />);
export const Refresh = svg(
  <>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    <path d="M21 3v6h-6" />
  </>,
);
export const Restore = svg(
  <>
    <path d="M3 12a9 9 0 1 0 6.2-8.6" />
    <path d="M3 3v6h6" />
  </>,
);
export const Copy = svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
);
export const Download = svg(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const ArrowUp = svg(<path d="M12 19V5M5 12l7-7 7 7" />);
export const ArrowRight = svg(<path d="M5 12h14M13 6l6 6-6 6" />);
export const Chevron = svg(<path d="m6 9 6 6 6-6" />, 2.6);
export const Search = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const Dots = svg(
  <>
    <circle cx="12" cy="5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="19" r="1.6" />
  </>,
);
export const Grip = svg(
  <>
    <circle cx="9" cy="6" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="18" r="1" />
  </>,
);
export const Sparkle = svg(<path d="m12 3 1.9 5.6L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.4z" />);
export const Commit = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v6M12 16v6" />
  </>,
  2.2,
);
export const Eye = svg(
  <>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const Lock = svg(
  <>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </>,
);
export const External = svg(
  <>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14 21 3" />
  </>,
);
export const Columns = svg(<path d="M9 3v18M15 3v18M3 9h18M3 15h18" />);
export const Rows = svg(<path d="M3 18h6M3 12h10M3 6h14" />);
export const Menu = svg(<path d="M4 6h16M4 12h16M4 18h16" />);
export const Circle = svg(<circle cx="12" cy="12" r="9" />);
export const Chart = svg(
  <>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 3 3 5-7" />
  </>,
  1.9,
);
export const Monitor = svg(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </>,
  1.9,
);

/* ── Status ───────────────────────────────────────────────────────────── */
export const Warning = svg(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
export const Info = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);
export const Error = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </>,
);
export const Sun = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M4.2 4.2 6.3 6.3M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8 6.3 17.7M17.7 6.3l2.1-2.1" />
  </>,
);
export const Moon = svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />, 1.9);
export const Auto = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none" />
  </>,
  1.9,
);
export const Gear = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </>,
);
