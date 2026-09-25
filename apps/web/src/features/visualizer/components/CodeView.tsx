import { useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

import type { VisualizerLanguage } from '../trace'
import { highlightLine, tokenClass } from './highlight'

type LineState = 'current' | 'error' | 'previous' | 'none'

// The learner's code with the current line highlighted. Line numbers toggle
// breakpoints for Play.
export function CodeView({
  code,
  language,
  currentLine,
  previousLine,
  condition,
  errorLine,
  breakpoints,
  onToggleBreakpoint,
  hits,
}: {
  code: string
  language: VisualizerLanguage
  currentLine: number | null
  previousLine: number | null
  condition: boolean | undefined
  errorLine: number | null
  breakpoints: ReadonlySet<number>
  onToggleBreakpoint: (line: number) => void
  hits: ReadonlyMap<number, number>
}) {
  const lines = useMemo(() => code.replace(/\s+$/, '').split('\n'), [code])
  const highlighted = useMemo(
    () => lines.map((line) => highlightLine(line, language)),
    [lines, language],
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const focusLine = errorLine ?? currentLine

  useEffect(() => {
    const container = containerRef.current
    if (container === null || focusLine === null) return
    const row = container.querySelector<HTMLElement>(
      `[data-line="${focusLine}"]`,
    )
    if (row === null) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    const padding = 48
    if (top < container.scrollTop + padding) {
      container.scrollTop = Math.max(0, top - padding)
    } else if (
      bottom >
      container.scrollTop + container.clientHeight - padding
    ) {
      container.scrollTop = bottom - container.clientHeight + padding
    }
  }, [focusLine])

  return (
    <div
      className="relative max-h-[min(34rem,62dvh)] min-w-0 overflow-auto rounded-lg border border-border bg-background font-mono text-[0.8rem] leading-6"
      ref={containerRef}
    >
      <ol aria-label="Code" className="min-w-max py-2">
        {highlighted.map((tokens, index) => {
          const line = index + 1
          const state: LineState =
            errorLine === line
              ? 'error'
              : currentLine === line
                ? 'current'
                : previousLine === line
                  ? 'previous'
                  : 'none'
          const hitCount = hits.get(line) ?? 0
          const breakpoint = breakpoints.has(line)
          return (
            <li
              aria-current={
                state === 'current' || state === 'error' ? 'step' : undefined
              }
              className={cn(
                'relative flex items-stretch border-l-[3px] pr-4',
                state === 'current' && 'border-primary bg-primary/12',
                state === 'error' && 'border-destructive bg-danger-soft',
                state === 'previous' && 'border-primary/30 bg-primary/5',
                state === 'none' && 'border-transparent',
              )}
              data-line={line}
              key={line}
            >
              <button
                aria-label={`${breakpoint ? 'Remove' : 'Add'} breakpoint on line ${line}`}
                aria-pressed={breakpoint}
                className="group relative flex w-14 shrink-0 items-center justify-end gap-1 pr-3 text-right text-xs text-muted-foreground select-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                onClick={() => onToggleBreakpoint(line)}
                title="Toggle breakpoint"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full transition-opacity',
                    breakpoint
                      ? 'bg-destructive opacity-100'
                      : 'bg-destructive/60 opacity-0 group-hover:opacity-60',
                  )}
                />
                <span className="tabular-nums">{line}</span>
              </button>
              <span className="min-w-0 flex-1 pl-2 whitespace-pre text-foreground">
                {tokens.length === 0
                  ? ' '
                  : tokens.map((token, tokenIndex) => (
                      <span className={tokenClass[token.kind]} key={tokenIndex}>
                        {token.text}
                      </span>
                    ))}
              </span>
              {state === 'current' && condition !== undefined ? (
                <span
                  className={cn(
                    'my-0.5 ml-3 inline-flex shrink-0 items-center rounded px-1.5 font-sans text-[0.7rem] font-semibold',
                    condition
                      ? 'bg-go-soft text-go-foreground'
                      : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {condition ? 'true' : 'false'}
                </span>
              ) : null}
              {hitCount > 0 && state !== 'current' ? (
                <span
                  aria-label={`ran ${hitCount} times so far`}
                  className="ml-3 shrink-0 self-center font-sans text-[0.65rem] text-muted-foreground/70 tabular-nums"
                >
                  ×{hitCount}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
