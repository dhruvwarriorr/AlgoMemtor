import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import {
  ArrowUp,
  Brain,
  Lightbulb,
  LoaderCircle,
  Lock,
  MessageCircle,
  Plus,
  Target,
} from '@/components/icons/algo-icons'

import { ArcGauge } from '@/components/kit/charts'
import { SegmentedControl } from '@/components/kit/SegmentedControl'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { useNotification } from '@/providers/useNotification'
import { useTypedExample } from '@/lib/use-typed-example'
import { cn } from '@/lib/utils'

import {
  useCorrectLearnerMemory,
  useCreateLearnerMemory,
  useLearnerMemories,
  useLearnerMemoryAction,
} from '../hooks/useLearnerMemories'
import type { LearnerMemory, LearnerMemoryCategory } from '../contracts'
import { Select } from '@/components/ui/select'

const categoryLabels: Record<string, string> = {
  preference: 'Preference',
  difficulty_calibration: 'Difficulty calibration',
  topic_weakness: 'Topic weakness',
  scheduling_preference: 'Scheduling preference',
  recommendation_feedback_pattern: 'Recommendation feedback pattern',
  learning_goal: 'Learning goal',
  topic_strength: 'Topic strength',
  coding_style: 'Coding style',
  problem_solving_approach: 'Problem-solving approach',
  learning_pace: 'Learning pace',
  time_availability: 'Time availability',
  mistake_pattern: 'Mistake pattern',
  contest_performance: 'Contest performance',
  explanation_preference: 'Explanation preference',
  communication_preference: 'Communication preference',
  user_instruction: 'User instruction',
  conversation_summary: 'Conversation summary',
  learning_milestone: 'Learning milestone',
  bloom_level: 'Bloom level',
  spaced_repetition_state: 'Spaced repetition state',
}

const categories = Object.keys(categoryLabels) as LearnerMemoryCategory[]

