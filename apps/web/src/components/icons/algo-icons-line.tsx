import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/*
 * AlgoMemtor line icons — "node & edge".
 *
 * Reserved for the top navigation bar and its account menu. Everything else
 * uses the solid set in `algo-icons.tsx`.
 *
 * Every glyph is drawn on a 24-unit grid with light round strokes and small
 * squarish corners, and most carry one filled "memory node": the same dot
 * that forms the crossbar of the logo's A. Arrows grow out of a node, charts
 * end on one, and the coach glyph is the brand mark itself. Set
 * `--icon-node` on any ancestor to tint the nodes separately from the lines.
 *
 * Names match the icons they replace so call sites stay unchanged.
 */

export type IconProps = ComponentPropsWithoutRef<'svg'>
export type IconComponent = ComponentType<IconProps>

function node(cx: number, cy: number, r = 1.9) {
  return (
    <circle
      className="algo-node"
      cx={cx}
      cy={cy}
      fill="var(--icon-node, currentColor)"
      r={r}
      stroke="none"
    />
  )
}

function ring(cx: number, cy: number, r = 2) {
  return <circle cx={cx} cy={cy} r={r} />
}

function createIcon(name: string, body: ReactNode): IconComponent {
  function Icon({ className, strokeWidth = 1.6, ...props }: IconProps) {
    return (
      <svg
        aria-hidden="true"
        className={cn('algo-icon', className)}
        data-icon={name}
        fill="none"
        height={24}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
        width={24}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        {body}
      </svg>
    )
  }
  Icon.displayName = name
  return Icon
}

/* ---- Brand and navigation ---------------------------------------------- */

// The coach: the logo's A with its memory node, plus a small spark.
export const Sparkles = createIcon(
  'Sparkles',
  <>
    <path d="M5 20.5 12 4l7 16.5" />
    {node(12, 14.6, 2.1)}
    <path d="M19.5 3v3.5M17.75 4.75h3.5" />
  </>,
)

// Dashboard: an asymmetric bento with one lit tile.
export const LayoutGrid = createIcon(
  'LayoutGrid',
  <>
    <rect height="10" rx="1.8" width="7.5" x="3.5" y="3.5" />
    <rect height="5.5" rx="1.8" width="7.5" x="13" y="3.5" />
    <rect height="9.5" rx="1.8" width="7.5" x="13" y="11" />
    <rect height="5" rx="1.8" width="7.5" x="3.5" y="15.5" />
    {node(7.25, 8.5, 1.7)}
  </>,
)

// Recommendation: an idea with a node for a filament.
export const Lightbulb = createIcon(
  'Lightbulb',
  <>
    <path d="M9.5 17.5h5M10.5 20.5h3" />
    <path d="M8.8 14.8C7.1 13.6 6 11.7 6 9.6a6 6 0 0 1 12 0c0 2.1-1.1 4-2.8 5.2" />
    <path d="M12 11.8v3" />
    {node(12, 9.6, 2)}
  </>,
)

// Memory: a small knowledge graph around one lit node.
export const Brain = createIcon(
  'Brain',
  <>
    {ring(5.5, 6, 2.2)}
    {ring(18.5, 6, 2.2)}
    {ring(12, 19.5, 2.2)}
    <path d="M7.7 6h8.6M10.2 10.1 7.2 7.5M13.8 10.1l3-2.6M12 14v3.3" />
    {node(12, 11.8, 2.4)}
  </>,
)

export const TrendingUp = createIcon(
  'TrendingUp',
  <>
    <path d="M3.5 18 9 12.5l4 3.5 7-8" />
    {node(20, 8, 2)}
  </>,
)

export const TrendingDown = createIcon(
  'TrendingDown',
  <>
    <path d="M3.5 6 9 11.5l4-3.5 7 8" />
    {node(20, 16, 2)}
  </>,
)

