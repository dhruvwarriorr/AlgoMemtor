/* eslint-disable react-refresh/only-export-components -- a static icon
 * module: every export is a component built by createIcon, which the
 * fast-refresh rule cannot recognise. */
import {
  useId,
  type ComponentPropsWithoutRef,
  type ComponentType,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

/*
 * AlgoMemtor solid icons — "lit nodes".
 *
 * Filled glyphs on a 24-unit grid with small squarish corners. Detail is cut
 * out of the fill with a mask, so it reads as negative space on any
 * background. Most icons carry the brand's memory node: a dot in its own
 * colour (`--icon-node`, defaulting to the icon colour) sitting inside a thin
 * gap, the same node that forms the crossbar of the logo's A.
 *
 * The top navigation bar keeps the line set in `algo-icons-line.tsx`.
 * Names match the icons they replace so call sites stay unchanged.
 */

export type IconProps = ComponentPropsWithoutRef<'svg'>
export type IconComponent = ComponentType<IconProps>

type IconParts = {
  // Filled in the icon colour, with `cut` masked out of it.
  shape: ReactNode
  // Drawn black inside the mask: holes and grooves in `shape`.
  cut?: ReactNode
  // Drawn after the masked shape, in the icon colour, never cut.
  over?: ReactNode
  // Accent nodes in `--icon-node`.
  accent?: ReactNode
}

const ACCENT = 'var(--icon-node, currentColor)'

// A memory node: a hole in the fill plus an accent dot inside it.
function node(cx: number, cy: number, r = 2) {
  return {
    cut: <circle cx={cx} cy={cy} fill="#000" r={r + 1.1} />,
    dot: <circle className="algo-node" cx={cx} cy={cy} fill={ACCENT} r={r} />,
  }
}

function dot(cx: number, cy: number, r = 2) {
  return <circle className="algo-node" cx={cx} cy={cy} fill={ACCENT} r={r} />
}

// Thick strokes for glyphs that are lines by nature (arrows, checks).
const bold = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2.6,
} as const

// Grooves cut into a fill.
const groove = (width = 2) =>
  ({
    fill: 'none',
    stroke: '#000',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: width,
  }) as const

function createIcon(name: string, parts: IconParts): IconComponent {
  function Icon({ className, ...rest }: IconProps) {
    // Solid glyphs keep their own weights; a caller's strokeWidth is ignored.
    const { strokeWidth, ...props } = rest
    void strokeWidth
    const maskId = `algo-${useId().replace(/[^\w-]/g, '')}`
    return (
      <svg
        aria-hidden="true"
        className={cn('algo-icon', className)}
        data-icon={name}
        fill="none"
        height={24}
        viewBox="0 0 24 24"
        width={24}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        {parts.cut ? (
          <mask
            height="24"
            id={maskId}
            maskUnits="userSpaceOnUse"
            width="24"
            x="0"
            y="0"
          >
            <rect fill="#fff" height="24" width="24" />
            {parts.cut}
          </mask>
        ) : null}
        <g fill="currentColor" mask={parts.cut ? `url(#${maskId})` : undefined}>
          {parts.shape}
        </g>
        {parts.over}
        {parts.accent}
      </svg>
    )
  }
  Icon.displayName = name
  return Icon
}

/* ---- Brand -------------------------------------------------------------- */

// The coach: the logo's A as a solid chevron with its memory node, and a spark.
export const Sparkles = createIcon('Sparkles', {
  shape: (
    <>
      <path d="M10.3 3.9a1.9 1.9 0 0 1 3.4 0l7 15.4a1.3 1.3 0 0 1-1.2 1.8h-2a1.3 1.3 0 0 1-1.2-.8L12 10l-4.3 10.3a1.3 1.3 0 0 1-1.2.8h-2a1.3 1.3 0 0 1-1.2-1.8Z" />
      <path d="m19.6 1.2.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8Z" />
    </>
  ),
  accent: dot(12, 16.2, 2.1),
})

export const LayoutGrid = createIcon('LayoutGrid', {
  shape: (
    <>
      <rect height="5.5" rx="2" width="8" x="13" y="3" />
      <rect height="10" rx="2" width="8" x="13" y="11" />
      <rect height="5" rx="2" width="8" x="3" y="16" />
    </>
  ),
  accent: <rect fill={ACCENT} height="11" rx="2" width="8" x="3" y="3" />,
})

const bulb = node(12, 9.4, 1.9)
export const Lightbulb = createIcon('Lightbulb', {
  shape: (
    <>
      <path d="M12 2.5a7 7 0 0 0-4.3 12.5c.8.6 1.3 1.4 1.3 2.3v.4h6v-.4c0-.9.5-1.7 1.3-2.3A7 7 0 0 0 12 2.5Z" />
      <rect height="2.6" rx="1.3" width="6" x="9" y="19" />
    </>
  ),
  cut: bulb.cut,
  accent: bulb.dot,
})

