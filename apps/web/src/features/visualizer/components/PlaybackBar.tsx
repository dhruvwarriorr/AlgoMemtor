import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  EndIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  StepBackIcon,
  StepForwardIcon,
} from './player-icons'

import { speeds, type JumpTarget, type Speed } from './playback'

export function PlaybackBar({
  current,
  total,
  playing,
  speed,
  importantOnly,
  jumps,
  onSelect,
  onPrevious,
  onNext,
  onTogglePlay,
  onSpeed,
  onImportantOnly,
}: {
  current: number
  total: number
  playing: boolean
  speed: Speed
  importantOnly: boolean
  jumps: JumpTarget[]
  onSelect: (index: number) => void
  onPrevious: () => void
  onNext: () => void
  onTogglePlay: () => void
  onSpeed: (speed: Speed) => void
  onImportantOnly: (value: boolean) => void
}) {
  const last = Math.max(0, total - 1)
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          aria-label="Playback"
          className="flex items-center gap-1"
          role="group"
        >
          <Button
            aria-label="Restart"
            disabled={current === 0}
            onClick={() => onSelect(0)}
            size="icon-sm"
            title="Restart (Home)"
            type="button"
            variant="ghost"
          >
            <RestartIcon />
          </Button>
          <Button
            aria-label="Previous step"
            disabled={current === 0}
            onClick={onPrevious}
            size="icon-sm"
            title="Previous step (←)"
            type="button"
            variant="outline"
          >
            <StepBackIcon />
          </Button>
          <Button
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={total === 0}
            onClick={onTogglePlay}
            size="icon"
            title="Play or pause (Space)"
            type="button"
            variant="accent"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            aria-label="Next step"
            disabled={current >= last}
            onClick={onNext}
            size="icon-sm"
            title="Next step (→)"
            type="button"
            variant="outline"
          >
            <StepForwardIcon />
          </Button>
          <Button
            aria-label="Last step"
            disabled={current >= last}
            onClick={() => onSelect(last)}
            size="icon-sm"
            title="Last step (End)"
            type="button"
            variant="ghost"
          >
            <EndIcon />
          </Button>
        </div>
        <p
          className="min-w-24 text-sm text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          Step{' '}
          <span className="font-semibold text-foreground">
            {total === 0 ? 0 : current + 1}
          </span>{' '}
          of {total.toLocaleString()}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Speed
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              onChange={(event) => {
                const value = speeds.find(
                  (item) => item === Number(event.target.value),
                )
                if (value !== undefined) onSpeed(value)
              }}
              value={speed}
            >
              {speeds.map((value) => (
                <option key={value} value={value}>
                  {value} step{value === 1 ? '' : 's'}/s
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input
              checked={importantOnly}
              className="size-3.5 accent-[var(--primary)]"
              onChange={(event) => onImportantOnly(event.target.checked)}
              type="checkbox"
            />
            Important steps only
          </label>
        </div>
      </div>
      <input
        aria-label="Step"
        aria-valuetext={`Step ${current + 1} of ${total}`}
        className="h-2 w-full cursor-pointer accent-[var(--primary)]"
        disabled={total <= 1}
        max={last}
        min={0}
        onChange={(event) => onSelect(Number(event.target.value))}
        type="range"
        value={current}
      />
      {jumps.length > 0 ? (
        <div
          aria-label="Jump to"
          className="flex flex-wrap items-center gap-1.5"
          role="group"
        >
          <span className="mr-1 text-xs text-muted-foreground">Jump to</span>
          {jumps.map((jump) => (
            <button
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
                jump.tone === 'danger'
                  ? 'border-destructive/40 bg-danger-soft text-danger-foreground hover:bg-danger-soft/70'
                  : jump.tone === 'warning'
                    ? 'border-amber-500/40 bg-amber-100 text-amber-950 hover:bg-amber-100/70 dark:bg-amber-400/15 dark:text-amber-200'
                    : 'border-border text-foreground hover:bg-secondary',
              )}
              disabled={jump.step === null}
              key={jump.id}
              onClick={() => {
                if (jump.step !== null) onSelect(jump.step)
              }}
              type="button"
            >
              {jump.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
