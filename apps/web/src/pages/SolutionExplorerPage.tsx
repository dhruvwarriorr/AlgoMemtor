import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  SOLUTION_CHAT_HISTORY_LIMIT,
  isSafeCoachPublicUrl,
  type CommunitySolution,
  type ProviderKey,
  type SolutionApproach,
  type SolutionApproachKind,
  type SolutionExploration,
  type SolutionStatementSource,
} from '@algomemtor/shared-contracts'

import {
  ArrowRight,
  BookOpen,
  Crosshair,
  Lightbulb,
  RefreshCw,
} from '@/components/icons/algo-icons'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import {
  CodeBlockView,
  CoachMessageContent,
} from '@/features/coach/components/CoachMessageContent'
import {
  MentorChatDock,
  type DockMessage,
} from '@/features/mentor/components/MentorChatDock'
import {
  LanguagePicker,
  ProviderBadge,
  ProviderProblemLink,
  SectionCard,
} from '@/features/mentor/components/shared'
import {
  errorCode,
  formatDateTime,
  inputClass,
  mentorErrorMessage,
  useRememberedLanguage,
} from '@/features/mentor/format'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import {
  useExplorations,
  useExploreSolutions,
  useSolutionAccess,
  useSolutionChat,
} from '@/features/mentor/hooks'
import { cn } from '@/lib/utils'

const kindLabels: Record<SolutionApproachKind, string> = {
  brute_force: 'Brute force',
  better: 'Better',
  optimized: 'Optimal',
  alternative: 'Alternative',
  mathematical: 'Mathematical',
}

const kindStyles: Record<SolutionApproachKind, string> = {
  brute_force: 'bg-secondary text-secondary-foreground',
  better: 'bg-sun-soft text-sun-foreground',
  optimized: 'bg-go-soft text-go-foreground',
  alternative: 'bg-primary/10 text-primary',
  mathematical: 'bg-sun-soft text-sun-foreground',
}

const communityKindLabels = {
  editorial: 'Editorial',
  community: 'Community solution',
  discussion: 'Discussion',
  submissions: 'Submissions',
  article: 'Article',
  video: 'Video',
} as const

const unlockCopy = {
  solved: 'Unlocked because you solved it.',
  attempted: 'Unlocked by your attempt on the platform.',
  helped: 'Unlocked after working on it in the Doubt Helper.',
  self_reported_attempt: 'Unlocked after your self-reported attempt.',
} as const

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

function ApproachCard({
  approach,
  index,
  total,
  language,
}: {
  approach: SolutionApproach
  index: number
  total: number
  language: string
}) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Approach {index + 1} of {total}
        </span>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[0.7rem] font-semibold',
            kindStyles[approach.kind],
          )}
        >
          {kindLabels[approach.kind]}
        </span>
        <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[0.7rem] text-foreground">
          Time {approach.timeComplexity}
        </span>
        <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[0.7rem] text-foreground">
          Space {approach.spaceComplexity}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-foreground">
        {approach.name}
      </h3>
      <div className="mt-2 text-[0.95rem] [&>div]:mt-1">
        <CoachMessageContent content={approach.idea} role="assistant" />
      </div>
      <div className="mt-4 rounded-lg border-l-2 border-primary bg-primary/5 px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          Key insight
        </p>
        <div className="text-sm [&>div]:mt-1">
          <CoachMessageContent content={approach.keyInsight} role="assistant" />
        </div>
      </div>
      {approach.steps !== undefined && approach.steps.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground">Algorithm</p>
          <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-sm leading-6 marker:text-muted-foreground">
            {approach.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <details className="mt-4 rounded-lg border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Why it works{approach.limitations ? ' and its limits' : ''}
        </summary>
        <div className="mt-2 text-sm [&>div]:mt-1">
          <CoachMessageContent content={approach.whyItWorks} role="assistant" />
        </div>
        {approach.limitations ? (
          <div className="mt-3 text-sm text-muted-foreground [&>div]:mt-1">
            <CoachMessageContent
              content={`**Limitations.** ${approach.limitations}`}
              role="assistant"
            />
          </div>
        ) : null}
      </details>
      {approach.code ? (
        <details
          className="mt-3 rounded-lg border border-border px-4 py-3"
          open={approach.kind === 'optimized'}
        >
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Code ({language})
          </summary>
          <CodeBlockView code={approach.code} language={language} />
          {approach.codeExplanation ? (
            <div className="mt-3 text-sm text-muted-foreground [&>div]:mt-1">
              <CoachMessageContent
                content={approach.codeExplanation}
                role="assistant"
              />
            </div>
          ) : null}
        </details>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No verified program was produced for this approach. Regenerate, or ask
          the assistant to write it.
        </p>
      )}
    </article>
  )
}