// Memory: a small knowledge graph around one lit node.
const memory = node(12, 11.8, 2.6)
export const Brain = createIcon('Brain', {
  shape: (
    <>
      <circle cx="5.5" cy="6" r="3" />
      <circle cx="18.5" cy="6" r="3" />
      <circle cx="12" cy="19.5" r="3" />
      <path
        d="M7 6h10M8 8l2.5 2.3M16 8l-2.5 2.3M12 14.5v2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="12" cy="11.8" r="4.2" />
    </>
  ),
  cut: memory.cut,
  accent: memory.dot,
})

/* ---- Charts and trends -------------------------------------------------- */

const rising = node(19, 6.5, 2)
export const TrendingUp = createIcon('TrendingUp', {
  shape: (
    <path d="M3 19.2V15.6a1 1 0 0 1 .3-.7L8 10.2a1 1 0 0 1 1.4 0l3 2.7 6-6.6V19.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19.2Z" />
  ),
  cut: rising.cut,
  accent: rising.dot,
})

const falling = node(19, 16.2, 2)
export const TrendingDown = createIcon('TrendingDown', {
  shape: (
    <path d="M3 19.2V5.5l5 4.9a1 1 0 0 0 1.4 0l3-2.6 6.3 7.2v4.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19.2Z" />
  ),
  cut: falling.cut,
  accent: falling.dot,
})

export const BarChart3 = createIcon('BarChart3', {
  shape: (
    <>
      <rect height="9" rx="1.6" width="4.4" x="3.5" y="12" />
      <rect height="14" rx="1.6" width="4.4" x="9.8" y="7" />
      <rect height="8" rx="1.6" width="4.4" x="16.1" y="13" />
    </>
  ),
  accent: dot(18.3, 8.4, 2.2),
})

export const LineChart = createIcon('LineChart', {
  shape: (
    <>
      <rect height="18" rx="1.3" width="2.6" x="3" y="3" />
      <rect height="2.6" rx="1.3" width="18" x="3" y="18.4" />
    </>
  ),
  over: <path {...bold} d="m8.5 14.5 3.3-3.8 3 2.5 3.7-4.6" />,
  accent: dot(19.6, 7.2, 2.2),
})

export const Activity = createIcon('Activity', {
  shape: <path {...bold} d="M2.5 12h4l2.4-6.5 5 13 2.4-6.5h1.5" />,
  accent: dot(20.6, 12, 2.3),
})

const gaugeNode = node(12, 16.8, 2.2)
export const Gauge = createIcon('Gauge', {
  shape: (
    <>
      <path d="M2.8 17.4a9.2 9.2 0 0 1 18.4 0 1.2 1.2 0 0 1-1.2 1.2h-2.1a1.2 1.2 0 0 1-1.2-1.1 4.7 4.7 0 0 0-9.4 0 1.2 1.2 0 0 1-1.2 1.1H4a1.2 1.2 0 0 1-1.2-1.2Z" />
      <path {...bold} d="m12 16.8 4.3-5.4" />
    </>
  ),
  cut: gaugeNode.cut,
  accent: gaugeNode.dot,
})

/* ---- Practice ----------------------------------------------------------- */

const cup = node(12, 8.2, 1.9)
export const Trophy = createIcon('Trophy', {
  shape: (
    <>
      <path d="M6.3 3.8A1.3 1.3 0 0 1 7.6 2.5h8.8a1.3 1.3 0 0 1 1.3 1.3v5.5a5.7 5.7 0 0 1-11.4 0Z" />
      <path
        d="M6.4 5.3H4.2v1.4a3.6 3.6 0 0 0 3.2 3.6M17.6 5.3h2.2v1.4a3.6 3.6 0 0 1-3.2 3.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <rect height="4" rx="1" width="2.6" x="10.7" y="14" />
      <rect height="3.4" rx="1.3" width="10" x="7" y="18" />
    </>
  ),
  cut: cup.cut,
  accent: cup.dot,
})

const crownNode = node(12, 13.3, 1.8)
export const Crown = createIcon('Crown', {
  shape: (
    <>
      <path d="M3.4 7.2a.8.8 0 0 1 1.3-.7l3.6 3.3 3-5.1a.8.8 0 0 1 1.4 0l3 5.1 3.6-3.3a.8.8 0 0 1 1.3.7l-1.4 9.9a1.3 1.3 0 0 1-1.3 1.1H6.1a1.3 1.3 0 0 1-1.3-1.1Z" />
      <rect height="2.3" rx="1.1" width="15" x="4.5" y="19.3" />
    </>
  ),
  cut: crownNode.cut,
  accent: crownNode.dot,
})

