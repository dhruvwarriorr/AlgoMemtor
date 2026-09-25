import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  EndIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  StepBackIcon,
  StepForwardIcon,
} from '../components/player-icons'
import { speeds, type JumpTarget, type Speed } from '../components/playback'
import type { Marker } from './markers'

const markerClass: Record<Marker['tone'], string> = {
  call: 'bg-primary/60',
  output: 'bg-go',
  warning: 'bg-amber-500',
  danger: 'bg-destructive',
  breakpoint: 'bg-foreground',
  finding: 'bg-fuchsia-500',
}

export function Transport({
  current,
  total,
  playing,
  speed,
  markers,
  jumps,
  importantOnly,
  onSeek,
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
  markers: Marker[]
  jumps: JumpTarget[]
  importantOnly: boolean
  onSeek: (index: number) => void
  onPrevious: () => void
  onNext: () => void
  onTogglePlay: () => void
  onSpeed: (speed: Speed) => void
  onImportantOnly: (value: boolean) => void
}) {
  const last = Math.max(0, total - 1)
  const progress = last === 0 ? 0 : current / last
  const [jumpOpen, setJumpOpen] = useState(false)
  const available = useMemo(
    () => jumps.filter((jump) => jump.step !== null),
    [jumps],
  )
  return (
    <div className="sticky bottom-3 z-30 mt-2 flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card/95 p-2.5 shadow-lift backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:p-3">
      <div className="relative h-7 min-w-0 px-1">
        <div className="absolute inset-x-1 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-150 motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1 top-0 h-full"
        >
          {markers.map((marker, index) => (
            <span
              className={cn(
                'absolute top-0.5 h-1.5 w-[3px] -translate-x-1/2 rounded-full',
                markerClass[marker.tone],
                marker.tone === 'danger' || marker.tone === 'finding'
                  ? 'h-2.5 w-1'
                  : '',
              )}
              key={`${marker.tone}-${marker.step}-${index}`}
              style={{
                left: `${last === 0 ? 0 : (marker.step / last) * 100}%`,
              }}
            />
          ))}
        </div>
        <input
          aria-label="Step"
          aria-valuetext={`Step ${current + 1} of ${total}`}
          className="visualizer-scrubber absolute inset-x-0 top-0 h-full w-full cursor-pointer appearance-none bg-transparent"
          max={last}
          min={0}
          onChange={(event) => onSeek(Number(event.target.value))}
          step={1}
          type="range"
          value={current}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div
          aria-label="Playback"
          className="flex items-center gap-0.5"
          role="group"
        >
          <Button
            aria-label="Back to the first step"
            disabled={current === 0}
            onClick={() => onSeek(0)}
            size="icon-sm"
            title="First step (Home)"
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
            variant="ghost"
          >
            <StepBackIcon />
          </Button>
          <Button
            aria-label={playing ? 'Pause' : 'Play'}
            className="size-10 rounded-full"
            disabled={current >= last && !playing}
            onClick={onTogglePlay}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            type="button"
          >
            {playing ? (
              <PauseIcon className="size-5" />
            ) : (
              <PlayIcon className="size-5" />
            )}
          </Button>
          <Button
            aria-label="Next step"
            disabled={current >= last}
            onClick={onNext}
            size="icon-sm"
            title="Next step (→)"
            type="button"
            variant="ghost"
          >
            <StepForwardIcon />
          </Button>
          <Button
            aria-label="Last step"
            disabled={current >= last}
            onClick={() => onSeek(last)}
            size="icon-sm"
            title="Last step (End)"
            type="button"
            variant="ghost"
          >
            <EndIcon />
          </Button>
        </div>
        <span className="min-w-[5.5rem] font-mono text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">
            {(current + 1).toLocaleString()}
          </span>{' '}
          / {total.toLocaleString()}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Speed</span>
          <select
            aria-label="Playback speed"
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => onSpeed(Number(event.target.value) as Speed)}
            value={speed}
          >
            {speeds.map((choice) => (
              <option key={choice} value={choice}>
                {choice < 1 ? `${1 / choice}s / step` : `${choice} steps/s`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            checked={importantOnly}
            className="size-3.5 accent-[var(--primary)]"
            onChange={(event) => onImportantOnly(event.target.checked)}
            type="checkbox"
          />
          <span title="Skip steps where nothing changes">Only changes</span>
        </label>
        <div className="relative">
          <Button
            aria-expanded={jumpOpen}
            aria-haspopup="menu"
            disabled={available.length === 0}
            onClick={() => setJumpOpen((value) => !value)}
            size="sm"
            type="button"
            variant="outline"
          >
            Jump to…
          </Button>
          {jumpOpen ? (
            <div
              className="absolute bottom-full right-0 z-40 mb-2 grid w-56 gap-0.5 rounded-xl border border-border bg-popover p-1.5 shadow-lift"
              role="menu"
            >
              {available.map((jump) => (
                <button
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none',
                    jump.tone === 'danger' && 'text-destructive',
                    jump.tone === 'warning' &&
                      'text-amber-700 dark:text-amber-300',
                  )}
                  key={jump.id}
                  onClick={() => {
                    setJumpOpen(false)
                    if (jump.step !== null) onSeek(jump.step)
                  }}
                  role="menuitem"
                  type="button"
                >
                  {jump.label}
                  <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                    #{(jump.step ?? 0) + 1}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