// Insights: two measured bars and a projected point above the third.
export const BarChart3 = createIcon(
  'BarChart3',
  <>
    <path d="M3.5 20.5h17" />
    <rect height="6.5" rx="1.2" width="3.6" x="5" y="12" />
    <rect height="10.5" rx="1.2" width="3.6" x="10.2" y="8" />
    <rect height="7.5" rx="1.2" width="3.6" x="15.4" y="11" />
    {node(17.2, 6.6, 1.8)}
  </>,
)

export const LineChart = createIcon(
  'LineChart',
  <>
    <path d="M3.5 3.5v17h17" />
    <path d="m7 15 3.5-4 3 2.5 5-6" />
    {node(18.5, 7.5, 1.7)}
  </>,
)

export const Activity = createIcon(
  'Activity',
  <>
    <path d="M3 12h3.5L9 6l4.5 12 2.5-6h2" />
    {node(20, 12, 1.8)}
  </>,
)

export const Gauge = createIcon(
  'Gauge',
  <>
    <path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" />
    <path d="m12 14.5 4.2-5" />
    {node(12, 14.5, 1.9)}
  </>,
)

/* ---- Practice ----------------------------------------------------------- */

export const Trophy = createIcon(
  'Trophy',
  <>
    <path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0V4Z" />
    <path d="M7.5 6h-3v1.2a3.3 3.3 0 0 0 3.3 3.3M16.5 6h3v1.2a3.3 3.3 0 0 1-3.3 3.3" />
    <path d="M12 14v3.5M8.5 20.5h7l-1-3h-5l-1 3Z" />
    {node(12, 8.4, 1.8)}
  </>,
)

export const Crown = createIcon(
  'Crown',
  <>
    <path d="m3.5 8 4.5 4 4-6.5 4 6.5 4.5-4L19 18.5H5L3.5 8Z" />
    <path d="M5 21h14" />
    {node(12, 14, 1.6)}
  </>,
)

export const Flame = createIcon(
  'Flame',
  <>
    <path d="M12 3.5c.8 2.8 5.5 5.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4 2.3-5.6.7 1 1 2 1 3 1.2-2 2.2-4.2 2.2-7.6Z" />
    {node(12, 15.8, 1.9)}
  </>,
)

// Problems: one solved row (a node) above two open ones.
export const ListChecks = createIcon(
  'ListChecks',
  <>
    {node(5.5, 6.5, 1.9)}
    <rect height="3.4" rx="1" width="3.4" x="3.8" y="10.3" />
    <rect height="3.4" rx="1" width="3.4" x="3.8" y="16.3" />
    <path d="M10 6.5h10M10 12h10M10 18h6.5" />
  </>,
)

export const Bookmark = createIcon(
  'Bookmark',
  <>
    <path d="M5.5 4.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16L12 16.3l-6.5 4.2v-16Z" />
    {node(12, 9.5, 1.9)}
  </>,
)

export const BookmarkCheck = createIcon(
  'BookmarkCheck',
  <>
    <path d="M5.5 4.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16L12 16.3l-6.5 4.2v-16Z" />
    <path d="m9.2 9.8 2 2 3.6-3.8" />
  </>,
)

export const Target = createIcon(
  'Target',
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    {node(12, 12, 1.8)}
  </>,
)

export const Crosshair = createIcon(
  'Crosshair',
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    {node(12, 12, 1.7)}
  </>,
)

export const Compass = createIcon(
  'Compass',
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    {node(12, 12, 1.2)}
  </>,
)

// Roadmap: a path that leaves a lit node and ends at an open one.
export const Route = createIcon(
  'Route',
  <>
    {node(5.5, 18.5, 2)}
    <path d="M7.5 18.5H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7.5" />
    {ring(18.5, 6.5, 2)}
  </>,
)

const MapIcon = createIcon(
  'Map',
  <>
    <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5v-13.5Z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </>,
)
export { MapIcon as Map }

export const Code2 = createIcon(
  'Code2',
  <>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
    {node(12, 12, 1.8)}
  </>,
)