const flameNode = node(12, 16, 2)
export const Flame = createIcon('Flame', {
  shape: (
    <path d="M12.3 2.3c.9 3 6 5.6 6 11.2a6.3 6.3 0 0 1-12.6 0c0-2.9 1.6-4.5 2.6-6.2.8 1.1 1.2 2.2 1.2 3.4 1.4-2.2 2.6-4.7 2.8-8.4Z" />
  ),
  cut: flameNode.cut,
  accent: flameNode.dot,
})

// Problems: one solved row (a lit node) above two open ones.
export const ListChecks = createIcon('ListChecks', {
  shape: (
    <>
      <rect height="4.2" opacity=".42" rx="1.3" width="4.2" x="3.3" y="9.9" />
      <rect height="4.2" opacity=".42" rx="1.3" width="4.2" x="3.3" y="15.9" />
      <rect height="2.8" rx="1.4" width="11" x="10" y="5.1" />
      <rect height="2.8" rx="1.4" width="11" x="10" y="10.6" />
      <rect height="2.8" rx="1.4" width="7.5" x="10" y="16.6" />
    </>
  ),
  accent: dot(5.4, 6.5, 2.3),
})

const bookmarkNode = node(12, 9.4, 1.9)
const bookmarkShape = (
  <path d="M5.2 4.4a1.9 1.9 0 0 1 1.9-1.9h9.8a1.9 1.9 0 0 1 1.9 1.9v15.9a.9.9 0 0 1-1.4.8L12 17.5l-5.4 3.6a.9.9 0 0 1-1.4-.8Z" />
)
export const Bookmark = createIcon('Bookmark', {
  shape: bookmarkShape,
  cut: bookmarkNode.cut,
  accent: bookmarkNode.dot,
})

export const BookmarkCheck = createIcon('BookmarkCheck', {
  shape: bookmarkShape,
  cut: <path {...groove(2.3)} d="m8.9 9.6 2.2 2.2 4-4.3" />,
})

const targetNode = node(12, 12, 2.3)
export const Target = createIcon('Target', {
  shape: <circle cx="12" cy="12" r="9.5" />,
  cut: (
    <>
      <circle {...groove(1.8)} cx="12" cy="12" r="6.3" />
      {targetNode.cut}
    </>
  ),
  accent: targetNode.dot,
})

export const Crosshair = createIcon('Crosshair', {
  shape: (
    <>
      <circle cx="12" cy="12" r="8" />
      <rect height="5" rx="1.2" width="2.4" x="10.8" y="1.5" />
      <rect height="5" rx="1.2" width="2.4" x="10.8" y="17.5" />
      <rect height="2.4" rx="1.2" width="5" x="1.5" y="10.8" />
      <rect height="2.4" rx="1.2" width="5" x="17.5" y="10.8" />
    </>
  ),
  cut: <circle cx="12" cy="12" fill="#000" r="5" />,
  accent: dot(12, 12, 2.2),
})

export const Compass = createIcon('Compass', {
  shape: <circle cx="12" cy="12" r="9.5" />,
  cut: <path d="M16.8 7.2 13.9 14 7.2 16.8l2.9-6.8Z" fill="#000" />,
  accent: dot(12, 12, 1.5),
})

// Roadmap: a path from a lit node to a destination.
export const Route = createIcon('Route', {
  shape: (
    <>
      <path {...bold} d="M8 18.5h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
      <circle cx="18.5" cy="6.5" r="3" />
    </>
  ),
  accent: dot(5.3, 18.5, 2.6),
})

const MapIcon = createIcon('Map', {
  shape: (
    <path d="M2.8 6.1a1 1 0 0 1 .6-.9l5.3-2.4a1 1 0 0 1 .8 0l5 2.1a1 1 0 0 0 .8 0l4.5-2a1 1 0 0 1 1.4.9v13.1a1 1 0 0 1-.6.9l-5.3 2.4a1 1 0 0 1-.8 0l-5-2.1a1 1 0 0 0-.8 0l-4.5 2a1 1 0 0 1-1.4-.9Z" />
  ),
  cut: <path {...groove(1.3)} d="M9 3.8v13.6M15 6.6v13.6" />,
})
export { MapIcon as Map }

export const Code2 = createIcon('Code2', {
  shape: <path {...bold} d="m8 6.5-5.5 5.5L8 17.5M16 6.5l5.5 5.5-5.5 5.5" />,
  accent: dot(12, 12, 2.3),
})

export const Shapes = createIcon('Shapes', {
  shape: (
    <>
      <path d="M11.1 3.6a1 1 0 0 1 1.8 0l4.3 7.2a1 1 0 0 1-.9 1.5H7.7a1 1 0 0 1-.9-1.5Z" />
      <rect height="7.6" rx="1.8" width="7.6" x="3" y="13.8" />
    </>
  ),
  accent: (
    <circle className="algo-node" cx="17" cy="17.6" fill={ACCENT} r="3.8" />
  ),
})

