import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import {
  ArrowLeft,
  Code2,
  Lock,
  MessageCircle,
  Pencil,
  RefreshCw,
  X,
} from '@/components/icons/algo-icons'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/features/mentor/format'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import {
  changeKey,
  changesAt,
  compareOutput,
  findStep,
  importantSteps,
  stepContext,
} from '@/features/visualizer/analysis'
import { CodeEditor } from '@/features/visualizer/components/CodeEditor'
import { CodeView } from '@/features/visualizer/components/CodeView'
import { IoPanel } from '@/features/visualizer/components/IoPanel'
import { PlaybackBar } from '@/features/visualizer/components/PlaybackBar'
import type {
  JumpTarget,
  Speed,
} from '@/features/visualizer/components/playback'
import { StepCard } from '@/features/visualizer/components/StepCard'
import { StructuresPanel } from '@/features/visualizer/components/StructuresPanel'
import { TimelinePanel } from '@/features/visualizer/components/TimelinePanel'
import { VariablesPanel } from '@/features/visualizer/components/VariablesPanel'
import {
  defaultExample,
  edgeCaseIdeas,
  visualizerExamples,
} from '@/features/visualizer/examples'
import {
  CODE_LIMIT,
  INPUT_LIMIT,
  contextOf,
  loadDraft,
  mentorLanguageFor,
  readVisualizerHandoff,
  saveDraft,
  type VisualizerContext,
  type VisualizerDraft,
} from '@/features/visualizer/handoff'
import { TraceRunnerError } from '@/features/visualizer/run-trace'
import {
  defaultTraceLimits,
  visualizerLanguageLabels,
  type ExecutionTrace,
  type VisualizerLanguage,
} from '@/features/visualizer/trace'
import { useTraceRunner } from '@/features/visualizer/use-trace-runner'
import type { RunPhase } from '@/features/visualizer/worker/protocol'
import { cn } from '@/lib/utils'

type RunResult = {
  trace: ExecutionTrace
  code: string
  input: string
  expected: string
  language: VisualizerLanguage
}

const languages: readonly VisualizerLanguage[] = ['cpp', 'python']

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

