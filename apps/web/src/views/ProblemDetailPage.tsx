import { Link, useParams } from '@/lib/router'
import { ProviderKeySchema } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { buttonVariants } from '@/components/ui/button'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useProblemDetail } from '@/features/platform/hooks'

function decodeParam(value: string | undefined) {
  if (value === undefined) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function ProblemDetailPage() {
  const params = useParams<{ provider: string; externalId: string }>()
  const providerResult = ProviderKeySchema.safeParse(params.provider)
  const provider = providerResult.success ? providerResult.data : undefined
  const externalId = decodeParam(params.externalId)
  const detailQuery = useProblemDetail(
    provider ?? 'codeforces',
    provider === undefined ? '' : externalId,
  )
  const detail = detailQuery.data?.data

  if (!provider || externalId.length === 0) {
    return (
      <PageContainer>
        <ErrorState
          message="The problem reference is not a supported provider problem."
          title="Problem not found"
        />
      </PageContainer>
    )
  }

  if (detailQuery.isPending) {
    return (
      <PageContainer>
        <PageSkeleton label="Loading problem details" rows={5} />
      </PageContainer>
    )
  }

  if (detailQuery.isError || detail === undefined) {
    return (
      <PageContainer>
        <PageHeader
          description="Problem details are provided as a convenience; the source provider remains authoritative."
          title="Problem details"
        />
        <ErrorState
          message={
            detailQuery.error instanceof Error
              ? detailQuery.error.message
              : 'This problem could not be loaded.'
          }
          onRetry={() => void detailQuery.refetch()}
          title="Unable to load problem"
        />
      </PageContainer>
    )
  }

  const { summary, content } = detail

  return (
    <PageContainer>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to="/problems"
            >
              Back to problems
            </Link>
            <a
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href={summary.canonicalUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open on {providerLabels[provider]}
            </a>
          </div>
        }
        description={`${providerLabels[provider]} · ${summary.externalId}. The provider remains authoritative for the full statement, execution, and verdict.`}
        title={summary.title}
      />

      {detailQuery.isFetching ? (
        <p className="text-sm text-muted-foreground" role="status">
          Checking for a fresher provider copy…
        </p>
      ) : null}

      <section
        aria-labelledby="problem-metadata-heading"
        className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="problem-metadata-heading"
        >
          Problem metadata
        </h2>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">
              Provider difficulty
            </dt>
            <dd className="mt-1 font-medium text-foreground">
              {summary.providerDifficulty ?? 'Not reported'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              Normalized difficulty
            </dt>
            <dd className="mt-1 font-medium capitalize text-foreground">
              {summary.normalizedDifficulty ?? 'Not mapped'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Solved by</dt>
            <dd className="mt-1 font-medium text-foreground">
              {summary.solvedCount === undefined
                ? 'Not reported'
                : summary.solvedCount.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Access</dt>
            <dd className="mt-1 font-medium text-foreground">
              {summary.isPaidOnly
                ? 'Premium / metadata only'
                : 'Public metadata'}
            </dd>
          </div>
        </dl>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Topics</h3>
          <ul className="flex min-w-0 flex-wrap gap-1.5">
            {summary.topics.map((topic) => (
              <li
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                key={topic}
              >
                {topic}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-border pt-4">
          <ProblemLearningControls
            initialBookmarked={summary.bookmarked ?? false}
            initialStatus={summary.learnerStatus ?? 'unsolved'}
            problem={{ provider, externalId: summary.externalId }}
          />
        </div>
      </section>

      {content === null || content.isPaidOnly ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Problem content is not available here
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            This provider did not expose a public/free statement for this
            problem. Use the canonical link above to read and solve it on the
            provider.
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="problem-content-heading"
          className="space-y-6"
        >
          <div>
            <h2
              className="text-xl font-semibold tracking-tight text-foreground"
              id="problem-content-heading"
            >
              Public problem content
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This copy is sanitized provider data and may be incomplete. It is
              shown with source attribution for convenience.
            </p>
          </div>

          {content.statementHtml ? (
            <article
              className="min-w-0 rounded-xl border border-border bg-card p-4 leading-7 text-foreground sm:p-6 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: content.statementHtml }}
            />
          ) : content.statementText ? (
            <article className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 leading-7 text-foreground sm:p-6">
              {content.statementText}
            </article>
          ) : null}

          {content.constraints.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-foreground">
                Constraints
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground">
                {content.constraints.map((constraint) => (
                  <li key={constraint}>{constraint}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {content.examples.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground">
                Examples
              </h3>
              <ul className="grid min-w-0 gap-3 md:grid-cols-2">
                {content.examples.map((example, index) => (
                  <li
                    className="min-w-0 rounded-lg border border-border bg-card p-4"
                    key={`${example.input}:${example.output}:${index}`}
                  >
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Input
                        </p>
                        <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-sm text-foreground">
                          {example.input}
                        </pre>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Output
                        </p>
                        <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-sm text-foreground">
                          {example.output}
                        </pre>
                      </div>
                    </div>
                    {example.explanation ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {example.explanation}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {content.hints.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-foreground">Hints</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground">
                {content.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {content.publicSolutionHtml ? (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground">
                Public solution material
              </h3>
              <article
                className="min-w-0 rounded-xl border border-border bg-card p-4 leading-7 text-foreground sm:p-6 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3"
                dangerouslySetInnerHTML={{ __html: content.publicSolutionHtml }}
              />
            </section>
          ) : null}
        </section>
      )}
    </PageContainer>
  )
}

export default ProblemDetailPage