export const Shapes = createIcon(
  'Shapes',
  <>
    <path d="m12 3.5 4.5 7.5h-9L12 3.5Z" />
    <rect height="7" rx="1.5" width="7" x="3.5" y="14" />
    {node(17, 17.5, 3.4)}
  </>,
)

export const Swords = createIcon(
  'Swords',
  <>
    <path d="M4 4h3.5l9 9M13 16.5l3.5-3.5M15 15l4.5 4.5" />
    <path d="M20 4h-3.5l-9 9M11 16.5 7.5 13M9 15l-4.5 4.5" />
  </>,
)

export const Zap = createIcon(
  'Zap',
  <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z" />,
)

export const CalendarDays = createIcon(
  'CalendarDays',
  <>
    <rect height="15.5" rx="2" width="17" x="3.5" y="5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    {node(8, 14, 1.1)}
    {node(12, 14, 1.1)}
    {node(16, 14, 1.1)}
    {node(8, 17.3, 1.1)}
    {node(12, 17.3, 1.1)}
  </>,
)

export const CalendarCheck = createIcon(
  'CalendarCheck',
  <>
    <rect height="15.5" rx="2" width="17" x="3.5" y="5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="m9 15 2 2 4-4" />
  </>,
)

/* ---- Account and system ------------------------------------------------- */

export const UserRound = createIcon(
  'UserRound',
  <>
    {node(12, 8, 3.6)}
    <path d="M4.5 20.5c.9-3.8 3.8-5.8 7.5-5.8s6.6 2 7.5 5.8" />
  </>,
)

// Settings: a hex nut around a node.
export const Settings = createIcon(
  'Settings',
  <>
    <path d="m12 2.8 7.8 4.5v9.4L12 21.2l-7.8-4.5V7.3L12 2.8Z" />
    {node(12, 12, 2.6)}
  </>,
)

export const SlidersHorizontal = createIcon(
  'SlidersHorizontal',
  <>
    <path d="M3.5 7h4M11.5 7h9M3.5 17h9M16.5 17h4" />
    {node(9.5, 7, 2.1)}
    {ring(14.5, 17, 2)}
  </>,
)

export const LogOut = createIcon(
  'LogOut',
  <>
    <path d="M10 3.5H6A1.5 1.5 0 0 0 4.5 5v14A1.5 1.5 0 0 0 6 20.5h4" />
    <path d="m15 7.5 4.5 4.5-4.5 4.5M19.5 12h-8" />
    {node(10, 12, 1.7)}
  </>,
)

export const Sun = createIcon(
  'Sun',
  <>
    {node(12, 12, 3.4)}
    <path d="M12 2.8V5M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5" />
  </>,
)

export const Moon = createIcon(
  'Moon',
  <>
    <path d="M19.5 14.6A7.9 7.9 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1Z" />
    {node(17.5, 5.5, 1.3)}
  </>,
)

export const Monitor = createIcon(
  'Monitor',
  <>
    <rect height="12.5" rx="1.8" width="18" x="3" y="4" />
    <path d="M9 20.5h6M12 16.5v4" />
    {node(12, 10.2, 1.9)}
  </>,
)

export const Lock = createIcon(
  'Lock',
  <>
    <rect height="10" rx="2" width="14" x="5" y="10.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    {node(12, 15.5, 1.7)}
  </>,
)

export const ShieldCheck = createIcon(
  'ShieldCheck',
  <>
    <path d="m12 3 7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6L12 3Z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </>,
)

export const BadgeCheck = createIcon(
  'BadgeCheck',
  <>
    <path d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5Z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </>,
)

export const Bell = createIcon(
  'Bell',
  <>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
    <path d="M10 21.2h4" />
    {node(12, 11, 1.6)}
  </>,
)

export const BellRing = createIcon(
  'BellRing',
  <>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
    <path d="M10 21.2h4M3 8a9 9 0 0 1 2.5-4.5M21 8a9 9 0 0 0-2.5-4.5" />
    {node(12, 11, 1.6)}
  </>,
)

