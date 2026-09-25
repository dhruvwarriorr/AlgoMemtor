import type {
  VisualizerDebugResult,
  VisualizerDebugTurn,
  VisualizerFinding,
} from '@algomemtor/shared-contracts'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState, type FormEvent } from 'react'

import {
  Lightbulb,
  Lock,
  MessageCircle,
  Send,
  Sparkles,
} from '@/components/icons/algo-icons'
import { AiLoader } from '@/components/motion/AiLoader'
import { Button } from '@/components/ui/button'
import {
  CodeBlockView,
  CoachMessageContent,
} from '@/features/coach/components/CoachMessageContent'
import { mentorErrorMessage } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

import type { OutputComparison } from '../analysis'
import type { ExecutionTrace, VisualizerLanguage } from '../trace'
import { useVisualizerDebug } from './api'
import { traceDigest } from './digest'

export type DebugRun = {
  trace: ExecutionTrace
  code: string
  input: string
  expected: string
  language: VisualizerLanguage
}

type ChatTurn = {
  role: 'learner' | 'mentor'
  content: string
  step?: number
  result?: VisualizerDebugResult
}

const verdictStyle: Record<
  VisualizerDebugResult['verdict'],
  { label: string; className: string }
> = {
  bug_found: { label: 'Bug found', className: 'bg-destructive text-white' },
  error_explained: {
    label: 'Error explained',
    className: 'bg-destructive text-white',
  },
  looks_correct: {
    label: 'Looks correct',
    className: 'bg-go text-white dark:text-go-soft',
  },
  needs_expected_output: {
    label: 'Needs the expected output',
    className: 'bg-amber-500 text-white dark:text-amber-950',
  },
  unsure: { label: 'Not sure yet', className: 'bg-secondary text-foreground' },
}

const categoryLabel: Record<VisualizerFinding['category'], string> = {
  logic: 'Logic',
  off_by_one: 'Off by one',
  overflow: 'Overflow',
  boundary: 'Edge case',
  initialization: 'Initialisation',
  wrong_condition: 'Condition',
  input_output: 'Input / output',
  runtime_error: 'Runtime error',
  complexity: 'Too slow',
  other: 'Other',
}

const fenceLanguage: Record<VisualizerLanguage, string> = {
  cpp: 'cpp',
  java: 'java',
  python: 'python',
}

function FindingCard({
  finding,
  language,
  onLine,
  onStep,
  index,
  steps,
}: {
  finding: VisualizerFinding
  steps: number
  language: VisualizerLanguage
  onLine: (line: number) => void
  onStep: (step: number) => void
  index: number
}) {
  const [showFix, setShowFix] = useState(false)
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border bg-card p-3',
        finding.severity === 'bug'
          ? 'border-destructive/40'
          : finding.severity === 'risk'
            ? 'border-amber-400/60'
            : 'border-border',
      )}
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: index * 0.06 }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            finding.severity === 'bug'
              ? 'bg-danger-soft text-danger-foreground'
              : finding.severity === 'risk'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {finding.severity === 'bug'
            ? 'Bug'
            : finding.severity === 'risk'
              ? 'Risk'
              : 'Note'}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {categoryLabel[finding.category]}
        </span>
        <span className="ml-auto flex gap-1">
          <button
            className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onLine(finding.line)}
            title="Show this line"
            type="button"
          >
            L{finding.line}
            {finding.endLine !== undefined ? `–${finding.endLine}` : ''}
          </button>
          {finding.step !== undefined && finding.step <= steps ? (
            <button
              className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onStep(finding.step as number)}
              title="Jump the visualizer to this step"
              type="button"
            >
              step {finding.step}
            </button>
          ) : null}
        </span>
      </div>
      <h4 className="text-sm font-semibold leading-snug text-foreground">
        {finding.title}
      </h4>
      <p className="text-[13px] leading-6 text-foreground/85">
        {finding.explanation}
      </p>
      <p className="flex gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[13px] leading-5 text-amber-950 dark:bg-amber-400/10 dark:text-amber-50">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-semibold">Hint: </span>
          {finding.hint}
        </span>
      </p>
      {finding.fix !== undefined ? (
        showFix ? (
          <div className="flex flex-col gap-2">
            <CodeBlockView
              code={finding.fix.code}
              language={fenceLanguage[language]}
            />
            <p className="text-[13px] leading-5 text-muted-foreground">
              {finding.fix.explanation}
            </p>
          </div>
        ) : (
          <Button
            className="self-start"
            onClick={() => setShowFix(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Show the fix
          </Button>
        )
      ) : null}
    </motion.li>
  )
}

