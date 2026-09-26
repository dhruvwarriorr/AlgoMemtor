import {
  useRef,
  type CSSProperties,
  type RefObject,
  type ElementType,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

type SurfaceTag = 'div' | 'section' | 'article' | 'li' | 'aside' | 'header'

// A card whose border lights up where the pointer is, with a faint pool of
// the page accent under it. Touch users get a still card.
export function SpotlightCard({
  as = 'div',
  className,
  style,
  children,
  elementRef,
  ...rest
}: {
  as?: SurfaceTag
  className?: string
  style?: CSSProperties
  children: ReactNode
  // Also receives the element, for observers such as impression tracking.
  elementRef?: RefObject<HTMLElement | null>
  'aria-label'?: string
  'aria-labelledby'?: string
  id?: string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const Tag = as as ElementType

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const node = ref.current
    if (!node || event.pointerType !== 'mouse') return
    const rect = node.getBoundingClientRect()
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    node.style.setProperty('--my', `${event.clientY - rect.top}px`)
    node.style.setProperty('--spot', '1')
  }

  return (
    <Tag
      className={cn(
        'spot-card rounded-2xl border border-border bg-card',
        className,
      )}
      onPointerLeave={() => ref.current?.style.setProperty('--spot', '0')}
      onPointerMove={onPointerMove}
      ref={(node: HTMLElement | null) => {
        ref.current = node
        if (elementRef) elementRef.current = node
      }}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// A panel with a light running around its border: for the one thing on a
// page that deserves attention.
export function BeamFrame({
  as = 'div',
  className,
  duration,
  children,
  ...rest
}: {
  as?: SurfaceTag
  className?: string
  duration?: number
  children: ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
}) {
  const Tag = as as ElementType
  return (
    <Tag
      className={cn(
        'beam-frame rounded-2xl border border-border bg-card',
        className,
      )}
      style={
        duration === undefined
          ? undefined
          : ({ '--beam-duration': `${duration}s` } as CSSProperties)
      }
      {...rest}
    >
      {children}
    </Tag>
  )
}

// Soft, slowly drifting pools of the page accent. Put it inside a relative,
// overflow-hidden parent, under frosted content.
export function OrbField({
  className,
  intensity = 1,
}: {
  className?: string
  intensity?: number
}) {
  const orb = (
    position: string,
    color: string,
    size: string,
    delay: string,
  ) => (
    <span
      className={cn('orb-float absolute rounded-full blur-3xl', position, size)}
      style={
        {
          background: `radial-gradient(closest-side, ${color}, transparent)`,
          opacity: 0.55 * intensity,
          '--orb-delay': delay,
        } as CSSProperties
      }
    />
  )
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 overflow-hidden',
        className,
      )}
    >
      {orb(
        '-top-16 -left-10',
        'color-mix(in oklab, var(--acc) 55%, transparent)',
        'size-72',
        '0s',
      )}
      {orb(
        '-right-16 top-6',
        'color-mix(in oklab, var(--acc-2) 45%, transparent)',
        'size-64',
        '-5s',
      )}
      {orb(
        'bottom-[-6rem] left-1/3',
        'color-mix(in oklab, var(--acc) 35%, transparent)',
        'size-80',
        '-9s',
      )}
    </span>
  )
}

// Frosted glass over the page accent's light.
export function GlassCard({
  className,
  orbs = true,
  children,
}: {
  className?: string
  orbs?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn('relative isolate overflow-hidden rounded-2xl', className)}
    >
      {orbs ? <OrbField /> : null}
      <div className="glass-card relative h-full rounded-[inherit]">
        {children}
      </div>
    </div>
  )
}

// A small uppercase label with a lit dot, used above values and sections.
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-acc" />
      {children}
    </span>
  )
}
