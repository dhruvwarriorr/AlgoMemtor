import { useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  SOLUTION_CHAT_HISTORY_LIMIT,
  isSafeCoachPublicUrl,
  type SolutionApproach,
  type SolutionExploration,
  type SolutionStatementSource,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  Link2,
  RefreshCw,
} from '@/components/icons/algo-icons'
import { PageHero } from '@/components/kit/PageHero'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import PageContainer from '@/components/layout/PageContainer'
import { DoubtHelperIcon } from '@/components/icons/mentor-icons'
import { ErrorState } from '@/components/states/ErrorState'
import { Button, buttonVariants } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { useNotification } from '@/app/useNotification'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import {
  MentorChatDock,
  type DockMessage,
} from '@/features/mentor/components/MentorChatDock'
import { useCoachName } from '@/features/pet/pet-preference'
import { petLines } from '@/features/pet/pet-lines'
import { endPetActivity, startPetActivity } from '@/features/pet/mello-events'
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
import { mentorToolPath } from '@/features/mentor/feature-routes'
import {
  useExplorations,
  useExploreSolutions,
  useSolutionAccess,
  useSolutionChat,
} from '@/features/mentor/hooks'
import {
  ApproachDetail,
  ApproachJourney,
  ExplorerPreview,
  LinkCheck,
  LessonNotes,
  ObservationDeck,
  SourceRows,
} from '@/features/mentor/components/solution-visuals'
import { cn } from '@/lib/utils'

const unlockCopy = {
  solved: 'Unlocked because you solved it.',
  attempted: 'Unlocked by your attempt on the platform.',
  helped: 'Unlocked after working on it in the Doubt Helper.',
  self_reported_attempt: 'Unlocked after your self-reported attempt.',
} as const

const unlockShort = {
  solved: 'Solved',
  attempted: 'Attempted',
  helped: 'Doubt Helper',
  self_reported_attempt: 'Your attempt',
} as const

const statementShort: Record<SolutionStatementSource, string> = {
  provider: 'From the platform',
  page: 'From the page',
  pasted: 'Pasted by you',
  search: 'Web search',
}

const statementNotes: Record<SolutionStatementSource, string> = {
  provider: 'Based on the statement from the platform.',
  page: 'Based on the statement read from the problem page.',
  pasted: 'Based on the statement you pasted.',
  search:
    'The page could not be opened, so this is based on a web search for the statement. Check details against the original.',
}

const workingSteps: readonly AiLoaderStep[] = [
  { label: 'Reading the problem from the link', indicator: 'bar' },
  {
    label: 'Finding the editorial and top community solutions',
    indicator: 'grid',
  },
  { label: 'Writing three approaches with full code', indicator: 'dots' },
]

const chatSuggestions = [
  'Why does the optimal approach work?',
  'Walk me through the optimal code line by line.',
  'Which edge cases break the brute force?',
  'Could a different technique also solve this?',
] as const

// The approach path and the chosen approach below it.
function ApproachExplorer({
  approaches,
  language,
  problem,
  testCase,
}: {
  approaches: readonly SolutionApproach[]
  language: string
  problem: { title: string; url?: string }
  testCase: { input?: string; expected?: string }
}) {
  const optimal = approaches.findIndex((item) => item.kind === 'optimized')
  const [state, setState] = useState<{ active: number; direction: 1 | -1 }>({
    active: optimal === -1 ? 0 : optimal,
    direction: 1,
  })
  const current = approaches[state.active]
  return (
    <section aria-labelledby="approaches-heading" className="min-w-0">
      <SectionLabel
        detail="Tap a station to switch"
        id="approaches-heading"
        title="From brute force to optimal"
      />
      <div className="mt-5">
        <ApproachJourney
          active={state.active}
          approaches={approaches}
          onSelect={(index) =>
            setState((previous) => ({
              active: index,
              direction: index >= previous.active ? 1 : -1,
            }))
          }
        />
      </div>
      {current ? (
        <div className="mt-8">
          <ApproachDetail
            approach={current}
            direction={state.direction}
            index={state.active}
            language={language}
            problem={problem}
            testCase={testCase}
          />
        </div>
      ) : null}
    </section>
  )
}

