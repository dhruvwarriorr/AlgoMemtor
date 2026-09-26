import type { CSSProperties, ReactNode } from 'react'

import type { IconProps } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

/*
 * Doubt Helper icons: small illustrations, one per kind of doubt, drawn for
 * this product rather than taken from a generic set.
 *
 * Grid 32×32, 1.6 stroke in the ink colour, a tinted plate (`--di-plate`)
 * behind the subject and one lit accent (`--di`). Each icon has a hue of its
 * own so the eight read apart at a glance.
 *
 * Motion lives in index.css (`.di-icon`). It plays when a `.di-host` parent
 * is hovered or focused, or when the icon sits in a `[data-selected=true]`
 * tile: the lens scans, the route draws, the shield stamps, the bolt
 * flickers, the caret blinks, the wrong result shakes, the hourglass turns
 * and the spark spins. Nothing moves under reduced motion.
 */

export type DoubtIconComponent = ((props: IconProps) => ReactNode) & {
  hue: string
  displayName: string
}

function doubtIcon(
  name: string,
  hue: string,
  body: ReactNode,
): DoubtIconComponent {
  function Icon({ className, style, ...props }: IconProps) {
    return (
      <svg
        className={cn('di-icon', className)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
        style={{ '--di': hue, ...style } as CSSProperties}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        {body}
      </svg>
    )
  }
  Icon.displayName = name
  Icon.hue = hue
  return Icon
}

const plate = 'var(--di-plate, color-mix(in oklab, var(--di) 18%, transparent))'
const lit = 'var(--di)'

// I cannot understand the problem: a statement read through a lens that
// finds the confusing line.
export const UnderstandProblemIcon = doubtIcon(
  'UnderstandProblemIcon',
  '#0ea5e9',
  <>
    <rect
      fill={plate}
      height={23}
      rx={3}
      stroke="none"
      width={17}
      x={4}
      y={4}
    />
    <rect height={23} rx={3} width={17} x={4} y={4} />
    <path d="M8 9.5h9M8 13.5h6" />
    <path d="M8 17.5h4M8 21.5h5" opacity={0.45} />
    <g className="di-scan">
      <circle cx={20.5} cy={19} fill="var(--card, #fff)" r={5.2} />
      <circle cx={20.5} cy={19} r={5.2} />
      <path d="M24.3 22.8 28 26.5" strokeWidth={2.4} />
      <path
        d="M19 17.6a1.6 1.6 0 1 1 2.4 1.4c-.6.3-.9.7-.9 1.3"
        stroke={lit}
        strokeWidth={1.7}
      />
      <circle cx={20.5} cy={22.2} fill={lit} r={0.9} stroke="none" />
    </g>
  </>,
)

// I do not know how to approach it: a dead end, and a route that winds on to
// the flag.
export const FindApproachIcon = doubtIcon(
  'FindApproachIcon',
  '#22c55e',
  <>
    <circle cx={16} cy={16} fill={plate} r={13} stroke="none" />
    <path
      d="M13.5 15.2C10.8 13.8 9 11.5 8.6 8.2"
      opacity={0.5}
      strokeDasharray="2 2.6"
    />
    <path d="M7 6.6l3.2 3.2M10.2 6.6 7 9.8" opacity={0.6} />
    <path
      className="di-draw"
      d="M6.5 26c0-5 4.4-6.2 7.3-9.8 2.7-3.3 5.2-4.8 10.4-5.2"
      pathLength={1}
      strokeWidth={2}
    />
    <circle cx={6.5} cy={26} fill="var(--card, #fff)" r={2.2} />
    <g className="di-wave">
      <path d="M24.4 16V4.2" />
      <path d="M24.4 4.4h5.1l-1.6 2.3 1.6 2.3h-5.1z" fill={lit} stroke={lit} />
    </g>
  </>,
)

// Check my approach: a plan on a clipboard, stamped by a shield.
export const ApproachReviewIcon = doubtIcon(
  'ApproachReviewIcon',
  '#14b8a6',
  <>
    <rect
      fill={plate}
      height={22}
      rx={3}
      stroke="none"
      width={16}
      x={4}
      y={6}
    />
    <rect height={22} rx={3} width={16} x={4} y={6} />
    <rect
      fill="var(--card, #fff)"
      height={4}
      rx={1.4}
      width={7}
      x={8.5}
      y={4}
    />
    <path d="M7.6 13.2l1.3 1.3 2.2-2.4M13.4 13.2h3.6" />
    <path d="M7.6 19.2l1.3 1.3 2.2-2.4M13.4 19.2h2" opacity={0.55} />
    <g className="di-stamp">
      <path
        d="M22.5 13.6l5.8 2.2v4.3c0 3.6-2.5 6.1-5.8 7.5-3.3-1.4-5.8-3.9-5.8-7.5v-4.3z"
        fill="var(--card, #fff)"
      />
      <path
        d="M22.5 13.6l5.8 2.2v4.3c0 3.6-2.5 6.1-5.8 7.5-3.3-1.4-5.8-3.9-5.8-7.5v-4.3z"
        fill={plate}
        stroke={lit}
      />
      <path
        className="di-draw"
        d="M20 20.6l1.8 1.8 3.4-3.6"
        pathLength={1}
        stroke={lit}
        strokeWidth={1.9}
      />
    </g>
  </>,
)

// Compilation error: a code window split by a bolt between its brackets.
export const CompilationErrorIcon = doubtIcon(
  'CompilationErrorIcon',
  '#f43f5e',
  <>
    <rect
      fill={plate}
      height={21}
      rx={3.2}
      stroke="none"
      width={26}
      x={3}
      y={6}
    />
    <rect height={21} rx={3.2} width={26} x={3} y={6} />
    <path d="M3 11h26" opacity={0.55} />
    <circle cx={6.4} cy={8.5} fill="currentColor" r={0.8} stroke="none" />
    <circle cx={9} cy={8.5} fill="currentColor" r={0.8} stroke="none" />
    <path d="M10.4 15.4 7.4 19l3 3.6M21.6 15.4l3 3.6-3 3.6" strokeWidth={1.9} />
    <path
      className="di-flicker"
      d="M17.2 13.6 14 19.2h3.6l-2.6 5.6"
      stroke={lit}
      strokeWidth={2}
    />
  </>,
)

// My code prints nothing: a terminal with a prompt, a waiting caret and
// empty lines where output should be.
export const NoOutputIcon = doubtIcon(
  'NoOutputIcon',
  '#8b5cf6',
  <>
    <rect
      fill={plate}
      height={22}
      rx={3.2}
      stroke="none"
      width={26}
      x={3}
      y={5}
    />
    <rect height={22} rx={3.2} width={26} x={3} y={5} />
    <path d="M7.4 12.2l2.8 2.4-2.8 2.4" strokeWidth={1.9} />
    <rect
      className="di-caret"
      fill={lit}
      height={4.2}
      rx={0.8}
      stroke="none"
      width={3.4}
      x={12.4}
      y={12.6}
    />
    <path
      d="M7.4 21.8h5.4M15.6 21.8h9"
      opacity={0.4}
      strokeDasharray="1.4 2.4"
    />
  </>,
)

// Wrong answer: the expected result, and yours knocked askew beside it.
export const WrongAnswerIcon = doubtIcon(
  'WrongAnswerIcon',
  '#ef4444',
  <>
    <rect
      fill={plate}
      height={13}
      rx={3}
      stroke="none"
      width={13}
      x={3.5}
      y={5}
    />
    <rect height={13} rx={3} width={13} x={3.5} y={5} />
    <path d="M6.8 11.6l2.1 2.1 4.2-4.4" strokeWidth={1.9} />
    <path d="M14.2 22.6h-2.8M14.2 25.4h-2.8" opacity={0.5} />
    <g className="di-shake">
      <rect
        fill="var(--card, #fff)"
        height={13}
        rx={3}
        transform="rotate(8 22 20.5)"
        width={13}
        x={15.5}
        y={14}
      />
      <rect
        fill={plate}
        height={13}
        rx={3}
        stroke={lit}
        transform="rotate(8 22 20.5)"
        width={13}
        x={15.5}
        y={14}
      />
      <path
        d="M19.4 17.8l5.2 5.4M24.6 17.8l-5.2 5.4"
        stroke={lit}
        strokeWidth={2}
      />
    </g>
  </>,
)

// Time or memory limit exceeded: an hourglass running out beside a memory
// chip.
export const LimitExceededIcon = doubtIcon(
  'LimitExceededIcon',
  '#f59e0b',
  <>
    <rect
      fill={plate}
      height={10}
      rx={2}
      stroke="none"
      width={10}
      x={19}
      y={17}
    />
    <rect height={10} rx={2} width={10} x={19} y={17} />
    <path
      d="M21.5 15v2M26.5 15v2M21.5 27v2M26.5 27v2M17 19.5h2M17 24.5h2"
      opacity={0.6}
    />
    <rect
      fill={lit}
      height={3.6}
      opacity={0.85}
      rx={0.8}
      stroke="none"
      width={3.6}
      x={22.2}
      y={20.2}
    />
    <g className="di-turn">
      <path d="M5.5 3.5h11M5.5 28.5h11" strokeWidth={1.9} />
      <path d="M7 3.5c0 5.2 4 7.2 4 12.5s-4 7.3-4 12.5M15 3.5c0 5.2-4 7.2-4 12.5s4 7.3 4 12.5" />
      <path d="M8.7 8h4.6L11 11.4z" fill={lit} stroke="none" />
      <path
        d="M8.3 27c.7-2.4 1.6-3.4 2.7-3.4s2 1 2.7 3.4z"
        fill={lit}
        stroke="none"
      />
      <path
        className="di-sand"
        d="M11 12.4v9.4"
        stroke={lit}
        strokeDasharray="1 1.8"
      />
    </g>
  </>,
)

// General help: a conversation with a spark of insight in it.
export const GeneralHelpIcon = doubtIcon(
  'GeneralHelpIcon',
  '#6366f1',
  <>
    <path
      d="M4.5 8A3.5 3.5 0 0 1 8 4.5h16A3.5 3.5 0 0 1 27.5 8v10.5A3.5 3.5 0 0 1 24 22h-9.5l-6 5v-5H8a3.5 3.5 0 0 1-3.5-3.5z"
      fill={plate}
      stroke="none"
    />
    <path d="M4.5 8A3.5 3.5 0 0 1 8 4.5h16A3.5 3.5 0 0 1 27.5 8v10.5A3.5 3.5 0 0 1 24 22h-9.5l-6 5v-5H8a3.5 3.5 0 0 1-3.5-3.5z" />
    <path
      className="di-spark"
      d="M16 7.6l1.3 3.3 3.3 1.3-3.3 1.3-1.3 3.3-1.3-3.3-3.3-1.3 3.3-1.3z"
      fill={lit}
      stroke={lit}
      strokeWidth={1}
    />
    <circle cx={22.2} cy={8.8} fill={lit} opacity={0.6} r={1} stroke="none" />
    <circle
      cx={9.6}
      cy={16.6}
      fill={lit}
      opacity={0.45}
      r={0.9}
      stroke="none"
    />
  </>,
)
