import type {
  ContestParticipation,
  ProviderRatingChange,
} from '@algomemtor/shared-contracts'

export type ContestHistoryEntry = {
  key: string
  participation?: ContestParticipation
  ratingChange?: ProviderRatingChange
}

function sameContest(
  participation: ContestParticipation,
  ratingChange: ProviderRatingChange,
) {
  if (participation.provider !== ratingChange.provider) return false

  if (
    participation.contestId !== undefined &&
    ratingChange.contestId !== undefined
  ) {
    return participation.contestId === ratingChange.contestId
  }

  return (
    participation.contestName !== undefined &&
    ratingChange.contestName !== undefined &&
    participation.contestName === ratingChange.contestName
  )
}

function entryDate(entry: Omit<ContestHistoryEntry, 'key'>) {
  return entry.participation?.attendedAt ?? entry.ratingChange?.occurredAt
}

function entryKey(
  entry: Omit<ContestHistoryEntry, 'key'>,
  fallbackIndex: number,
) {
  const source = entry.participation ?? entry.ratingChange
  if (source === undefined) return `contest-history:${fallbackIndex}`

  const contestId =
    'contestId' in source && source.contestId !== undefined
      ? source.contestId
      : 'eventId' in source
        ? source.eventId
        : undefined

  return `${source.provider}:${contestId ?? entryDate(entry) ?? fallbackIndex}`
}

/**
 * Presents participation and rating events as one contest history without
 * changing the independently persisted analytics arrays.
 */
export function mergeContestHistory(
  participations: readonly ContestParticipation[],
  ratingHistory: readonly ProviderRatingChange[],
): ContestHistoryEntry[] {
  const consumedRatingEvents = new Set<string>()
  const merged: ContestHistoryEntry[] = participations.map(
    (participation, participationIndex) => {
      const ratingChange = ratingHistory.find((candidate) => {
        const eventKey = `${candidate.provider}:${candidate.eventId}`
        if (consumedRatingEvents.has(eventKey)) return false
        return sameContest(participation, candidate)
      })

      if (ratingChange !== undefined) {
        consumedRatingEvents.add(
          `${ratingChange.provider}:${ratingChange.eventId}`,
        )
      }

      const entry = { participation, ratingChange }
      return {
        ...entry,
        key: entryKey(entry, participationIndex),
      }
    },
  )

  ratingHistory.forEach((ratingChange, ratingIndex) => {
    if (
      consumedRatingEvents.has(
        `${ratingChange.provider}:${ratingChange.eventId}`,
      )
    ) {
      return
    }

    const entry = { ratingChange }
    merged.push({
      ...entry,
      key: entryKey(entry, participations.length + ratingIndex),
    })
  })

  return merged.sort((left, right) => {
    const leftTime = Date.parse(entryDate(left) ?? '')
    const rightTime = Date.parse(entryDate(right) ?? '')
    return rightTime - leftTime
  })
}
