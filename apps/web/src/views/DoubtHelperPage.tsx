import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from '@/lib/router'
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
  Code2,
  Crosshair,
  Lightbulb,
  Link2,
  Lock,
  MessageCircle,
  Plus,
} from '@/components/icons/algo-icons'
import {
  ApproachReviewIcon,
  CompilationErrorIcon,
  FindApproachIcon,
  GeneralHelpIcon,
  LimitExceededIcon,
  NoOutputIcon,
  UnderstandProblemIcon,
  WrongAnswerIcon,
  type DoubtIconComponent,
} from '@/components/icons/doubt-icons'
import { CapsuleStats } from '@/components/kit/stat-cards'
import { PageHero } from '@/components/kit/PageHero'
import { OrbField } from '@/components/kit/surfaces'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { useNotification } from '@/providers/useNotification'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
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
  withoutYourTurn,
} from '@/features/mentor/format'
import {
  useHelpSession,
  useHelpSessions,
  useHelpTurn,
  useStartHelpSession,
} from '@/features/mentor/hooks'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import {
  DoubtHelperIcon,
  TestCaseVisualizerIcon,
} from '@/components/icons/mentor-icons'
import {
  VISUALIZER_PATH,
  readDoubtIntake,
  readDoubtQuestion,
  recallDoubtCode,
  rememberDoubtCode,
  testCaseFromMarkdown,
  visualizerLanguageFor,
  visualizerLanguageForFence,
  type DoubtIntakeHandoff,
  type VisualizerHandoff,
} from '@/features/visualizer/handoff'
import type { VisualizerLanguage } from '@/features/visualizer/trace'
import { useCoachName } from '@/features/pet/pet-preference'
import { petLines } from '@/features/pet/pet-lines'
import {
  cueMelloSuccess,
  endPetActivity,
  petSay,
  startPetActivity,
} from '@/features/pet/mello-events'
import { cn } from '@/lib/utils'

const doubtIcons: Record<ProblemHelpDoubtType, DoubtIconComponent> = {
  understand_problem: UnderstandProblemIcon,
  find_approach: FindApproachIcon,
  approach_review: ApproachReviewIcon,
  compilation_error: CompilationErrorIcon,
  no_output: NoOutputIcon,
  wrong_answer: WrongAnswerIcon,
  performance_tle_mle: LimitExceededIcon,
  general: GeneralHelpIcon,
}

