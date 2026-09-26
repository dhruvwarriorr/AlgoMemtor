import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

// The default example (two pointers on a sorted array, target 13) replayed
// as a looping miniature, so the empty composer shows what a run looks like.
const values = [1, 3, 4, 6, 9, 11] as const
const target = 13
const frames = [
  { l: 0, r: 5, line: 1 },
  { l: 1, r: 5, line: 2 },
  { l: 1, r: 4, line: 1 },
  { l: 2, r: 4, line: 3 },
] as const
const codeLines = [
  'sum = a[l] + a[r]',
  'if (sum < target) l++',
  'else r--',
  'if (sum == target) print(l, r)',
] as const

const cellWidth = 3.25 // rem: a 2.5rem cell plus the 0.75rem gap

export function TracePreview() {
  const reduceMotion = useReducedMotion()
  const [frame, setFrame] = useState(reduceMotion ? frames.length - 1 : 0)
  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setInterval(
      () => setFrame((value) => (value + 1) % frames.length),
      1500,
    )
    return () => window.clearInterval(timer)
  }, [reduceMotion])
  const current = frames[frame] ?? frames[0]
  const sum = (values[current.l] ?? 0) + (values[current.r] ?? 0)
  const found = frame === frames.length - 1
  const relation = sum < target ? '<' : sum > target ? '>' : '='

  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft"
    >
      <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_25%,transparent),transparent)] blur-2xl" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Preview · two pointers
        </p>
        <span className="font-mono text-[0.68rem] text-muted-foreground">
          step {frame + 1}/{frames.length}
        </span>
      </div>

      <div className="relative mx-auto mt-5 w-fit">
        <div className="relative h-5">
          {(['l', 'r'] as const).map((pointer) => (
            <motion.span
              animate={{ x: `${current[pointer] * cellWidth}rem` }}
              className={cn(
                'absolute top-0 left-0 grid w-10 place-items-center font-mono text-[0.68rem] font-bold',
                pointer === 'l' ? 'text-[#0ea5e9]' : 'text-[#8b5cf6]',
              )}
              key={pointer}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              {pointer}↓
            </motion.span>
          ))}
        </div>
        <div className="flex gap-3">
          {values.map((value, index) => {
            const inWindow = index >= current.l && index <= current.r
            const pointed = index === current.l || index === current.r
            return (
              <motion.span
                animate={{
                  scale: pointed ? 1.08 : 1,
                  opacity: inWindow ? 1 : 0.35,
                }}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-xl border-2 font-mono text-sm font-bold transition-colors duration-300',
                  pointed && found
                    ? 'border-[#22c55e] bg-[#22c55e]/15 text-foreground'
                    : index === current.l
                      ? 'border-[#0ea5e9] bg-[#0ea5e9]/10 text-foreground'
                      : index === current.r
                        ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 text-foreground'
                        : 'border-border bg-secondary/50 text-muted-foreground',
                )}
                key={value}
                transition={{ type: 'spring', stiffness: 380, damping: 20 }}
              >
                {value}
              </motion.span>
            )
          })}
        </div>
        <div className="mt-1 flex gap-3">
          {values.map((value, index) => (
            <span
              className="w-10 text-center font-mono text-[0.6rem] text-muted-foreground"
              key={value}
            >
              {index}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
        <span className="rounded-lg bg-[#0ea5e9]/12 px-2 py-1 text-[#0369a1] dark:text-[#7dd3fc]">
          l = {current.l}
        </span>
        <span className="rounded-lg bg-[#8b5cf6]/12 px-2 py-1 text-[#6d28d9] dark:text-[#c4b5fd]">
          r = {current.r}
        </span>
        <AnimatePresence mode="popLayout">
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'rounded-lg px-2 py-1 font-semibold',
              relation === '='
                ? 'bg-[#22c55e]/15 text-[#15803d] dark:text-[#86efac]'
                : 'bg-secondary text-foreground',
            )}
            exit={{ opacity: 0, y: -8 }}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            key={`${sum}-${frame}`}
          >
            sum {sum} {relation} {target}
          </motion.span>
        </AnimatePresence>
      </div>

      <ol className="relative mt-4 overflow-hidden rounded-xl border border-border bg-secondary/40 py-1.5 font-mono text-[0.72rem]">
        {codeLines.map((line, index) => (
          <li
            className={cn(
              'relative px-3 py-0.5 transition-colors duration-300',
              index === current.line
                ? 'text-foreground'
                : 'text-muted-foreground',
            )}
            key={line}
          >
            {index === current.line ? (
              <motion.span
                className={cn(
                  'absolute inset-0 border-l-2',
                  found
                    ? 'border-[#22c55e] bg-[#22c55e]/12'
                    : 'border-acc bg-acc/10',
                )}
                layoutId={reduceMotion ? undefined : 'trace-preview-line'}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            ) : null}
            <span className="relative">{line}</span>
          </li>
        ))}
      </ol>

      <div className="relative mt-3 flex gap-1">
        {frames.map((_, index) => (
          <span
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              index <= frame
                ? found
                  ? 'bg-[#22c55e]'
                  : 'bg-acc'
                : 'bg-border',
            )}
            key={index}
          />
        ))}
      </div>
    </div>
  )
}