// Memories fall into four groups, each with its own colour, so the page
// reads by kind at a glance.
const memoryGroups = [
  {
    id: 'goals',
    label: 'Goals & pace',
    color: '#8b5cf6',
    categories: [
      'learning_goal',
      'learning_milestone',
      'time_availability',
      'scheduling_preference',
      'learning_pace',
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    color: '#0ea5e9',
    categories: [
      'topic_strength',
      'topic_weakness',
      'bloom_level',
      'contest_performance',
      'mistake_pattern',
      'spaced_repetition_state',
      'difficulty_calibration',
    ],
  },
  {
    id: 'style',
    label: 'Style',
    color: '#f59e0b',
    categories: [
      'preference',
      'coding_style',
      'problem_solving_approach',
      'explanation_preference',
      'communication_preference',
    ],
  },
  {
    id: 'guidance',
    label: 'Your guidance',
    color: '#22c55e',
    categories: [
      'user_instruction',
      'recommendation_feedback_pattern',
      'conversation_summary',
    ],
  },
] as const

function groupOf(category: string) {
  return (
    memoryGroups.find((group) =>
      (group.categories as readonly string[]).includes(category),
    ) ?? memoryGroups[3]
  )
}

// The memories as a small constellation: the learner in the centre, one
// node per group around it, and a dot per memory orbiting its group.
function MemoryConstellation({
  memories,
}: {
  memories: readonly LearnerMemory[]
}) {
  const reduceMotion = useReducedMotion()
  const center = { x: 160, y: 110 }
  const active = memories.filter((memory) => memory.status === 'active')
  const ticker = active.length > 0 ? active : memories
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reduceMotion || ticker.length < 2) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 3200)
    return () => window.clearInterval(timer)
  }, [reduceMotion, ticker.length])
  const shown = ticker[tick % Math.max(1, ticker.length)]
  return (
    <figure className="relative isolate flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Memory core</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-heading text-base font-bold text-foreground tabular-nums">
            {active.length}
          </span>{' '}
          active of {memories.length}
        </p>
      </div>
      <svg aria-hidden="true" className="h-56 w-full" viewBox="0 0 320 220">
        <defs>
          <radialGradient id="memory-core">
            <stop offset="0%" stopColor="var(--acc)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--acc)" stopOpacity={0} />
          </radialGradient>
        </defs>
        {[34, 58].map((radius, index) => (
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            key={radius}
            style={{
              transformOrigin: `${center.x}px ${center.y}px`,
              animationDuration: `${index === 0 ? 14 : 26}s`,
              animationDirection: index === 0 ? 'normal' : 'reverse',
            }}
          >
            <circle
              cx={center.x}
              cy={center.y}
              fill="none"
              r={radius}
              stroke="var(--acc)"
              strokeDasharray={index === 0 ? '2 6' : '10 8'}
              strokeOpacity={0.35}
              strokeWidth={1.2}
            />
            <circle
              cx={center.x + radius}
              cy={center.y}
              fill="var(--acc)"
              r={index === 0 ? 2.5 : 3}
            />
          </g>
        ))}
        <motion.circle
          animate={
            reduceMotion ? {} : { r: [40, 50, 40], opacity: [0.8, 1, 0.8] }
          }
          cx={center.x}
          cy={center.y}
          fill="url(#memory-core)"
          r={46}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {memoryGroups.map((group, groupIndex) => {
          const angle =
            (groupIndex / memoryGroups.length) * Math.PI * 2 - Math.PI / 4
          const node = {
            x: center.x + Math.cos(angle) * 92,
            y: center.y + Math.sin(angle) * 66,
          }
          const members = memories.filter(
            (memory) => groupOf(memory.category).id === group.id,
          )
          return (
            <g key={group.id}>
              <motion.line
                animate={{ pathLength: 1 }}
                initial={reduceMotion ? false : { pathLength: 0 }}
                stroke={group.color}
                strokeDasharray="3 4"
                strokeOpacity={0.6}
                strokeWidth={1.2}
                transition={{ duration: 1, delay: 0.2 + groupIndex * 0.1 }}
                x1={center.x}
                x2={node.x}
                y1={center.y}
                y2={node.y}
              />
              <g
                className={reduceMotion ? undefined : 'memory-orbit'}
                style={{
                  transformOrigin: `${node.x}px ${node.y}px`,
                  animationDuration: `${18 + groupIndex * 4}s`,
                }}
              >
                {members.slice(0, 10).map((memory, index) => {
                  const orbit =
                    (index / Math.max(1, Math.min(members.length, 10))) *
                    Math.PI *
                    2
                  return (
                    <circle
                      cx={node.x + Math.cos(orbit) * 22}
                      cy={node.y + Math.sin(orbit) * 22}
                      fill={group.color}
                      key={memory.id}
                      opacity={memory.status === 'archived' ? 0.3 : 0.9}
                      r={2.2 + memory.confidence * 2.4}
                    />
                  )
                })}
              </g>
              <motion.circle
                animate={{ scale: 1 }}
                cx={node.x}
                cy={node.y}
                fill="var(--card)"
                initial={reduceMotion ? false : { scale: 0 }}
                r={13}
                stroke={group.color}
                strokeWidth={2}
                style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 18,
                  delay: 0.3 + groupIndex * 0.1,
                }}
              />
              <text
                fill="var(--foreground)"
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
                x={node.x}
                y={node.y + 3}
              >
                {members.length}
              </text>
            </g>
          )
        })}
        <circle cx={center.x} cy={center.y} fill="var(--acc)" r={16} />
        <text
          fill="#fff"
          fontSize={8}
          fontWeight={700}
          textAnchor="middle"
          x={center.x}
          y={center.y + 3}
        >
          YOU
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {memoryGroups.map((group) => (
          <span className="inline-flex items-center gap-1.5" key={group.id}>
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: group.color }}
            />
            <span className="text-muted-foreground">{group.label}</span>
            <span className="font-mono font-semibold text-foreground">
              {
                memories.filter(
                  (memory) => groupOf(memory.category).id === group.id,
                ).length
              }
            </span>
          </span>
        ))}
      </figcaption>
      {shown ? (
        <div className="mt-auto pt-4">
          <div className="relative min-h-14 overflow-hidden rounded-2xl border border-border bg-background/60 px-3.5 py-2.5">
            <AnimatePresence initial={false} mode="wait">
              <motion.p
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="flex items-start gap-2 text-xs leading-5 text-foreground"
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: 10, filter: 'blur(4px)' }
                }
                key={shown.id}
                transition={{ duration: 0.4 }}
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: groupOf(shown.category).color }}
                />
                <span className="line-clamp-2">{shown.text}</span>
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <p className="mt-auto pt-4 text-center text-xs leading-5 text-muted-foreground">
          <span className="block rounded-2xl border border-dashed border-border px-3.5 py-2.5">
            Memories you add or earn will orbit here.
          </span>
        </p>
      )}
    </figure>
  )
}

