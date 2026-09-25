import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import type { CallTreeView } from '../scene/calls'
import type {
  Narration,
  NarrationTone,
  ScalarChip,
  Scene,
  StructureView,
} from '../scene/types'
import { ArrayStage } from './ArrayStage'
import { HeapStage } from './HeapStage'
import {
  CallTreeStage,
  GraphStage,
  ListStage,
  RecordStage,
  TreeStage,
} from './DiagramStages'
import { AnimatedText, StructureCard, ToggleChip } from './primitives'
import { useStickyHeight } from './sticky'
import {
  CubeStage,
  GridStage,
  MapStage,
  QueueStage,
  SetStage,
  StackStage,
} from './TableStages'

const toneStyle: Record<
  NarrationTone,
  { chip: string; label: string; icon: string }
> = {
  info: { chip: 'bg-secondary text-foreground', label: 'Step', icon: '•' },
  true: {
    chip: 'bg-go text-white dark:text-go-soft',
    label: 'True',
    icon: '✓',
  },
  false: { chip: 'bg-destructive text-white', label: 'False', icon: '✗' },
  loop: {
    chip: 'bg-primary text-primary-foreground',
    label: 'Loop',
    icon: '↻',
  },
  call: {
    chip: 'bg-primary text-primary-foreground',
    label: 'Call',
    icon: '↘',
  },
  return: {
    chip: 'bg-go text-white dark:text-go-soft',
    label: 'Return',
    icon: '↗',
  },
  output: { chip: 'bg-ink text-ink-foreground', label: 'Output', icon: '›' },
  input: { chip: 'bg-sky-deep text-white', label: 'Input', icon: '‹' },
  warning: {
    chip: 'bg-amber-500 text-white dark:text-amber-950',
    label: 'Careful',
    icon: '!',
  },
  error: { chip: 'bg-destructive text-white', label: 'Error', icon: '✕' },
  done: {
    chip: 'bg-go text-white dark:text-go-soft',
    label: 'Done',
    icon: '✓',
  },
}