const providerForUrl = (url: string): ProviderKey | 'other' => {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return host.endsWith('codeforces.com')
    ? 'codeforces'
    : host.endsWith('leetcode.com')
      ? 'leetcode'
      : host.endsWith('codechef.com')
        ? 'codechef'
        : host === 'cses.fi'
          ? 'cses'
          : 'other'
}

function SourceList({
  sources,
  empty,
}: {
  sources: readonly CommunitySolution[]
  empty: string
}) {
  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="grid gap-3">
      {sources.map((source) => (
        <li
          className="min-w-0 rounded-lg border border-border p-3.5"
          key={source.url}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
              {communityKindLabels[source.kind]}
            </span>
            <span>{source.publisher}</span>
            {source.official ? (
              <span className="text-go-foreground">Official</span>
            ) : null}
            {source.language ? <span>· {source.language}</span> : null}
          </div>
          <ProviderProblemLink
            className="mt-1.5 text-sm"
            href={source.url}
            provider={providerForUrl(source.url)}
            title={source.title}
          />
          {source.highlight ? (
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {source.highlight}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function ExplorationView({
  exploration,
  onRefresh,
  refreshing,
}: {
  exploration: SolutionExploration
  onRefresh: () => void
  refreshing: boolean
}) {
  const { problem } = exploration
  const explanation = exploration.problemExplanation
  const official = exploration.community.filter((source) => source.official)
  const community = exploration.community.filter((source) => !source.official)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ProviderBadge provider={problem.provider ?? 'other'} />
              <span className="text-xs text-muted-foreground">
                {unlockCopy[exploration.unlockedBy]} Generated{' '}
                {formatDateTime(exploration.generatedAt)}.
              </span>
            </div>
            <h2 className="mt-2 text-xl text-foreground sm:text-2xl">
              {problem.canonicalUrl ? (
                <ProviderProblemLink
                  href={problem.canonicalUrl}
                  provider={problem.provider ?? 'other'}
                  title={problem.title}
                />
              ) : (
                problem.title
              )}
            </h2>
          </div>
          <Button
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
        </div>
        <div className="mt-3 text-[0.95rem] text-foreground/90 [&>div]:mt-1">
          <CoachMessageContent content={exploration.summary} role="assistant" />
        </div>
        {exploration.statementSource ? (
          <p
            className={cn(
              'mt-3 text-xs',
              exploration.statementSource === 'search'
                ? 'rounded-md bg-sun-soft px-3 py-2 text-sun-foreground'
                : 'text-muted-foreground',
            )}
          >
            {statementNotes[exploration.statementSource]}
          </p>
        ) : null}
      </section>

      {explanation ? (
        <SectionCard
          description="What the problem really asks, before any solution."
          id="problem-heading"
          title="Understand the problem"
        >
          <div className="grid gap-4 text-[0.95rem]">
            <div className="[&>div]:mt-0">
              <CoachMessageContent
                content={explanation.restatement}
                role="assistant"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Input, output and constraints
              </p>
              <div className="text-sm [&>div]:mt-1">
                <CoachMessageContent
                  content={explanation.inputOutput}
                  role="assistant"
                />
              </div>
            </div>
            {explanation.keyObservations.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Key observations
                </p>
                <ul className="mt-2 grid gap-2">
                  {explanation.keyObservations.map((item) => (
                    <li className="flex gap-2.5 text-sm leading-6" key={item}>
                      <Lightbulb
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-primary"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {explanation.exampleWalkthrough ? (
              <details className="rounded-lg border border-border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Sample walkthrough
                </summary>
                <div className="mt-2 text-sm [&>div]:mt-1">
                  <CoachMessageContent
                    content={explanation.exampleWalkthrough}
                    role="assistant"
                  />
                </div>
              </details>
            ) : null}
            {explanation.edgeCases.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Edge cases to watch
                </p>
                <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6 marker:text-muted-foreground">
                  {explanation.edgeCases.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <section aria-label="Approaches" className="grid min-w-0 gap-4">
        {exploration.approaches.map((approach, index) => (
          <ApproachCard
            approach={approach}
            index={index}
            key={`${approach.kind}-${index}`}
            language={exploration.language}
            total={exploration.approaches.length}
          />
        ))}
      </section>

      <SectionCard
        description="When to prefer which approach."
        id="comparison-heading"
        title="Trade-offs"
      >
        <div className="text-[0.95rem] [&>div]:mt-1">
          <CoachMessageContent
            content={exploration.comparison}
            role="assistant"
          />
        </div>
      </SectionCard>

      {exploration.thinkingLessons.length > 0 ? (
        <SectionCard
          description="Habits that transfer to the next problem."
          id="lessons-heading"
          title="Think like an experienced solver"
        >
          <ul className="grid gap-2">
            {exploration.thinkingLessons.map((lesson) => (
              <li className="flex gap-2.5 text-sm leading-6" key={lesson}>
                <Lightbulb
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
                <span>{lesson}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        description="The official write-up from the problem setters."
        id="editorial-heading"
        title="Editorial"
      >
        <SourceList
          empty="No official editorial was found for this problem."
          sources={official}
        />
      </SectionCard>

      <SectionCard
        description={`The most relevant solutions in ${exploration.language} found on the web, with what each does well.`}
        id="community-heading"
        title="Community solutions"
      >
        <SourceList
          empty={`No community solutions in ${exploration.language} were found.`}
          sources={community}
        />
      </SectionCard>
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
  const [formError, setFormError] = useState<string | null>(null)
  const [language, setLanguage] = useRememberedLanguage()
  const accessQuery = useSolutionAccess(submittedUrl, language || 'C++')
  const explore = useExploreSolutions()
  const explorationsQuery = useExplorations()
  const [result, setResult] = useState<{
    key: string
    data: SolutionExploration
  } | null>(null)
  const [pasteMode, setPasteMode] = useState(false)
  const [problemTitle, setProblemTitle] = useState('')
  // A problem without a link, identified by its name once submitted.
  const [pasted, setPasted] = useState<{
    title: string
    statement: string
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

  const targetKey = pasteMode
    ? pasted === null
      ? null
      : `pasted:${pasted.title}`
    : submittedUrl
  const current = result?.key === targetKey ? result.data : null
  const chatKey =
    current === null ? '' : `${targetKey ?? ''}|${current.language}`
  const chatMessages = chatThread.key === chatKey ? chatThread.messages : []

  function run(
    options: { attemptConfirmed?: boolean; refresh?: boolean } = {},
    pastedProblem = pasteMode ? pasted : null,
  ) {
    const key =
      pastedProblem !== null ? `pasted:${pastedProblem.title}` : targetKey
    if (key === null || explore.isPending) return
    setLastRun(options)
    const pastedStatement = statement.trim()
    explore.mutate(
      {
        ...(pastedProblem !== null
          ? {
              problemTitle: pastedProblem.title,
              transientStatement: pastedProblem.statement,
              // Without a link there is no platform evidence; pasting the
              // problem here is the learner's own confirmation.
              attemptConfirmed: true,
            }
          : {
              problemUrl: submittedUrl ?? '',
              ...(pastedStatement === ''
                ? {}
                : { transientStatement: pastedStatement }),
            }),
        language: language.trim() || 'C++',
        ...(options.attemptConfirmed ? { attemptConfirmed: true } : {}),
        ...(options.refresh ? { refresh: true } : {}),
      },
      {
        onSuccess: (response) => {
          setNeedsStatement(false)
          setResult({ key, data: response.data })
        },
        onError: (error) => {
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
        ...(pasteMode && pasted !== null
          ? { problemTitle: pasted.title }
          : { problemUrl: submittedUrl ?? '' }),
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
                      content: response.data.answer,
                    },
                  ],
                }
              : thread,
          ),
        onError: (error) =>
          notify({
            title: 'The assistant could not answer',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
      },
    )
    return true
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pasteMode) {
      const title = problemTitle.trim()
      const text = statement.trim()
      if (title === '' || text === '') {
        setFormError('Add the problem name and paste its statement.')
        return
      }
      setFormError(null)
      setResult(null)
      setPasted({ title, statement: text })
      run({}, { title, statement: text })
      return
    }
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

  return (
    <PageContainer>
      <PageHeader
        description="Paste a problem link after you solve or genuinely attempt it. You get a clear explanation of the problem, three approaches from brute force to optimal with complete code, the official editorial and the best community solutions in your language, and an assistant for follow-up questions."
        title="Solution Explorer"
      />

      <form
        className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
        noValidate
        onSubmit={submit}
      >
        {pasteMode ? (
          <div className="grid gap-4">
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
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="solutions-problem"
            >
              Problem link
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-describedby={formError ? 'solutions-error' : undefined}
                className={inputClass}
                id="solutions-problem"
                inputMode="url"
                onChange={(event) => setDraft(event.target.value)}
                placeholder="https://leetcode.com/problems/two-sum/"
                type="url"
                value={draft}
              />
              <Button className="shrink-0" size="lg" type="submit">
                Open <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
        {formError ? (
          <p
            className="text-sm text-danger-foreground"
            id="solutions-error"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
        {!needsStatement ? (
          <button
            className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setPasteMode((value) => !value)
              setFormError(null)
            }}
            type="button"
          >
            {pasteMode ? 'Use a link instead' : 'No link? Paste the statement'}
          </button>
        ) : null}
        {needsStatement && !pasteMode ? (
          <div className="grid gap-3 rounded-lg border border-border bg-background/50 p-4">
            <p className="text-sm text-sun-foreground" role="status">
              The problem could not be read from that link. Paste the statement
              so the explanation does not have to guess.
            </p>
            <textarea
              aria-label="Problem statement"
              className={cn(inputClass, 'min-h-32 resize-y font-mono text-xs')}
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
        <LanguagePicker
          idPrefix="solutions"
          onChange={setLanguage}
          value={language}
        />
        {pasteMode ? (
          <Button
            className="self-start"
            disabled={explore.isPending}
            type="submit"
          >
            <BookOpen aria-hidden="true" /> Explore approaches
          </Button>
        ) : null}
      </form>

      {targetKey === null ? null : explore.isPending ? (
        <div
          className="rounded-xl border border-border bg-card p-6"
          role="status"
        >
          <AiLoader steps={workingSteps} title="Exploring solutions" />
        </div>
      ) : current !== null ? (
        // A loaded exploration stays visible even if a background refetch
        // of the access check fails.
        <ExplorationView
          exploration={current}
          onRefresh={() => run({ refresh: true })}
          refreshing={explore.isPending}
        />
      ) : pasteMode ? null : accessQuery.isPending ? (
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
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
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
                  <Crosshair aria-hidden="true" /> Get a hint instead
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

      <SectionCard
        description="Problems you explored before open instantly from here."
        id="recent-explorations"
        title="Recent explorations"
      >
        {explorationsQuery.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : (explorationsQuery.data?.data.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Open a problem you have solved or attempted above.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {explorationsQuery.data?.data.map((item) => (
              <li
                key={`${item.problem.canonicalUrl ?? item.problem.title}-${item.generatedAt}`}
              >
                <button
                  className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  disabled={item.problem.canonicalUrl === undefined}
                  onClick={() => {
                    if (item.problem.canonicalUrl === undefined) return
                    setDraft(item.problem.canonicalUrl)
                    setResult(null)
                    setSearchParams({ problem: item.problem.canonicalUrl })
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {item.problem.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.approachCount} approaches ·{' '}
                      {formatDateTime(item.generatedAt, false)}
                    </span>
                  </span>
                  <ProviderBadge provider={item.problem.provider ?? 'other'} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {current !== null ? (
        <MentorChatDock
          emptyState={
            <p>
              Ask anything about{' '}
              <span className="font-medium text-foreground">
                {current.problem.title}
              </span>
              : the approaches, the code, a proof or your own idea. The
              assistant already has this whole page.
            </p>
          }
          launcherLabel="Ask about this solution"
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
          title="Solution assistant"
        />
      ) : null}
    </PageContainer>
  )
}

export default SolutionExplorerPage
