import type {
  ExternalProblemSummary,
  ProviderWarning,
} from '@algomemtor/shared-contracts'

import { ProblemCard } from './ProblemCard'

type ProblemCatalogProps = {
  isFetching: boolean
  problems: ExternalProblemSummary[]
  warnings: ProviderWarning[]
}

export function ProblemCatalog({ isFetching, problems }: ProblemCatalogProps) {
  return (
    <div className="min-w-0 space-y-4">
      {isFetching ? (
        <p className="text-sm text-muted-foreground" role="status">
          Updating catalog…
        </p>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {problems.map((problem, index) => (
          <ProblemCard
            index={index}
            key={`${problem.provider}:${problem.externalId}`}
            problem={problem}
          />
        ))}
      </div>
    </div>
  )
}
