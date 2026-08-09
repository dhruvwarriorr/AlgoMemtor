import type {
  ExternalProblemSummary,
  ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProblemCard } from './ProblemCard'

type ProblemCatalogProps = {
  isFetching: boolean
  isPartial: boolean
  problems: ExternalProblemSummary[]
  warnings: ProviderWarning[]
}

export function ProblemCatalog({
  isFetching,
  isPartial,
  problems,
  warnings,
}: ProblemCatalogProps) {
  const staleWarnings = warnings.filter(
    (warning) => warning.code === 'STALE_DATA',
  )
  const otherWarnings = warnings.filter(
    (warning) => warning.code !== 'STALE_DATA',
  )

  return (
    <div className="min-w-0 space-y-4">
      {isFetching ? (
        <p className="text-sm text-muted-foreground" role="status">
          Updating catalog…
        </p>
      ) : null}

      {staleWarnings.length > 0 ? (
        <aside
          className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          role="status"
        >
          Catalog data may be stale. You can keep browsing while refreshed data
          is requested.
        </aside>
      ) : null}

      {isPartial || otherWarnings.length > 0 ? (
        <aside
          className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          role="status"
        >
          <p className="font-medium">Some provider results are unavailable.</p>
          {otherWarnings.map((warning) => (
            <p className="mt-1" key={`${warning.provider}:${warning.code}`}>
              {warning.message}
            </p>
          ))}
        </aside>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {problems.map((problem) => (
          <ProblemCard
            key={`${problem.provider}:${problem.externalId}`}
            problem={problem}
          />
        ))}
      </div>
    </div>
  )
}
