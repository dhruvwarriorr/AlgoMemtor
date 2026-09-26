import type { ReactNode } from 'react'

import type {
  IconComponent,
  IconProps,
} from '@/components/icons/algo-icons-line'
import { cn } from '@/lib/utils'

/*
 * The drawing kit behind the mentor tool and app icons: a 24px grid, a 1.8
 * stroke, and the brand's memory node as the point of focus.
 *
 * Motion lives in index.css (`.mi-icon`). When the icon, the link or button
 * around it, or a `.mi-host` card is hovered: `mi-draw` strokes trace in,
 * `mi-spin` parts turn once, `mi-pulse` nodes pulse, `mi-drop` parts settle
 * into place, `mi-flicker` parts sway like a flame, `mi-sweep` needles swing
 * up, and `mi-lift` parts rise and return. `.mi-intro` plays the drawing once
 * when the icon first appears. Nothing moves under reduced motion.
 */
export function motionIcon(name: string, body: ReactNode): IconComponent {
  function Icon({ className, strokeWidth = 1.8, ...props }: IconProps) {
    return (
      <svg
        className={cn('mi-icon', className)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
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

// The brand node: a filled dot that takes `--icon-node` when set.
export function iconNode(cx: number, cy: number, r = 1.9, pulse = true) {
  return (
    <circle
      className={pulse ? 'mi-pulse' : undefined}
      cx={cx}
      cy={cy}
      fill="var(--icon-node, currentColor)"
      r={r}
      stroke="none"
    />
  )
}