export const Palette = createIcon(
  'Palette',
  <>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.8 1.8-1.8h2.2a3.7 3.7 0 0 0 3.7-3.7c0-3.6-3.8-7-8.5-7Z" />
    {node(8, 10.5, 1.3)}
    {node(11, 7.2, 1.3)}
    {node(15.3, 7.8, 1.3)}
  </>,
)

export const Database = createIcon(
  'Database',
  <>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
    <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" />
    <path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    {node(12, 5.5, 1.2)}
  </>,
)

export const PlugZap = createIcon(
  'PlugZap',
  <>
    <path d="M9 3.5v4M15 3.5v4M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0V7.5ZM12 16.5v4" />
    {node(12, 11, 1.8)}
  </>,
)

export const Unplug = createIcon(
  'Unplug',
  <>
    <path d="M9 3.5v4M15 3.5v4M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0V7.5ZM12 16.5v4" />
    <path d="m3.5 3.5 17 17" />
  </>,
)

export const CloudOff = createIcon(
  'CloudOff',
  <>
    <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6 3.8 3.8 0 0 1-.2 7.4H7Z" />
    <path d="m3.5 3.5 17 17" />
  </>,
)

/* ---- Conversation ------------------------------------------------------- */

export const MessageCircle = createIcon(
  'MessageCircle',
  <>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3.5V17H6a2 2 0 0 1-2-2V6Z" />
    {node(8.5, 10.5, 1.2)}
    {node(12, 10.5, 1.2)}
    {node(15.5, 10.5, 1.2)}
  </>,
)

export const MessagesSquare = createIcon(
  'MessagesSquare',
  <>
    <path d="M8 4.5h11A1.5 1.5 0 0 1 20.5 6v8" />
    <path d="M3.5 9.5A1.5 1.5 0 0 1 5 8h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 15 17H9l-4 3.2V17a1.5 1.5 0 0 1-1.5-1.5v-6Z" />
    {node(10, 12.5, 1.4)}
  </>,
)

export const Send = createIcon(
  'Send',
  <>
    <path d="M20.5 3.5 3.5 10.5l7 3 3 7 7-17Z" />
    <path d="m20.5 3.5-10 10" />
  </>,
)

export const Paperclip = createIcon(
  'Paperclip',
  <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.4 3.4 0 0 1 4.8 4.8l-7.6 7.6a1.7 1.7 0 0 1-2.4-2.4l7-7" />,
)

export const BookOpen = createIcon(
  'BookOpen',
  <>
    <path d="M12 6.5C10 4.8 7.2 4 3.5 4v14c3.7 0 6.5.8 8.5 2.5 2-1.7 4.8-2.5 8.5-2.5V4c-3.7 0-6.5.8-8.5 2.5Z" />
    <path d="M12 6.5v14" />
  </>,
)

/* ---- Actions and status ------------------------------------------------- */

export const X = createIcon('X', <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />)

export const Plus = createIcon('Plus', <path d="M12 5v14M5 12h14" />)

export const Check = createIcon('Check', <path d="m5 12.5 4.5 4.5L19 7.5" />)

export const CheckCheck = createIcon(
  'CheckCheck',
  <path d="m2.5 12.8 4 4 8.5-9M12 16l.8.8 8.7-9" />,
)

export const CheckCircle2 = createIcon(
  'CheckCircle2',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.3 2.8 2.8 5.4-5.6" />
  </>,
)

export const XCircle = createIcon(
  'XCircle',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </>,
)

export const MoreHorizontal = createIcon(
  'MoreHorizontal',
  <>
    {node(5.5, 12, 1.7)}
    {node(12, 12, 1.7)}
    {node(18.5, 12, 1.7)}
  </>,
)

// Arrows are edges: each one leaves from a node.
export const ArrowRight = createIcon(
  'ArrowRight',
  <>
    <path d="M6.2 12h13.3M14 6.5l5.5 5.5-5.5 5.5" />
    {node(4, 12, 1.6)}
  </>,
)

