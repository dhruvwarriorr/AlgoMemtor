import { useCallback, useState } from 'react'
import type { LearnerProblemStatus } from '@algomemtor/shared-contracts'
import { Bookmark, BookmarkCheck } from '@/components/icons/algo-icons'

import { useNotification } from '@/app/useNotification'
import { Button } from '@/components/ui/button'
import {
  useAddBookmark,
  useRemoveBookmark,
} from '@/features/bookmarks/hooks/useBookmarks'

import {
  useSaveProblemReflection,
  useSetProblemStatus,
} from '../hooks/useProgress'
import { problemKey, type ProblemReference } from '../contracts'
import { ReflectionDialog } from './ReflectionDialog'

const statusLabels: Record<LearnerProblemStatus, string> = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  solved: 'Solved',
}

type ProblemLearningControlsProps = {
  problem: ProblemReference
  initialStatus?: LearnerProblemStatus
  evidenceSource?: 'manual' | 'provider_verified'
  initialBookmarked?: boolean
  recommendationItemId?: string
  sourceContext?: string
  compact?: boolean
}

export function ProblemLearningControls(props: ProblemLearningControlsProps) {
  const initialStatus = props.initialStatus ?? 'unsolved'
  const initialBookmarked = props.initialBookmarked ?? false
  const controlKey = `${problemKey(props.problem)}:${initialStatus}:${initialBookmarked}`

  return <ProblemLearningControlsContent {...props} key={controlKey} />
}

function ProblemLearningControlsContent({
  problem,
  initialBookmarked = false,
  initialStatus = 'unsolved',
  evidenceSource,
  recommendationItemId,
  sourceContext,
  compact = false,
}: ProblemLearningControlsProps) {
  const { notify } = useNotification()
  const statusMutation = useSetProblemStatus()
  const reflectionMutation = useSaveProblemReflection()
  const addBookmarkMutation = useAddBookmark()
  const removeBookmarkMutation = useRemoveBookmark()
  const [status, setStatus] = useState(initialStatus)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [reflectionOpen, setReflectionOpen] = useState(false)
  const [reflectionStatusActionId, setReflectionStatusActionId] = useState<
    string | undefined
  >()
  const closeReflection = useCallback(() => setReflectionOpen(false), [])

  async function handleStatusChange(nextStatus: LearnerProblemStatus) {
    if (nextStatus === status && !statusMutation.isPending) return
    const previousStatus = status
    setStatus(nextStatus)
    try {
      const response = await statusMutation.mutateAsync({
        problem,
        input: {
          status: nextStatus,
          ...(recommendationItemId === undefined
            ? {}
            : { recommendationItemId }),
          ...(sourceContext === undefined ? {} : { sourceContext }),
        },
      })
      if (nextStatus === 'attempted' || nextStatus === 'solved') {
        setReflectionStatusActionId(response.data.statusActionId)
        setReflectionOpen(true)
      }
    } catch (error) {
      setStatus(previousStatus)
      notify({
        title: 'Status was not saved',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
        tone: 'error',
      })
    }
  }

  async function toggleBookmark() {
    const nextBookmarked = !bookmarked
    setBookmarked(nextBookmarked)
    try {
      if (nextBookmarked) await addBookmarkMutation.mutateAsync(problem)
      else await removeBookmarkMutation.mutateAsync(problem)
    } catch (error) {
      setBookmarked(!nextBookmarked)
      notify({
        title: nextBookmarked
          ? 'Bookmark was not saved'
          : 'Bookmark was not removed',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
        tone: 'error',
      })
    }
  }

  async function saveReflection(input: {
    perceivedDifficulty: 'easy' | 'medium' | 'hard'
    note?: string
  }) {
    try {
      await reflectionMutation.mutateAsync({
        problem,
        input: {
          ...input,
          ...(reflectionStatusActionId === undefined
            ? {}
            : { statusActionId: reflectionStatusActionId }),
        },
      })
      closeReflection()
      setReflectionStatusActionId(undefined)
      notify({
        title: 'Reflection saved',
        description:
          'Your note will remain separate from the provider problem.',
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'Reflection was not saved',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
        tone: 'error',
      })
      throw error
    }
  }

  const bookmarkPending =
    addBookmarkMutation.isPending || removeBookmarkMutation.isPending

  return (
    <>
      <div
        className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-3'}
        data-problem-key={problemKey(problem)}
      >
        {evidenceSource !== undefined ? (
          <p className="text-xs text-muted-foreground">
            {evidenceSource === 'manual'
              ? 'Marked by you'
              : 'Confirmed on linked public Codeforces profile'}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Status for {problem.externalId}</span>
            <select
              aria-label={`Status for ${problem.externalId}`}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-[border-color,box-shadow] outline-none hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
              disabled={statusMutation.isPending}
              onChange={(event) =>
                void handleStatusChange(
                  event.target.value as LearnerProblemStatus,
                )
              }
              value={status}
            >
              {(Object.keys(statusLabels) as LearnerProblemStatus[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ),
              )}
            </select>
          </label>
          {statusMutation.isPending ? (
            <span className="text-xs text-muted-foreground" role="status">
              Saving status…
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            aria-pressed={bookmarked}
            className={
              compact && bookmarked
                ? 'text-[#d97706] dark:text-[#fbbf24]'
                : undefined
            }
            disabled={bookmarkPending}
            onClick={() => void toggleBookmark()}
            size={compact ? 'icon-sm' : 'sm'}
            title={compact ? (bookmarked ? 'Saved' : 'Bookmark') : undefined}
            type="button"
            variant={bookmarked ? 'secondary' : 'outline'}
          >
            {bookmarked ? (
              <BookmarkCheck aria-hidden="true" />
            ) : (
              <Bookmark aria-hidden="true" />
            )}
            <span className={compact ? 'sr-only' : undefined}>
              {bookmarked ? 'Saved' : 'Bookmark'}
            </span>
          </Button>
        </div>
      </div>

      <ReflectionDialog
        isSaving={reflectionMutation.isPending}
        onClose={closeReflection}
        onSave={saveReflection}
        open={reflectionOpen}
        problemLabel={problem.externalId}
      />
    </>
  )
}
