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

      <ul className="flex min-w-0 flex-col gap-2.5">
        {problems.map((problem, index) => (
          <ProblemCard
            index={index}
            key={`${problem.provider}:${problem.externalId}`}
            problem={problem}
          />
        ))}
      </ul>
    </div>
  )
}