function SectionLabel({
  title,
  detail,
  id,
}: {
  title: string
  detail?: string
  id: string
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <h2
        className="flex items-center gap-2.5 text-lg font-semibold text-foreground"
        id={id}
      >
        <span
          aria-hidden="true"
          className="h-5 w-1.5 rounded-full bg-linear-to-b from-acc to-acc-2"
        />
        {title}
      </h2>
      {detail ? (
        <p className="text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

function ExplorationView({
  exploration,
  onRefresh,
  refreshing,
  onAsk,
  coachName,
}: {
  exploration: SolutionExploration
  onRefresh: () => void
  refreshing: boolean
  onAsk: () => void
  coachName: string
}) {
  const { problem } = exploration
  const explanation = exploration.problemExplanation
  const official = exploration.community.filter((source) => source.official)
  const community = exploration.community.filter((source) => !source.official)
  const problemRef =
    problem.canonicalUrl === undefined
      ? { title: problem.title }
      : { title: problem.title, url: problem.canonicalUrl }
  const reduceMotion = useReducedMotion()
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="min-w-0">
          <motion.h2
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            className="text-2xl text-foreground sm:text-3xl"
            initial={
              reduceMotion ? false : { opacity: 0, filter: 'blur(10px)', y: 8 }
            }
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {problem.canonicalUrl ? (
              <ProviderProblemLink
                href={problem.canonicalUrl}
                provider={problem.provider ?? 'other'}
                title={problem.title}
              />
            ) : (
              problem.title
            )}
          </motion.h2>
          <div className="mt-3 max-w-3xl text-[1.02rem] leading-7 text-foreground/90 [&>div]:mt-1">
            <CoachMessageContent
              content={exploration.summary}
              role="assistant"
            />
          </div>
          {exploration.statementSource === 'search' ? (
            <p className="mt-3 inline-block rounded-lg bg-sun-soft px-3 py-2 text-xs text-sun-foreground">
              {statementNotes.search}
            </p>
          ) : null}
        </div>
        <aside
          aria-label="About this exploration"
          className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft"
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-acc to-acc-2"
          />
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-muted-foreground">Platform</dt>
              <dd>
                <ProviderBadge provider={problem.provider ?? 'other'} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-muted-foreground">Access</dt>
              <dd
                className="inline-flex items-center gap-1 text-foreground"
                title={unlockCopy[exploration.unlockedBy]}
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="size-4 shrink-0 text-go-foreground"
                />
                {unlockShort[exploration.unlockedBy]}
              </dd>
            </div>
            {exploration.statementSource &&
            exploration.statementSource !== 'search' ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-muted-foreground">Statement</dt>
                <dd className="text-foreground">
                  {statementShort[exploration.statementSource]}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-muted-foreground">Generated</dt>
              <dd className="text-xs text-foreground">
                {formatDateTime(exploration.generatedAt)}
              </dd>
            </div>
          </dl>
          <Button
            className="mt-4 w-full"
            disabled={refreshing}
            onClick={onRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                refreshing && 'animate-spin motion-reduce:animate-none',
              )}
            />
            Regenerate
          </Button>
          <Button
            className="mt-2 w-full"
            onClick={onAsk}
            size="sm"
            type="button"
          >
            Ask {coachName} about it
          </Button>
        </aside>
      </section>

      {explanation ? (
        <section aria-labelledby="problem-heading" className="min-w-0">
          <SectionLabel id="problem-heading" title="Understand the problem" />
          <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="text-[1.05rem] leading-7 text-foreground [&>div]:mt-0">
                <CoachMessageContent
                  content={explanation.restatement}
                  role="assistant"
                />
              </div>
              {explanation.exampleWalkthrough ? (
                <Disclosure className="mt-4" summary="Sample walkthrough">
                  <div className="text-sm [&>div]:mt-1">
                    <CoachMessageContent
                      content={explanation.exampleWalkthrough}
                      role="assistant"
                    />
                  </div>
                </Disclosure>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="rounded-2xl bg-secondary/60 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Code2 aria-hidden="true" className="size-3.5" /> Input,
                  output and constraints
                </p>
                <div className="mt-1 font-mono text-[0.8rem] leading-6 [&>div]:mt-0">
                  <CoachMessageContent
                    content={explanation.inputOutput}
                    role="assistant"
                  />
                </div>
              </div>
              {explanation.edgeCases.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Edge cases to watch
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {explanation.edgeCases.map((item, index) => (
                      <motion.li
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-full border border-[color-mix(in_oklab,#f59e0b_45%,var(--border))] bg-[#f59e0b]/10 px-3 py-1 text-xs leading-5 text-[#b45309] dark:text-[#fcd34d]"
                        initial={
                          reduceMotion ? false : { opacity: 0, scale: 0.6 }
                        }
                        key={item}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 18,
                          delay: 0.2 + index * 0.07,
                        }}
                      >
                        {item}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          {explanation.keyObservations.length > 0 ? (
            <div className="mt-6">
              <p className="text-sm font-semibold text-foreground">
                Key observations
              </p>
              <div className="mt-3">
                <ObservationDeck items={explanation.keyObservations} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <ApproachExplorer
        approaches={exploration.approaches}
        language={exploration.language}
        problem={problemRef}
        testCase={{
          ...(explanation?.walkthroughInput === undefined
            ? {}
            : { input: explanation.walkthroughInput }),
          ...(explanation?.walkthroughOutput === undefined
            ? {}
            : { expected: explanation.walkthroughOutput }),
        }}
      />

      <section
        aria-labelledby="lessons-heading"
        className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      >
        <div className="min-w-0">
          <SectionLabel id="comparison-heading" title="Trade-offs" />
          <blockquote className="relative mt-4 pl-10 text-[1.02rem] leading-7 text-foreground/90 [&>div]:mt-0">
            <span
              aria-hidden="true"
              className="absolute -top-3 left-0 font-heading text-6xl leading-none text-acc/40"
            >
              “
            </span>
            <CoachMessageContent
              content={exploration.comparison}
              role="assistant"
            />
          </blockquote>
        </div>
        {exploration.thinkingLessons.length > 0 ? (
          <div className="min-w-0">
            <SectionLabel
              id="lessons-heading"
              title="Think like an experienced solver"
            />
            <div className="mt-5">
              <LessonNotes lessons={exploration.thinkingLessons} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div
          aria-labelledby="editorial-heading"
          className="min-w-0"
          role="group"
        >
          <SectionLabel
            detail="From the problem setters"
            id="editorial-heading"
            title="Editorial"
          />
          <div className="mt-4">
            <SourceRows
              empty="No official editorial was found for this problem."
              sources={official}
            />
          </div>
        </div>
        <div
          aria-labelledby="community-heading"
          className="min-w-0"
          role="group"
        >
          <SectionLabel
            detail={`Top picks in ${exploration.language}`}
            id="community-heading"
            title="Community solutions"
          />
          <div className="mt-4">
            <SourceRows
              empty={`No community solutions in ${exploration.language} were found.`}
              sources={community}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function SolutionExplorerPage() {
  const { notify } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const problem = searchParams.get('problem')
  const submittedUrl =
    problem !== null && isSafeCoachPublicUrl(problem) ? problem : null
  const [draft, setDraft] = useState(problem ?? '')
  const coachName = useCoachName()
  const [formError, setFormError] = useState<string | null>(null)
  const [language, setLanguage] = useRememberedLanguage()
  const accessQuery = useSolutionAccess(submittedUrl, language || 'C++')
  const explore = useExploreSolutions()
  const explorationsQuery = useExplorations()
  const [result, setResult] = useState<{
    key: string
    data: SolutionExploration
  } | null>(null)
  const [statement, setStatement] = useState('')
  const [needsStatement, setNeedsStatement] = useState(false)
  const [lastRun, setLastRun] = useState<{
    attemptConfirmed?: boolean
    refresh?: boolean
  }>({})
  const chat = useSolutionChat()
  const [chatOpen, setChatOpen] = useState(false)
  const [chatThread, setChatThread] = useState<{
    key: string
    messages: DockMessage[]
  }>({ key: '', messages: [] })

  const targetKey = submittedUrl
  const current = result?.key === targetKey ? result.data : null
  const chatKey =
    current === null ? '' : `${targetKey ?? ''}|${current.language}`
  const chatMessages = chatThread.key === chatKey ? chatThread.messages : []

  function run(
    options: { attemptConfirmed?: boolean; refresh?: boolean } = {},
  ) {
    const key = targetKey
    if (key === null || explore.isPending) return
    setLastRun(options)
    // Only when the link could not be read: the statement the learner
    // pasted for this one request, never saved.
    const pastedStatement = statement.trim()
    startPetActivity('explore', 'reading', petLines.exploreStarted)
    explore.mutate(
      {
        problemUrl: submittedUrl ?? '',
        ...(pastedStatement === ''
          ? {}
          : { transientStatement: pastedStatement }),
        language: language.trim() || 'C++',
        ...(options.attemptConfirmed ? { attemptConfirmed: true } : {}),
        ...(options.refresh ? { refresh: true } : {}),
      },
      {
        onSuccess: (response) => {
          endPetActivity('explore', petLines.exploreDone)
          setNeedsStatement(false)
          setResult({ key, data: response.data })
        },
        onError: (error) => {
          endPetActivity('explore')
          if (errorCode(error) === 'PROBLEM_CONTEXT_UNAVAILABLE') {
            setNeedsStatement(true)
          }
          notify({
            title:
              errorCode(error) === 'SOLUTION_LOCKED'
                ? 'Try the problem first'
                : errorCode(error) === 'PROBLEM_CONTEXT_UNAVAILABLE'
                  ? 'The problem page could not be read'
                  : 'Solutions could not be explored',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          })
        },
      },
    )
  }

  function askChat(question: string) {
    if (current === null || targetKey === null || chat.isPending) {
      return false
    }
    const key = chatKey
    const history = chatMessages
      .slice(-SOLUTION_CHAT_HISTORY_LIMIT)
      .map(({ role, content }) => ({ role, content }))
    const learnerTurn: DockMessage = {
      id: crypto.randomUUID(),
      role: 'learner',
      content: question,
    }
    setChatThread({ key, messages: [...chatMessages, learnerTurn] })
    chat.mutate(
      {
        problemUrl: submittedUrl ?? '',
        language: current.language,
        question,
        ...(history.length === 0 ? {} : { history }),
      },
      {
        onSuccess: (response) =>
          setChatThread((thread) =>
            thread.key === key
              ? {
                  key,
                  messages: [
                    ...thread.messages,
                    {
                      id: crypto.randomUUID(),
                      role: 'mentor',
                      content: withoutYourTurn(response.data.answer),
                    },
                  ],
                }
              : thread,
          ),
        onError: (error) =>
          notify({
            title: `${coachName} could not answer`,
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
      },
    )
    return true
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = draft.trim()
    if (!isSafeCoachPublicUrl(url)) {
      setFormError('Paste a public https problem link.')
      return
    }
    setFormError(null)
    setResult(null)
    setSearchParams({ problem: url })
  }

  const access = accessQuery.data?.data
  const locked = access !== undefined && access.unlockedBy === undefined

  const recentExplorations = (
    <section aria-labelledby="recent-explorations" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-base font-semibold text-foreground"
          id="recent-explorations"
        >
          Recent explorations
        </h2>
        <p className="text-xs text-muted-foreground">Open instantly</p>
      </div>
      {explorationsQuery.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : (explorationsQuery.data?.data.length ?? 0) === 0 ? (
        <div className="mt-3 flex items-center gap-4 rounded-2xl border border-dashed border-border p-4">
          <span aria-hidden="true" className="flex shrink-0 -space-x-3">
            {[0, 1, 2].map((card) => (
              <span
                className="h-12 w-9 rounded-lg border border-border bg-card shadow-soft"
                key={card}
                style={{ transform: `rotate(${(card - 1) * 8}deg)` }}
              />
            ))}
          </span>
          <p className="text-sm text-muted-foreground">
            Nothing yet. Explorations you open are kept here and reopen
            instantly.
          </p>
        </div>
      ) : (
        <ul className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {explorationsQuery.data?.data.map((item, index) => (
            <motion.li
              animate={{ opacity: 1, y: 0 }}
              className="w-64 shrink-0 snap-start"
              initial={{ opacity: 0, y: 10 }}
              key={`${item.problem.canonicalUrl ?? item.problem.title}-${item.generatedAt}`}
              transition={{ delay: Math.min(index, 8) * 0.05 }}
            >
              <button
                className="flex h-full w-full min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-acc hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                disabled={item.problem.canonicalUrl === undefined}
                onClick={() => {
                  if (item.problem.canonicalUrl === undefined) return
                  setDraft(item.problem.canonicalUrl)
                  setResult(null)
                  setSearchParams({ problem: item.problem.canonicalUrl })
                }}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  {item.problem.provider === undefined ? (
                    <ProviderBadge provider="other" />
                  ) : (
                    <ProviderLogo
                      className="size-5 shrink-0"
                      provider={item.problem.provider}
                    />
                  )}
                  <span aria-hidden="true" className="flex gap-1">
                    {Array.from(
                      { length: Math.min(item.approachCount, 5) },
                      (_, dot) => (
                        <span
                          className="size-1.5 rounded-full bg-acc"
                          key={dot}
                          style={{ opacity: 0.4 + dot * 0.2 }}
                        />
                      ),
                    )}
                  </span>
                </span>
                <span className="line-clamp-2 text-sm font-semibold text-foreground">
                  {item.problem.title}
                </span>
                <span className="mt-auto text-xs text-muted-foreground">
                  {item.approachCount} approaches,{' '}
                  {formatDateTime(item.generatedAt, false)}
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <PageContainer accent="violet" className="gap-6">
      <PageHero
        info="Paste a problem link after you solve or genuinely attempt it. You get a clear explanation of the problem, three approaches from brute force to optimal with complete code, the official editorial and the best community solutions in your language, and an assistant for follow-up questions."
        subtitle="Every way to solve a problem you have already tried."
        title="Solution Explorer"
      />

      <div
        className={cn(
          'grid min-w-0 gap-6',
          targetKey === null &&
            'lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch',
        )}
      >
        <section
          aria-label="Open a problem"
          className={cn(
            'min-w-0',
            targetKey === null &&
              'flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-soft',
          )}
        >
          <form
            className="flex min-w-0 flex-col gap-4"
            noValidate
            onSubmit={submit}
          >
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-4 shadow-soft transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_15%,transparent)]">
              <label className="sr-only" htmlFor="solutions-problem">
                Problem link
              </label>
              <Link2
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <input
                aria-describedby={formError ? 'solutions-error' : undefined}
                className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
                id="solutions-problem"
                inputMode="url"
                onChange={(event) => setDraft(event.target.value)}
                placeholder="https://leetcode.com/problems/two-sum/"
                type="url"
                value={draft}
              />
              <Button className="group shrink-0 rounded-full" type="submit">
                Open
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </Button>
            </div>
            {formError ? (
              <p
                className="text-sm text-danger-foreground"
                id="solutions-error"
                role="alert"
              >
                {formError}
              </p>
            ) : null}
            {needsStatement ? (
              <div className="grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-4">
                <p className="text-sm text-sun-foreground" role="status">
                  The problem could not be read from that link. Paste the
                  statement so the explanation does not have to guess.
                </p>
                <textarea
                  aria-label="Problem statement"
                  className={cn(
                    inputClass,
                    'min-h-32 resize-y font-mono text-xs',
                  )}
                  maxLength={20_000}
                  onChange={(event) => setStatement(event.target.value)}
                  placeholder="Paste the full statement, constraints and samples."
                  value={statement}
                />
                <Button
                  className="self-start"
                  disabled={statement.trim() === '' || explore.isPending}
                  onClick={() => run(lastRun)}
                  size="sm"
                  type="button"
                >
                  Explore with this statement
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <LanguagePicker
                idPrefix="solutions"
                onChange={setLanguage}
                value={language}
              />
            </div>
          </form>
          {targetKey === null ? <LinkCheck value={draft} /> : null}
          {targetKey === null ? (
            <div className="mt-auto border-t border-border pt-4">
              {recentExplorations}
            </div>
          ) : null}
        </section>
        {targetKey === null ? (
          <div className="hidden min-w-0 lg:block [&>div]:h-full">
            <ExplorerPreview />
          </div>
        ) : null}
      </div>

      {targetKey === null ? null : explore.isPending ? (
        <div
          className="max-w-3xl rounded-2xl border border-border bg-card p-6"
          role="status"
        >
          <AiLoader steps={workingSteps} title="Exploring solutions" />
        </div>
      ) : current !== null ? (
        // A loaded exploration stays visible even if a background refetch
        // of the access check fails.
        <ExplorationView
          coachName={coachName}
          exploration={current}
          onAsk={() => setChatOpen(true)}
          onRefresh={() => run({ refresh: true })}
          refreshing={explore.isPending}
        />
      ) : accessQuery.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Checking your progress on this problem…
        </p>
      ) : accessQuery.isError ? (
        <ErrorState
          message={mentorErrorMessage(
            accessQuery.error,
            'This problem could not be opened.',
          )}
          onRetry={() => void accessQuery.refetch()}
          title="Problem unavailable"
        />
      ) : access !== undefined ? (
        <section className="relative flex max-w-3xl min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-0 left-0 w-1',
              locked ? 'bg-sun' : 'bg-go',
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <ProviderBadge provider={access.problem.provider ?? 'other'} />
            <span className="text-xs text-muted-foreground">
              {access.learnerStatus === 'solved'
                ? 'You solved this problem.'
                : access.learnerStatus === 'attempted'
                  ? 'You attempted this problem.'
                  : 'No attempt recorded yet.'}
            </span>
          </div>
          <h2 className="text-xl text-foreground sm:text-2xl">
            {access.problem.canonicalUrl ? (
              <ProviderProblemLink
                href={access.problem.canonicalUrl}
                provider={access.problem.provider ?? 'other'}
                title={access.problem.title}
              />
            ) : (
              access.problem.title
            )}
          </h2>
          {locked ? (
            <>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                The Solution Explorer is for after a genuine attempt, so seeing
                every approach does not rob you of the chance to find one
                yourself. Stuck? The Doubt Helper gives one hint at a time.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className={buttonVariants({ variant: 'outline' })}
                  to={mentorToolPath('doubt_helper', submittedUrl ?? undefined)}
                >
                  <DoubtHelperIcon aria-hidden="true" /> Get a hint instead
                </Link>
                <Button
                  onClick={() => run({ attemptConfirmed: true })}
                  type="button"
                >
                  I made a genuine attempt, show me
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {access.cached
                  ? 'You explored this before; it opens instantly.'
                  : 'Ready when you are.'}
              </p>
              <Button onClick={() => run()} type="button">
                <BookOpen aria-hidden="true" /> Explore approaches
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {targetKey === null ? null : recentExplorations}

      {current !== null ? (
        <MentorChatDock
          emptyState={
            <p>
              Ask anything about{' '}
              <span className="font-medium text-foreground">
                {current.problem.title}
              </span>
              : the approaches, the code, a proof or your own idea. {coachName}{' '}
              already has this whole page.
            </p>
          }
          draftKey={`solution-${chatKey}`}
          launcherLabel={`Ask ${coachName} about this solution`}
          messages={chatMessages}
          mode="ask"
          modes={[
            {
              id: 'ask',
              label: 'Ask a question',
              placeholder: 'e.g. Why is the brute force too slow here?',
              submitLabel: 'Ask',
            },
          ]}
          onOpenChange={setChatOpen}
          onSubmit={askChat}
          open={chatOpen}
          pending={chat.isPending}
          subtitle={`${current.problem.title} · ${current.language}`}
          suggestions={chatSuggestions}
          pendingLabel={`${coachName} is thinking…`}
          title="Solution Explorer"
        />
      ) : null}
    </PageContainer>
  )
}

export default SolutionExplorerPage
