import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  PROBLEM_HELP_MAX_GUIDED_LEVEL,
  codeRequiredDoubtTypes,
  isSafeCoachPublicUrl,
  type ProblemHelpBugCategory,
  type ProblemHelpDoubtType,
  type ProblemHelpSession,
  type ProblemHelpTurn,
  type ProblemHelpTurnRequest,
} from '@algomemtor/shared-contracts'

import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  CloudOff,
  Code2,
  Compass,
  Crosshair,
  Gauge,
  Lightbulb,
  Lock,
  MessageCircle,
  Plus,
  ShieldCheck,
  XCircle,
  type IconComponent,
} from '@/components/icons/algo-icons'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import { KpiTile } from '@/features/mentor/components/visuals'
import {
  MentorChatDock,
  type DockMessage,
} from '@/features/mentor/components/MentorChatDock'
import {
  LanguagePicker,
  ProviderBadge,
  ProviderProblemLink,
} from '@/features/mentor/components/shared'
import {
  errorCode,
  formatDateTime,
  inputClass,
  mentorErrorMessage,
  useRememberedLanguage,
} from '@/features/mentor/format'
import {
  useHelpSession,
  useHelpSessions,
  useHelpTurn,
  useStartHelpSession,
} from '@/features/mentor/hooks'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import { TestCaseVisualizerIcon } from '@/components/icons/mentor-icons'
import {
  VISUALIZER_PATH,
  readDoubtIntake,
  readDoubtQuestion,
  recallDoubtCode,
  rememberDoubtCode,
  visualizerLanguageFor,
  type DoubtIntakeHandoff,
  type VisualizerHandoff,
} from '@/features/visualizer/handoff'
import { cn } from '@/lib/utils'

const doubtIcons: Record<ProblemHelpDoubtType, IconComponent> = {
  understand_problem: BookOpen,
  find_approach: Compass,
  approach_review: ShieldCheck,
  compilation_error: Code2,
  no_output: CloudOff,
  wrong_answer: XCircle,
  performance_tle_mle: Gauge,
  general: MessageCircle,
}

const doubtOptions: readonly {
  value: ProblemHelpDoubtType
  label: string
  hint: string
}[] = [
  {
    value: 'understand_problem',
    label: 'I cannot understand the problem',
    hint: 'Restate it, walk through samples, flag tricky wording.',
  },
  {
    value: 'find_approach',
    label: 'I do not know how to approach it',
    hint: 'Brute force first, then a nudge toward the right idea.',
  },
  {
    value: 'approach_review',
    label: 'Check my approach before I submit',
    hint: 'Catch wrong or too-slow ideas before you code them.',
  },
  {
    value: 'compilation_error',
    label: 'Compilation error',
    hint: 'Explain the compiler message and the exact cause.',
  },
  {
    value: 'no_output',
    label: 'My code prints nothing',
    hint: 'Trace execution to find where output is lost.',
  },
  {
    value: 'wrong_answer',
    label: 'Wrong answer',
    hint: 'Find the failing case and the broken assumption.',
  },
  {
    value: 'performance_tle_mle',
    label: 'Time or memory limit exceeded',
    hint: 'Locate the bottleneck against the constraints.',
  },
  {
    value: 'general',
    label: 'General help with this problem',
    hint: 'Understanding plus solving mindset, no spoilers.',
  },
]

const doubtLabel = (value: ProblemHelpDoubtType) =>
  doubtOptions.find((option) => option.value === value)?.label ?? value

const errorFieldCopy: Partial<
  Record<ProblemHelpDoubtType, { label: string; placeholder: string }>
> = {
  compilation_error: {
    label: 'Compiler message',
    placeholder: 'Paste the full compiler error output.',
  },
  no_output: {
    label: 'Input you ran',
    placeholder: 'The input you used when nothing was printed.',
  },
  wrong_answer: {
    label: 'Expected vs actual (or failing test)',
    placeholder: 'e.g. Wrong answer on test 3: expected 7, got 6.',
  },
  performance_tle_mle: {
    label: 'Verdict and constraints',
    placeholder: 'e.g. TLE on test 12, n up to 2·10^5.',
  },
}

const levelNames = [
  'Nudge',
  'Concept',
  'Structure',
  'Key code',
  'Full walkthrough',
]