export const Swords = createIcon('Swords', {
  shape: (
    <>
      <path d="M3 3.8A.8.8 0 0 1 3.8 3h3.5l9.2 9.2-3.3 3.3L4 6.3Z" />
      <path d="M21 3.8a.8.8 0 0 0-.8-.8h-3.5l-5 5 3.3 3.3 6-6Z" opacity=".55" />
      <path
        {...bold}
        d="M13.5 17.2 17.2 13.5M15.6 15.6l4.6 4.6M10.5 17.2 6.8 13.5M8.4 15.6l-4.6 4.6"
      />
    </>
  ),
})

export const Zap = createIcon('Zap', {
  shape: (
    <path d="M13.4 2.2a.7.7 0 0 1 1.2.6L13.4 10h5.2a.7.7 0 0 1 .5 1.2l-8.5 10.6a.7.7 0 0 1-1.2-.6L10.6 14H5.4a.7.7 0 0 1-.5-1.2Z" />
  ),
})

const calendarBody = (
  <>
    <rect height="16.5" rx="2.6" width="18" x="3" y="4.5" />
    <rect height="5" rx="1.2" width="2.6" x="6.7" y="2" />
    <rect height="5" rx="1.2" width="2.6" x="14.7" y="2" />
  </>
)
const calendarHeader = <rect fill="#000" height="1.5" width="18" x="3" y="9" />

export const CalendarDays = createIcon('CalendarDays', {
  shape: calendarBody,
  cut: (
    <>
      {calendarHeader}
      {[
        [6.3, 12.3],
        [10.9, 12.3],
        [15.5, 12.3],
        [6.3, 16.3],
        [10.9, 16.3],
        [15.5, 16.3],
      ].map(([x, y]) => (
        <rect
          fill="#000"
          height="2.4"
          key={`${x}-${y}`}
          rx=".6"
          width="2.4"
          x={x}
          y={y}
        />
      ))}
    </>
  ),
  accent: (
    <rect
      className="algo-node"
      fill={ACCENT}
      height="2.4"
      rx=".6"
      width="2.4"
      x="15.5"
      y="16.3"
    />
  ),
})

export const CalendarCheck = createIcon('CalendarCheck', {
  shape: calendarBody,
  cut: (
    <>
      {calendarHeader}
      <path {...groove(2.3)} d="m8.4 15.2 2.4 2.4 4.8-4.8" />
    </>
  ),
})

/* ---- Account and system ------------------------------------------------- */

export const UserRound = createIcon('UserRound', {
  shape: (
    <path d="M3.9 20.2C4.6 16.2 7.9 13.7 12 13.7s7.4 2.5 8.1 6.5a1 1 0 0 1-1 1.3H4.9a1 1 0 0 1-1-1.3Z" />
  ),
  accent: (
    <circle className="algo-node" cx="12" cy="7.3" fill={ACCENT} r="4.3" />
  ),
})

// Settings: a hex nut around a lit node.
export const Settings = createIcon('Settings', {
  shape: (
    <path d="M11 2.6a2 2 0 0 1 2 0l6.9 4a2 2 0 0 1 1 1.7v7.4a2 2 0 0 1-1 1.7l-6.9 4a2 2 0 0 1-2 0l-6.9-4a2 2 0 0 1-1-1.7V8.3a2 2 0 0 1 1-1.7Z" />
  ),
  cut: <circle cx="12" cy="12" fill="#000" r="3.9" />,
  accent: dot(12, 12, 2.3),
})

export const SlidersHorizontal = createIcon('SlidersHorizontal', {
  shape: (
    <>
      <rect height="2.4" rx="1.2" width="18" x="3" y="5.8" />
      <rect height="2.4" rx="1.2" width="18" x="3" y="15.8" />
      <circle cx="15" cy="17" r="3.3" />
    </>
  ),
  cut: (
    <>
      <circle cx="9" cy="7" fill="#000" r="4.4" />
      <circle cx="15" cy="17" fill="#000" r="1.3" />
    </>
  ),
  accent: dot(9, 7, 3.2),
})

const doorNode = node(8.7, 12, 1.5)
export const LogOut = createIcon('LogOut', {
  shape: <rect height="18" rx="2.4" width="10" x="3" y="3" />,
  cut: (
    <>
      <rect fill="#000" height="7" width="6" x="11" y="8.5" />
      {doorNode.cut}
    </>
  ),
  over: (
    <>
      <path {...bold} d="M11.5 12h7" />
      <path
        d="M17 7.6a.7.7 0 0 1 1.1-.5l4 4.3a.9.9 0 0 1 0 1.2l-4 4.3a.7.7 0 0 1-1.1-.5Z"
        fill="currentColor"
      />
    </>
  ),
  accent: doorNode.dot,
})

export const Sun = createIcon('Sun', {
  shape: (
    <path
      d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.4"
    />
  ),
  accent: <circle className="algo-node" cx="12" cy="12" fill={ACCENT} r="5" />,
})

