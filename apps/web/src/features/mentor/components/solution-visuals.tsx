import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link } from '@/lib/router'
import {
  isSafeCoachPublicUrl,
  type CommunitySolution,
  type ProviderKey,
  type SolutionApproach,
  type SolutionApproachKind,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  ArrowUpRight,
  BadgeCheck,
  Lightbulb,
  Route,
  Trophy,
  Zap,
} from '@/components/icons/algo-icons'
import { TestCaseVisualizerIcon } from '@/components/icons/mentor-icons'
import { buttonVariants } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import {
  CodeBlockView,
  CoachMessageContent,
} from '@/features/coach/components/CoachMessageContent'
import {
  VISUALIZER_PATH,
  visualizerLanguageFor,
  type VisualizerHandoff,
} from '@/features/visualizer/handoff'
import { cn } from '@/lib/utils'

/*
 * Pieces of the Solution Explorer. The page avoids full-width boxes: the
 * approaches are a path of nodes, the detail splits into prose and a code
 * window, and supporting material sits in small cards and rows.
 */

const ease = [0.16, 1, 0.3, 1] as const

const kindLabels: Record<SolutionApproachKind, string> = {
  brute_force: 'Brute force',
  better: 'Better',
  optimized: 'Optimal',
  alternative: 'Alternative',
  mathematical: 'Mathematical',
}

const kindColors: Record<SolutionApproachKind, string> = {
  brute_force: '#f97316',
  better: '#f59e0b',
  alternative: '#0ea5e9',
  mathematical: '#8b5cf6',
  optimized: '#22c55e',
}

// A rough cost rank for a big-O expression, only for the cost meters.
function complexityWeight(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, '')
  if (/!|2\^|\^n|exp/.test(text)) return 10
  if (/n\^3|n³/.test(text)) return 8
  if (/n\^2|n²|n\*n|n\*m|m\*n|nm/.test(text)) return 6.5
  if (/sqrt|√/.test(text)) return 4.5
  if (/[nmkq]\*?log/.test(text)) return 4
  if (/log/.test(text)) return 2
  if (/[nmkq]/.test(text)) return 3
  return 1.2
}

const codeExtensions: Record<string, string> = {
  'c++': 'cpp',
  cpp: 'cpp',
  java: 'java',
  python: 'py',
  python3: 'py',
  javascript: 'js',
  typescript: 'ts',
  go: 'go',
  rust: 'rs',
  kotlin: 'kt',
  'c#': 'cs',
  c: 'c',
}

function CostMeter({ weight, color }: { weight: number; color: string }) {
  const lit = Math.max(1, Math.round((weight / 10) * 5))
  return (
    <span aria-hidden="true" className="flex items-end gap-0.5">
      {[1, 2, 3, 4, 5].map((bar) => (
        <span
          className="w-1 rounded-full"
          key={bar}
          style={{
            height: `${4 + bar * 2}px`,
            background:
              bar <= lit
                ? color
                : 'color-mix(in oklab, var(--muted-foreground) 25%, transparent)',
          }}
        />
      ))}
    </span>
  )
}