const bugLabels: Record<ProblemHelpBugCategory, string> = {
  logic_error: 'Logic error',
  edge_case: 'Missed edge case',
  off_by_one: 'Off-by-one',
  overflow: 'Integer overflow',
  wrong_algorithm: 'Wrong algorithm',
  time_complexity: 'Too slow',
  memory_usage: 'Memory usage',
  compilation: 'Compilation',
  input_output: 'Input/output',
  undefined_behavior: 'Undefined behavior',
  none_found: 'No bug found',
}

const workingSteps: readonly AiLoaderStep[] = [
  { label: 'Reading the problem', indicator: 'bar' },
  { label: 'Checking your attempt', indicator: 'grid' },
  { label: 'Writing one step at a time', indicator: 'dots' },
]

function HintLadder({ level, stage }: { level: number; stage: string }) {
  return (
    <ol
      aria-label={`Hint ${Math.min(level, 5)} of 5`}
      className="grid grid-cols-5"
    >
      {levelNames.map((name, index) => {
        const reached = index < level
        const current = index === level - 1
        return (
          <li
            className="relative flex min-w-0 flex-col items-center"
            key={name}
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2',
                  reached ? 'bg-primary' : 'bg-border',
                )}
              />
            ) : null}
            <span
              className={cn(
                'relative grid size-8 place-items-center rounded-full font-heading text-sm font-bold transition-colors',
                reached
                  ? index === 4
                    ? 'bg-sun text-sun-foreground'
                    : 'mesh-card text-white'
                  : 'border border-border bg-card text-muted-foreground',
                current && 'ring-4 ring-primary/20',
              )}
            >
              {reached && !current ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                'mt-1.5 max-w-full truncate text-center text-[0.7rem]',
                current
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {name}
            </span>
          </li>
        )
      })}
      <span className="sr-only">
        {stage === 'solution_revealed'
          ? 'Full solution revealed'
          : `Currently at hint ${level}`}
      </span>
    </ol>
  )
}

// Your help history at a glance, shown above a new doubt.
function HelpStats() {
  const sessionsQuery = useHelpSessions()
  const sessions = sessionsQuery.data?.data ?? []
  if (sessions.length === 0) return null
  const solved = sessions.filter((item) => item.stage === 'completed').length
  const reveals = sessions.filter(
    (item) => item.solutionRevealedAt !== undefined,
  ).length
  const average =
    sessions.reduce((sum, item) => sum + Math.min(item.hintLevel, 5), 0) /
    sessions.length
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        detail="Problems you asked about"
        icon={Crosshair}
        label="Help sessions"
        tone="accent"
        value={sessions.length}
      />
      <KpiTile
        detail="Marked solved"
        icon={CheckCheck}
        label="Solved"
        tone="green"
        value={solved}
      />
      <KpiTile
        detail="Lower means more independence"
        icon={Lightbulb}
        label="Average hint"
        tone="sky"
        value={average.toFixed(1)}
      />
      <KpiTile
        detail="Sessions that revealed the solution"
        icon={Lock}
        label="Full reveals"
        tone="sand"
        value={reveals}
      />
    </dl>
  )
}

function turnHeading(turn: ProblemHelpTurn) {
  if (turn.kind === 'diagnosis') return 'Diagnosis'
  if (turn.kind === 'solution') return 'Full walkthrough'
  if (turn.kind === 'feedback') return 'Feedback on your attempt'
  if (turn.kind === 'answer') return 'Answer'
  return turn.hintLevel === undefined
    ? 'Hint'
    : `Hint ${turn.hintLevel} · ${levelNames[turn.hintLevel - 1] ?? ''}`
}