export const Moon = createIcon('Moon', {
  shape: (
    <path d="M20.4 14.2a8.6 8.6 0 1 1-10.6-10.6.7.7 0 0 1 .8 1 6.4 6.4 0 0 0 8.8 8.8.7.7 0 0 1 1 .8Z" />
  ),
  accent: dot(18.2, 4.6, 1.6),
})

const screenNode = node(12, 10.2, 2.1)
export const Monitor = createIcon('Monitor', {
  shape: (
    <>
      <rect height="13.5" rx="2.4" width="19" x="2.5" y="3" />
      <rect height="3.5" width="2.6" x="10.7" y="16" />
      <rect height="2.4" rx="1.2" width="9" x="7.5" y="19.1" />
    </>
  ),
  cut: screenNode.cut,
  accent: screenNode.dot,
})

const lockNode = node(12, 15.5, 1.9)
export const Lock = createIcon('Lock', {
  shape: (
    <>
      <rect height="11.5" rx="2.6" width="16" x="4" y="9.8" />
      <path
        d="M7.8 10V7.4a4.2 4.2 0 0 1 8.4 0V10"
        stroke="currentColor"
        strokeWidth="2.4"
      />
    </>
  ),
  cut: lockNode.cut,
  accent: lockNode.dot,
})

export const ShieldCheck = createIcon('ShieldCheck', {
  shape: (
    <path d="M11.3 2.3a2 2 0 0 1 1.4 0l6.5 2.6a1.4 1.4 0 0 1 .9 1.3v5.3c0 4.9-3.2 8.6-7.7 10a1.4 1.4 0 0 1-.8 0c-4.5-1.4-7.7-5.1-7.7-10V6.2a1.4 1.4 0 0 1 .9-1.3Z" />
  ),
  cut: <path {...groove(2.3)} d="m8.6 12 2.3 2.3 4.5-4.6" />,
})

export const BadgeCheck = createIcon('BadgeCheck', {
  shape: (
    <path d="M10.4 2.6a2.3 2.3 0 0 1 3.2 0l7.8 7.8a2.3 2.3 0 0 1 0 3.2l-7.8 7.8a2.3 2.3 0 0 1-3.2 0l-7.8-7.8a2.3 2.3 0 0 1 0-3.2Z" />
  ),
  cut: <path {...groove(2.3)} d="m8.6 12 2.3 2.3 4.5-4.6" />,
})

const bellShape = (
  <>
    <path d="M12 2.6a6.6 6.6 0 0 0-6.6 6.6v4.9l-1.7 2.8a1 1 0 0 0 .9 1.5h14.8a1 1 0 0 0 .9-1.5l-1.7-2.8V9.2A6.6 6.6 0 0 0 12 2.6Z" />
    <rect height="2.6" rx="1.3" width="5" x="9.5" y="19.3" />
  </>
)
const bellNode = node(12, 10.2, 1.9)
export const Bell = createIcon('Bell', {
  shape: bellShape,
  cut: bellNode.cut,
  accent: bellNode.dot,
})

export const BellRing = createIcon('BellRing', {
  shape: (
    <>
      {bellShape}
      <path
        d="M2.4 8.3a9.4 9.4 0 0 1 2.4-4.6M21.6 8.3a9.4 9.4 0 0 0-2.4-4.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </>
  ),
  cut: bellNode.cut,
  accent: bellNode.dot,
})

export const Palette = createIcon('Palette', {
  shape: (
    <path d="M12 2.5a9.5 9.5 0 0 0 0 19c1.4 0 2.2-1 2.2-2 0-1.5-1.1-1.8-1.1-3.1 0-1.2.9-2 2-2h2.4a4.1 4.1 0 0 0 4-4.1c0-4.2-4.3-7.8-9.5-7.8Z" />
  ),
  cut: (
    <>
      <circle cx="7.6" cy="11" fill="#000" r="2.2" />
      <circle cx="10.6" cy="6.9" fill="#000" r="2.2" />
      <circle cx="15.6" cy="7.6" fill="#000" r="2.2" />
    </>
  ),
  accent: (
    <>
      {dot(7.6, 11, 1.3)}
      {dot(10.6, 6.9, 1.3)}
      {dot(15.6, 7.6, 1.3)}
    </>
  ),
})

export const Database = createIcon('Database', {
  shape: (
    <path d="M4 5.6C4 3.9 7.6 2.5 12 2.5s8 1.4 8 3.1v12.8c0 1.7-3.6 3.1-8 3.1s-8-1.4-8-3.1Z" />
  ),
  cut: (
    <path
      {...groove(1.5)}
      d="M4 9.2c0 1.7 3.6 3 8 3s8-1.3 8-3M4 14c0 1.7 3.6 3 8 3s8-1.3 8-3"
    />
  ),
  accent: dot(12, 5.6, 1.5),
})

