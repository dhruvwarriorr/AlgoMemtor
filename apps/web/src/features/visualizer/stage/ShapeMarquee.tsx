import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// What the visualizer can draw, as a slowly scrolling band of small glyphs.
const glyph = (children: ReactNode) => (
  <svg
    aria-hidden="true"
    className="size-5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.6}
    viewBox="0 0 24 24"
  >
    {children}
  </svg>
)

const shapes: readonly { label: string; color: string; icon: ReactNode }[] = [
  {
    label: 'Arrays',
    color: '#0ea5e9',
    icon: glyph(
      <>
        <rect height="6" rx="1" width="5" x="2" y="9" />
        <rect height="6" rx="1" width="5" x="9.5" y="9" />
        <rect height="6" rx="1" width="5" x="17" y="9" />
      </>,
    ),
  },
  {
    label: 'Two pointers',
    color: '#8b5cf6',
    icon: glyph(
      <>
        <path d="M5 4v6M19 4v6M3 8l2 2 2-2M17 8l2 2 2-2" />
        <rect height="6" rx="1" width="20" x="2" y="13" />
      </>,
    ),
  },
  {
    label: 'Stacks',
    color: '#f59e0b',
    icon: glyph(
      <>
        <rect height="4" rx="1" width="14" x="5" y="4" />
        <rect height="4" rx="1" width="14" x="5" y="10" />
        <rect height="4" rx="1" width="14" x="5" y="16" />
      </>,
    ),
  },
  {
    label: 'Queues',
    color: '#22c55e',
    icon: glyph(
      <>
        <rect height="8" rx="1" width="4" x="4" y="8" />
        <rect height="8" rx="1" width="4" x="10" y="8" />
        <path d="M16 12h6M19 9l3 3-3 3" />
      </>,
    ),
  },
  {
    label: 'Hash maps',
    color: '#ec4899',
    icon: glyph(
      <>
        <path d="M4 6h5M4 12h5M4 18h5" />
        <path d="M9 6l6 0M9 12l6 6M9 18l6-6" strokeOpacity={0.6} />
        <circle cx="18" cy="6" r="2" />
        <circle cx="18" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>,
    ),
  },
  {
    label: 'Trees',
    color: '#14b8a6',
    icon: glyph(
      <>
        <circle cx="12" cy="5" r="2.2" />
        <circle cx="6" cy="17" r="2.2" />
        <circle cx="18" cy="17" r="2.2" />
        <path d="M11 7l-4 8M13 7l4 8" />
      </>,
    ),
  },
  {
    label: 'Graphs',
    color: '#6366f1',
    icon: glyph(
      <>
        <circle cx="5" cy="7" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M7 7l10-1M6 9l5 7M18 8l-5 8" />
      </>,
    ),
  },
  {
    label: 'Recursion',
    color: '#f97316',
    icon: glyph(
      <>
        <rect height="5" rx="1" width="16" x="4" y="3" />
        <rect height="5" rx="1" width="12" x="6" y="10" />
        <rect height="5" rx="1" width="8" x="8" y="17" />
      </>,
    ),
  },
  {
    label: 'Linked lists',
    color: '#06b6d4',
    icon: glyph(
      <>
        <rect height="6" rx="1.5" width="5" x="2" y="9" />
        <rect height="6" rx="1.5" width="5" x="17" y="9" />
        <path d="M7 12h10M14 9l3 3-3 3" />
      </>,
    ),
  },
  {
    label: 'DP tables',
    color: '#84cc16',
    icon: glyph(
      <>
        <rect height="16" rx="1.5" width="16" x="4" y="4" />
        <path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />
      </>,
    ),
  },
]

export function ShapeMarquee() {
  const reduceMotion = useReducedMotion()
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 gap-3 pr-3">
      {shapes.map((shape) => (
        <li
          className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-4 pl-2 text-sm font-medium whitespace-nowrap text-foreground"
          key={shape.label}
        >
          <span
            className="grid size-8 place-items-center rounded-full"
            style={{
              color: shape.color,
              background: `color-mix(in oklab, ${shape.color} 14%, transparent)`,
            }}
          >
            {shape.icon}
          </span>
          {shape.label}
        </li>
      ))}
    </ul>
  )
  return (
    <div
      aria-label="What the visualizer draws"
      className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]"
      role="group"
    >
      {reduceMotion ? (
        <div className="flex flex-wrap gap-3">{row(false)}</div>
      ) : (
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          className="flex w-max"
          transition={{ duration: 38, repeat: Infinity, ease: 'linear' }}
        >
          {row(false)}
          {row(true)}
        </motion.div>
      )}
    </div>
  )
}