function MemoryEditor({
  memory,
  isSaving,
  onCancel,
  onSave,
}: {
  memory: LearnerMemory
  isSaving: boolean
  onCancel: () => void
  onSave: (input: {
    text: string
    category: LearnerMemoryCategory
  }) => Promise<void>
}) {
  const [text, setText] = useState(memory.text)
  const [category, setCategory] = useState(memory.category)

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave({ text, category })
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium text-foreground">
        Memory text
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 py-2 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
          disabled={isSaving}
          maxLength={500}
          onChange={(event) => setText(event.currentTarget.value)}
          required
          value={text}
        />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-foreground">
        Category
        <Select
          className="font-normal"
          disabled={isSaving}
          onValueChange={(value) => {
            const next = categories.find((item) => item === value)
            if (next !== undefined) setCategory(next)
          }}
          options={categories.map((value) => ({
            value,
            label: categoryLabels[value],
          }))}
          value={category}
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={isSaving}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button disabled={isSaving || text.trim().length === 0} type="submit">
          {isSaving ? 'Saving…' : 'Save correction'}
        </Button>
      </div>
    </form>
  )
}

function memoryActionLabel(memory: LearnerMemory) {
  if (memory.status === 'proposed') return 'Approve'
  if (memory.status === 'active') return 'Archive'
  return 'Restore'
}

const memoryExamples = [
  'I prefer short hints before full explanations',
  'I practice 1 hour on weekdays',
  'Explain with C++ examples',
  'I struggle with DP state design',
  'I am preparing for ICPC',
]

const memoryUses = [
  { label: 'Recommendations', icon: Target, color: '#0ea5e9' },
  { label: 'Doubt hints', icon: Lightbulb, color: '#f59e0b' },
  { label: 'Coach and reports', icon: MessageCircle, color: '#22c55e' },
] as const