const plugShape = (
  <>
    <rect height="5" rx="1.2" width="2.4" x="7.8" y="2" />
    <rect height="5" rx="1.2" width="2.4" x="13.8" y="2" />
    <path d="M5.8 7.9a1 1 0 0 1 1-1h10.4a1 1 0 0 1 1 1v3a6.2 6.2 0 0 1-12.4 0Z" />
    <rect height="5.5" rx="1.2" width="2.6" x="10.7" y="16.5" />
  </>
)
const plugNode = node(12, 11, 1.8)
export const PlugZap = createIcon('PlugZap', {
  shape: plugShape,
  cut: plugNode.cut,
  accent: plugNode.dot,
})

export const Unplug = createIcon('Unplug', {
  shape: plugShape,
  cut: <path {...groove(4.6)} d="m3 3 18 18" />,
  over: <path {...bold} strokeWidth={2.2} d="m3.5 3.5 17 17" />,
})

export const CloudOff = createIcon('CloudOff', {
  shape: (
    <path d="M7 19.5a5 5 0 0 1-.7-9.9 6.6 6.6 0 0 1 12.4 1.8 4.1 4.1 0 0 1-.6 8.1Z" />
  ),
  cut: <path {...groove(4.6)} d="m3 3 18 18" />,
  over: <path {...bold} strokeWidth={2.2} d="m3.5 3.5 17 17" />,
})

/* ---- Conversation ------------------------------------------------------- */

export const MessageCircle = createIcon('MessageCircle', {
  shape: (
    <path d="M3.5 6.2a2.7 2.7 0 0 1 2.7-2.7h11.6a2.7 2.7 0 0 1 2.7 2.7v8.6a2.7 2.7 0 0 1-2.7 2.7h-6.4l-4.6 3.5a.7.7 0 0 1-1.1-.6v-2.9h-.2a2 2 0 0 1-2-2Z" />
  ),
  cut: (
    <>
      <circle cx="8.3" cy="10.5" fill="#000" r="1.4" />
      <circle cx="12" cy="10.5" fill="#000" r="2.1" />
      <circle cx="15.7" cy="10.5" fill="#000" r="1.4" />
    </>
  ),
  accent: dot(12, 10.5, 1.3),
})

const threadNode = node(10, 12.6, 1.5)
export const MessagesSquare = createIcon('MessagesSquare', {
  shape: (
    <>
      <path
        d="M7.5 3h11.8a2 2 0 0 1 2 2v8.6a1.5 1.5 0 0 1-1.5 1.5H18V9a2.5 2.5 0 0 0-2.5-2.5H7.5Z"
        opacity=".45"
      />
      <path d="M2.5 9.6a1.8 1.8 0 0 1 1.8-1.8h10.9A1.8 1.8 0 0 1 17 9.6v6.3a1.8 1.8 0 0 1-1.8 1.8H9.6l-3.9 3.1a.7.7 0 0 1-1.1-.6v-2.5h-.3a1.8 1.8 0 0 1-1.8-1.8Z" />
    </>
  ),
  cut: threadNode.cut,
  accent: threadNode.dot,
})

export const Send = createIcon('Send', {
  shape: (
    <path d="M20.6 2.3a.8.8 0 0 1 1.1 1.1l-7.2 17.7a.8.8 0 0 1-1.5 0l-2.8-7.3-7.3-2.8a.8.8 0 0 1 0-1.5Z" />
  ),
  cut: <path {...groove(1.7)} d="m21.3 2.7-11 11" />,
})

export const Paperclip = createIcon('Paperclip', {
  shape: (
    <path
      {...bold}
      d="m20 11.3-7.9 7.9a5.1 5.1 0 0 1-7.2-7.2L13 3.9a3.4 3.4 0 0 1 4.8 4.8l-7.7 7.7a1.7 1.7 0 0 1-2.4-2.4l7-7"
    />
  ),
})

export const BookOpen = createIcon('BookOpen', {
  shape: (
    <>
      <path d="M11 6.4C9.1 5 6.6 4.2 3.2 4.2a.7.7 0 0 0-.7.7v12.8a.7.7 0 0 0 .7.7c3.3 0 5.8.7 7.8 2.1Z" />
      <path
        d="M13 6.4c1.9-1.4 4.4-2.2 7.8-2.2a.7.7 0 0 1 .7.7v12.8a.7.7 0 0 1-.7.7c-3.3 0-5.8.7-7.8 2.1Z"
        opacity=".6"
      />
    </>
  ),
})

/* ---- Actions and status ------------------------------------------------- */

export const X = createIcon('X', {
  shape: <path {...bold} d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
})

export const Plus = createIcon('Plus', {
  shape: <path {...bold} d="M12 5v14M5 12h14" />,
})

export const Check = createIcon('Check', {
  shape: <path {...bold} d="m5 12.5 4.5 4.5L19 7.5" />,
})

