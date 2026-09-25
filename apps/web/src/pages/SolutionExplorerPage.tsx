import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  isSafeCoachPublicUrl,
  type SolutionApproach,
  type SolutionApproachKind,
  type SolutionExploration,
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
} from '@/features/mentor/hooks'
import { cn } from '@/lib/utils'

const kindLabels: Record<SolutionApproachKind, string> = {
  brute_force: 'Brute force',
  optimized: 'Optimized',
  alternative: 'Alternative',
  mathematical: 'Mathematical',
}

const kindStyles: Record<SolutionApproachKind, string> = {
  brute_force: 'bg-secondary text-secondary-foreground',
  optimized: 'bg-go-soft text-go-foreground',
  alternative: 'bg-primary/10 text-primary',
  mathematical: 'bg-sun-soft text-sun-foreground',
}

const communityKindLabels = {
  editorial: 'Editorial',
  community: 'Community solutions',
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

const workingSteps: readonly AiLoaderStep[] = [
  { label: 'Reading the problem', indicator: 'bar' },
  { label: 'Finding the editorial and community write-ups', indicator: 'grid' },
  { label: 'Comparing approaches', indicator: 'dots' },
]

function ApproachCard({
  approach,
  language,
}: {
  approach: SolutionApproach
  language: string
}) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
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
        <details className="mt-3 rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Show code ({language})
          </summary>
          <CodeBlockView code={approach.code} language={language} />
        </details>
      ) : null}
    </article>
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
      </section>

      <section aria-label="Approaches" className="grid min-w-0 gap-4">
        {exploration.approaches.map((approach, index) => (
          <ApproachCard
            approach={approach}
            key={`${approach.kind}-${index}`}
            language={exploration.language}
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
        description="Official editorials and the community write-ups worth reading, with what makes each instructive."
        id="community-heading"
        title="Editorial and community solutions"
      >
        {exploration.community.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No editorial or community write-up was found for this problem.
          </p>
        ) : (
          <ul className="grid gap-3">
            {exploration.community.map((source) => (
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
                </div>
                <ProviderProblemLink
                  className="mt-1.5 text-sm"
                  href={source.url}
                  provider="other"
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
        )}
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
    url: string
    data: SolutionExploration
  } | null>(null)

  const current = result?.url === submittedUrl ? result.data : null

  function run(
    options: { attemptConfirmed?: boolean; refresh?: boolean } = {},
  ) {
    if (submittedUrl === null || explore.isPending) return
    explore.mutate(
      {
        problemUrl: submittedUrl,
        language: language.trim() || 'C++',
        ...(options.attemptConfirmed ? { attemptConfirmed: true } : {}),
        ...(options.refresh ? { refresh: true } : {}),
      },
      {
        onSuccess: (response) =>
          setResult({ url: submittedUrl, data: response.data }),
        onError: (error) =>
          notify({
            title:
              errorCode(error) === 'SOLUTION_LOCKED'
                ? 'Try the problem first'
                : 'Solutions could not be explored',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
      },
    )
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

  return (
    <PageContainer>
      <PageHeader
        description="After you solve or genuinely attempt a problem, see it from several angles: the brute force and why it fails, the optimized insight, genuinely different alternatives, complexity trade-offs, and the editorial and community write-ups worth reading."
        title="Solution Explorer"
      />

      <form
        className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
        noValidate
        onSubmit={submit}
      >
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
          {formError ? (
            <p
              className="text-sm text-danger-foreground"
              id="solutions-error"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
        </div>
        <LanguagePicker
          idPrefix="solutions"
          onChange={setLanguage}
          value={language}
        />
      </form>

      {submittedUrl === null ? null : accessQuery.isPending ? (
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
      ) : explore.isPending ? (
        <div
          className="rounded-xl border border-border bg-card p-6"
          role="status"
        >
          <AiLoader steps={workingSteps} title="Exploring solutions" />
        </div>
      ) : current !== null ? (
        <ExplorationView
          exploration={current}
          onRefresh={() => run({ refresh: true })}
          refreshing={explore.isPending}
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
                  to={mentorToolPath('doubt_helper', submittedUrl)}
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
    </PageContainer>
  )
}

export default SolutionExplorerPage