function ResultView({
  result,
  steps,
  language,
  onLine,
  onStep,
  onTryInput,
  onAsk,
}: {
  result: VisualizerDebugResult
  steps: number
  language: VisualizerLanguage
  onLine: (line: number) => void
  onStep: (step: number) => void
  onTryInput: (input: string) => void
  onAsk: (question: string) => void
}) {
  const verdict = verdictStyle[result.verdict]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span
          className={cn(
            'self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
            verdict.className,
          )}
        >
          {verdict.label}
        </span>
        <p className="text-[15px] font-semibold leading-snug text-foreground">
          {result.headline}
        </p>
        {result.answer === undefined ? (
          <p className="text-[13px] leading-6 text-foreground/80">
            {result.summary}
          </p>
        ) : (
          <CoachMessageContent content={result.answer} role="assistant" />
        )}
      </div>
      {result.findings.length > 0 ? (
        <ol className="flex flex-col gap-2.5">
          {result.findings.map((finding, index) => (
            <FindingCard
              finding={finding}
              index={index}
              key={`${finding.line}-${finding.title}`}
              language={language}
              onLine={onLine}
              onStep={onStep}
              steps={steps}
            />
          ))}
        </ol>
      ) : null}
      {result.suggestedTests.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inputs worth trying
          </h4>
          {result.suggestedTests.map((test, index) => (
            <div
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-secondary/30 p-2.5"
              key={index}
            >
              <p className="text-xs leading-5 text-foreground/85">
                {test.reason}
              </p>
              <pre className="max-h-24 overflow-auto rounded-md bg-card px-2 py-1.5 font-mono text-[11px] text-foreground">
                {test.input || '(empty input)'}
              </pre>
              <Button
                className="self-start"
                onClick={() => onTryInput(test.input)}
                size="sm"
                type="button"
                variant="outline"
              >
                Visualize with this input
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {result.followUps.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {result.followUps.map((question) => (
            <button
              className="rounded-full border border-border bg-card px-2.5 py-1 text-left text-xs text-foreground hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={question}
              onClick={() => onAsk(question)}
              type="button"
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const starterQuestions = [
  'Why did this value change here?',
  'Is this condition doing what I want?',
  'What should happen at this step instead?',
]

export function AiDebugger({
  run,
  current,
  sourceLines,
  comparison,
  problem,
  onJump,
  onLine,
  onTryInput,
  onOpenDoubtHelper,
  doubtHelperLabel,
  onFindings,
}: {
  run: DebugRun
  current: number
  sourceLines: readonly string[]
  comparison: OutputComparison | null
  problem?: { title?: string; url?: string }
  onJump: (index: number) => void
  onLine: (line: number) => void
  onTryInput: (input: string) => void
  onOpenDoubtHelper: () => void
  doubtHelperLabel: string
  onFindings?: (findings: VisualizerFinding[]) => void
}) {
  const mutation = useVisualizerDebug()
  const [diagnosis, setDiagnosis] = useState<VisualizerDebugResult | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'diagnose' | 'ask' | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const trace = run.trace
  const failed = trace.error !== undefined
  const wrong = comparison?.status === 'mismatch'
  const step = trace.steps[current]
  const hasExpected = run.expected.trim() !== ''

  const history = useMemo<VisualizerDebugTurn[]>(
    () =>
      turns.slice(-10).map((turn) => ({
        role: turn.role,
        content: turn.content.slice(0, 6_000),
      })),
    [turns],
  )

  const toStep = (step: number) =>
    onJump(Math.max(0, Math.min(trace.steps.length - 1, step - 1)))

  async function send(mode: 'diagnose' | 'ask', text?: string) {
    if (pending !== null) return
    setError(null)
    setPending(mode)
    const focus = mode === 'ask' ? current : failed || wrong ? null : current
    try {
      const response = await mutation.mutateAsync({
        mode,
        language: run.language,
        code: run.code,
        input: run.input,
        ...(mode === 'ask' && text !== undefined ? { question: text } : {}),
        ...(mode === 'ask' && history.length > 0 ? { history } : {}),
        ...(problem !== undefined &&
        (problem.title !== undefined || problem.url !== undefined)
          ? { problem }
          : {}),
        digest: traceDigest(trace, sourceLines, run.expected, focus),
      })
      if (response.data.findings.length > 0 || mode === 'diagnose') {
        onFindings?.(response.data.findings)
      }
      if (mode === 'diagnose') {
        setDiagnosis(response.data)
      } else {
        setTurns((currentTurns) => [
          ...currentTurns,
          { role: 'learner', content: text ?? '', step: current },
          {
            role: 'mentor',
            content: response.data.answer ?? response.data.summary,
            result: response.data,
          },
        ])
        setQuestion('')
        window.requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          })
        })
      }
    } catch (caught) {
      setError(
        mentorErrorMessage(
          caught,
          'The AI Debugger is not available right now. Try again.',
        ),
      )
    } finally {
      setPending(null)
    }
  }

  function ask(event?: FormEvent) {
    event?.preventDefault()
    const text = question.trim()
    if (text === '') return
    void send('ask', text)
  }

  return (
    <aside
      aria-label="AI Debugger"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
    >
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-a to-brand-b text-white shadow-soft">
          <Sparkles aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            AI Debugger
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Reads this run step by step and points at where it goes wrong.
          </p>
        </div>
      </header>

      {pending === 'diagnose' ? (
        <AiLoader
          steps={[
            { label: 'Reading your run', indicator: 'bar' },
            { label: 'Following the values that matter', indicator: 'dots' },
            { label: 'Writing hints', indicator: 'grid' },
          ]}
          title="Looking for the bug"
        />
      ) : diagnosis === null ? (
        <div
          className={cn(
            'flex flex-col gap-3 rounded-xl border p-3.5',
            failed || wrong
              ? 'border-destructive/30 bg-danger-soft/60'
              : 'border-border bg-secondary/40',
          )}
        >
          <p className="text-sm leading-6 text-foreground">
            {failed
              ? `The run stopped with ${trace.error?.title ?? 'an error'}${trace.error?.line !== undefined ? ` on line ${trace.error.line}` : ''}.`
              : wrong
                ? `The output goes wrong at token ${comparison.token}: expected ${comparison.expected ?? 'nothing'}, got ${comparison.actual ?? 'nothing'}.`
                : hasExpected
                  ? 'The output matches the expected output. Ask the AI to look for edge cases that could still break it.'
                  : 'Add the expected output to find exactly where the answer goes wrong, or ask the AI to check the logic.'}
          </p>
          <Button
            className="w-full"
            disabled={pending !== null}
            onClick={() => void send('diagnose')}
            size="lg"
            type="button"
          >
            <Sparkles aria-hidden="true" />
            {failed || wrong ? 'Find my bug' : 'Check my logic'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ResultView
            steps={trace.steps.length}
            language={run.language}
            onAsk={(text) => {
              setQuestion(text)
              void send('ask', text)
            }}
            onLine={onLine}
            onStep={toStep}
            onTryInput={onTryInput}
            result={diagnosis}
          />
          <Button
            className="self-start"
            disabled={pending !== null}
            onClick={() => void send('diagnose')}
            size="sm"
            type="button"
            variant="ghost"
          >
            Check again
          </Button>
        </div>
      )}

      {error !== null ? (
        <p
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section
        aria-label="Ask about this run"
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageCircle aria-hidden="true" className="size-4 text-primary" />
          Ask about step {current + 1}
          {step !== undefined ? (
            <span className="font-mono text-xs font-normal text-muted-foreground">
              · line {step.line}
            </span>
          ) : null}
        </h3>
        {turns.length > 0 ? (
          <div
            className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1"
            ref={scrollRef}
          >
            <AnimatePresence initial={false}>
              {turns.map((turn, index) => (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'rounded-xl px-3 py-2',
                    turn.role === 'learner'
                      ? 'ml-6 bg-primary/10 text-foreground'
                      : 'mr-2 border border-border bg-card',
                  )}
                  initial={{ opacity: 0, y: 6 }}
                  key={index}
                >
                  {turn.role === 'learner' ? (
                    <div className="flex flex-col gap-1">
                      {turn.step !== undefined ? (
                        <button
                          className="self-start font-mono text-[10px] font-semibold text-primary hover:underline"
                          onClick={() => onJump(turn.step as number)}
                          type="button"
                        >
                          at step {turn.step + 1}
                        </button>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {turn.content}
                      </p>
                    </div>
                  ) : turn.result !== undefined ? (
                    <ResultView
                      steps={trace.steps.length}
                      language={run.language}
                      onAsk={(text) => {
                        setQuestion(text)
                        void send('ask', text)
                      }}
                      onLine={onLine}
                      onStep={toStep}
                      onTryInput={onTryInput}
                      result={turn.result}
                    />
                  ) : (
                    <CoachMessageContent
                      content={turn.content}
                      role="assistant"
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {starterQuestions.map((text) => (
              <button
                className="rounded-full border border-border bg-card px-2.5 py-1 text-left text-xs text-foreground hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                disabled={pending !== null}
                key={text}
                onClick={() => {
                  setQuestion(text)
                  void send('ask', text)
                }}
                type="button"
              >
                {text}
              </button>
            ))}
          </div>
        )}
        {pending === 'ask' ? (
          <AiLoader
            steps={[{ label: 'Thinking about this step', indicator: 'dots' }]}
            title="Answering"
          />
        ) : null}
        <form className="flex items-end gap-2" onSubmit={ask}>
          <label className="sr-only" htmlFor="visualizer-question">
            Your question
          </label>
          <textarea
            className="min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            id="visualizer-question"
            maxLength={2_000}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                ask()
              }
            }}
            placeholder="Why is i 5 here? What went wrong?"
            rows={2}
            value={question}
          />
          <Button
            aria-label="Send question"
            disabled={pending !== null || question.trim() === ''}
            size="icon"
            type="submit"
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
        <Button
          className="self-start"
          onClick={onOpenDoubtHelper}
          size="sm"
          type="button"
          variant="ghost"
        >
          {doubtHelperLabel}
        </Button>
      </section>

      <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
        <Lock aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
        Your code still runs only in this browser. Asking the AI sends the code,
        the input and a summary of this run to AlgoMemtor's AI; nothing is
        stored.
      </p>
    </aside>
  )
}