function initialDraft(state: unknown): VisualizerDraft {
  const handoff = readVisualizerHandoff(state)
  if (handoff !== null) {
    return {
      language: handoff.language,
      code: handoff.code,
      input: handoff.input ?? '',
      expected: handoff.expected ?? '',
      context: contextOf(handoff),
    }
  }
  const draft = loadDraft()
  if (draft !== null) return draft
  const example = defaultExample('cpp')
  return {
    language: example.language,
    code: example.code,
    input: example.input,
    expected: example.expected,
    context: null,
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
  const [view, setView] = useState<'edit' | 'visualize'>('edit')
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(4)
  const [importantOnly, setImportantOnly] = useState(false)
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(new Set())
  const [watched, setWatched] = useState<string | null>(null)

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

  const lastIndex = Math.max(0, steps.length - 1)

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

  const select = (index: number) => {
    setCurrent(Math.min(lastIndex, Math.max(0, index)))
  }

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

  useEffect(() => {
    if (view !== 'visualize' || trace === null) return
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

  function chooseLanguage(next: VisualizerLanguage) {
    if (next === language) return
    setLanguage(next)
    if (next === 'python') runner.warmup('python')
    const untouched =
      visualizerExamples.some((example) => example.code === code) ||
      code.trim() === ''
    if (untouched) {
      const example = defaultExample(next)
      setCode(example.code)
      setInput(example.input)
      setExpected(example.expected)
      setContext(null)
    }
  }

  function loadExample(id: string) {
    const example = visualizerExamples.find((item) => item.id === id)
    if (example === undefined) return
    setLanguage(example.language)
    setCode(example.code)
    setInput(example.input)
    setExpected(example.expected)
    setContext(null)
    if (example.language === 'python') runner.warmup('python')
  }

  async function run(event?: FormEvent) {
    event?.preventDefault()
    if (phase !== null) return
    if (code.trim() === '') {
      setRunError('Write or paste some code first.')
      return
    }
    setRunError(null)
    setPlaying(false)
    setPhase(language === 'python' ? 'loading' : 'running')
    try {
      const nextTrace = await runner.run(
        { language, code, input, limits: defaultTraceLimits },
        setPhase,
      )
      setResult({ trace: nextTrace, code, input, expected, language })
      setCurrent(0)
      setWatched(null)
      setView('visualize')
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
    }
  }

  const step = trace?.steps[current]
  const previousStep = current > 0 ? trace?.steps[current - 1] : undefined
  const firstError =
    trace === null
      ? null
      : trace.steps.findIndex((item) => item.event === 'error')
  const jumps: JumpTarget[] =
    trace === null
      ? []
      : [
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
            label: 'Next branch',
            step: findStep(
              trace,
              current,
              1,
              (item) => item.cond !== undefined && item.loop === undefined,
            ),
          },
          {
            id: 'iteration',
            label: 'Next iteration',
            step: findStep(
              trace,
              current,
              1,
              (item) => item.loop !== undefined,
            ),
          },
          {
            id: 'call',
            label: 'Next call',
            step: findStep(trace, current, 1, (item) => item.event === 'call'),
          },
          {
            id: 'output',
            label: 'Next output',
            step: findStep(
              trace,
              current,
              1,
              (item, index) =>
                index > 0 && item.out > (trace.steps[index - 1]?.out ?? 0),
            ),
          },
          ...(breakpoints.size > 0
            ? [
                {
                  id: 'breakpoint',
                  label: 'Next breakpoint',
                  step: findStep(trace, current, 1, (item) =>
                    breakpoints.has(item.line),
                  ),
                },
              ]
            : []),
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
          ...(firstError !== null && firstError >= 0
            ? [
                {
                  id: 'error',
                  label: 'Error',
                  step: firstError,
                  tone: 'danger' as const,
                },
              ]
            : []),
        ]

  function askAboutStep() {
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

  return (
    <PageContainer className="gap-6">
      <PageHeader
        description="Run your code on a test case and follow it step by step: the current line, every variable, arrays and other structures, and the output as it is printed."
        title="Test Case Visualizer"
      />

      {context !== null ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            From{' '}
            {context.source === 'doubt_helper'
              ? 'Doubt Helper'
              : 'Solution Explorer'}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {context.problem?.title ?? 'Your problem'}
            {context.approach !== undefined ? (
              <span className="text-muted-foreground">
                {' '}
                · {context.approach}
              </span>
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
      ) : null}

      {phase !== null ? (
        <div
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
          role="status"
        >
          <AiLoader
            steps={loadingSteps[phase]}
            title={
              phase === 'loading' ? 'Preparing Python' : 'Running your code'
            }
          />
          <div>
            <Button
              onClick={() => runner.cancel()}
              type="button"
              variant="outline"
            >
              Stop
            </Button>
          </div>
        </div>
      ) : view === 'edit' || result === null ? (
        <EditorForm
          code={code}
          expected={expected}
          input={input}
          language={language}
          onChooseLanguage={chooseLanguage}
          onCode={setCode}
          onExample={loadExample}
          onExpected={setExpected}
          onInput={setInput}
          onRun={(event) => void run(event)}
          onShowLast={result === null ? undefined : () => setView('visualize')}
          runError={runError}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <RunSummary
            comparison={comparison}
            onEdit={() => {
              setPlaying(false)
              setView('edit')
            }}
            onRerun={() => void run()}
            result={result}
          />
          {trace !== null && trace.steps.length === 0 ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <CodeView
                breakpoints={breakpoints}
                code={result.code}
                condition={undefined}
                currentLine={null}
                errorLine={trace.error?.line ?? null}
                hits={new Map()}
                language={result.language}
                onToggleBreakpoint={() => undefined}
                previousLine={null}
              />
              <section className="rounded-xl border border-destructive/40 bg-danger-soft p-4 text-danger-foreground">
                <h2 className="text-base font-semibold">
                  {trace.error?.title ?? 'The code did not run'}
                </h2>
                <p className="mt-1 text-sm leading-6">
                  {trace.error?.message}
                  {trace.error?.line !== undefined
                    ? ` (line ${trace.error.line})`
                    : ''}
                </p>
                {trace.error?.kind === 'unsupported' ? (
                  <p className="mt-2 text-sm leading-6">
                    The C++ visualizer runs a large subset of contest C++. You
                    can rewrite this part, or try the Python version of your
                    solution.
                  </p>
                ) : null}
                <Button
                  className="mt-3"
                  onClick={() => setView('edit')}
                  type="button"
                  variant="outline"
                >
                  <Pencil aria-hidden="true" /> Edit code
                </Button>
              </section>
            </div>
          ) : trace !== null && step !== undefined ? (
            <>
              <PlaybackBar
                current={current}
                importantOnly={importantOnly}
                jumps={jumps}
                onImportantOnly={setImportantOnly}
                onNext={() => {
                  const target = move(1)
                  if (target !== null) setCurrent(target)
                }}
                onPrevious={() => {
                  const target = move(-1)
                  if (target !== null) setCurrent(target)
                }}
                onSelect={(index) => {
                  setPlaying(false)
                  select(index)
                }}
                onSpeed={setSpeed}
                onTogglePlay={() => setPlaying((value) => !value)}
                playing={playing}
                speed={speed}
                total={steps.length}
              />
              <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--app-header)+1rem)]">
                  <CodeView
                    breakpoints={breakpoints}
                    code={result.code}
                    condition={step.cond}
                    currentLine={step.event === 'error' ? null : step.line}
                    errorLine={step.event === 'error' ? step.line : null}
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
                      previousStep.line !== step.line
                        ? previousStep.line
                        : null
                    }
                  />
                  <StepCard
                    action={
                      <>
                        <Button
                          onClick={askAboutStep}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <MessageCircle aria-hidden="true" />
                          {context?.source === 'doubt_helper' &&
                          context.sessionId !== undefined
                            ? 'Ask Doubt Helper about this step'
                            : 'Get help with this step'}
                        </Button>
                      </>
                    }
                    current={current}
                    sourceLines={sourceLines}
                    trace={trace}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <VariablesPanel
                    current={current}
                    onWatch={setWatched}
                    trace={trace}
                    watched={watched}
                  />
                  <StructuresPanel current={current} trace={trace} />
                  <IoPanel
                    comparison={comparison}
                    current={current}
                    expected={result.expected}
                    input={result.input}
                    onSelect={select}
                    trace={trace}
                  />
                  <TimelinePanel
                    current={current}
                    important={importantOnly ? important : null}
                    sourceLines={sourceLines}
                    onSelect={(index) => {
                      setPlaying(false)
                      select(index)
                    }}
                    trace={trace}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </PageContainer>
  )
}

function EditorForm({
  language,
  code,
  input,
  expected,
  runError,
  onChooseLanguage,
  onCode,
  onInput,
  onExpected,
  onExample,
  onRun,
  onShowLast,
}: {
  language: VisualizerLanguage
  code: string
  input: string
  expected: string
  runError: string | null
  onChooseLanguage: (language: VisualizerLanguage) => void
  onCode: (value: string) => void
  onInput: (value: string) => void
  onExpected: (value: string) => void
  onExample: (id: string) => void
  onRun: (event: FormEvent) => void
  onShowLast: (() => void) | undefined
}) {
  return (
    <form
      className="grid min-w-0 gap-5 rounded-xl border border-border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
      noValidate
      onSubmit={onRun}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium text-foreground">
              Language
            </legend>
            <div className="mt-2 flex gap-2">
              {languages.map((choice) => (
                <button
                  aria-pressed={language === choice}
                  className={cn(
                    'h-9 rounded-md border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    language === choice
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-foreground/75 hover:bg-secondary',
                  )}
                  key={choice}
                  onClick={() => onChooseLanguage(choice)}
                  type="button"
                >
                  {visualizerLanguageLabels[choice]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Load an example
            <select
              className="h-9 max-w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              onChange={(event) => {
                onExample(event.target.value)
                event.target.value = ''
              }}
              value=""
            >
              <option disabled value="">
                Choose…
              </option>
              {languages.map((choice) => (
                <optgroup key={choice} label={visualizerLanguageLabels[choice]}>
                  {visualizerExamples
                    .filter((example) => example.language === choice)
                    .map((example) => (
                      <option key={example.id} value={example.id}>
                        {example.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <CodeEditor
          describedBy="visualizer-code-help"
          id="visualizer-code"
          label="Your code"
          maxLength={CODE_LIMIT}
          onChange={onCode}
          placeholder={
            language === 'cpp'
              ? '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n}'
              : 'n = int(input())'
          }
          value={code}
        />
        <p
          className="text-xs leading-5 text-muted-foreground"
          id="visualizer-code-help"
        >
          {language === 'cpp'
            ? 'C++ runs in a step-by-step interpreter for contest C++: STL containers, strings, structs, lambdas, recursion and macros. Pointers and a few rarer features are not supported yet. Tab indents; press Esc, then Tab, to leave the editor.'
            : 'Python runs real CPython 3.14 in your browser, with the standard library. Tab indents; press Esc, then Tab, to leave the editor.'}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          Test input
          <textarea
            className={cn(inputClass, 'min-h-36 resize-y font-mono text-xs')}
            maxLength={INPUT_LIMIT}
            onChange={(event) => onInput(event.target.value)}
            placeholder="The exact input your program reads."
            spellCheck={false}
            value={input}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          <span>
            Expected output{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </span>
          <textarea
            className={cn(inputClass, 'min-h-24 resize-y font-mono text-xs')}
            maxLength={INPUT_LIMIT}
            onChange={(event) => onExpected(event.target.value)}
            placeholder="If you know the right answer, the visualizer finds the step where the output first goes wrong."
            spellCheck={false}
            value={expected}
          />
        </label>
        <details className="rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Edge cases worth trying
          </summary>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-xs leading-5 text-muted-foreground">
            {edgeCaseIdeas.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
          </ul>
        </details>
        {runError !== null ? (
          <p
            className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
            role="alert"
          >
            {runError}
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-3">
          <Button size="lg" type="submit">
            <Code2 aria-hidden="true" /> Run &amp; visualize
          </Button>
          {onShowLast !== undefined ? (
            <Button onClick={onShowLast} type="button" variant="outline">
              Back to the last run
            </Button>
          ) : null}
          <p className="inline-flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Your code runs only in this browser tab and is not sent to or stored
            by AlgoMemtor. Up to {defaultTraceLimits.maxSteps.toLocaleString()}{' '}
            steps are recorded and runs stop after{' '}
            {defaultTraceLimits.timeMs / 1000} seconds.
          </p>
        </div>
      </div>
    </form>
  )
}

function RunSummary({
  result,
  comparison,
  onEdit,
  onRerun,
}: {
  result: RunResult
  comparison: ReturnType<typeof compareOutput> | null
  onEdit: () => void
  onRerun: () => void
}) {
  const { trace } = result
  const error = trace.error
  const verdict =
    error === undefined
      ? comparison === null
        ? { label: 'Finished', tone: 'ok' }
        : comparison.status === 'match'
          ? { label: 'Output matches', tone: 'ok' }
          : { label: 'Wrong output', tone: 'bad' }
      : {
          label:
            error.kind === 'compile'
              ? 'Does not compile'
              : error.kind === 'unsupported'
                ? 'Not supported'
                : error.kind === 'timeout'
                  ? 'Time limit'
                  : error.kind === 'recursion'
                    ? 'Recursion too deep'
                    : error.kind === 'output_limit'
                      ? 'Too much output'
                      : error.kind === 'memory'
                        ? 'Memory limit'
                        : 'Runtime error',
          tone: 'bad',
        }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <span
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-semibold',
            verdict.tone === 'ok'
              ? 'bg-go-soft text-go-foreground'
              : 'bg-danger-soft text-danger-foreground',
          )}
        >
          {verdict.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {visualizerLanguageLabels[result.language]} ·{' '}
          {trace.steps.length.toLocaleString()} steps recorded
          {trace.totalSteps > trace.steps.length
            ? ` of ${trace.totalSteps.toLocaleString()} run`
            : ''}{' '}
          · {Math.max(1, Math.round(trace.durationMs)).toLocaleString()} ms
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button onClick={onEdit} size="sm" type="button" variant="outline">
            <Pencil aria-hidden="true" /> Edit code and input
          </Button>
          <Button onClick={onRerun} size="sm" type="button" variant="ghost">
            <RefreshCw aria-hidden="true" /> Run again
          </Button>
        </span>
      </div>
      {error !== undefined && trace.steps.length > 0 ? (
        <p className="rounded-lg border border-destructive/30 bg-danger-soft px-4 py-2.5 text-sm text-danger-foreground">
          <span className="font-semibold">{error.title}:</span> {error.message}
          {error.line !== undefined ? ` (line ${error.line})` : ''} Everything
          before it is recorded below.
        </p>
      ) : null}
      {trace.truncated ? (
        <p className="rounded-lg border border-border bg-secondary/60 px-4 py-2.5 text-sm text-secondary-foreground">
          Recording stopped after {trace.steps.length.toLocaleString()} steps to
          keep the timeline usable
          {error === undefined
            ? '; the program kept running, so the output is complete.'
            : '.'}{' '}
          Try a smaller input to see every step.
        </p>
      ) : null}
      {trace.warnings.length > 0 ? (
        <details className="rounded-lg border border-amber-500/40 bg-amber-100 px-4 py-2.5 text-sm text-amber-950 dark:bg-amber-400/15 dark:text-amber-100">
          <summary className="cursor-pointer font-medium">
            {trace.warnings.length} warning
            {trace.warnings.length === 1 ? '' : 's'} during the run
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {trace.warnings.map((warning) => (
              <li key={`${warning.step}-${warning.message}`}>
                {warning.line > 0 ? `Line ${warning.line}: ` : ''}
                {warning.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export default TestCaseVisualizerPage
