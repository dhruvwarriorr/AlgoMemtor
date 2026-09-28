import type { VisualizerFinding } from '@algomemtor/shared-contracts'
import { MotionConfig, motion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from '@/lib/router'

import {
  ArrowLeft,
  BookOpen,
  Code2,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from '@/components/icons/algo-icons'
import { PageHero } from '@/components/kit/PageHero'
import PageContainer from '@/components/layout/PageContainer'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import { Button } from '@/components/ui/button'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import { AiDebugger } from '@/features/visualizer/ai/AiDebugger'
import {
  changeKey,
  changesAt,
  compareOutput,
  findStep,
  importantSteps,
  stepContext,
} from '@/features/visualizer/analysis'
import { CodeView } from '@/features/visualizer/components/CodeView'
import { IoPanel } from '@/features/visualizer/components/IoPanel'
import { PlayIcon } from '@/features/visualizer/components/player-icons'
import type {
  JumpTarget,
  Speed,
} from '@/features/visualizer/components/playback'
import {
  defaultExample,
  exampleFor,
  visualizerExamples,
  type ExampleProgram,
} from '@/features/visualizer/examples'
import {
  contextOf,
  loadDraft,
  mentorLanguageFor,
  readVisualizerHandoff,
  saveDraft,
  type VisualizerContext,
  type VisualizerDraft,
  readsInput,
} from '@/features/visualizer/handoff'
import { TraceRunnerError } from '@/features/visualizer/run-trace'
import { buildScene } from '@/features/visualizer/scene/build'
import { callTreeAt, callTree } from '@/features/visualizer/scene/calls'
import {
  CodeComposer,
  ExampleGallery,
} from '@/features/visualizer/stage/Composer'
import { ShapeMarquee } from '@/features/visualizer/stage/ShapeMarquee'
import { Legend } from '@/features/visualizer/stage/Legend'
import { Stage } from '@/features/visualizer/stage/Stage'
import { traceMarkers, type Marker } from '@/features/visualizer/stage/markers'
import { Transport } from '@/features/visualizer/stage/Transport'
import {
  defaultTraceLimits,
  visualizerLanguageLabels,
  type ExecutionTrace,
  type VisualizerLanguage,
} from '@/features/visualizer/trace'
import { useTraceRunner } from '@/features/visualizer/use-trace-runner'
import type { RunPhase } from '@/features/visualizer/worker/protocol'
import { cn } from '@/lib/utils'
import { endPetActivity, startPetActivity } from '@/features/pet/mello-events'
import { petLines } from '@/features/pet/pet-lines'

type RunResult = {
  id: number
  trace: ExecutionTrace
  code: string
  input: string
  expected: string
  language: VisualizerLanguage
}

type PageView = 'code' | 'examples' | 'visualize'

type RunSource = {
  language: VisualizerLanguage
  code: string
  input: string
  expected: string
}

const loadingSteps: Record<RunPhase, readonly AiLoaderStep[]> = {
  loading: [
    {
      label: 'Downloading the Python runtime (first run only)',
      indicator: 'bar',
    },
    { label: 'Starting Python in your browser', indicator: 'grid' },
    { label: 'Running your code step by step', indicator: 'dots' },
  ],
  running: [
    { label: 'Running your code in this browser', indicator: 'bar' },
    { label: 'Recording every step', indicator: 'dots' },
  ],
}

const TIP_KEY = 'algomemtor.visualizer.tip-dismissed'

function readTipDismissed() {
  try {
    return window.localStorage.getItem(TIP_KEY) === '1'
  } catch {
    return true
  }
}

function initialDraft(state: unknown): VisualizerDraft & { handoff: boolean } {
  const handoff = readVisualizerHandoff(state)
  if (handoff !== null) {
    return {
      language: handoff.language,
      code: handoff.code,
      input: handoff.input ?? '',
      expected: handoff.expected ?? '',
      context: contextOf(handoff),
      handoff: true,
    }
  }
  const draft = loadDraft()
  if (draft !== null) return { ...draft, handoff: false }
  const example = defaultExample('cpp')
  return {
    language: example.language,
    code: example.code,
    input: example.input,
    expected: example.expected,
    context: null,
    handoff: false,
  }
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

function verdictOf(
  trace: ExecutionTrace,
  comparison: ReturnType<typeof compareOutput> | null,
): { label: string; tone: 'ok' | 'bad' | 'neutral' } {
  const error = trace.error
  if (error === undefined) {
    if (comparison === null) return { label: 'Finished', tone: 'neutral' }
    return comparison.status === 'match'
      ? { label: 'Output matches', tone: 'ok' }
      : { label: 'Wrong output', tone: 'bad' }
  }
  const labels: Record<string, string> = {
    compile: 'Does not compile',
    unsupported: 'Not supported',
    timeout: 'Time limit',
    recursion: 'Recursion too deep',
    output_limit: 'Too much output',
    memory: 'Memory limit',
  }
  return { label: labels[error.kind] ?? 'Runtime error', tone: 'bad' }
}

function TestCaseVisualizerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const runner = useTraceRunner()
  const [initial] = useState(() => initialDraft(location.state))
  const [language, setLanguage] = useState<VisualizerLanguage>(initial.language)
  const [code, setCode] = useState(initial.code)
  const [input, setInput] = useState(initial.input)
  const [expected, setExpected] = useState(initial.expected)
  const [context, setContext] = useState<VisualizerContext | null>(
    initial.context,
  )
  const [phase, setPhase] = useState<RunPhase | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [view, setView] = useState<PageView>('code')
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(2)
  const [importantOnly, setImportantOnly] = useState(false)
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(new Set())
  const [watched, setWatched] = useState<string | null>(null)
  const [findings, setFindings] = useState<VisualizerFinding[]>([])
  const [focusLine, setFocusLine] = useState<number | null>(null)
  const [tipDismissed, setTipDismissed] = useState(readTipDismissed)
  const runId = useRef(0)
  const codeRef = useRef<HTMLDivElement | null>(null)
  const autoRun = useRef(initial.handoff)

  // The handoff has been copied into the draft; drop it from history so a
  // reload keeps the learner's edits instead of re-applying it.
  useEffect(() => {
    if (location.state !== null && location.state !== undefined) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    saveDraft({ language, code, input, expected, context })
  }, [language, code, input, expected, context])

  const trace = result?.trace ?? null
  const steps = trace?.steps ?? []
  const lastIndex = Math.max(0, steps.length - 1)
  const sourceLines = useMemo(() => result?.code.split('\n') ?? [], [result])
  const important = useMemo(
    () => (trace === null ? [] : importantSteps(trace)),
    [trace],
  )
  const comparison = useMemo(
    () =>
      trace === null ||
      result === null ||
      result.expected.trim() === '' ||
      trace.steps.length === 0
        ? null
        : compareOutput(trace, result.expected),
    [trace, result],
  )
  const scene = useMemo(
    () =>
      trace === null || trace.steps.length === 0
        ? null
        : buildScene(trace, Math.min(current, lastIndex), sourceLines),
    [trace, current, lastIndex, sourceLines],
  )
  const calls = useMemo(() => {
    if (trace === null || trace.steps.length === 0) return null
    const tree = callTree(trace)
    if (tree.nodes.size < 2) return null
    return callTreeAt(trace, Math.min(current, lastIndex))
  }, [trace, current, lastIndex])
  const hits = useMemo(() => {
    const counts = new Map<number, number>()
    if (trace === null) return counts
    for (
      let index = 0;
      index <= current && index < trace.steps.length;
      index += 1
    ) {
      const step = trace.steps[index]
      if (step?.event === 'line' && step.loop === undefined) {
        counts.set(step.line, (counts.get(step.line) ?? 0) + 1)
      }
    }
    return counts
  }, [trace, current])
  const flagged = useMemo(() => {
    const lines = new Map<number, string>()
    for (const finding of findings) {
      if (!lines.has(finding.line)) lines.set(finding.line, finding.title)
    }
    return lines
  }, [findings])
  const markers = useMemo<Marker[]>(() => {
    if (trace === null) return []
    const extra: Marker[] = findings
      .filter((finding) => finding.step !== undefined)
      .map((finding) => ({
        step: (finding.step as number) - 1,
        tone: 'finding',
      }))
    if (comparison?.status === 'mismatch' && comparison.step !== null) {
      extra.push({ step: comparison.step, tone: 'danger' })
    }
    trace.steps.forEach((step, index) => {
      if (breakpoints.has(step.line) && index % 1 === 0 && extra.length < 400) {
        extra.push({ step: index, tone: 'breakpoint' })
      }
    })
    return traceMarkers(trace, extra)
  }, [trace, findings, comparison, breakpoints])

  const move = (direction: 1 | -1, from = current): number | null => {
    if (trace === null) return null
    if (!importantOnly) {
      const target = from + direction
      return target < 0 || target > lastIndex ? null : target
    }
    return findStep(
      trace,
      from,
      direction,
      (_, index) => important[index] === true,
    )
  }

  const select = useCallback(
    (index: number) => {
      setCurrent(Math.min(lastIndex, Math.max(0, index)))
    },
    [lastIndex],
  )

  // Playback.
  useEffect(() => {
    if (!playing || trace === null) return
    const timer = window.setTimeout(() => {
      const target = move(1)
      if (target === null) {
        setPlaying(false)
        return
      }
      setCurrent(target)
      const step = trace.steps[target]
      const watchedChanged =
        watched !== null &&
        changesAt(trace, target).some(
          (change) => changeKey(change.frame, change.name) === watched,
        )
      if (
        step === undefined ||
        breakpoints.has(step.line) ||
        step.event === 'error' ||
        watchedChanged ||
        target >= lastIndex
      ) {
        setPlaying(false)
      }
    }, 1000 / speed)
    return () => window.clearTimeout(timer)
  })

  // Keyboard.
  useEffect(() => {
    if (result === null || trace === null || view !== 'visualize') return
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        isEditable(event.target)
      )
        return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const target = move(1)
        if (target !== null) setCurrent(target)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const target = move(-1)
        if (target !== null) setCurrent(target)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setCurrent(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        setCurrent(lastIndex)
      } else if (
        event.key === ' ' &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault()
        setPlaying((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function execute(source: RunSource) {
    if (phase !== null) return
    if (source.code.trim() === '') {
      setRunError('Write or paste some code first.')
      return
    }
    if (
      source.input.trim() === '' &&
      readsInput(source.language, source.code)
    ) {
      setRunError(
        'This code reads input, but the input box is empty. Add a test case input, then run it.',
      )
      return
    }
    setRunError(null)
    setPlaying(false)
    setPhase(source.language === 'python' ? 'loading' : 'running')
    startPetActivity('visualizer-run', 'working', petLines.visualizerRun)
    let traced = false
    try {
      const nextTrace = await runner.run(
        {
          language: source.language,
          code: source.code,
          input: source.input,
          limits: defaultTraceLimits,
        },
        setPhase,
      )
      runId.current += 1
      setResult({ id: runId.current, trace: nextTrace, ...source })
      setCurrent(0)
      setWatched(null)
      setFindings([])
      setFocusLine(null)
      setView('visualize')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      traced = true
    } catch (error) {
      if (
        error instanceof TraceRunnerError &&
        error.message === 'The run was cancelled.'
      )
        return
      setRunError(
        error instanceof Error ? error.message : 'The code could not be run.',
      )
    } finally {
      setPhase(null)
      endPetActivity(
        'visualizer-run',
        traced
          ? petLines.visualizerDone
          : {
              message: 'That run did not finish. Check the message above.',
              state: 'thinking',
            },
      )
    }
  }

  const run = (event?: FormEvent) => {
    event?.preventDefault()
    void execute({ language, code, input, expected })
  }

  // Code handed over by the Doubt Helper or Solution Explorer runs at once.
  useEffect(() => {
    if (!autoRun.current) return
    autoRun.current = false
    const timer = window.setTimeout(() => {
      void execute({ language, code, input, expected })
    }, 0)
    return () => window.clearTimeout(timer)
  })

  function chooseLanguage(next: VisualizerLanguage) {
    if (next === language) return
    setLanguage(next)
    if (next === 'python') runner.warmup('python')
    const untouched =
      visualizerExamples.some((example) => example.code === code) ||
      code.trim() === ''
    if (untouched) {
      const example =
        visualizerExamples.find(
          (item) =>
            item.language === next &&
            item.title ===
              visualizerExamples.find((other) => other.code === code)?.title,
        ) ?? defaultExample(next)
      setCode(example.code)
      setInput(example.input)
      setExpected(example.expected)
      setContext(null)
    }
  }

  function openExample(program: ExampleProgram, chosen: VisualizerLanguage) {
    const example = exampleFor(program, chosen)
    setLanguage(example.language)
    setCode(example.code)
    setInput(example.input)
    setExpected(example.expected)
    setContext(null)
    if (example.language === 'python') runner.warmup('python')
    void execute({
      language: example.language,
      code: example.code,
      input: example.input,
      expected: example.expected,
    })
  }

  function askDoubtHelper() {
    if (result === null || trace === null) return
    const content = stepContext(trace, current, sourceLines, result.expected)
    if (context?.source === 'doubt_helper' && context.sessionId !== undefined) {
      void navigate(`/doubt-helper/${context.sessionId}`, {
        state: { visualizerQuestion: { content, code: result.code } },
      })
      return
    }
    void navigate('/doubt-helper', {
      state: {
        visualizerIntake: {
          code: result.code,
          language: mentorLanguageFor[result.language],
          details: content,
        },
      },
    })
  }

  function showLine(line: number) {
    setFocusLine(line)
    codeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const step = trace?.steps[current]
  const previousStep = current > 0 ? trace?.steps[current - 1] : undefined
  const firstError =
    trace === null
      ? -1
      : trace.steps.findIndex((item) => item.event === 'error')
  const jumps: JumpTarget[] =
    trace === null
      ? []
      : [
          ...(firstError >= 0
            ? [
                {
                  id: 'error',
                  label: 'The error',
                  step: firstError,
                  tone: 'danger' as const,
                },
              ]
            : []),
          ...(comparison?.status === 'mismatch' && comparison.step !== null
            ? [
                {
                  id: 'wrong',
                  label: 'First wrong output',
                  step: comparison.step,
                  tone: 'danger' as const,
                },
              ]
            : []),
          {
            id: 'change',
            label: 'Next change',
            step: findStep(
              trace,
              current,
              1,
              (_, index) => changesAt(trace, index).length > 0,
            ),
          },
          {
            id: 'branch',
            label: 'Next decision (if / while)',
            step: findStep(
              trace,
              current,
              1,
              (item) => item.cond !== undefined && item.loop === undefined,
            ),
          },
          {
            id: 'iteration',
            label: 'Next loop iteration',
            step: findStep(
              trace,
              current,
              1,
              (item) => item.loop !== undefined,
            ),
          },
          {
            id: 'call',
            label: 'Next function call',
            step: findStep(trace, current, 1, (item) => item.event === 'call'),
          },
          {
            id: 'output',
            label: 'Next printed output',
            step: findStep(
              trace,
              current,
              1,
              (item, index) =>
                index > 0 && item.out > (trace.steps[index - 1]?.out ?? 0),
            ),
          },
          ...(watched !== null
            ? [
                {
                  id: 'watch',
                  label: `Next change of ${watched.split(':').slice(1).join(':')}`,
                  step: findStep(trace, current, 1, (_, index) =>
                    changesAt(trace, index).some(
                      (change) =>
                        changeKey(change.frame, change.name) === watched,
                    ),
                  ),
                },
              ]
            : []),
          ...(trace.warnings.length > 0
            ? [
                {
                  id: 'warning',
                  label: 'Next warning',
                  step: findStep(
                    trace,
                    current,
                    1,
                    (item) => item.notes !== undefined,
                  ),
                  tone: 'warning' as const,
                },
              ]
            : []),
        ]

  const backLink =
    context?.source === 'doubt_helper' && context.sessionId !== undefined
      ? {
          to: `/doubt-helper/${context.sessionId}`,
          label: 'Back to Doubt Helper',
        }
      : context?.source === 'solution_explorer' &&
          context.problem?.url !== undefined
        ? {
            to: mentorToolPath('solution_explorer', context.problem.url),
            label: 'Back to Solution Explorer',
          }
        : null

  const contextBar =
    context !== null ? (
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          From{' '}
          {context.source === 'doubt_helper'
            ? 'Doubt Helper'
            : 'Solution Explorer'}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">
          {context.problem?.title ?? 'Your problem'}
          {context.approach !== undefined ? (
            <span className="text-muted-foreground"> · {context.approach}</span>
          ) : null}
        </span>
        {backLink !== null ? (
          <Link
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            to={backLink.to}
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            {backLink.label}
          </Link>
        ) : null}
        <button
          aria-label="Clear the problem context"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setContext(null)}
          type="button"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    ) : null

  const loading =
    phase !== null ? (
      <div
        className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-lift"
        role="status"
      >
        <AiLoader
          steps={loadingSteps[phase]}
          title={phase === 'loading' ? 'Preparing Python' : 'Running your code'}
        />
        <Button
          className="self-start"
          onClick={() => runner.cancel()}
          type="button"
          variant="outline"
        >
          Stop
        </Button>
      </div>
    ) : null

  const verdict = trace === null ? null : verdictOf(trace, comparison)
  const noSteps = trace !== null && trace.steps.length === 0
  const error = trace?.error

  const tabs: { id: PageView; label: string; disabled: boolean }[] = [
    { id: 'code', label: 'Code', disabled: false },
    { id: 'examples', label: 'Examples', disabled: false },
    { id: 'visualize', label: 'Visualization', disabled: result === null },
  ]

  const tabIcons: Record<PageView, ReactNode> = {
    code: <Code2 aria-hidden="true" className="size-3.5" />,
    examples: <BookOpen aria-hidden="true" className="size-3.5" />,
    visualize: <PlayIcon aria-hidden="true" className="size-3.5" />,
  }

  const header = (
    <PageHero
      actions={
        <div
          aria-label="Visualizer sections"
          className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1"
          role="tablist"
        >
          {tabs.map((tab) => (
            <button
              aria-controls={`visualizer-panel-${tab.id}`}
              aria-selected={view === tab.id}
              className={cn(
                'relative inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                view === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              disabled={tab.disabled}
              id={`visualizer-tab-${tab.id}`}
              key={tab.id}
              onClick={() => {
                setPlaying(false)
                setView(tab.id)
              }}
              role="tab"
              type="button"
            >
              {view === tab.id ? (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg border border-border bg-card shadow-soft"
                  layoutId="visualizer-tab"
                />
              ) : null}
              <span className="relative inline-flex items-center gap-2">
                {tabIcons[tab.id]}
                {tab.label}
                {tab.id === 'visualize' && verdict !== null ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      verdict.tone === 'ok' && 'bg-go',
                      verdict.tone === 'bad' && 'bg-destructive',
                      verdict.tone === 'neutral' && 'bg-muted-foreground',
                    )}
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      }
      info="Run your C++, Java or Python code on a test case and watch every array, pointer, stack, queue, map, tree, graph and recursive call move step by step. Code runs only in this browser tab. The AI Debugger shows where it goes wrong."
      subtitle="Watch your code run on a test case, step by step."
      title="Test Case Visualizer"
    >
      {result === null && view === 'code' ? <ShapeMarquee /> : null}
    </PageHero>
  )

  let panel: ReactNode
  if (view === 'code' || result === null) {
    panel =
      view === 'examples' ? (
        <ExampleGallery
          language={language}
          onLanguage={chooseLanguage}
          onOpen={openExample}
        />
      ) : (
        <CodeComposer
          code={code}
          expected={expected}
          input={input}
          language={language}
          onCode={setCode}
          onExpected={setExpected}
          onInput={setInput}
          onLanguage={chooseLanguage}
          onRun={run}
          runError={runError}
          {...(result === null ? {} : { onBack: () => setView('visualize') })}
        />
      )
  } else if (view === 'examples') {
    panel = (
      <ExampleGallery
        language={language}
        onLanguage={chooseLanguage}
        onOpen={openExample}
      />
    )
  } else {
    const problem =
      context?.problem === undefined
        ? undefined
        : {
            ...(context.problem.title === undefined
              ? {}
              : { title: context.problem.title }),
            ...(context.problem.url === undefined
              ? {}
              : { url: context.problem.url }),
          }
    panel = (
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {visualizerLanguageLabels[result.language]}
          </span>
          {verdict !== null ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                verdict.tone === 'ok' && 'bg-go-soft text-go-foreground',
                verdict.tone === 'bad' &&
                  'bg-danger-soft text-danger-foreground',
                verdict.tone === 'neutral' && 'bg-secondary text-foreground',
              )}
            >
              {verdict.label}
            </span>
          ) : null}
          {trace !== null ? (
            <span className="text-xs text-muted-foreground">
              {trace.steps.length.toLocaleString()} steps
              {trace.totalSteps > trace.steps.length
                ? ` of ${trace.totalSteps.toLocaleString()}`
                : ''}{' '}
              · {Math.max(1, Math.round(trace.durationMs)).toLocaleString()} ms
            </span>
          ) : null}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Legend />
            <Button
              onClick={() => {
                setPlaying(false)
                setView('code')
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Pencil aria-hidden="true" /> Edit code &amp; input
            </Button>
            <Button
              onClick={() => void execute(result)}
              size="sm"
              type="button"
            >
              <RefreshCw aria-hidden="true" /> Run again
            </Button>
          </span>
        </div>

        {error !== undefined && !noSteps ? (
          <p className="rounded-xl border border-destructive/30 bg-danger-soft px-4 py-2.5 text-sm text-danger-foreground">
            <span className="font-semibold">{error.title}:</span>{' '}
            {error.message}
            {error.line !== undefined ? ` (line ${error.line})` : ''}.
            Everything before it is recorded; jump to it from the playback bar.
          </p>
        ) : null}
        {trace?.truncated === true ? (
          <p className="rounded-xl border border-border bg-secondary/60 px-4 py-2.5 text-sm text-secondary-foreground">
            Recording stopped after {trace.steps.length.toLocaleString()} steps
            to keep things smooth
            {error === undefined
              ? '; the program kept running, so the output is complete.'
              : '.'}{' '}
            Use a smaller input to see every step.
          </p>
        ) : null}
        {!tipDismissed && !noSteps ? (
          <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-2.5 text-sm text-foreground">
            <Sparkles
              aria-hidden="true"
              className="size-4 shrink-0 text-primary"
            />
            <span className="min-w-0 flex-1">
              Press{' '}
              <kbd className="rounded border border-border bg-card px-1 font-mono text-xs">
                Space
              </kbd>{' '}
              to play,{' '}
              <kbd className="rounded border border-border bg-card px-1 font-mono text-xs">
                ←
              </kbd>{' '}
              <kbd className="rounded border border-border bg-card px-1 font-mono text-xs">
                →
              </kbd>{' '}
              to step. Click a variable to pause whenever it changes.
            </span>
            <button
              aria-label="Dismiss the tip"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setTipDismissed(true)
                try {
                  window.localStorage.setItem(TIP_KEY, '1')
                } catch {
                  // Storage may be unavailable; the tip just shows again.
                }
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        ) : null}

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            {noSteps && trace !== null ? (
              <section className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-danger-soft p-5 text-danger-foreground">
                <h2 className="text-lg font-semibold">
                  {error?.title ?? 'The code did not run'}
                </h2>
                <p className="text-sm leading-6">
                  {error?.message}
                  {error?.line !== undefined ? ` (line ${error.line})` : ''}
                </p>
                {error?.kind === 'unsupported' ? (
                  <p className="text-sm leading-6">
                    The visualizer runs a large part of each language, but not
                    everything yet. Rewrite this part, or try the solution in
                    another language.
                  </p>
                ) : null}
                <Button
                  className="self-start"
                  onClick={() => setView('code')}
                  type="button"
                  variant="outline"
                >
                  <Pencil aria-hidden="true" /> Edit code
                </Button>
              </section>
            ) : scene !== null && step !== undefined ? (
              <Stage
                callTree={calls}
                key={result.id}
                line={step.line}
                onSelectCall={(frame) => {
                  const node =
                    trace === null
                      ? undefined
                      : callTree(trace).nodes.get(frame)
                  if (node !== undefined) {
                    setPlaying(false)
                    select(node.callStep)
                  }
                }}
                onWatch={setWatched}
                scene={scene}
                stepKey={current}
                watched={watched}
              />
            ) : null}

            {trace !== null && !noSteps ? (
              <Transport
                current={current}
                importantOnly={importantOnly}
                jumps={jumps}
                markers={markers}
                onImportantOnly={setImportantOnly}
                onNext={() => {
                  const target = move(1)
                  if (target !== null) setCurrent(target)
                }}
                onPrevious={() => {
                  const target = move(-1)
                  if (target !== null) setCurrent(target)
                }}
                onSeek={(index) => {
                  setPlaying(false)
                  select(index)
                }}
                onSpeed={setSpeed}
                onTogglePlay={() => {
                  if (!playing && current >= lastIndex) setCurrent(0)
                  setPlaying((value) => !value)
                }}
                playing={playing}
                speed={speed}
                total={steps.length}
              />
            ) : null}

            <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <section
                aria-labelledby="code-heading"
                className="min-w-0 scroll-mt-24 rounded-2xl border border-border bg-card p-4 shadow-soft"
                ref={codeRef}
              >
                <h2
                  className="mb-2 text-sm font-semibold text-foreground"
                  id="code-heading"
                >
                  Code
                </h2>
                <CodeView
                  breakpoints={breakpoints}
                  className="h-[22rem] max-h-none"
                  code={result.code}
                  condition={step?.cond}
                  currentLine={
                    step === undefined || step.event === 'error'
                      ? null
                      : step.line
                  }
                  errorLine={
                    step?.event === 'error'
                      ? step.line
                      : noSteps
                        ? (error?.line ?? null)
                        : null
                  }
                  flagged={flagged}
                  focusLine={focusLine}
                  hits={hits}
                  language={result.language}
                  onToggleBreakpoint={(line) =>
                    setBreakpoints((currentSet) => {
                      const next = new Set(currentSet)
                      if (next.has(line)) next.delete(line)
                      else next.add(line)
                      return next
                    })
                  }
                  previousLine={
                    previousStep !== undefined &&
                    step !== undefined &&
                    previousStep.line !== step.line
                      ? previousStep.line
                      : null
                  }
                />
              </section>
              {trace !== null && !noSteps ? (
                <IoPanel
                  comparison={comparison}
                  current={current}
                  expected={result.expected}
                  input={result.input}
                  onSelect={select}
                  trace={trace}
                />
              ) : null}
            </div>
          </div>
          <div className="min-w-0 lg:sticky lg:top-[calc(var(--app-header)+1rem)] lg:max-h-[calc(100dvh-var(--app-header)-2rem)] lg:overflow-y-auto lg:rounded-2xl">
            {trace === null ? null : (
              <AiDebugger
                comparison={comparison}
                current={Math.min(current, lastIndex)}
                doubtHelperLabel={
                  context?.source === 'doubt_helper' &&
                  context.sessionId !== undefined
                    ? 'Ask Doubt Helper about this step'
                    : 'Open this step in Doubt Helper'
                }
                key={result.id}
                onFindings={setFindings}
                onJump={(index) => {
                  setPlaying(false)
                  select(index)
                }}
                onLine={showLine}
                onOpenDoubtHelper={askDoubtHelper}
                onTryInput={(next) => {
                  setInput(next)
                  setExpected('')
                  void execute({
                    language: result.language,
                    code: result.code,
                    input: next,
                    expected: '',
                  })
                }}
                run={result}
                sourceLines={sourceLines}
                {...(problem === undefined ? {} : { problem })}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 36,
        mass: 0.7,
        duration: Math.min(0.45, 0.9 / speed),
      }}
    >
      <PageContainer accent="violet" className="gap-5">
        {header}
        {contextBar}
        <div
          aria-labelledby={`visualizer-tab-${result === null && view === 'visualize' ? 'code' : view}`}
          id={`visualizer-panel-${view}`}
          role="tabpanel"
        >
          {panel}
        </div>
        {loading}
      </PageContainer>
    </MotionConfig>
  )
}

export default TestCaseVisualizerPage
