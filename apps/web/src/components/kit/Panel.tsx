import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

import { SpotlightCard } from './surfaces'

/*
 * Chart and section panels. A page chooses one look with <PanelStyle>, so
 * panels on different pages do not repeat each other:
 *   rail   — lit accent bar beside the title, pointer light on the border
 *   notch  — the title sits in a folder tab hanging from the top edge
 *   glass  — frosted over a pool of the accent colour
 *   hud    — corner brackets and a mono title, like an instrument display
 *   soft   — borderless tinted tile
 *   plain  — a quiet bordered card
 *   classic — the original card of the Progress, Insights and Dashboard
 *             pages: a larger title and a plain bordered surface
 */
export type PanelVariant =
  'rail' | 'notch' | 'glass' | 'hud' | 'soft' | 'plain' | 'classic'

const PanelVariantContext = createContext<PanelVariant>('plain')

export function PanelStyle({
  variant,
  children,
}: {
  variant: PanelVariant
  children: ReactNode
}) {
  return (
    <PanelVariantContext.Provider value={variant}>
      {children}
    </PanelVariantContext.Provider>
  )
}

function Corners() {
  const corner =
    'pointer-events-none absolute size-3.5 border-acc transition-all duration-500 group-hover/panel:size-5'
  return (
    <span aria-hidden="true">
      <span
        className={cn(
          corner,
          'top-0 left-0 rounded-tl-lg border-t-2 border-l-2',
        )}
      />
      <span
        className={cn(
          corner,
          'top-0 right-0 rounded-tr-lg border-t-2 border-r-2',
        )}
      />
      <span
        className={cn(
          corner,
          'bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2',
        )}
      />
      <span
        className={cn(
          corner,
          'right-0 bottom-0 rounded-br-lg border-r-2 border-b-2',
        )}
      />
    </span>
  )
}

export function Panel({
  title,
  description,
  action,
  className,
  children,
  headingLevel = 2,
  headingId,
  variant: override,
  as = 'section',
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
  headingLevel?: 2 | 3
  headingId?: string
  variant?: PanelVariant
  as?: 'section' | 'div'
}) {
  const contextVariant = useContext(PanelVariantContext)
  const variant = override ?? contextVariant
  const reduceMotion = useReducedMotion()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const labelled =
    headingId === undefined ? {} : { 'aria-labelledby': headingId }

  const heading =
    variant === 'hud' ? (
      <Heading
        className="font-mono text-xs font-semibold tracking-[0.12em] text-foreground uppercase"
        id={headingId}
      >
        <span aria-hidden="true" className="mr-1.5 text-acc">
          ▸
        </span>
        {title}
      </Heading>
    ) : variant === 'rail' ? (
      <Heading
        className="flex items-center gap-2 text-base font-semibold text-foreground"
        id={headingId}
      >
        <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-acc" />
        {title}
      </Heading>
    ) : (
      <Heading
        className={cn(
          'font-semibold text-foreground',
          variant === 'classic' ? 'text-lg' : 'text-base',
        )}
        id={headingId}
      >
        {title}
      </Heading>
    )

  const header =
    variant === 'notch' ? (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex rounded-b-xl bg-acc px-3.5 py-1.5 text-white shadow-[0_8px_18px_-10px_var(--acc)] dark:text-[#0b0c0e] [&_h2]:text-sm [&_h2]:text-inherit [&_h3]:text-sm [&_h3]:text-inherit">
            {heading}
          </div>
          {description ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    ) : (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {heading}
          {description ? (
            <p
              className={cn(
                'mt-1 text-xs leading-5 text-muted-foreground',
                variant === 'hud' && 'font-mono text-[0.68rem]',
                variant === 'classic' && 'mt-0.5 text-sm',
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    )

  const body = (
    <>
      {header}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  )

  const shell =
    variant === 'rail' ? (
      <SpotlightCard className="flex h-full min-w-0 flex-col p-4 sm:p-5">
        {body}
      </SpotlightCard>
    ) : variant === 'glass' ? (
      <div className="relative isolate h-full overflow-hidden rounded-3xl">
        <span
          aria-hidden="true"
          className="orb-float pointer-events-none absolute -top-16 -right-12 -z-10 size-52 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_40%,transparent),transparent)] blur-2xl"
          style={{ '--orb-delay': '-3s' } as CSSProperties}
        />
        <div className="glass-card flex h-full min-w-0 flex-col rounded-3xl p-4 sm:p-5">
          {body}
        </div>
      </div>
    ) : variant === 'hud' ? (
      <div className="group/panel relative flex h-full min-w-0 flex-col rounded-xl bg-[color-mix(in_oklab,var(--card)_55%,transparent)] p-4 ring-1 ring-border sm:p-5">
        <Corners />
        {body}
      </div>
    ) : variant === 'soft' ? (
      <div className="flex h-full min-w-0 flex-col rounded-3xl bg-[color-mix(in_oklab,var(--acc)_7%,var(--card))] p-4 sm:p-5">
        {body}
      </div>
    ) : variant === 'notch' ? (
      <div className="flex h-full min-w-0 flex-col rounded-3xl border border-border bg-card p-4 pt-0 sm:p-5 sm:pt-0">
        {body}
      </div>
    ) : variant === 'classic' ? (
      <div className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-4 sm:p-5">
        {body}
      </div>
    ) : (
      <div className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 sm:p-5">
        {body}
      </div>
    )

  const Wrapper = as === 'div' ? motion.div : motion.section
  return (
    <Wrapper
      {...labelled}
      className={cn('flex min-w-0 flex-col', className)}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {shell}
    </Wrapper>
  )
}