export const CheckCheck = createIcon('CheckCheck', {
  shape: <path {...bold} d="m2.5 12.8 4 4 8.5-9M12 16l.8.8 8.7-9" />,
})

export const CheckCircle2 = createIcon('CheckCircle2', {
  shape: <circle cx="12" cy="12" r="10" />,
  cut: <path {...groove(2.4)} d="m7.8 12.3 2.8 2.8 5.6-5.8" />,
})

export const XCircle = createIcon('XCircle', {
  shape: <circle cx="12" cy="12" r="10" />,
  cut: <path {...groove(2.4)} d="m8.7 8.7 6.6 6.6M15.3 8.7l-6.6 6.6" />,
})

export const MoreHorizontal = createIcon('MoreHorizontal', {
  shape: (
    <>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
    </>
  ),
  accent: dot(12, 12, 2.4),
})

// Arrows are edges: a solid head grows out of a lit node.
export const ArrowRight = createIcon('ArrowRight', {
  shape: (
    <>
      <path {...bold} d="M7 12h8" />
      <path d="M13.8 6.9a.8.8 0 0 1 1.3-.6l6.2 5.1a.8.8 0 0 1 0 1.2l-6.2 5.1a.8.8 0 0 1-1.3-.6Z" />
    </>
  ),
  accent: dot(4, 12, 2.2),
})

export const ArrowLeft = createIcon('ArrowLeft', {
  shape: (
    <>
      <path {...bold} d="M17 12H9" />
      <path d="M10.2 6.9a.8.8 0 0 0-1.3-.6l-6.2 5.1a.8.8 0 0 0 0 1.2l6.2 5.1a.8.8 0 0 0 1.3-.6Z" />
    </>
  ),
  accent: dot(20, 12, 2.2),
})

export const ArrowUp = createIcon('ArrowUp', {
  shape: (
    <>
      <path {...bold} d="M12 17V9" />
      <path d="M6.9 10.2a.8.8 0 0 1-.6-1.3l5.1-6.2a.8.8 0 0 1 1.2 0l5.1 6.2a.8.8 0 0 1-.6 1.3Z" />
    </>
  ),
  accent: dot(12, 20, 2.2),
})

export const ArrowDown = createIcon('ArrowDown', {
  shape: (
    <>
      <path {...bold} d="M12 7v8" />
      <path d="M6.9 13.8a.8.8 0 0 0-.6 1.3l5.1 6.2a.8.8 0 0 0 1.2 0l5.1-6.2a.8.8 0 0 0-.6-1.3Z" />
    </>
  ),
  accent: dot(12, 4, 2.2),
})

export const ArrowUpRight = createIcon('ArrowUpRight', {
  shape: (
    <>
      <path {...bold} d="m8.4 15.6 6.4-6.4" />
      <path d="M10.3 4.6a.8.8 0 0 1 .5-1.4h8.9a1.1 1.1 0 0 1 1.1 1.1v8.9a.8.8 0 0 1-1.4.5Z" />
    </>
  ),
  accent: dot(6, 18, 2.2),
})

export const CornerDownLeft = createIcon('CornerDownLeft', {
  shape: (
    <>
      <path {...bold} d="M19.5 8v3.5a3 3 0 0 1-3 3H9" />
      <path d="M10.4 9.6a.8.8 0 0 0-1.3-.6l-5 4.6a.8.8 0 0 0 0 1.2l5 4.6a.8.8 0 0 0 1.3-.6Z" />
    </>
  ),
  accent: dot(19.5, 4.6, 2),
})

export const ExternalLink = createIcon('ExternalLink', {
  shape: <rect height="15" rx="2.6" width="15" x="3" y="6" />,
  cut: <path d="M11 1h12v12Z" fill="#000" transform="translate(-.5 .5)" />,
  over: (
    <>
      <path {...bold} strokeWidth={2.4} d="m12.2 11.8 7-7" />
      <path
        d="M14.3 3.3a.7.7 0 0 1 .5-1.2H21a.9.9 0 0 1 .9.9v6.2a.7.7 0 0 1-1.2.5Z"
        fill="currentColor"
      />
    </>
  ),
  accent: dot(11, 13, 1.8),
})

export const Link2 = createIcon('Link2', {
  shape: (
    <>
      <rect height="9.5" rx="4.75" width="10.5" x="1.5" y="7.25" />
      <rect height="9.5" rx="4.75" width="10.5" x="12" y="7.25" />
    </>
  ),
  cut: (
    <>
      <rect fill="#000" height="4" rx="2" width="5.5" x="4.3" y="10" />
      <rect fill="#000" height="4" rx="2" width="5.5" x="14.2" y="10" />
    </>
  ),
  over: (
    <rect
      fill="currentColor"
      height="2.6"
      rx="1.3"
      width="7"
      x="8.5"
      y="10.7"
    />
  ),
  accent: dot(12, 12, 1.9),
})