export function NarrationBar({
  narration,
  stepKey,
  line,
}: {
  narration: Narration
  stepKey: number
  line: number
}) {
  const tone = toneStyle[narration.tone]
  return (
    <div
      aria-live="polite"
      className={cn(
        'relative h-[7.25rem] overflow-hidden rounded-2xl border px-4 py-3 transition-colors sm:h-[6.5rem]',
        narration.tone === 'error'
          ? 'border-destructive/40 bg-danger-soft'
          : narration.tone === 'warning'
            ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-400/10'
            : 'border-border bg-card',
      )}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="flex min-w-0 flex-col gap-1.5"
        initial={{ opacity: 0.2, y: 4 }}
        key={stepKey}
        transition={{ duration: 0.18 }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide',
              tone.chip,
            )}
          >
            <span aria-hidden="true">{tone.icon}</span>
            {tone.label}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            line {line}
          </span>
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-foreground">
            {narration.headline}
          </p>
        </div>
        {narration.code !== undefined ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[13px]">
            <code className="max-w-full truncate rounded-md bg-secondary px-2 py-0.5 text-foreground">
              {narration.code}
            </code>
            {narration.evaluated !== undefined ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <code
                  className={cn(
                    'max-w-full truncate rounded-md px-2 py-0.5 font-semibold',
                    narration.tone === 'true'
                      ? 'bg-go-soft text-go-foreground'
                      : narration.tone === 'false'
                        ? 'bg-danger-soft text-danger-foreground'
                        : 'bg-primary/10 text-primary',
                  )}
                >
                  {narration.evaluated}
                </code>
              </>
            ) : null}
          </div>
        ) : null}
        {narration.detail !== undefined && narration.detail.length > 0 ? (
          <ul className="flex min-w-0 gap-x-4 overflow-hidden text-xs text-muted-foreground">
            {narration.detail.slice(0, 3).map((line, index) => (
              <li className="truncate" key={index}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </motion.div>
    </div>
  )
}

export function ScalarStrip({
  scalars,
  watched,
  onWatch,
}: {
  scalars: ScalarChip[]
  watched: string | null
  onWatch: (id: string | null) => void
}) {
  const [attach, stickyStyle] = useStickyHeight<HTMLDivElement>()
  return (
    <div
      aria-label="Variables"
      className="flex flex-wrap content-start gap-1.5"
      ref={attach}
      role="list"
      style={stickyStyle}
    >
      {scalars.length === 0 ? (
        <span className="py-1.5 text-xs text-muted-foreground">
          No variables yet.
        </span>
      ) : null}
      <AnimatePresence initial={false}>
        {scalars.map((chip) => (
          <motion.button
            animate={{ opacity: 1, scale: 1 }}
            aria-label={`${chip.name} = ${chip.text}${chip.changed && chip.before !== undefined ? `, was ${chip.before}` : ''}. ${watched === chip.id ? 'Watched; click to stop' : 'Click to pause when it changes'}`}
            aria-pressed={watched === chip.id}
            className={cn(
              'group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left font-mono text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              chip.changed
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-400/15'
                : chip.pointer
                  ? 'border-primary/40 bg-primary/[0.06]'
                  : 'border-border bg-card hover:bg-secondary/60',
              watched === chip.id && 'ring-2 ring-primary/50',
            )}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            initial={{ opacity: 0, scale: 0.9 }}
            key={chip.id}
            onClick={() => onWatch(watched === chip.id ? null : chip.id)}
            role="listitem"
            type="button"
          >
            <span className="shrink-0 font-semibold text-muted-foreground">
              {chip.name}
            </span>
            <span className="text-muted-foreground/70">=</span>
            {chip.changed && chip.before !== undefined ? (
              <span className="hidden shrink-0 text-xs text-muted-foreground line-through decoration-amber-500/70 sm:inline">
                {chip.before}
              </span>
            ) : null}
            <AnimatedText
              className={cn(
                'max-w-[16rem] font-semibold',
                chip.changed
                  ? 'text-amber-900 dark:text-amber-100'
                  : 'text-foreground',
              )}
              text={chip.text}
            />
            {chip.owner !== 'global' ? null : (
              <span className="rounded bg-secondary px-1 text-[9px] uppercase text-muted-foreground">
                global
              </span>
            )}
            {watched === chip.id ? (
              <span aria-hidden="true" className="text-[10px] text-primary">
                ◉
              </span>
            ) : null}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}

const kindLabel: Record<StructureView['kind'], string> = {
  array: 'array',
  grid: '2D grid',
  cube: '3D array',
  stack: 'stack',
  queue: 'queue',
  heap: 'priority queue',
  map: 'map',
  set: 'set',
  graph: 'graph',
  tree: 'tree',
  list: 'linked list',
  record: 'object',
}

// Width depends on the kind only, never on the current size, so a card
// keeps its place while its contents grow and shrink.
function isWide(view: StructureView) {
  switch (view.kind) {
    case 'stack':
    case 'map':
    case 'set':
    case 'record':
      return false
    default:
      return true
  }
}

function StructureBody({
  view,
  styles,
  onStyle,
  stepKey,
}: {
  view: StructureView
  stepKey: number
  styles: Record<string, string>
  onStyle: (id: string, style: string) => void
}) {
  const chosen = styles[view.id]
  switch (view.kind) {
    case 'array':
      return (
        <ArrayStage
          style={(chosen as 'cells' | 'bars' | undefined) ?? view.style}
          view={view}
        />
      )
    case 'grid':
      return <GridStage view={view} />
    case 'cube': {
      const small =
        view.layers.length <= 4 && (view.layers[0]?.[0]?.length ?? 0) <= 6
      return (
        <CubeStage
          isometric={(chosen ?? (small ? '3d' : 'flat')) === '3d'}
          view={view}
        />
      )
    }
    case 'stack':
      return <StackStage view={view} />
    case 'queue':
      return <QueueStage view={view} />
    case 'heap':
      return <HeapStage stepKey={stepKey} view={view} />
    case 'map':
      return <MapStage view={view} />
    case 'set':
      return <SetStage view={view} />
    case 'graph':
      return <GraphStage view={view} />
    case 'tree':
      return <TreeStage view={view} />
    case 'list':
      return <ListStage view={view} />
    case 'record':
      return <RecordStage view={view} />
  }
  void onStyle
}

function StructureActions({
  view,
  styles,
  onStyle,
}: {
  view: StructureView
  styles: Record<string, string>
  onStyle: (id: string, style: string) => void
}) {
  if (view.kind === 'array' && view.numeric) {
    const style = styles[view.id] ?? view.style
    return (
      <>
        <ToggleChip
          label="Show as cells"
          onClick={() => onStyle(view.id, 'cells')}
          pressed={style === 'cells'}
        >
          Cells
        </ToggleChip>
        <ToggleChip
          label="Show as bars"
          onClick={() => onStyle(view.id, 'bars')}
          pressed={style === 'bars'}
        >
          Bars
        </ToggleChip>
      </>
    )
  }
  if (view.kind === 'cube') {
    const small =
      view.layers.length <= 4 && (view.layers[0]?.[0]?.length ?? 0) <= 6
    const style = styles[view.id] ?? (small ? '3d' : 'flat')
    return (
      <>
        <ToggleChip
          label="Show in 3D"
          onClick={() => onStyle(view.id, '3d')}
          pressed={style === '3d'}
        >
          3D
        </ToggleChip>
        <ToggleChip
          label="Show layers side by side"
          onClick={() => onStyle(view.id, 'flat')}
          pressed={style === 'flat'}
        >
          Layers
        </ToggleChip>
      </>
    )
  }
  return null
}

export function Stage({
  scene,
  callTree,
  stepKey,
  line,
  watched,
  onWatch,
  onSelectCall,
}: {
  scene: Scene
  callTree: CallTreeView | null
  stepKey: number
  line: number
  watched: string | null
  onWatch: (id: string | null) => void
  onSelectCall: (frame: number) => void
}) {
  const [styles, setStyles] = useState<Record<string, string>>({})
  const onStyle = (id: string, style: string) =>
    setStyles((current) => ({ ...current, [id]: style }))
  const showCalls = callTree !== null && callTree.nodes.length >= 2
  const [attach, stickyStyle] = useStickyHeight<HTMLDivElement>()
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <NarrationBar line={line} narration={scene.narration} stepKey={stepKey} />
      <ScalarStrip
        onWatch={onWatch}
        scalars={scene.scalars}
        watched={watched}
      />
      {scene.structures.length === 0 && !showCalls ? (
        <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-foreground">
              No data structures yet
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Arrays, strings you index, grids, stacks, queues, maps, sets,
              graphs, trees, linked lists and recursive calls appear here as the
              program creates them.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="grid min-w-0 content-start gap-4 xl:grid-cols-2"
          ref={attach}
          style={stickyStyle}
        >
          {scene.structures.map((view) => (
            <StructureCard
              actions={
                <StructureActions
                  onStyle={onStyle}
                  styles={styles}
                  view={view}
                />
              }
              active={view.active}
              changed={view.changed}
              key={view.id}
              kind={kindLabel[view.kind]}
              owner={
                view.owner === 'global' || view.owner === '<module>'
                  ? undefined
                  : view.owner
              }
              title={view.name}
              type={view.type}
              wide={isWide(view)}
            >
              <StructureBody
                onStyle={onStyle}
                stepKey={stepKey}
                styles={styles}
                view={view}
              />
            </StructureCard>
          ))}
          {showCalls ? (
            <StructureCard
              active={false}
              changed={false}
              kind="recursion tree"
              title="Calls"
              wide
            >
              <CallTreeStage onSelect={onSelectCall} view={callTree} />
            </StructureCard>
          ) : null}
        </div>
      )}
    </div>
  )
}

export { AnimatedText }
