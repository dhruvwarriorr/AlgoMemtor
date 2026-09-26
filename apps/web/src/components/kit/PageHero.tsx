import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import type { IconComponent } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

import { InfoTip } from './InfoTip'

const ease = [0.16, 1, 0.3, 1] as const

// The top of a page: a lit tool badge, a short title that settles in word by
// word, one line of context, and anything longer behind an info button.
// Visuals (stats, a pipeline) go in `children`, under the title row.
export function PageHero({
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  info,
  actions,
  children,
  className,
}: {
  eyebrow?: string
  icon?: IconComponent
  title: string
  subtitle?: ReactNode
  info?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const words = title.split(' ')

  return (
    <header className={cn('relative isolate min-w-0', className)}>
      <span
        aria-hidden="true"
        className="grid-fade pointer-events-none absolute -top-8 -right-6 -z-10 h-56 w-[28rem] max-w-full"
      />
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <motion.p
              animate={{ opacity: 1, x: 0 }}
              className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-3 pl-1 text-xs font-medium text-foreground backdrop-blur"
              initial={reduceMotion ? false : { opacity: 0, x: -8 }}
              transition={{ duration: 0.5, ease }}
            >
              {Icon ? (
                <span
                  aria-hidden="true"
                  className="grid size-6 place-items-center rounded-full bg-acc text-white [--icon-node:#fff] dark:text-[#0b0c0e] dark:[--icon-node:#0b0c0e]"
                >
                  <Icon className="mi-intro size-3.5" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="ml-2 size-1.5 rounded-full bg-acc"
                />
              )}
              {eyebrow}
            </motion.p>
          ) : null}
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 text-[2rem] leading-[1.04] tracking-[-0.02em] break-words text-foreground sm:text-[2.6rem]">
              {words.map((word, index) => (
                <motion.span
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  className="inline-block"
                  initial={
                    reduceMotion
                      ? false
                      : { opacity: 0, y: 14, filter: 'blur(8px)' }
                  }
                  key={`${word}-${index}`}
                  transition={{ duration: 0.6, ease, delay: 0.05 * index }}
                >
                  {word}
                  {index < words.length - 1 ? ' ' : null}
                </motion.span>
              ))}
            </h1>
            {info ? <InfoTip className="mt-2 shrink-0">{info}</InfoTip> : null}
          </div>
          {subtitle ? (
            <motion.p
              animate={{ opacity: 1 }}
              className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-muted-foreground"
              initial={reduceMotion ? false : { opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {subtitle}
            </motion.p>
          ) : null}
        </div>
        {actions ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            transition={{ duration: 0.5, ease, delay: 0.15 }}
          >
            {actions}
          </motion.div>
        ) : null}
      </div>
      {children ? <div className="mt-6 min-w-0">{children}</div> : null}
    </header>
  )
}
