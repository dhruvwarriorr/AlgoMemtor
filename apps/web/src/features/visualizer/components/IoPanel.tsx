import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { OutputComparison } from '../analysis'
import type { ExecutionTrace } from '../trace'

const PREVIEW = 4_000

function visible(text: string) {
  return text.length > PREVIEW
    ? `${text.slice(0, PREVIEW)}\n… ${text.length - PREVIEW} more characters`
    : text
}

export function IoPanel({
  trace,
  current,
  input,
  expected,
  comparison,
  onSelect,
}: {
  trace: ExecutionTrace
  current: number
  input: string
  expected: string
  comparison: OutputComparison | null
  onSelect: (index: number) => void
}) {
  const step = trace.steps[current]
  const previous = current > 0 ? trace.steps[current - 1] : undefined
  const outEnd = step?.out ?? trace.stdout.length
  const outStart = previous?.out ?? 0
  const consumed = step?.in ?? 0
  const stderr = trace.stderr.slice(0, step?.err ?? trace.stderr.length)
  const output = trace.stdout.slice(0, outEnd)
  return (
    <section
      aria-labelledby="io-heading"
      className="min-w-0 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground" id="io-heading">
        Input and output
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Input · {consumed.toLocaleString()} of{' '}
            {input.length.toLocaleString()} characters read
          </p>
          <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-background p-2.5 font-mono text-[0.78rem] leading-5 whitespace-pre-wrap break-words">
            {input === '' ? (
              <span className="text-muted-foreground">No input.</span>
            ) : (
              <>
                <span className="text-muted-foreground/70 line-through decoration-muted-foreground/30">
                  {visible(input.slice(0, consumed))}
                </span>
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-0.5 translate-y-0.5 bg-primary"
                />
                <span className="text-foreground">
                  {visible(input.slice(consumed))}
                </span>
              </>
            )}
          </pre>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Output so far
          </p>
          <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-background p-2.5 font-mono text-[0.78rem] leading-5 whitespace-pre-wrap break-words">
            {output === '' ? (
              <span className="text-muted-foreground">
                Nothing printed yet.
              </span>
            ) : (
              <>
                {visible(output.slice(0, outStart))}
                <mark className="rounded-sm bg-amber-200 text-foreground dark:bg-amber-400/30">
                  {visible(output.slice(outStart))}
                </mark>
              </>
            )}
          </pre>
          {stderr !== '' ? (
            <>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Error stream (stderr)
              </p>
              <pre className="mt-1 max-h-24 overflow-auto rounded-lg border border-border bg-background p-2.5 font-mono text-[0.75rem] whitespace-pre-wrap text-muted-foreground">
                {visible(stderr)}
              </pre>
            </>
          ) : null}
        </div>
      </div>
      {expected.trim() !== '' && comparison !== null ? (
        <div
          className={cn(
            'mt-3 rounded-lg border px-3 py-2.5 text-sm',
            comparison.status === 'match'
              ? 'border-go/40 bg-go-soft text-go-foreground'
              : 'border-destructive/40 bg-danger-soft text-danger-foreground',
          )}
          role="status"
        >
          {comparison.status === 'match' ? (
            <p className="font-medium">
              The final output matches the expected output.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1">
                <span className="font-medium">Output differs</span> at token{' '}
                {comparison.token} (output line {comparison.outputLine}):
                expected{' '}
                <code className="rounded bg-background/70 px-1 font-mono">
                  {comparison.expected ?? 'nothing'}
                </code>
                , got{' '}
                <code className="rounded bg-background/70 px-1 font-mono">
                  {comparison.actual ?? 'nothing'}
                </code>
                .
                {comparison.actual === null
                  ? ' The program stopped printing too early.'
                  : ''}
              </p>
              {comparison.step !== null ? (
                <Button
                  onClick={() => onSelect(comparison.step as number)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Show the step that printed it
                </Button>
              ) : null}
            </div>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-medium opacity-80">Expected</p>
              <pre className="mt-0.5 max-h-24 overflow-auto rounded bg-background/70 p-2 font-mono text-[0.75rem] whitespace-pre-wrap text-foreground">
                {visible(expected)}
              </pre>
            </div>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-medium opacity-80">
                Actual (whole run)
              </p>
              <pre className="mt-0.5 max-h-24 overflow-auto rounded bg-background/70 p-2 font-mono text-[0.75rem] whitespace-pre-wrap text-foreground">
                {trace.stdout === '' ? '(nothing)' : visible(trace.stdout)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