export const ArrowLeft = createIcon(
  'ArrowLeft',
  <>
    <path d="M17.8 12H4.5M10 6.5 4.5 12l5.5 5.5" />
    {node(20, 12, 1.6)}
  </>,
)

export const ArrowUp = createIcon(
  'ArrowUp',
  <>
    <path d="M12 17.8V4.5M6.5 10 12 4.5 17.5 10" />
    {node(12, 20, 1.6)}
  </>,
)

export const ArrowDown = createIcon(
  'ArrowDown',
  <>
    <path d="M12 6.2v13.3M6.5 14l5.5 5.5 5.5-5.5" />
    {node(12, 4, 1.6)}
  </>,
)

export const ArrowUpRight = createIcon(
  'ArrowUpRight',
  <>
    <path d="M8.1 15.9 17 7M9.5 7H17v7.5" />
    {node(6.5, 17.5, 1.6)}
  </>,
)

export const CornerDownLeft = createIcon(
  'CornerDownLeft',
  <>
    <path d="M19.5 7v4.5a3 3 0 0 1-3 3H5.5M9.5 10.5l-4 4 4 4" />
    {node(19.5, 4.8, 1.5)}
  </>,
)

export const ExternalLink = createIcon(
  'ExternalLink',
  <>
    <path d="M14 3.5h6.5V10M20.5 3.5 12.2 11.8" />
    <path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h5" />
    {node(11, 13, 1.6)}
  </>,
)

export const Link2 = createIcon(
  'Link2',
  <>
    <path d="M9.5 7.5H7a4.5 4.5 0 0 0 0 9h2.5M14.5 7.5H17a4.5 4.5 0 0 1 0 9h-2.5M8.5 12h7" />
    {node(12, 12, 1.7)}
  </>,
)

export const Search = createIcon(
  'Search',
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
    {node(10.5, 10.5, 1.6)}
  </>,
)

export const ScanSearch = createIcon(
  'ScanSearch',
  <>
    <path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" />
    <circle cx="11.5" cy="11.5" r="3.5" />
    <path d="m14 14 2.5 2.5" />
    {node(11.5, 11.5, 1.1)}
  </>,
)

export const Copy = createIcon(
  'Copy',
  <>
    <rect height="12.5" rx="2" width="12.5" x="8" y="8" />
    <path d="M16 8V5a1.5 1.5 0 0 0-1.5-1.5h-9A1.5 1.5 0 0 0 4 5v9a1.5 1.5 0 0 0 1.5 1.5H8" />
  </>,
)

export const Pencil = createIcon(
  'Pencil',
  <path d="m4 20 1.1-4.2L15.8 5.1a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.2 18.9 4 20ZM14 7l3 3" />,
)

export const Trash2 = createIcon(
  'Trash2',
  <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 10.5v6M14 10.5v6" />,
)

export const Download = createIcon(
  'Download',
  <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 20.5h16" />,
)

export const ImageUp = createIcon(
  'ImageUp',
  <>
    <path d="M20.5 13v5.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H11" />
    <path d="m3.5 16 4.5-4.5 4 4 2.5-2.5 6 6M17.5 9.5v-6M15 6l2.5-2.5L20 6" />
    {node(8.5, 7.8, 1.6)}
  </>,
)

export const RefreshCw = createIcon(
  'RefreshCw',
  <>
    <path d="M19.5 9.5A8 8 0 0 0 5.2 7.5M4.5 3.5V8H9M4.5 14.5a8 8 0 0 0 14.3 2M19.5 20.5V16H15" />
    {node(12, 12, 1.9)}
  </>,
)

// Spinner: an open ring led by a node, so the spin reads as a dot orbiting.
export const LoaderCircle = createIcon(
  'LoaderCircle',
  <>
    <path d="M20.5 12A8.5 8.5 0 1 1 14.5 3.9" />
    {node(20.5, 12, 2)}
  </>,
)

export const Loader2 = LoaderCircle