// Mirrors the recommendation steering bar: say it in plain words, it is saved
// as an active user instruction that shapes every recommendation, hint and
// report.
function LearnerMemoryComposer() {
  const { notify } = useNotification()
  const createMutation = useCreateLearnerMemory()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const [text, setText] = useState('')
  const reduceMotion = useReducedMotion()
  const typing = !reduceMotion && text === '' && !createMutation.isPending
  const typed = useTypedExample(memoryExamples, typing)

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const value = text.trim()
    if (value === '' || createMutation.isPending) return
    createMutation.mutate(
      { text: value },
      {
        onSuccess: () => {
          setText('')
          notify({
            title: 'Memory added',
            description:
              'AlgoMemtor will use this in recommendations, hints and reports.',
            tone: 'success',
          })
        },
        onError: (error) => {
          notify({
            title: 'Memory was not added',
            description:
              error instanceof Error ? error.message : 'Please try again.',
            tone: 'error',
          })
        },
      },
    )
  }

  return (
    <section
      aria-label="Add a memory"
      className="animate-rise relative isolate flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_20%,transparent),transparent)] blur-2xl"
      />
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative grid size-10 shrink-0 place-items-center">
          {reduceMotion ? null : (
            <motion.span
              animate={{ scale: [1, 1.35], opacity: [0.45, 0] }}
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-acc"
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <span className="relative grid size-10 place-items-center rounded-full bg-linear-to-br from-acc to-[color-mix(in_oklab,var(--acc)_55%,var(--acc-2))] text-white [--icon-node:#fff]">
            <Brain aria-hidden="true" className="size-4.5" />
          </span>
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Add a memory
          </h2>
          <p className="text-xs text-muted-foreground">
            How you learn, what you are preparing for, or what to avoid. Saved
            as a user instruction.
          </p>
        </div>
      </div>
      <form className="mt-4" onSubmit={submit}>
        <label className="sr-only" htmlFor={inputId}>
          What should AlgoMemtor remember?
        </label>
        <div
          className={cn(
            'relative flex items-center gap-2 rounded-2xl border border-input bg-background py-2 pr-2 pl-4 transition-[border-color,box-shadow] focus-within:border-acc focus-within:ring-4 focus-within:ring-[color-mix(in_oklab,var(--acc)_18%,transparent)]',
            createMutation.isPending && 'opacity-80',
          )}
        >
          {typing ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 truncate text-base text-muted-foreground sm:text-sm"
            >
              {typed}
              <span className="blink-caret ml-px inline-block h-4 w-px translate-y-0.5 bg-acc" />
            </span>
          ) : null}
          <input
            autoComplete="off"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
            disabled={createMutation.isPending}
            id={inputId}
            maxLength={500}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              typing
                ? ''
                : 'e.g. I learn best with concise hints before full explanations.'
            }
            ref={inputRef}
            value={text}
          />
          <button
            aria-label={
              createMutation.isPending ? 'Saving memory' : 'Add memory'
            }
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-acc text-white transition-[opacity,transform] hover:scale-105 hover:opacity-90 disabled:opacity-40 dark:text-[#0b0c0e]"
            disabled={text.trim() === '' || createMutation.isPending}
            type="submit"
          >
            {createMutation.isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <ArrowUp aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {createMutation.isPending ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            Saving to your learner memory…
          </p>
        ) : (
          <div className="mt-4">
            <p className="text-[0.68rem] font-medium text-muted-foreground">
              Try one
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {memoryExamples.map((example, index) => (
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-[border-color,color,transform] hover:-translate-y-0.5 hover:border-acc hover:text-foreground"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  key={example}
                  onClick={() => {
                    setText(example)
                    inputRef.current?.focus()
                  }}
                  transition={{ delay: 0.05 * index }}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-3" />
                  {example}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </form>
      <div className="mt-auto pt-5">
        <p className="text-[0.68rem] font-medium text-muted-foreground">
          Used in
        </p>
        <ol className="mt-2 grid grid-cols-3 gap-2">
          {memoryUses.map((use, index) => {
            const Icon = use.icon
            return (
              <motion.li
                animate={{ opacity: 1, y: 0 }}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background/60 px-2.5 py-2"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                key={use.label}
                transition={{ delay: 0.2 + index * 0.08 }}
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-lg"
                  style={{
                    color: use.color,
                    background: `color-mix(in oklab, ${use.color} 15%, transparent)`,
                  }}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
                <span className="truncate text-xs font-medium text-foreground">
                  {use.label}
                </span>
              </motion.li>
            )
          })}
        </ol>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" />
          Up to 500 characters. Avoid passwords, contact details or secrets.
        </p>
      </div>
    </section>
  )
}

export function LearnerMemoryPanel({
  showComposer = false,
}: {
  showComposer?: boolean
}) {
  const { notify } = useNotification()
  const memoriesQuery = useLearnerMemories()
  const actionMutation = useLearnerMemoryAction()
  const correctionMutation = useCorrectLearnerMemory()
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'proposed' | 'archived'
  >('all')
  const composer = showComposer ? <LearnerMemoryComposer /> : null

  function act(
    memory: LearnerMemory,
    action: 'approve' | 'archive' | 'restore' | 'delete',
  ) {
    actionMutation.mutate(
      { memoryId: memory.id, action },
      {
        onSuccess: () => {
          notify({
            title: action === 'delete' ? 'Memory deleted' : 'Memory updated',
            description: 'Your memory controls were saved.',
            tone: 'success',
          })
        },
        onError: (error) => {
          notify({
            title: 'Memory was not updated',
            description:
              error instanceof Error ? error.message : 'Please try again.',
            tone: 'error',
          })
        },
      },
    )
  }

  async function correct(
    memoryId: string,
    input: {
      text: string
      category: LearnerMemoryCategory
    },
  ) {
    try {
      await correctionMutation.mutateAsync({ memoryId, input })
      setEditingMemoryId(null)
      notify({
        title: 'Memory corrected',
        description: 'Future recommendations can use your correction.',
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'Memory was not corrected',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  if (memoriesQuery.isPending) {
    return (
      <div className="space-y-4">
        {composer}
        <PageSkeleton label="Loading learner memory" rows={3} />
      </div>
    )
  }

  if (memoriesQuery.isError) {
    return (
      <div className="space-y-4">
        {composer}
        <ErrorState
          message={
            memoriesQuery.error instanceof Error
              ? memoriesQuery.error.message
              : 'Learner memory could not be loaded.'
          }
          onRetry={() => void memoriesQuery.refetch()}
          title="Memory unavailable"
        />
      </div>
    )
  }

  const memories = memoriesQuery.data.data

  if (memories.length === 0) {
    const pendingJobs = memoriesQuery.data.meta.pendingJobs
    const emptyDescription = showComposer
      ? 'Add a user instruction above, or wait for eligible reflections, progress, and recommendation feedback to be processed.'
      : 'Memory will appear after eligible reflections, progress, or recommendation feedback are processed.'
    return (
      <div className="space-y-3">
        {composer === null ? null : (
          <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            {composer}
            <MemoryConstellation memories={memories} />
          </div>
        )}
        {pendingJobs > 0 ? (
          <p
            className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            role="status"
          >
            {pendingJobs} memory job{pendingJobs === 1 ? '' : 's'} are being
            processed.
          </p>
        ) : null}
        <EmptyState
          description={
            pendingJobs > 0
              ? 'Your eligible notes and progress are still being processed. Check back shortly.'
              : emptyDescription
          }
          title={
            pendingJobs > 0 ? 'Memory is processing' : 'No learner memory yet'
          }
        />
      </div>
    )
  }

  const counts = {
    all: memories.length,
    active: memories.filter((memory) => memory.status === 'active').length,
    proposed: memories.filter((memory) => memory.status === 'proposed').length,
    archived: memories.filter((memory) => memory.status === 'archived').length,
  }
  const visible =
    statusFilter === 'all'
      ? memories
      : memories.filter((memory) => memory.status === statusFilter)

  return (
    <div className="space-y-4">
      {composer === null ? null : (
        <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          {composer}
          <MemoryConstellation memories={memories} />
        </div>
      )}
      {memoriesQuery.data.meta.pendingJobs > 0 ? (
        <p
          className="rounded-2xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
          role="status"
        >
          {memoriesQuery.data.meta.pendingJobs} memory job
          {memoriesQuery.data.meta.pendingJobs === 1 ? '' : 's'} are being
          processed.
        </p>
      ) : null}
      <SegmentedControl
        label="Filter memories by status"
        onChange={setStatusFilter}
        options={(['all', 'active', 'proposed', 'archived'] as const).map(
          (value) => ({
            value,
            label: `${value === 'all' ? 'All' : value[0]?.toUpperCase() + value.slice(1)} · ${counts[value]}`,
          }),
        )}
        size="sm"
        value={statusFilter}
      />
      <ul className="min-w-0 columns-1 gap-3 md:columns-2 xl:columns-3">
        {visible.map((memory, index) => {
          const isActing =
            actionMutation.isPending &&
            actionMutation.variables?.memoryId === memory.id
          const isEditing = editingMemoryId === memory.id
          const group = groupOf(memory.category)

          return (
            <motion.li
              animate={{ opacity: 1, y: 0 }}
              className="mb-3 min-w-0 break-inside-avoid"
              initial={{ opacity: 0, y: 12 }}
              key={memory.id}
              transition={{ delay: Math.min(index, 9) * 0.04 }}
            >
              <article
                className={cn(
                  'group relative overflow-hidden rounded-2xl border border-border bg-card p-4 pl-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift',
                  memory.status === 'archived' && 'opacity-70',
                )}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{
                    background: `linear-gradient(${group.color}, color-mix(in oklab, ${group.color} 30%, transparent))`,
                  }}
                />
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p
                    className="text-[0.7rem] font-semibold tracking-wide uppercase"
                    style={{ color: group.color }}
                  >
                    {categoryLabels[memory.category]}
                  </p>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-medium capitalize',
                      memory.status === 'active'
                        ? 'bg-go-soft text-go-foreground'
                        : memory.status === 'proposed'
                          ? 'bg-acc-soft text-acc-ink'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {memory.status}
                  </span>
                </div>
                <p className="mt-2 text-[0.95rem] leading-6 break-words text-foreground">
                  {memory.text}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <ArcGauge
                    className="size-10 shrink-0"
                    color={group.color}
                    value={memory.confidence}
                  >
                    <span className="font-mono text-[0.6rem] font-bold">
                      {Math.round(memory.confidence * 100)}
                    </span>
                  </ArcGauge>
                  <p className="min-w-0 text-xs text-muted-foreground">
                    Confidence {Math.round(memory.confidence * 100)}% ·{' '}
                    {memory.evidenceCount} evidence item
                    {memory.evidenceCount === 1 ? '' : 's'}
                    {memory.learnerCorrected ? ' · corrected by you' : ''}
                  </p>
                </div>
                {isEditing ? (
                  <MemoryEditor
                    isSaving={correctionMutation.isPending}
                    memory={memory}
                    onCancel={() => setEditingMemoryId(null)}
                    onSave={(input) => correct(memory.id, input)}
                  />
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-border pt-3">
                    <Button
                      disabled={isActing || correctionMutation.isPending}
                      onClick={() => setEditingMemoryId(memory.id)}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      Correct
                    </Button>
                    <Button
                      disabled={isActing || correctionMutation.isPending}
                      onClick={() =>
                        act(
                          memory,
                          memory.status === 'proposed'
                            ? 'approve'
                            : memory.status === 'active'
                              ? 'archive'
                              : 'restore',
                        )
                      }
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      {isActing ? 'Saving…' : memoryActionLabel(memory)}
                    </Button>
                    <Button
                      className="ml-auto"
                      disabled={isActing || correctionMutation.isPending}
                      onClick={() => act(memory, 'delete')}
                      size="xs"
                      type="button"
                      variant="destructive"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </article>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