const lens = node(10.5, 10.5, 2.2)
export const Search = createIcon('Search', {
  shape: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path
        d="m16 16 4.8 4.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </>
  ),
  cut: lens.cut,
  accent: lens.dot,
})

export const ScanSearch = createIcon('ScanSearch', {
  shape: (
    <>
      <path
        d="M3.2 8V5.6a2.4 2.4 0 0 1 2.4-2.4H8M16 3.2h2.4a2.4 2.4 0 0 1 2.4 2.4V8M20.8 16v2.4a2.4 2.4 0 0 1-2.4 2.4H16M8 20.8H5.6a2.4 2.4 0 0 1-2.4-2.4V16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="11.2" cy="11.2" r="4.4" />
      <path
        d="m14.3 14.3 2.4 2.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </>
  ),
  cut: <circle cx="11.2" cy="11.2" fill="#000" r="2.3" />,
  accent: dot(11.2, 11.2, 1.3),
})

export const Copy = createIcon('Copy', {
  shape: (
    <>
      <rect height="12.5" opacity=".45" rx="2.6" width="12.5" x="3" y="3" />
      <rect height="12.5" rx="2.6" width="12.5" x="8.5" y="8.5" />
    </>
  ),
})

export const Pencil = createIcon('Pencil', {
  shape: (
    <path d="M15.9 3.5a2.4 2.4 0 0 1 3.4 0l1.2 1.2a2.4 2.4 0 0 1 0 3.4L9.4 19.2a1.7 1.7 0 0 1-.8.4l-4.2 1a.8.8 0 0 1-1-1l1-4.2a1.7 1.7 0 0 1 .4-.8Z" />
  ),
  cut: <path {...groove(1.5)} d="m13.8 5.8 4.4 4.4" />,
})

export const Trash2 = createIcon('Trash2', {
  shape: (
    <>
      <rect height="2.8" rx="1.4" width="17" x="3.5" y="4.6" />
      <rect height="3.4" rx="1.2" width="6" x="9" y="2" />
      <path d="M5.4 8.8h13.2l-1.1 11.2a1.9 1.9 0 0 1-1.9 1.7H8.4a1.9 1.9 0 0 1-1.9-1.7Z" />
    </>
  ),
  cut: <path {...groove(1.7)} d="M10 12v6M14 12v6" />,
})

export const Download = createIcon('Download', {
  shape: (
    <>
      <path {...bold} d="M12 6v7" />
      <path d="M7.3 11.2a.8.8 0 0 0-.5 1.3l4.6 4.6a.8.8 0 0 0 1.2 0l4.6-4.6a.8.8 0 0 0-.5-1.3Z" />
      <rect height="2.8" rx="1.4" width="18" x="3" y="18.7" />
    </>
  ),
  accent: dot(12, 3, 1.9),
})

const sunNode = node(7.8, 8.7, 1.7)
export const ImageUp = createIcon('ImageUp', {
  shape: <rect height="16" rx="2.8" width="18" x="2.5" y="5" />,
  cut: (
    <>
      <path d="m3.5 19 5-5.6 3.7 3.6 2.8-2.8 4.9 4.8Z" fill="#000" />
      {sunNode.cut}
      <rect fill="#000" height="10" rx="2" width="9" x="15.5" y="-1" />
    </>
  ),
  over: (
    <>
      <path {...bold} strokeWidth={2.2} d="M20 3.8v5" />
      <path
        d="M17.3 5.6a.6.6 0 0 1-.4-1l2.7-2.9a.6.6 0 0 1 .8 0l2.7 2.9a.6.6 0 0 1-.4 1Z"
        fill="currentColor"
      />
    </>
  ),
  accent: sunNode.dot,
})

export const RefreshCw = createIcon('RefreshCw', {
  shape: (
    <>
      <path
        {...bold}
        d="M19.5 10A7.8 7.8 0 0 0 6 6.9M4.5 14A7.8 7.8 0 0 0 18 17.1"
      />
      <path d="M3.3 3.9a.7.7 0 0 1 1.1-.5l4.8 3.3a.7.7 0 0 1-.2 1.3l-5.3 1a.7.7 0 0 1-.8-.8Z" />
      <path d="M20.7 20.1a.7.7 0 0 1-1.1.5l-4.8-3.3a.7.7 0 0 1 .2-1.3l5.3-1a.7.7 0 0 1 .8.8Z" />
    </>
  ),
  accent: dot(12, 12, 2.2),
})

// Spinner: an arc led by a lit node, so a spin reads as a node orbiting.
export const LoaderCircle = createIcon('LoaderCircle', {
  shape: (
    <path
      {...bold}
      strokeWidth={2.8}
      d="M20.5 12A8.5 8.5 0 1 1 14.5 3.9"
      opacity=".9"
    />
  ),
  accent: dot(20.5, 12, 2.5),
})

export const Loader2 = LoaderCircle
