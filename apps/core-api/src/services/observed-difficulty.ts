import type {
  ExternalProblemSummary,
  ProviderSolvedProblem,
} from '@algomemtor/shared-contracts'

// CodeChef rates problems by difficulty; the same bands the catalog uses.
export const codeChefDifficulty = (rating: number) =>
  rating <= 1000 ? 'easy' : rating <= 1500 ? 'medium' : 'hard'

// A solve that records where it happened decides its own difficulty: a
// contest solve counts at the problem's rating, a practice solve counts as
// unrated even when the catalog rates the problem. Solves without a context
// keep the catalog's rating. Returns a new map; the input is not changed.
export function withObservedDifficulty(
  metadata: ReadonlyMap<string, ExternalProblemSummary>,
  solved: readonly ProviderSolvedProblem[],
  fetchedAt: string,
) {
  const result = new Map(metadata)
  for (const problem of solved) {
    if (problem.solveContext === undefined) continue
    const key = `${problem.provider}:${problem.externalId}`
    const known = metadata.get(key)
    const {
      providerDifficulty: _difficulty,
      normalizedDifficulty: _normalized,
      ...unrated
    } = known ?? {
      provider: problem.provider,
      externalId: problem.externalId,
      title: problem.externalId,
      canonicalUrl: problem.canonicalUrl,
      providerTags: problem.providerTags ?? [],
      topics:
        problem.topics !== undefined && problem.topics.length > 0
          ? problem.topics
          : [problem.provider],
      fetchedAt,
    }
    const rating =
      problem.solveContext === 'contest' ? problem.difficultyRating : undefined
    if (rating === undefined) {
      // A contest solve whose rating is unknown keeps the catalog's rating.
      if (problem.solveContext === 'contest' && known !== undefined) continue
      result.set(key, unrated)
      continue
    }
    result.set(key, {
      ...unrated,
      providerDifficulty: rating,
      normalizedDifficulty: codeChefDifficulty(rating),
    })
  }
  return result
}