function Transcript({ turns }: { turns: readonly ProblemHelpTurn[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {turns.map((turn) =>
        turn.role === 'learner' ? (
          <li className="flex flex-col items-end" key={turn.id}>
            <div className="max-w-[88%] rounded-xl rounded-br-md border border-border bg-secondary px-4 py-3 text-sm leading-6 text-foreground [&_em]:text-muted-foreground [&_p]:my-0.5 [&_strong]:font-semibold">
              <CoachMessageContent content={turn.content} role="assistant" />
            </div>
            <time
              className="mt-1 px-1 text-[0.7rem] text-muted-foreground"
              dateTime={turn.createdAt}
            >
              {turn.kind === 'intake'
                ? 'Your doubt'
                : turn.kind === 'attempt'
                  ? 'Your attempt'
                  : 'Your question'}{' '}
              · {formatDateTime(turn.createdAt)}
            </time>
          </li>
        ) : (
          <li className="flex gap-3" key={turn.id}>
            <span
              aria-hidden="true"
              className="coach-orb mt-0.5 size-8 shrink-0"
            />
            <article className="min-w-0 flex-1">
              <h3 className="font-sans text-sm font-semibold text-foreground">
                {turnHeading(turn)}
              </h3>
              <div className="text-[0.95rem] [&>div]:mt-1.5">
                <CoachMessageContent content={turn.content} role="assistant" />
              </div>
            </article>
          </li>
        ),
      )}
    </ol>
  )
}

function IntakeForm({
  initialProblem,
  intake,
}: {
  initialProblem: string
  intake: DoubtIntakeHandoff | null
}) {
  const navigate = useNavigate()
  const { notify } = useNotification()
  const start = useStartHelpSession()
  const [language, setLanguage] = useRememberedLanguage(intake?.language)
  const [problemUrl, setProblemUrl] = useState(initialProblem)
  const [pasteMode, setPasteMode] = useState(false)
  const [problemTitle, setProblemTitle] = useState('')
  const [statement, setStatement] = useState('')
  const [doubtType, setDoubtType] = useState<ProblemHelpDoubtType | null>(
    intake === null ? null : 'wrong_answer',
  )
  const [attempt, setAttempt] = useState(
    intake === null
      ? ''
      : 'I traced my code on a test case in the Test Case Visualizer. The step I am unsure about is below.',
  )
  const [code, setCode] = useState(intake?.code ?? '')
  const [errorText, setErrorText] = useState(
    intake?.details.slice(0, 4_000) ?? '',
  )
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [needsStatement, setNeedsStatement] = useState(false)

  const codeRequired =
    doubtType !== null && codeRequiredDoubtTypes.includes(doubtType)
  const errorCopy = doubtType === null ? undefined : errorFieldCopy[doubtType]
  const showStatement = pasteMode || needsStatement

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (start.isPending) return
    const url = problemUrl.trim()
    if (!showStatement && url === '') {
      setFieldError('Paste the problem link, or choose to paste the statement.')
      return
    }
    if (url !== '' && !isSafeCoachPublicUrl(url)) {
      setFieldError('Use a public https problem link.')
      return
    }
    if (showStatement && url === '' && problemTitle.trim() === '') {
      setFieldError('Give the problem a name.')
      return
    }
    if (showStatement && statement.trim() === '') {
      setFieldError('Paste the problem statement.')
      return
    }
    if (doubtType === null) {
      setFieldError('Choose the type of doubt.')
      return
    }
    if (language.trim() === '') {
      setFieldError('Choose your programming language.')
      return
    }
    if (attempt.trim() === '') {
      setFieldError('Tell the mentor what you tried or where you are stuck.')
      return
    }
    if (codeRequired && code.trim() === '') {
      setFieldError('Paste the code you are debugging.')
      return
    }
    setFieldError(null)
    start.mutate(
      {
        ...(url === '' ? {} : { problemUrl: url }),
        ...(showStatement && problemTitle.trim() !== ''
          ? { problemTitle: problemTitle.trim() }
          : {}),
        ...(showStatement && statement.trim() !== ''
          ? { transientStatement: statement.trim() }
          : {}),
        language: language.trim(),
        doubtType,
        attemptSummary: attempt.trim(),
        ...(code.trim() === '' ? {} : { transientCode: code }),
        ...(errorText.trim() === '' ? {} : { transientError: errorText }),
        source: initialProblem === '' ? 'manual' : 'coach',
      },
      {
        onSuccess: (response) => {
          if (code.trim() !== '') {
            rememberDoubtCode(
              response.data.id,
              code,
              doubtType === 'no_output' ? errorText : '',
            )
          }
          if (showStatement && statement.trim() !== '') {
            try {
              window.sessionStorage.setItem(
                `algomemtor.doubt.statement.${response.data.id}`,
                statement.trim(),
              )
            } catch {
              // The statement is optional after the first turn for linked
              // problems; pasted ones are asked for again if storage fails.
            }
          }
          void navigate(`/doubt-helper/${response.data.id}`)
        },
        onError: (error) => {
          if (errorCode(error) === 'PROBLEM_CONTEXT_UNAVAILABLE') {
            setNeedsStatement(true)
          }
          notify({
            title: 'The Doubt Helper could not start',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          })
        },
      },
    )
  }

  if (start.isPending) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-6"
        role="status"
      >
        <AiLoader steps={workingSteps} title="Preparing your first hint" />
      </div>
    )
  }

  return (
    <form
      aria-describedby={fieldError ? 'doubt-form-error' : undefined}
      className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:p-6"
      noValidate
      onSubmit={submit}
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          What are you stuck on?
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Hints come one level at a time: nudge, concept, structure, key code,
          then a full walkthrough only when you confirm it.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="doubt-problem-url"
        >
          Problem link {showStatement ? '(optional)' : ''}
        </label>
        <input
          className={inputClass}
          id="doubt-problem-url"
          inputMode="url"
          onChange={(event) => setProblemUrl(event.target.value)}
          placeholder="https://codeforces.com/problemset/problem/2266/G"
          type="url"
          value={problemUrl}
        />
        <p className="text-xs text-muted-foreground">
          Codeforces, CodeChef, LeetCode and CSES links are read directly. Other
          public pages are read for each answer and never stored.
        </p>
        {!needsStatement ? (
          <button
            className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setPasteMode((value) => !value)}
            type="button"
          >
            {pasteMode ? 'Use a link instead' : 'No link? Paste the statement'}
          </button>
        ) : null}
      </div>

      {showStatement ? (
        <div className="grid gap-4 rounded-lg border border-border bg-background/50 p-4">
          {needsStatement ? (
            <p className="text-sm text-sun-foreground" role="status">
              The problem could not be read from that link. Paste the statement
              so the mentor does not have to guess.
            </p>
          ) : null}
          {problemUrl.trim() === '' ? (
            <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
              Problem name
              <input
                className={inputClass}
                maxLength={200}
                onChange={(event) => setProblemTitle(event.target.value)}
                placeholder="e.g. Grid Paths"
                value={problemTitle}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            Problem statement
            <textarea
              className={cn(inputClass, 'min-h-40 resize-y font-mono text-xs')}
              maxLength={20_000}
              onChange={(event) => setStatement(event.target.value)}
              placeholder="Paste the full statement, constraints and samples."
              value={statement}
            />
          </label>
        </div>
      ) : null}

      <fieldset className="min-w-0">
        <legend className="text-sm font-medium text-foreground">
          Type of doubt
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {doubtOptions.map((option) => {
            const Icon = doubtIcons[option.value]
            const chosen = doubtType === option.value
            return (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-[border-color,background-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  chosen
                    ? 'border-primary bg-primary/5 shadow-soft'
                    : 'border-border hover:bg-secondary/60',
                )}
                key={option.value}
              >
                <input
                  checked={chosen}
                  className="sr-only"
                  name="doubt-type"
                  onChange={() => setDoubtType(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
                    chosen
                      ? 'mesh-card text-white'
                      : 'bg-accent text-accent-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <LanguagePicker
        idPrefix="doubt"
        onChange={setLanguage}
        value={language}
      />

      <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
        What have you tried?
        <textarea
          className={cn(inputClass, 'min-h-24 resize-y')}
          maxLength={1_000}
          onChange={(event) => setAttempt(event.target.value)}
          placeholder={
            doubtType === 'understand_problem'
              ? 'Which part of the statement is confusing?'
              : 'Your idea so far, what you observed, or where you got stuck.'
          }
          value={attempt}
        />
        <span className="text-xs font-normal text-muted-foreground">
          {attempt.length}/1000 · saved so you can resume this session.
        </span>
      </label>

      {doubtType !== null &&
      doubtType !== 'understand_problem' &&
      doubtType !== 'find_approach' ? (
        <div className="grid gap-4 rounded-lg border border-border bg-background/50 p-4">
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock aria-hidden="true" className="size-3.5" />
            Used for this answer only and never saved.
          </p>
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span>Your code {codeRequired ? '' : '(optional)'}</span>
            <textarea
              className={cn(inputClass, 'min-h-44 resize-y font-mono text-xs')}
              maxLength={12_000}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Paste the code you are working on."
              spellCheck={false}
              value={code}
            />
          </label>
          {errorCopy !== undefined ? (
            <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
              {errorCopy.label}
              <textarea
                className={cn(
                  inputClass,
                  'min-h-20 resize-y font-mono text-xs',
                )}
                maxLength={4_000}
                onChange={(event) => setErrorText(event.target.value)}
                placeholder={errorCopy.placeholder}
                spellCheck={false}
                value={errorText}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {fieldError ? (
        <p
          className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
          id="doubt-form-error"
          role="alert"
        >
          {fieldError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          The mentor calibrates depth to your level and learner memory.
        </p>
        <Button size="lg" type="submit">
          Get my first hint
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </form>
  )
}

function SessionView({ sessionId }: { sessionId: string }) {
  const { notify } = useNotification()
  const location = useLocation()
  const navigate = useNavigate()
  const sessionQuery = useHelpSession(sessionId)
  const turn = useHelpTurn(sessionId)
  // A question prepared in the Test Case Visualizer about one step.
  const [visualizerQuestion] = useState(() => readDoubtQuestion(location.state))
  const [dockOpen, setDockOpen] = useState(visualizerQuestion !== null)
  const [dockMode, setDockMode] = useState<'ask' | 'attempt'>('ask')
  const [code, setCode] = useState(visualizerQuestion?.code ?? '')
  const [errorText, setErrorText] = useState('')
  const [statement, setStatement] = useState(() => {
    try {
      return (
        window.sessionStorage.getItem(
          `algomemtor.doubt.statement.${sessionId}`,
        ) ?? ''
      )
    } catch {
      return ''
    }
  })
  const [needsStatement, setNeedsStatement] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const turnCount = sessionQuery.data?.turns.length ?? 0

  useEffect(() => {
    if (location.state !== null && location.state !== undefined) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    if (turnCount === 0) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turnCount])

  if (sessionQuery.isPending) {
    return <PageSkeleton label="Loading help session" rows={4} />
  }
  if (sessionQuery.isError) {
    return (
      <ErrorState
        message={mentorErrorMessage(
          sessionQuery.error,
          'This help session could not be loaded.',
        )}
        onRetry={() => void sessionQuery.refetch()}
        title="Session unavailable"
      />
    )
  }

  const { data: session, turns } = sessionQuery.data
  const pastedProblem =
    session.problem.platform === 'other' &&
    session.problem.canonicalUrl === undefined
  const statementRequired = pastedProblem || needsStatement
  const active =
    session.stage === 'hinting' ||
    session.stage === 'solution_confirmation' ||
    session.stage === 'solution_revealed'

  function act(
    request: ProblemHelpTurnRequest,
    success?: string,
  ): Promise<boolean> {
    if (turn.isPending) return Promise.resolve(false)
    const withStatement =
      statement.trim() !== '' &&
      (request.action === 'next_hint' ||
        request.action === 'ask' ||
        request.action === 'submit_attempt' ||
        request.action === 'confirm_solution')
        ? { ...request, transientStatement: statement.trim() }
        : request
    return new Promise((resolve) => {
      turn.mutate(withStatement, {
        onSuccess: () => {
          setCode('')
          setErrorText('')
          if (success) notify({ title: success, tone: 'success' })
          resolve(true)
        },
        onError: (error) => {
          if (errorCode(error) === 'PROBLEM_CONTEXT_UNAVAILABLE') {
            setNeedsStatement(true)
          }
          notify({
            title:
              errorCode(error) === 'PROBLEM_HELP_STALE_VERSION'
                ? 'Session updated elsewhere'
                : 'That did not work',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          })
          resolve(false)
        },
      })
    })
  }

  function openDock(mode: 'ask' | 'attempt') {
    setDockMode(mode)
    setDockOpen(true)
  }

  function sendFromDock(content: string, mode: string) {
    return act(
      mode === 'attempt'
        ? {
            action: 'submit_attempt',
            expectedVersion: session.version,
            content,
            ...(code.trim() === '' ? {} : { transientCode: code }),
            ...(errorText.trim() === '' ? {} : { transientError: errorText }),
          }
        : {
            action: 'ask',
            expectedVersion: session.version,
            content,
            ...(code.trim() === '' ? {} : { transientCode: code }),
          },
    )
  }

  // The dock shows the back-and-forth; hints stay in the main transcript.
  const dockMessages: DockMessage[] = turns
    .filter((item) =>
      ['question', 'attempt', 'answer', 'feedback'].includes(item.kind),
    )
    .map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      ...(item.kind === 'attempt'
        ? { label: 'I tried this' }
        : item.kind === 'feedback'
          ? { label: 'Feedback' }
          : {}),
    }))

  const nextLevel = Math.min(
    session.hintLevel + 1,
    PROBLEM_HELP_MAX_GUIDED_LEVEL,
  )
  const visualizerLanguage = visualizerLanguageFor(session.language)

  function openVisualizer() {
    const remembered = recallDoubtCode(session.id)
    const handoff: VisualizerHandoff = {
      source: 'doubt_helper',
      language: visualizerLanguage ?? 'cpp',
      code: code.trim() !== '' ? code : (remembered?.code ?? ''),
      input: remembered?.input ?? '',
      problem:
        session.problem.canonicalUrl === undefined
          ? { title: session.problem.title }
          : { title: session.problem.title, url: session.problem.canonicalUrl },
      sessionId: session.id,
    }
    void navigate(VISUALIZER_PATH, { state: { visualizer: handoff } })
  }
  const canExplore =
    session.problem.canonicalUrl !== undefined &&
    session.problem.provider !== undefined

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ProviderBadge provider={session.problem.provider ?? 'other'} />
              <span className="text-xs text-muted-foreground">
                {doubtLabel(session.doubtType)} · {session.language}
              </span>
              {session.bugCategory ? (
                <span className="rounded-md bg-sun-soft px-2 py-0.5 text-[0.7rem] font-medium text-sun-foreground">
                  {bugLabels[session.bugCategory]}
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 min-w-0 text-xl text-foreground sm:text-2xl">
              {session.problem.canonicalUrl ? (
                <ProviderProblemLink
                  href={session.problem.canonicalUrl}
                  provider={session.problem.provider ?? 'other'}
                  title={session.problem.title}
                />
              ) : (
                session.problem.title
              )}
            </h2>
          </div>
          <span
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium',
              session.stage === 'completed'
                ? 'bg-go-soft text-go-foreground'
                : session.stage === 'abandoned'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-primary/10 text-primary',
            )}
          >
            {session.stage === 'completed'
              ? 'Solved'
              : session.stage === 'abandoned'
                ? 'Ended'
                : session.stage === 'solution_revealed'
                  ? 'Solution revealed'
                  : 'In progress'}
          </span>
        </div>
        <HintLadder level={session.hintLevel} stage={session.stage} />
      </header>

      <section
        aria-label="Help conversation"
        aria-live="polite"
        className="min-w-0"
      >
        <Transcript turns={turns} />
        {turn.isPending ? (
          <div className="mt-6" role="status">
            <AiLoader steps={workingSteps} title="Your mentor is thinking" />
          </div>
        ) : null}
        <div ref={endRef} />
      </section>

      {active && statementRequired ? (
        <label className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground">
          Problem statement (needed for each answer, never saved)
          <textarea
            className={cn(inputClass, 'min-h-28 resize-y font-mono text-xs')}
            maxLength={20_000}
            onChange={(event) => {
              setStatement(event.target.value)
              try {
                window.sessionStorage.setItem(
                  `algomemtor.doubt.statement.${sessionId}`,
                  event.target.value,
                )
              } catch {
                // Kept in component state when storage is unavailable.
              }
            }}
            placeholder="Paste the full statement again to continue."
            value={statement}
          />
        </label>
      ) : null}

      {session.stage === 'solution_confirmation' ? (
        <section
          aria-labelledby="reveal-heading"
          className="rounded-xl border border-sun/50 bg-sun-soft p-4 sm:p-5"
          role="alertdialog"
        >
          <h3
            className="text-base font-semibold text-sun-foreground"
            id="reveal-heading"
          >
            Reveal the full solution?
          </h3>
          <p className="mt-1 text-sm leading-6 text-sun-foreground/90">
            The next reply gives the complete approach, a correctness argument
            and full code in {session.language}. You are at hint{' '}
            {session.hintLevel} of 4. One more hint is often all it takes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={turn.isPending}
              onClick={() =>
                void act({
                  action: 'cancel_solution',
                  expectedVersion: session.version,
                })
              }
              type="button"
              variant="outline"
            >
              Keep working with hints
            </Button>
            <Button
              disabled={turn.isPending}
              onClick={() =>
                void act({
                  action: 'confirm_solution',
                  expectedVersion: session.version,
                })
              }
              type="button"
            >
              Reveal full solution
            </Button>
          </div>
        </section>
      ) : null}

      {active && session.stage !== 'solution_confirmation' ? (
        <div className="sticky bottom-0 z-10 -mx-1 rounded-xl border border-border bg-background/95 p-3 shadow-soft backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {session.stage === 'hinting' ? (
              <Button
                disabled={
                  turn.isPending ||
                  session.hintLevel >= PROBLEM_HELP_MAX_GUIDED_LEVEL
                }
                onClick={() =>
                  void act({
                    action: 'next_hint',
                    expectedVersion: session.version,
                  })
                }
                type="button"
              >
                <Plus aria-hidden="true" />
                {session.hintLevel >= PROBLEM_HELP_MAX_GUIDED_LEVEL
                  ? 'All hints used'
                  : `Next hint · ${levelNames[nextLevel - 1]}`}
              </Button>
            ) : null}
            <Button
              disabled={turn.isPending}
              onClick={() => openDock('attempt')}
              type="button"
              variant="outline"
            >
              <Code2 aria-hidden="true" /> I tried this
            </Button>
            <Button
              disabled={turn.isPending}
              onClick={() => openDock('ask')}
              type="button"
              variant="outline"
            >
              <MessageCircle aria-hidden="true" /> Ask a question
            </Button>
            {visualizerLanguage !== null ? (
              <Button
                disabled={turn.isPending}
                onClick={openVisualizer}
                type="button"
                variant="outline"
              >
                <TestCaseVisualizerIcon aria-hidden="true" /> Visualize a test
                case
              </Button>
            ) : null}
            {session.stage === 'hinting' ? (
              <Button
                disabled={turn.isPending}
                onClick={() =>
                  void act({
                    action: 'request_solution',
                    expectedVersion: session.version,
                  })
                }
                type="button"
                variant="ghost"
              >
                <Lock aria-hidden="true" /> Full solution
              </Button>
            ) : null}
            <span className="ml-auto flex flex-wrap gap-2">
              <Button
                disabled={turn.isPending}
                onClick={() =>
                  void act(
                    { action: 'complete', expectedVersion: session.version },
                    'Nice work. Marked solved.',
                  )
                }
                type="button"
                variant="secondary"
              >
                <Check aria-hidden="true" /> I solved it
              </Button>
              <Button
                disabled={turn.isPending}
                onClick={() =>
                  void act({
                    action: 'abandon',
                    expectedVersion: session.version,
                  })
                }
                type="button"
                variant="ghost"
              >
                End
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      {!active || session.stage === 'solution_revealed' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {session.stage === 'completed'
              ? 'Solved. See how else it can be solved, or start a new doubt.'
              : session.stage === 'abandoned'
                ? 'This session has ended. Your hints stay here for reference.'
                : 'See how else this problem can be solved and what experienced solvers noticed.'}
          </p>
          {canExplore && session.problem.canonicalUrl ? (
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to={mentorToolPath(
                'solution_explorer',
                session.problem.canonicalUrl,
              )}
            >
              <BookOpen aria-hidden="true" /> Explore other approaches
            </Link>
          ) : null}
          {!active ? (
            <Link className={buttonVariants()} to="/doubt-helper">
              New doubt
            </Link>
          ) : null}
        </div>
      ) : null}

      {active ? (
        <MentorChatDock
          emptyState={
            dockMode === 'attempt' ? (
              <p>
                Tell your mentor what you tried and what happened. Attach your
                code or the verdict for precise feedback.
              </p>
            ) : (
              <p>
                Ask about the last hint or anything in this problem. Your mentor
                already knows the problem and every hint so far, and keeps to
                your current hint level.
              </p>
            )
          }
          extra={
            <details
              className="rounded-lg border border-border px-3 py-2"
              open={visualizerQuestion !== null}
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                <Code2 aria-hidden="true" className="mr-1 inline size-3.5" />
                Attach code{dockMode === 'attempt' ? ' or a verdict' : ''} (used
                for this answer only, never saved)
              </summary>
              <div className="mt-3 grid gap-3">
                <textarea
                  aria-label="Code for this answer"
                  className={cn(
                    inputClass,
                    'min-h-28 resize-y font-mono text-xs',
                  )}
                  disabled={turn.isPending}
                  maxLength={12_000}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Paste your current code."
                  spellCheck={false}
                  value={code}
                />
                {dockMode === 'attempt' ? (
                  <textarea
                    aria-label="Verdict or error for this answer"
                    className={cn(
                      inputClass,
                      'min-h-14 resize-y font-mono text-xs',
                    )}
                    disabled={turn.isPending}
                    maxLength={4_000}
                    onChange={(event) => setErrorText(event.target.value)}
                    placeholder="Verdict, error output, or failing test."
                    spellCheck={false}
                    value={errorText}
                  />
                ) : null}
              </div>
            </details>
          }
          launcherLabel="Ask or share an attempt"
          {...(visualizerQuestion === null
            ? {}
            : { initialDrafts: { ask: visualizerQuestion.content } })}
          messages={dockMessages}
          mode={dockMode}
          modes={[
            {
              id: 'ask',
              label: 'Ask a question',
              icon: <MessageCircle aria-hidden="true" className="size-3.5" />,
              placeholder: 'What is unclear about the last hint?',
              submitLabel: 'Ask',
            },
            {
              id: 'attempt',
              label: 'I tried this',
              icon: <Code2 aria-hidden="true" className="size-3.5" />,
              placeholder: 'Describe what you tried and what happened.',
              submitLabel: 'Get feedback',
            },
          ]}
          onModeChange={(mode) =>
            setDockMode(mode === 'attempt' ? 'attempt' : 'ask')
          }
          onOpenChange={setDockOpen}
          onSubmit={sendFromDock}
          open={dockOpen}
          pending={turn.isPending}
          pendingLabel="Your mentor is thinking…"
          disabled={session.stage === 'solution_confirmation'}
          disabledReason="Choose whether to reveal the full solution first."
          subtitle={`${session.problem.title} · Hint ${session.hintLevel} of 5`}
          title="Your mentor"
        />
      ) : null}
    </div>
  )
}

function SessionList({ activeId }: { activeId: string | undefined }) {
  const sessionsQuery = useHelpSessions()
  const sessions = sessionsQuery.data?.data ?? []
  return (
    <aside
      aria-label="Your help sessions"
      className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--app-header)+1.5rem)] lg:max-h-[calc(100dvh-var(--app-header)-3rem)] lg:overflow-y-auto"
    >
      <Link
        className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
        to="/doubt-helper"
      >
        <Plus aria-hidden="true" /> New doubt
      </Link>
      {sessionsQuery.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading sessions…
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Your help sessions appear here so you can pick up where you left off.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sessions.map((session: ProblemHelpSession) => (
            <li key={session.id}>
              <Link
                aria-current={session.id === activeId ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  session.id === activeId
                    ? 'bg-card shadow-soft ring-1 ring-border'
                    : 'hover:bg-card/70',
                )}
                to={`/doubt-helper/${session.id}`}
              >
                <span className="block truncate text-sm font-medium text-foreground">
                  {session.problem.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {session.stage === 'completed'
                    ? 'Solved'
                    : session.stage === 'abandoned'
                      ? 'Ended'
                      : session.stage === 'solution_revealed'
                        ? 'Solution revealed'
                        : `Hint ${session.hintLevel} of 5`}{' '}
                  · {doubtLabel(session.doubtType)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function DoubtHelperPage() {
  const { sessionId } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const initialProblem = searchParams.get('problem') ?? ''
  const intake = readDoubtIntake(location.state)

  return (
    <main
      className="flex w-full min-w-0 flex-1 flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:px-10"
      id="main-content"
    >
      <header className="animate-rise flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
            <Crosshair aria-hidden="true" className="size-3.5" /> Doubt Helper
          </p>
          <h1 className="mt-2 text-[2.1rem] leading-[1.05] text-foreground sm:text-[2.6rem]">
            Get unstuck without spoilers
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Layered hints for a specific problem, and bug diagnosis for wrong
            answers, TLE, compile errors or missing output. You stay in charge
            of how much is revealed.
          </p>
        </div>
      </header>
      {sessionId === undefined ? <HelpStats /> : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <SessionList activeId={sessionId} />
        <div className="min-w-0 max-w-4xl">
          {sessionId === undefined ? (
            <IntakeForm
              initialProblem={initialProblem}
              intake={intake}
              key={`${initialProblem}|${intake === null ? '' : 'visualizer'}`}
            />
          ) : (
            <SessionView key={sessionId} sessionId={sessionId} />
          )}
        </div>
      </div>
    </main>
  )
}

export default DoubtHelperPage