const doubtOptions: readonly {
  value: ProblemHelpDoubtType
  short: string
  label: string
  hint: string
}[] = [
  {
    value: 'understand_problem',
    short: 'Understand it',
    label: 'I cannot understand the problem',
    hint: 'Restate it, walk through samples, flag tricky wording.',
  },
  {
    value: 'find_approach',
    short: 'Find an approach',
    label: 'I do not know how to approach it',
    hint: 'Brute force first, then a nudge toward the right idea.',
  },
  {
    value: 'approach_review',
    short: 'Review my idea',
    label: 'Check my approach before I submit',
    hint: 'Catch wrong or too-slow ideas before you code them.',
  },
  {
    value: 'compilation_error',
    short: 'Compile error',
    label: 'Compilation error',
    hint: 'Explain the compiler message and the exact cause.',
  },
  {
    value: 'no_output',
    short: 'No output',
    label: 'My code prints nothing',
    hint: 'Trace execution to find where output is lost.',
  },
  {
    value: 'wrong_answer',
    short: 'Wrong answer',
    label: 'Wrong answer',
    hint: 'Find the failing case and the broken assumption.',
  },
  {
    value: 'performance_tle_mle',
    short: 'TLE / MLE',
    label: 'Time or memory limit exceeded',
    hint: 'Locate the bottleneck against the constraints.',
  },
  {
    value: 'general',
    short: 'General help',
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

const levelDetails = [
  'A pointer in the right direction',
  'The idea or technique it needs',
  'How the solution fits together',
  'The one piece of code that matters',
  'Everything, only when you confirm',
]

// Five rising steps: one per hint level, lit as you climb.
function HintLadder({ level, stage }: { level: number; stage: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <ol
      aria-label={`Hint ${Math.min(level, 5)} of 5`}
      className="grid grid-cols-5 items-end gap-1.5"
    >
      {levelNames.map((name, index) => {
        const reached = index < level
        const current = index === level - 1
        return (
          <li className="flex min-w-0 flex-col gap-1.5" key={name}>
            <motion.span
              animate={{ scaleY: 1 }}
              aria-hidden="true"
              className={cn(
                'relative grid origin-bottom place-items-start justify-center rounded-md pt-1',
                reached
                  ? index === 4
                    ? 'bg-linear-to-t from-[#f59e0b] to-[#f43f5e] text-white'
                    : 'bg-acc text-white dark:text-[#0b0c0e]'
                  : 'bg-muted text-muted-foreground',
                current &&
                  'shadow-[0_0_0_3px_color-mix(in_oklab,var(--acc)_25%,transparent),0_10px_24px_-10px_var(--acc)]',
              )}
              initial={reduceMotion ? false : { scaleY: 0 }}
              style={{ height: `${14 + index * 9}px` }}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.06 * index,
              }}
            >
              {reached && !current ? (
                <Check className="size-3" />
              ) : (
                <span className="font-mono text-[0.6rem] leading-none font-bold">
                  {index + 1}
                </span>
              )}
            </motion.span>
            <span
              className={cn(
                'truncate text-center text-[0.68rem]',
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
    <CapsuleStats
      items={[
        {
          label: 'Help sessions',
          value: sessions.length,
          hint: 'Problems you asked about',
          icon: Crosshair,
        },
        {
          label: 'Solved',
          value: solved,
          hint: 'Marked solved',
          icon: CheckCheck,
          color: '#22c55e',
        },
        {
          label: 'Average hint',
          value: average.toFixed(1),
          hint: 'Lower means more independence',
          icon: Lightbulb,
          color: '#f59e0b',
        },
        {
          label: 'Full reveals',
          value: reveals,
          hint: 'Sessions that revealed the solution',
          icon: Lock,
          color: '#ef4444',
        },
      ]}
    />
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

// Questions, attempts and their answers live in the chat (the coach pet, or
// the docked panel with the pet off); the page keeps the hint trail.
const chatTurnKinds = new Set(['question', 'attempt', 'answer', 'feedback'])

function Transcript({
  turns,
  onVisualize,
}: {
  turns: readonly ProblemHelpTurn[]
  // Opens the Test Case Visualizer with a solution's code and test case.
  onVisualize?: (
    code: string,
    language: VisualizerLanguage,
    testCase: { input?: string; expected?: string },
  ) => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <ol className="relative flex flex-col gap-6 before:absolute before:top-3 before:bottom-3 before:left-4 before:w-px before:bg-linear-to-b before:from-acc/60 before:via-border before:to-transparent">
      {turns
        .filter((turn) => !chatTurnKinds.has(turn.kind))
        .map((turn) =>
          turn.role === 'learner' ? (
            <motion.li
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col items-end"
              initial={reduceMotion ? false : { opacity: 0, x: 12 }}
              key={turn.id}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="max-w-[88%] rounded-2xl rounded-br-md border border-border bg-secondary px-4 py-3 text-sm leading-6 text-foreground [&_em]:text-muted-foreground [&_p]:my-0.5 [&_strong]:font-semibold">
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
            </motion.li>
          ) : (
            <motion.li
              animate={{ opacity: 1, y: 0 }}
              className="relative flex gap-3"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              key={turn.id}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                aria-hidden="true"
                className="coach-orb mt-0.5 size-8 shrink-0"
              />
              <article className="min-w-0 flex-1">
                <h3 className="inline-flex items-center gap-1.5 rounded-full bg-acc-soft px-2.5 py-0.5 font-sans text-xs font-semibold text-acc-ink">
                  {turn.kind === 'hint' && turn.hintLevel !== undefined ? (
                    <span
                      aria-hidden="true"
                      className="grid size-4 place-items-center rounded-full bg-acc font-mono text-[0.6rem] text-white dark:text-[#0b0c0e]"
                    >
                      {turn.hintLevel}
                    </span>
                  ) : null}
                  {turnHeading(turn)}
                </h3>
                <div className="text-[0.95rem] [&>div]:mt-2">
                  <CoachMessageContent
                    content={withoutYourTurn(turn.content)}
                    role="assistant"
                    {...(turn.kind === 'solution' && onVisualize !== undefined
                      ? {
                          codeAction: (code: string, fence: string) => {
                            const language = visualizerLanguageForFence(fence)
                            if (language === null) return null
                            return (
                              <button
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary transition-colors hover:bg-background"
                                onClick={() =>
                                  onVisualize(
                                    code,
                                    language,
                                    testCaseFromMarkdown(turn.content),
                                  )
                                }
                                type="button"
                              >
                                <TestCaseVisualizerIcon
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                                Visualize this
                              </button>
                            )
                          },
                        }
                      : {})}
                  />
                </div>
              </article>
            </motion.li>
          ),
        )}
    </ol>
  )
}

// One numbered stop on the intake form's rail.
function FormStep({
  step,
  title,
  aside,
  children,
}: {
  step: number
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      <span
        aria-hidden="true"
        className="relative z-10 grid size-8 place-items-center rounded-full border border-border bg-card font-mono text-xs font-bold text-foreground shadow-soft"
      >
        {step}
      </span>
      <div className="min-w-0 pb-1">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <h3 className="font-sans text-[0.95rem] font-semibold text-foreground">
            {title}
          </h3>
          {aside}
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  )
}

// The side of the intake form: the chosen kind of doubt, and the hint
// staircase the session will climb.
function IntakeAside({
  doubtType,
}: {
  doubtType: ProblemHelpDoubtType | null
}) {
  const coachName = useCoachName()
  const option = doubtOptions.find((item) => item.value === doubtType)
  const Icon = option ? doubtIcons[option.value] : DoubtHelperIcon
  return (
    <aside
      aria-label="How help works"
      className="relative isolate hidden overflow-hidden rounded-2xl border border-border bg-card p-5 xl:sticky xl:top-[calc(var(--app-header)+1.5rem)] xl:block"
    >
      <OrbField intensity={0.7} />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          data-selected="true"
          exit={{ opacity: 0, y: -8 }}
          initial={{ opacity: 0, y: 8 }}
          key={option?.value ?? 'none'}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="grid size-20 place-items-center rounded-2xl border border-border bg-card/80 text-foreground shadow-soft backdrop-blur">
            <Icon aria-hidden="true" className="size-12" />
          </span>
          <p className="mt-4 font-heading text-lg leading-6 font-semibold text-foreground">
            {option ? option.label : 'Pick what you are stuck on'}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {option
              ? option.hint
              : `${coachName} tailors the first hint to the kind of doubt.`}
          </p>
        </motion.div>
      </AnimatePresence>
      <ol className="mt-6 flex flex-col gap-2" aria-label="Hint levels">
        {levelNames.map((name, index) => (
          <motion.li
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -8 }}
            key={name}
            transition={{ delay: 0.15 + index * 0.07 }}
          >
            <span aria-hidden="true" className="flex w-14 shrink-0 justify-end">
              <span
                className={cn(
                  'h-2 rounded-full',
                  index === 4
                    ? 'bg-linear-to-r from-[#f59e0b] to-[#f43f5e]'
                    : 'bg-acc',
                )}
                style={{
                  width: `${14 + index * 10}px`,
                  opacity: 0.4 + index * 0.15,
                }}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {index + 1}. {name}
                {index === 4 ? (
                  <Lock
                    aria-hidden="true"
                    className="ml-1 inline size-3 text-muted-foreground"
                  />
                ) : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {levelDetails[index]}
              </span>
            </span>
          </motion.li>
        ))}
      </ol>
    </aside>
  )
}

function IntakeForm({
  initialProblem,
  intake,
}: {
  initialProblem: string
  intake: DoubtIntakeHandoff | null
}) {
  const coachName = useCoachName()
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
      setFieldError(`Tell ${coachName} what you tried or where you are stuck.`)
      return
    }
    if (codeRequired && code.trim() === '') {
      setFieldError('Paste the code you are debugging.')
      return
    }
    setFieldError(null)
    startPetActivity('doubt-start', 'reading', petLines.doubtStarted)
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
          endPetActivity('doubt-start', petLines.hintReady)
          void navigate(`/doubt-helper/${response.data.id}`)
        },
        onError: (error) => {
          endPetActivity('doubt-start')
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
        className="relative isolate overflow-hidden rounded-2xl border border-border bg-card p-6"
        role="status"
      >
        <OrbField intensity={0.6} />
        <AiLoader steps={workingSteps} title="Preparing your first hint" />
      </div>
    )
  }

  const selectedOption = doubtOptions.find((item) => item.value === doubtType)

  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <form
        aria-describedby={fieldError ? 'doubt-form-error' : undefined}
        className="relative flex min-w-0 flex-col gap-7 rounded-2xl border border-border bg-card p-4 before:absolute before:top-10 before:bottom-24 before:left-[2rem] before:w-px before:bg-border sm:p-6 sm:before:left-[2.5rem]"
        noValidate
        onSubmit={submit}
      >
        <h2 className="sr-only">What are you stuck on?</h2>

        <FormStep
          aside={
            !needsStatement ? (
              <button
                className="text-xs font-medium text-acc underline-offset-4 hover:underline"
                onClick={() => setPasteMode((value) => !value)}
                type="button"
              >
                {pasteMode
                  ? 'Use a link instead'
                  : 'No link? Paste the statement'}
              </button>
            ) : null
          }
          step={1}
          title="The problem"
        >
          <label className="sr-only" htmlFor="doubt-problem-url">
            Problem link {showStatement ? '(optional)' : ''}
          </label>
          <div className="relative">
            <Link2
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              aria-describedby="doubt-problem-url-hint"
              className={cn(inputClass, 'pl-10')}
              id="doubt-problem-url"
              inputMode="url"
              onChange={(event) => setProblemUrl(event.target.value)}
              placeholder="https://codeforces.com/problemset/problem/2266/G"
              type="url"
              value={problemUrl}
            />
          </div>
          <p
            className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
            id="doubt-problem-url-hint"
          >
            {['Codeforces', 'CodeChef', 'LeetCode', 'CSES'].map((name) => (
              <span
                className="rounded-full border border-border px-2 py-0.5 text-[0.68rem]"
                key={name}
              >
                {name}
              </span>
            ))}
            <span>read directly · other pages never stored</span>
          </p>

          {showStatement ? (
            <motion.div
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 grid gap-4 overflow-hidden rounded-xl border border-border bg-background/50 p-4"
              initial={{ opacity: 0, height: 0 }}
            >
              {needsStatement ? (
                <p className="text-sm text-sun-foreground" role="status">
                  The problem could not be read from that link. Paste the
                  statement so {coachName} does not have to guess.
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
                  className={cn(
                    inputClass,
                    'min-h-40 resize-y font-mono text-xs',
                  )}
                  maxLength={20_000}
                  onChange={(event) => setStatement(event.target.value)}
                  placeholder="Paste the full statement, constraints and samples."
                  value={statement}
                />
              </label>
            </motion.div>
          ) : null}
        </FormStep>

        <FormStep step={2} title="Type of doubt">
          <fieldset className="min-w-0">
            <legend className="sr-only">Type of doubt</legend>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {doubtOptions.map((option, index) => {
                const Icon = doubtIcons[option.value]
                const chosen = doubtType === option.value
                return (
                  <motion.label
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'di-host group relative flex cursor-pointer flex-col items-start gap-3 overflow-hidden rounded-2xl border p-3.5 transition-[border-color,background-color,box-shadow,transform] duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:-translate-y-0.5',
                      chosen
                        ? 'border-transparent shadow-lift'
                        : 'border-border bg-background/40 hover:border-[color-mix(in_oklab,var(--foreground)_18%,var(--border))]',
                    )}
                    data-selected={chosen}
                    initial={{ opacity: 0, y: 10 }}
                    key={option.value}
                    style={
                      chosen
                        ? {
                            background: `linear-gradient(160deg, color-mix(in oklab, ${Icon.hue} 16%, var(--card)), var(--card) 70%)`,
                            boxShadow: `inset 0 0 0 1.5px ${Icon.hue}`,
                          }
                        : undefined
                    }
                    transition={{ delay: 0.03 * index, duration: 0.4 }}
                  >
                    <input
                      checked={chosen}
                      className="sr-only"
                      name="doubt-type"
                      onChange={() => setDoubtType(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <Icon
                      aria-hidden="true"
                      className="size-10 text-foreground transition-transform duration-300 group-hover:scale-110"
                    />
                    <span className="min-w-0 text-sm leading-5 font-semibold text-foreground">
                      {option.short}
                      <span className="sr-only">: {option.label}</span>
                    </span>
                    <AnimatePresence>
                      {chosen ? (
                        <motion.span
                          animate={{ scale: 1, opacity: 1 }}
                          aria-hidden="true"
                          className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full text-white"
                          exit={{ scale: 0, opacity: 0 }}
                          initial={{ scale: 0, opacity: 0 }}
                          style={{ background: Icon.hue }}
                          transition={{
                            type: 'spring',
                            stiffness: 500,
                            damping: 26,
                          }}
                        >
                          <Check className="size-3" />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.label>
                )
              })}
            </div>
            <AnimatePresence initial={false} mode="wait">
              {selectedOption ? (
                <motion.p
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 text-sm text-muted-foreground xl:hidden"
                  exit={{ opacity: 0, y: -4 }}
                  initial={{ opacity: 0, y: 4 }}
                  key={selectedOption.value}
                >
                  {selectedOption.hint}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </fieldset>
        </FormStep>

        <FormStep step={3} title="Your attempt">
          <div className="flex flex-col gap-5">
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
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-1 w-16 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full rounded-full bg-acc transition-[width] duration-300"
                    style={{ width: `${Math.min(100, attempt.length / 10)}%` }}
                  />
                </span>
                {attempt.length}/1000 · saved so you can resume this session.
              </span>
            </label>

            <AnimatePresence initial={false}>
              {doubtType !== null &&
              doubtType !== 'understand_problem' &&
              doubtType !== 'find_approach' ? (
                <motion.div
                  animate={{ opacity: 1, height: 'auto' }}
                  className="overflow-hidden"
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="grid gap-4 rounded-xl border border-border bg-background/50 p-4">
                    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock aria-hidden="true" className="size-3.5" />
                      Used for this answer only and never saved.
                    </p>
                    <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                      <span>Your code {codeRequired ? '' : '(optional)'}</span>
                      <textarea
                        className={cn(
                          inputClass,
                          'min-h-44 resize-y font-mono text-xs',
                        )}
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
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </FormStep>

        {fieldError ? (
          <p
            className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
            id="doubt-form-error"
            role="alert"
          >
            {fieldError}
          </p>
        ) : null}

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">
            Depth follows your level and learner memory.
          </p>
          <Button size="lg" type="submit">
            Get my first hint
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </form>
      <IntakeAside doubtType={doubtType} />
    </div>
  )
}

function SessionView({ sessionId }: { sessionId: string }) {
  const { notify } = useNotification()
  const coachName = useCoachName()
  const location = useLocation()
  const navigate = useNavigate()
  const sessionQuery = useHelpSession(sessionId)
  const turn = useHelpTurn(sessionId)
  // A question prepared in the Test Case Visualizer about one step.
  const [visualizerQuestion] = useState(() => readDoubtQuestion(location.state))
  const [dockOpen, setDockOpen] = useState(visualizerQuestion !== null)
  const [code, setCode] = useState(visualizerQuestion?.code ?? '')
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
  // Only the page's own trail scrolls it; chat replies stay in the chat.
  const turnCount =
    sessionQuery.data?.turns.filter((item) => !chatTurnKinds.has(item.kind))
      .length ?? 0

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
    const inChat =
      request.action === 'ask' || request.action === 'submit_attempt'
    // In the chat the pet thinks in its own panel; hints and the full
    // walkthrough are read on the page.
    if (
      !inChat &&
      request.action !== 'complete' &&
      request.action !== 'abandon'
    )
      startPetActivity('doubt-turn', 'reading')
    return new Promise((resolve) => {
      turn.mutate(withStatement, {
        onSuccess: () => {
          endPetActivity('doubt-turn')
          setCode('')
          if (request.action === 'next_hint') petSay(petLines.hintReady)
          if (request.action === 'complete') {
            cueMelloSuccess()
            petSay(petLines.doubtSolved)
          }
          if (success) notify({ title: success, tone: 'success' })
          resolve(true)
        },
        onError: (error) => {
          endPetActivity('doubt-turn')
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

  function sendFromDock(content: string) {
    return act({
      action: 'ask',
      expectedVersion: session.version,
      content,
      ...(code.trim() === '' ? {} : { transientCode: code }),
    })
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

  // A full solution's code, run on the walkthrough's test case.
  function visualizeSolution(
    solutionCode: string,
    language: VisualizerLanguage,
    testCase: { input?: string; expected?: string },
  ) {
    const handoff: VisualizerHandoff = {
      source: 'doubt_helper',
      language,
      code: solutionCode,
      ...testCase,
      problem:
        session.problem.canonicalUrl === undefined
          ? { title: session.problem.title }
          : { title: session.problem.title, url: session.problem.canonicalUrl },
      sessionId: session.id,
    }
    void navigate(VISUALIZER_PATH, { state: { visualizer: handoff } })
  }

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
      <header className="relative isolate flex min-w-0 flex-col gap-5 overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <OrbField intensity={0.55} />
        <div className="flex min-w-0 items-start gap-4" data-selected="true">
          {(() => {
            const Icon = doubtIcons[session.doubtType]
            return (
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border bg-card/80 text-foreground backdrop-blur">
                <Icon aria-hidden="true" className="size-9" />
              </span>
            )
          })()}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ProviderBadge provider={session.problem.provider ?? 'other'} />
              <span className="text-xs text-muted-foreground">
                {doubtLabel(session.doubtType)} · {session.language}
              </span>
              {session.bugCategory ? (
                <span className="rounded-full bg-sun-soft px-2 py-0.5 text-[0.7rem] font-medium text-sun-foreground">
                  {bugLabels[session.bugCategory]}
                </span>
              ) : null}
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold',
                  session.stage === 'completed'
                    ? 'bg-go-soft text-go-foreground'
                    : session.stage === 'abandoned'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-acc-soft text-acc-ink',
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
        </div>
        <div className="w-full shrink-0 lg:w-80">
          <HintLadder level={session.hintLevel} stage={session.stage} />
        </div>
      </header>

      <section
        aria-label="Help conversation"
        aria-live="polite"
        className="min-w-0"
      >
        <Transcript onVisualize={visualizeSolution} turns={turns} />
        {turn.isPending &&
        turn.variables?.action !== 'ask' &&
        turn.variables?.action !== 'submit_attempt' ? (
          <div className="mt-6" role="status">
            <AiLoader steps={workingSteps} title={`${coachName} is thinking`} />
          </div>
        ) : null}
        <div ref={endRef} />
      </section>

      {active && statementRequired ? (
        <label className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm font-medium text-foreground">
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
          className="relative isolate overflow-hidden rounded-2xl border border-sun/50 bg-sun-soft p-4 sm:p-5"
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
        <div className="glass-card sticky bottom-3 z-10 rounded-2xl p-2.5 sm:p-3">
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
              onClick={() => setDockOpen(true)}
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
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4">
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
            <p>
              Ask about the last hint or anything in this problem. {coachName}{' '}
              already knows the problem and every hint so far, and keeps to your
              current hint level.
            </p>
          }
          extra={
            <Disclosure
              contentClassName="px-3 pb-3"
              defaultOpen={visualizerQuestion !== null}
              icon={
                <Code2
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
              }
              summary={
                <span className="text-xs text-muted-foreground">
                  Attach code (used for this answer only, never saved)
                </span>
              }
              summaryClassName="px-3 py-2"
            >
              <div className="grid gap-3">
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
              </div>
            </Disclosure>
          }
          launcherLabel="Ask a question"
          {...(visualizerQuestion === null
            ? {}
            : { initialDrafts: { ask: visualizerQuestion.content } })}
          messages={dockMessages}
          mode="ask"
          modes={[
            {
              id: 'ask',
              label: 'Ask a question',
              icon: <MessageCircle aria-hidden="true" className="size-3.5" />,
              placeholder: 'What is unclear about the last hint?',
              submitLabel: 'Ask',
            },
          ]}
          onOpenChange={setDockOpen}
          onSubmit={sendFromDock}
          open={dockOpen}
          pending={turn.isPending}
          pendingLabel={`${coachName} is thinking…`}
          disabled={session.stage === 'solution_confirmation'}
          disabledReason="Choose whether to reveal the full solution first."
          subtitle={`${session.problem.title} · Hint ${session.hintLevel} of 5`}
          draftKey={`doubt-${session.id}`}
          title={coachName}
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
        <div className="rounded-2xl border border-dashed border-border p-4 text-center">
          <div className="mx-auto flex w-fit -space-x-2" aria-hidden="true">
            {[UnderstandProblemIcon, WrongAnswerIcon, LimitExceededIcon].map(
              (Icon, index) => (
                <span
                  className="grid size-9 place-items-center rounded-xl border border-border bg-card text-foreground"
                  key={index}
                  style={{ rotate: `${(index - 1) * 8}deg` }}
                >
                  <Icon className="size-6" />
                </span>
              ),
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Your help sessions appear here so you can pick up where you left
            off.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {sessions.map((session: ProblemHelpSession) => {
            const Icon = doubtIcons[session.doubtType]
            const current = session.id === activeId
            return (
              <li key={session.id}>
                <Link
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'di-host flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    current
                      ? 'bg-card shadow-soft ring-1 ring-border'
                      : 'hover:bg-card/70',
                  )}
                  to={`/doubt-helper/${session.id}`}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground"
                  >
                    <Icon className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {session.problem.title}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span aria-hidden="true" className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <span
                            className={cn(
                              'h-1 w-2.5 rounded-full',
                              session.stage === 'completed'
                                ? 'bg-go'
                                : level <= session.hintLevel
                                  ? 'bg-acc'
                                  : 'bg-muted',
                            )}
                            key={level}
                          />
                        ))}
                      </span>
                      <span className="truncate text-[0.7rem] text-muted-foreground">
                        {session.stage === 'completed'
                          ? 'Solved'
                          : session.stage === 'abandoned'
                            ? 'Ended'
                            : session.stage === 'solution_revealed'
                              ? 'Solution revealed'
                              : `Hint ${session.hintLevel} of 5`}
                        <span className="sr-only">
                          {' '}
                          · {doubtLabel(session.doubtType)}
                        </span>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
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
      data-accent="amber"
      id="main-content"
    >
      <PageHero
        info={
          <>
            Layered hints for a specific problem, and bug diagnosis for wrong
            answers, TLE, compile errors or missing output. Hints come one level
            at a time: nudge, concept, structure, key code, then a full
            walkthrough only when you confirm it.
          </>
        }
        subtitle="Layered hints and bug diagnosis. You choose how much is revealed."
        title="Get unstuck without spoilers"
      >
        {sessionId === undefined ? <HelpStats /> : null}
      </PageHero>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <SessionList activeId={sessionId} />
        <div className="min-w-0">
          {sessionId === undefined ? (
            <IntakeForm
              initialProblem={initialProblem}
              intake={intake}
              key={`${initialProblem}|${intake === null ? '' : 'visualizer'}`}
            />
          ) : (
            <div className="max-w-4xl">
              <SessionView key={sessionId} sessionId={sessionId} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default DoubtHelperPage