// The approaches as stations on a path from brute force to optimal. Each
// station is a tab; the path fills up to the chosen one.
export function ApproachJourney({
  approaches,
  active,
  onSelect,
}: {
  approaches: readonly SolutionApproach[]
  active: number
  onSelect: (index: number) => void
}) {
  const reduceMotion = useReducedMotion()
  const count = approaches.length
  const inset = `calc(100% / ${count * 2})`
  const progress = count <= 1 ? 1 : active / (count - 1)
  return (
    <div className="relative min-w-0">
      <span
        aria-hidden="true"
        className="absolute top-7 h-0.5 rounded-full bg-border"
        style={{ left: inset, right: inset }}
      />
      <motion.span
        animate={{ scaleX: progress }}
        aria-hidden="true"
        className="absolute top-7 h-0.5 origin-left rounded-full bg-linear-to-r from-[#f97316] via-[#f59e0b] to-[#22c55e]"
        initial={reduceMotion ? false : { scaleX: 0 }}
        style={{ left: inset, right: inset }}
        transition={{ duration: 0.8, ease }}
      />
      <div
        aria-label="Choose an approach"
        className="relative grid"
        role="tablist"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {approaches.map((approach, index) => {
          const selected = index === active
          const color = kindColors[approach.kind]
          const Icon = approach.kind === 'optimized' ? Trophy : Route
          return (
            <button
              aria-controls="approach-panel"
              aria-selected={selected}
              className="group flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 pb-1 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              id={`approach-tab-${index}`}
              key={`${approach.kind}-${index}`}
              onClick={() => onSelect(index)}
              role="tab"
              type="button"
            >
              <motion.span
                animate={{ scale: 1, rotate: 0 }}
                className="relative grid size-14 place-items-center"
                initial={reduceMotion ? false : { scale: 0, rotate: -90 }}
                transition={{
                  type: 'spring',
                  stiffness: 320,
                  damping: 18,
                  delay: 0.12 * index,
                }}
              >
                {selected && !reduceMotion ? (
                  <motion.span
                    animate={{ scale: [1, 1.55], opacity: [0.45, 0] }}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full"
                    style={{ background: color }}
                    transition={{
                      duration: 1.6,
                      repeat: Infinity,
                      ease: 'easeOut',
                    }}
                  />
                ) : null}
                <span
                  className={cn(
                    'relative grid size-14 place-items-center rounded-full border-2 bg-card transition-[transform,background-color,color] duration-300 group-hover:scale-105',
                    selected && 'text-white',
                  )}
                  style={{
                    borderColor: color,
                    background: selected ? color : undefined,
                    color: selected ? undefined : color,
                  }}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
              </motion.span>
              <span
                className={cn(
                  'text-sm font-semibold transition-colors',
                  selected ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {kindLabels[approach.kind]}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[0.7rem] text-foreground">
                <CostMeter
                  color={color}
                  weight={complexityWeight(approach.timeComplexity)}
                />
                {approach.timeComplexity}
              </span>
              <span className="hidden w-full truncate text-xs text-muted-foreground sm:block">
                {approach.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CodeWindow({
  code,
  language,
  footer,
}: {
  code: string
  language: string
  footer?: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const extension = codeExtensions[language.trim().toLowerCase()] ?? 'txt'
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/50 px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          {['#ef4444', '#f59e0b', '#22c55e'].map((color, index) => (
            <motion.span
              animate={{ scale: 1 }}
              className="size-2.5 rounded-full"
              initial={reduceMotion ? false : { scale: 0 }}
              key={color}
              style={{ background: color }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 15,
                delay: 0.25 + index * 0.08,
              }}
            />
          ))}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          solution.{extension}
        </span>
      </div>
      <div className="relative [&>div]:my-0 [&>div]:rounded-none [&>div]:border-0">
        <CodeBlockView code={code} language={language} />
        {reduceMotion ? null : (
          <motion.span
            animate={{ top: '100%', opacity: 0 }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-10 bg-linear-to-b from-transparent via-[color-mix(in_oklab,var(--primary)_18%,transparent)] to-transparent"
            initial={{ top: '0%', opacity: 1 }}
            transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.3 }}
          />
        )}
      </div>
      {footer ? (
        <div className="border-t border-border px-4 py-3">{footer}</div>
      ) : null}
    </div>
  )
}

// One approach: prose on the left, the program on the right. Switching
// approaches wipes the new one in from the side of the chosen station.
export function ApproachDetail({
  approach,
  index,
  direction,
  language,
  problem,
  testCase,
}: {
  approach: SolutionApproach
  index: number
  direction: 1 | -1
  language: string
  problem: { title: string; url?: string }
  // The walkthrough's test case, run on this approach's code.
  testCase?: { input?: string; expected?: string }
}) {
  const reduceMotion = useReducedMotion()
  const color = kindColors[approach.kind]
  const visualizerLanguage = visualizerLanguageFor(language)
  const visualizer: VisualizerHandoff | null =
    approach.code === undefined || visualizerLanguage === null
      ? null
      : {
          source: 'solution_explorer',
          language: visualizerLanguage,
          code: approach.code,
          ...(testCase?.input === undefined ? {} : { input: testCase.input }),
          ...(testCase?.expected === undefined
            ? {}
            : { expected: testCase.expected }),
          problem,
          approach: `${kindLabels[approach.kind]}: ${approach.name}`,
        }
  const steps = approach.steps ?? []
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        animate={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }}
        aria-labelledby={`approach-tab-${index}`}
        className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
        exit={
          reduceMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                filter: 'blur(6px)',
                transition: { duration: 0.18 },
              }
        }
        id="approach-panel"
        initial={
          reduceMotion
            ? false
            : {
                clipPath:
                  direction === 1
                    ? 'inset(0% 0% 0% 100%)'
                    : 'inset(0% 100% 0% 0%)',
                opacity: 0.3,
              }
        }
        key={index}
        role="tabpanel"
        transition={{ duration: 0.55, ease }}
      >
        <div className="min-w-0">
          <p
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color }}
          >
            {kindLabels[approach.kind]} · space {approach.spaceComplexity}
          </p>
          <h3 className="mt-1 text-2xl text-foreground">{approach.name}</h3>
          <div className="mt-2 text-[0.95rem] text-foreground/90 [&>div]:mt-1">
            <CoachMessageContent content={approach.idea} role="assistant" />
          </div>
          <div
            className="relative mt-4 flex gap-3 overflow-hidden rounded-2xl border px-4 py-3"
            style={{
              borderColor: `color-mix(in oklab, ${color} 45%, var(--border))`,
              background: `linear-gradient(100deg, color-mix(in oklab, ${color} 12%, var(--card)), var(--card) 70%)`,
            }}
          >
            <Zap
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              style={{ color }}
            />
            <div className="min-w-0 text-sm [&>div]:mt-0">
              <p className="text-xs font-semibold text-muted-foreground">
                Key insight
              </p>
              <CoachMessageContent
                content={approach.keyInsight}
                role="assistant"
              />
            </div>
          </div>
          {steps.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-foreground">Algorithm</p>
              <ol className="relative mt-3 grid gap-3 pl-8">
                <motion.span
                  animate={{ scaleY: 1 }}
                  aria-hidden="true"
                  className="absolute top-2 bottom-2 left-[0.6875rem] w-px origin-top"
                  initial={reduceMotion ? false : { scaleY: 0 }}
                  style={{
                    background: `linear-gradient(${color}, color-mix(in oklab, ${color} 20%, transparent))`,
                  }}
                  transition={{ duration: 0.6, ease, delay: 0.2 }}
                />
                {steps.map((step, stepIndex) => (
                  <motion.li
                    animate={{ opacity: 1, x: 0 }}
                    className="relative text-sm leading-6"
                    initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                    key={step}
                    transition={{ duration: 0.4, delay: 0.3 + stepIndex * 0.1 }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0.5 -left-8 grid size-5.5 place-items-center rounded-full border-2 bg-card font-mono text-[0.65rem] font-bold"
                      style={{ borderColor: color, color }}
                    >
                      {stepIndex + 1}
                    </span>
                    {step}
                  </motion.li>
                ))}
              </ol>
            </div>
          ) : null}
          <Disclosure
            className="mt-5"
            summary={`Why it works${approach.limitations ? ' and its limits' : ''}`}
          >
            <div className="text-sm [&>div]:mt-1">
              <CoachMessageContent
                content={approach.whyItWorks}
                role="assistant"
              />
            </div>
            {approach.limitations ? (
              <div className="mt-3 text-sm text-muted-foreground [&>div]:mt-1">
                <CoachMessageContent
                  content={`**Limitations.** ${approach.limitations}`}
                  role="assistant"
                />
              </div>
            ) : null}
          </Disclosure>
        </div>
        <div className="min-w-0">
          {approach.code ? (
            <CodeWindow
              code={approach.code}
              footer={
                visualizer !== null || approach.codeExplanation ? (
                  <div className="flex flex-col gap-3">
                    {approach.codeExplanation ? (
                      <div className="text-sm text-muted-foreground [&>div]:mt-0">
                        <CoachMessageContent
                          content={approach.codeExplanation}
                          role="assistant"
                        />
                      </div>
                    ) : null}
                    {visualizer !== null ? (
                      <Link
                        className={cn(
                          buttonVariants({ size: 'sm', variant: 'outline' }),
                          'self-start',
                        )}
                        state={{ visualizer }}
                        to={VISUALIZER_PATH}
                      >
                        <TestCaseVisualizerIcon aria-hidden="true" />
                        Visualize with a test case
                      </Link>
                    ) : null}
                  </div>
                ) : undefined
              }
              language={language}
            />
          ) : (
            <p className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No verified program was produced for this approach. Regenerate, or
              ask the assistant to write it.
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// Key observations dealt like cards, flipping up one after another.
export function ObservationDeck({ items }: { items: readonly string[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <ol className="grid gap-3 [perspective:900px] sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => (
        <motion.li
          className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 pt-3 shadow-soft"
          initial={reduceMotion ? false : { opacity: 0, rotateX: -70, y: 16 }}
          key={item}
          style={{ transformOrigin: 'top center' }}
          transition={{ duration: 0.6, ease, delay: 0.1 * index }}
          viewport={{ once: true, margin: '-30px' }}
          whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
        >
          <span
            aria-hidden="true"
            className="block font-heading text-4xl leading-none font-bold text-transparent [-webkit-text-stroke:1.5px_var(--primary)]"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <p className="mt-2 text-sm leading-6 text-foreground">{item}</p>
        </motion.li>
      ))}
    </ol>
  )
}

const noteColors = ['#fde68a', '#bbf7d0', '#bae6fd', '#ddd6fe'] as const

// Habits worth keeping, as small tilted notes that straighten on hover.
export function LessonNotes({ lessons }: { lessons: readonly string[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {lessons.map((lesson, index) => {
        const tilt = index % 2 === 0 ? -1.5 : 1.5
        const color = noteColors[index % noteColors.length] ?? '#fde68a'
        return (
          <motion.li
            className="relative flex min-w-0 gap-2.5 rounded-lg p-4 pt-5 text-sm leading-6 text-[#1f2937] shadow-soft"
            initial={
              reduceMotion ? false : { opacity: 0, y: -24, rotate: tilt * 4 }
            }
            key={lesson}
            style={{ background: color }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 16,
              delay: 0.08 * index,
            }}
            viewport={{ once: true, margin: '-30px' }}
            whileHover={reduceMotion ? {} : { rotate: 0, y: -3 }}
            whileInView={{ opacity: 1, y: 0, rotate: tilt }}
          >
            <span
              aria-hidden="true"
              className="absolute -top-1.5 left-1/2 h-3 w-12 -translate-x-1/2 rounded-sm bg-white/60"
            />
            <Lightbulb
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 [--icon-node:#1f2937]"
            />
            <span>{lesson}</span>
          </motion.li>
        )
      })}
    </ul>
  )
}

const communityKindLabels = {
  editorial: 'Editorial',
  community: 'Community',
  discussion: 'Discussion',
  submissions: 'Submission',
  article: 'Article',
  video: 'Video',
} as const

const providerForUrl = (url: string): ProviderKey | null => {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return host.endsWith('codeforces.com')
    ? 'codeforces'
    : host.endsWith('leetcode.com')
      ? 'leetcode'
      : host.endsWith('codechef.com')
        ? 'codechef'
        : host === 'cses.fi'
          ? 'cses'
          : null
}

// Outbound resources as compact link rows; the arrow slides on hover.
export function SourceRows({
  sources,
  empty,
}: {
  sources: readonly CommunitySolution[]
  empty: string
}) {
  const reduceMotion = useReducedMotion()
  if (sources.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        {empty}
      </p>
    )
  }
  return (
    <ul className="grid gap-2">
      {sources.map((source, index) => {
        const provider = providerForUrl(source.url)
        return (
          <motion.li
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            key={source.url}
            transition={{ duration: 0.4, delay: 0.06 * index }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <a
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={source.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
                {provider === null ? (
                  <BadgeCheck
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                ) : (
                  <ProviderLogo className="size-4.5" provider={provider} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {source.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{communityKindLabels[source.kind]}</span>
                  <span>· {source.publisher}</span>
                  {source.official ? (
                    <span className="text-go-foreground">· Official</span>
                  ) : null}
                  {source.language ? <span>· {source.language}</span> : null}
                </span>
                {source.highlight ? (
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {source.highlight}
                  </span>
                ) : null}
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </motion.li>
        )
      })}
    </ul>
  )
}

const previewStations = [
  { label: 'Brute force', cost: 'O(n²)', color: '#f97316' },
  { label: 'Better', cost: 'O(n log n)', color: '#f59e0b' },
  { label: 'Optimal', cost: 'O(n)', color: '#22c55e' },
] as const

const previewCode = [
  [0, 62],
  [1, 48],
  [1, 70],
  [2, 40],
  [2, 56],
  [3, 34],
  [2, 22],
  [1, 52],
  [1, 30],
  [0, 18],
] as const

// A looping miniature of an exploration: the path steps from brute force to
// optimal while code lines write themselves. Decorative only.
export function ExplorerPreview() {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(reduceMotion ? 2 : 0)
  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setInterval(
      () => setStep((value) => (value + 1) % previewStations.length),
      2400,
    )
    return () => window.clearInterval(timer)
  }, [reduceMotion])
  const station = previewStations[step] ?? previewStations[0]
  return (
    <div
      aria-hidden="true"
      className="relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <span className="absolute -top-20 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_30%,transparent),transparent)] blur-2xl" />
      <p className="relative text-xs font-medium text-muted-foreground">
        Preview · Two Sum
      </p>
      <div className="relative mt-5">
        <span className="absolute top-4 right-[16.6%] left-[16.6%] h-0.5 rounded-full bg-border" />
        <motion.span
          animate={{ scaleX: step / (previewStations.length - 1) }}
          className="absolute top-4 right-[16.6%] left-[16.6%] h-0.5 origin-left rounded-full bg-linear-to-r from-[#f97316] via-[#f59e0b] to-[#22c55e]"
          transition={{ duration: 0.7, ease }}
        />
        <div className="relative grid grid-cols-3">
          {previewStations.map((item, index) => {
            const on = index <= step
            return (
              <div
                className="flex flex-col items-center gap-1.5"
                key={item.label}
              >
                <motion.span
                  animate={{
                    scale: index === step ? 1.15 : 1,
                    backgroundColor: on ? item.color : 'var(--card)',
                  }}
                  className="grid size-8 place-items-center rounded-full border-2"
                  style={{ borderColor: item.color }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                >
                  {index === 2 ? (
                    <Trophy
                      className="size-3.5"
                      style={{ color: on ? '#fff' : item.color }}
                    />
                  ) : (
                    <Route
                      className="size-3.5"
                      style={{ color: on ? '#fff' : item.color }}
                    />
                  )}
                </motion.span>
                <span
                  className={cn(
                    'text-[0.7rem] font-medium transition-colors',
                    index === step
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="relative mt-5 flex-1 overflow-hidden rounded-xl border border-border bg-secondary/40">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-[#ef4444]" />
            <span className="size-2 rounded-full bg-[#f59e0b]" />
            <span className="size-2 rounded-full bg-[#22c55e]" />
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-[0.68rem] font-semibold"
              exit={{ opacity: 0, y: -6 }}
              initial={{ opacity: 0, y: 6 }}
              key={station.cost}
              style={{ color: station.color }}
            >
              {station.cost}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="grid gap-2 p-3" key={step}>
          {previewCode.map(([indent, width], index) => (
            <motion.span
              animate={{ width: `${width}%` }}
              className="h-2 rounded-full"
              initial={reduceMotion ? false : { width: '0%' }}
              key={index}
              style={{
                marginLeft: `${indent * 1}rem`,
                background:
                  index % 3 === 1
                    ? `color-mix(in oklab, ${station.color} 55%, transparent)`
                    : 'color-mix(in oklab, var(--muted-foreground) 30%, transparent)',
              }}
              transition={{ duration: 0.35, ease, delay: 0.12 * index }}
            />
          ))}
        </div>
      </div>
      <div className="relative mt-4 flex items-end gap-2">
        <span className="rounded-2xl rounded-bl-sm bg-secondary px-3 py-1.5 text-[0.7rem] text-foreground">
          Why is this {station.cost}?
        </span>
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          className="mb-1 flex gap-0.5"
          transition={{ duration: 1.2, repeat: reduceMotion ? 0 : Infinity }}
        >
          <span className="size-1 rounded-full bg-muted-foreground" />
          <span className="size-1 rounded-full bg-muted-foreground" />
          <span className="size-1 rounded-full bg-muted-foreground" />
        </motion.span>
      </div>
    </div>
  )
}

const linkProviders: readonly { key: ProviderKey; label: string }[] = [
  { key: 'codeforces', label: 'Codeforces' },
  { key: 'leetcode', label: 'LeetCode' },
  { key: 'codechef', label: 'CodeChef' },
  { key: 'cses', label: 'CSES' },
]

type LinkReading =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'problem'; provider: ProviderKey; label: string; id: string }
  | { kind: 'page'; host: string }

// What a pasted link points at, read from its address alone. Only a hint for
// the learner: the server resolves the real problem.
function readLink(value: string): LinkReading {
  const text = value.trim()
  if (text === '') return { kind: 'empty' }
  if (!isSafeCoachPublicUrl(text)) return { kind: 'invalid' }
  const url = new URL(text)
  const host = url.hostname.replace(/^www\./, '')
  const path = url.pathname
  const match = (pattern: RegExp) => pattern.exec(path)
  if (host.endsWith('codeforces.com')) {
    const found =
      match(/\/problemset\/problem\/(\d+)\/(\w+)/) ??
      match(/\/(?:contest|gym)\/(\d+)\/problem\/(\w+)/)
    if (found) {
      return {
        kind: 'problem',
        provider: 'codeforces',
        label: 'Codeforces',
        id: `${found[1] ?? ''}${found[2] ?? ''}`,
      }
    }
  }
  if (host.endsWith('leetcode.com')) {
    const found = match(/\/problems\/([^/]+)/)
    if (found?.[1]) {
      return {
        kind: 'problem',
        provider: 'leetcode',
        label: 'LeetCode',
        id: found[1],
      }
    }
  }
  if (host.endsWith('codechef.com')) {
    const found = match(/\/problems\/([^/]+)/)
    if (found?.[1]) {
      return {
        kind: 'problem',
        provider: 'codechef',
        label: 'CodeChef',
        id: found[1],
      }
    }
  }
  if (host === 'cses.fi') {
    const found = match(/\/problemset\/task\/(\d+)/)
    if (found?.[1]) {
      return { kind: 'problem', provider: 'cses', label: 'CSES', id: found[1] }
    }
  }
  return { kind: 'page', host }
}

// A live reading of the link field: which platforms work while it is empty,
// then the platform and problem the pasted address points at.
export function LinkCheck({ value }: { value: string }) {
  const reduceMotion = useReducedMotion()
  const reading = readLink(value)
  const [spot, setSpot] = useState(0)
  useEffect(() => {
    if (reduceMotion || reading.kind !== 'empty') return
    const timer = window.setInterval(
      () => setSpot((current) => (current + 1) % (linkProviders.length + 1)),
      1400,
    )
    return () => window.clearInterval(timer)
  }, [reduceMotion, reading.kind])
  const key =
    reading.kind === 'problem'
      ? `${reading.provider}:${reading.id}`
      : reading.kind === 'page'
        ? `page:${reading.host}`
        : reading.kind
  return (
    <div
      aria-live="polite"
      className="flex min-h-16 items-center overflow-hidden rounded-2xl border border-border bg-background/60 p-3 [&>div]:w-full"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          key={key}
          transition={{ duration: 0.25 }}
        >
          {reading.kind === 'empty' ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Works with
              </span>
              {linkProviders.map((provider, index) => (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-[border-color,color,transform] duration-300',
                    spot === index
                      ? '-translate-y-0.5 border-acc text-foreground'
                      : 'border-border text-muted-foreground',
                  )}
                  key={provider.key}
                >
                  <ProviderLogo className="size-3.5" provider={provider.key} />
                  {provider.label}
                </span>
              ))}
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-[border-color,color,transform] duration-300',
                  spot === linkProviders.length
                    ? '-translate-y-0.5 border-acc text-foreground'
                    : 'border-border text-muted-foreground',
                )}
              >
                any public page
              </span>
            </div>
          ) : reading.kind === 'invalid' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-[#f59e0b]"
              />
              Keep going: paste the full public https link to the problem.
            </p>
          ) : reading.kind === 'problem' ? (
            <div className="flex min-w-0 items-center gap-3">
              <motion.span
                animate={{ scale: 1, rotate: 0 }}
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card"
                initial={reduceMotion ? false : { scale: 0.5, rotate: -20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              >
                <ProviderLogo className="size-5" provider={reading.provider} />
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {reading.label} problem
                </p>
                <p className="truncate font-mono text-sm font-semibold text-foreground">
                  {reading.id}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-go-soft px-2.5 py-1 text-xs font-medium text-go-foreground">
                <BadgeCheck aria-hidden="true" className="size-3.5" />
                Ready to open
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-dashed border-border font-mono text-xs text-muted-foreground">
                www
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Public page</p>
                <p className="truncate font-mono text-sm font-semibold text-foreground">
                  {reading.host}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                The problem is read from the page
              </span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
